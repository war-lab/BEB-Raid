// AudioPlayer の Web 実装（T-15 本実装）。
// セッション開始タップでの AudioContext 解放（iOS Safari の自動再生制限対策）＋
// Web Audio API による連結スケジュール再生を行う。

import type { AudioPlayer, PlaybackOutcome, PlayOptions } from './AudioPlayer'
import type { PackCache } from '../cache/PackCache'

/** テスト用に AudioContext の生成を差し替え可能にする */
export type AudioContextFactory = () => AudioContext

/** キャッシュmiss時のフォールバック取得（テスト用に差し替え可能） */
export type AudioFetch = (src: string) => Promise<Blob>

/** テスト用に HTMLAudioElement の生成を差し替え可能にする（T-45: rate経路） */
export type AudioElementFactory = () => HTMLAudioElement

const defaultFetch: AudioFetch = async (src) => {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`音声の取得に失敗: ${src}`)
  return res.blob()
}

const defaultCreateAudioElement: AudioElementFactory = () => new Audio()

/** デコード済み AudioBuffer のメモリキャッシュ上限（1セッションの出題数を上回る概算値） */
const BUFFER_CACHE_LIMIT = 50

/** onPosition 通知の間隔（ms。3.7節: 100ms程度で十分） */
const POSITION_NOTIFY_INTERVAL_MS = 100

export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null
  private readonly bufferCache = new Map<string, AudioBuffer>()
  private currentSources: AudioBufferSourceNode[] = []
  /** rate経路（HTMLAudioElement）で現在再生中の要素（同時に1つ。stop()での一括処理用） */
  private currentAudioElements: HTMLAudioElement[] = []
  /** rate経路で現在再生中の要素に紐づく ObjectURL（stop()時のrevoke漏れ防止） */
  private currentObjectUrls: string[] = []
  private positionTimer: ReturnType<typeof setInterval> | null = null
  private lastSrcs: string[] = []
  private lastOptions: PlayOptions | undefined
  private stopped = false
  /**
   * 再生中の startSequence を stop() から即時解決するためのハンドル。
   * stop() は `'interrupted'`、自然終了は `'ended'` で解決する（T-155）
   */
  private pendingResolve: ((outcome: PlaybackOutcome) => void) | null = null
  /**
   * startSequence の呼び出し世代。バッファ/Blob 読込 await 中に次の startSequence が
   * 始まると、stopped=false のリセットにより両方が再生をスケジュールして二重再生になり、
   * さらに pendingResolve の上書きで片方の Promise が永遠に未解決になる（呼び出し側が
   * 「再生中…」のまま固まる）。await 復帰時に世代が古ければ何もせず正常終了させる
   */
  private playGeneration = 0

  constructor(
    private readonly packCache: PackCache,
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
    private readonly fetchAudio: AudioFetch = defaultFetch,
    private readonly createAudioElement: AudioElementFactory = defaultCreateAudioElement,
  ) {}

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.createContext()
    }
    // iOS では通話・Siri 等の割り込みで非標準の 'interrupted' 状態になることがあるため、
    // 'suspended' 限定ではなく「running 以外」なら resume を試みる（効果は環境依存。
    // resume で復帰できない環境では従来どおり startSequence 側の running ガードで検出される）
    if (this.ctx.state !== 'running') {
      await this.ctx.resume()
    }
    // 無音バッファを1発再生し、iOS Safari の自動再生制限を解除する
    const silence = this.ctx.createBuffer(1, 1, this.ctx.sampleRate)
    const source = this.ctx.createBufferSource()
    source.buffer = silence
    source.connect(this.ctx.destination)
    source.start(0)
  }

  async play(src: string, options?: PlayOptions): Promise<PlaybackOutcome> {
    return this.startSequence([src], options)
  }

  async playSequence(srcs: string[], options?: PlayOptions): Promise<PlaybackOutcome> {
    return this.startSequence(srcs, options)
  }

  async replay(): Promise<PlaybackOutcome> {
    // 再生対象が無い場合は完走していないため 'interrupted' を返す（契約=AudioPlayer.ts）
    if (this.lastSrcs.length === 0) return 'interrupted'
    return this.startSequence(this.lastSrcs, this.lastOptions, true)
  }

  stop(): void {
    this.stopped = true
    for (const source of this.currentSources) {
      source.onended = null
      try {
        source.stop()
      } catch {
        // 未 start / 再生完了済みソースの stop() 例外は無視する
      }
    }
    this.currentSources = []
    for (const audio of this.currentAudioElements) {
      audio.onended = null
      audio.ontimeupdate = null
      audio.onloadedmetadata = null
      audio.onerror = null
      try {
        audio.pause()
      } catch {
        // 未ロード状態での pause() 例外は無視する
      }
    }
    this.currentAudioElements = []
    this.revokeObjectUrls()
    this.clearPositionTimer()
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve('interrupted')
    }
  }

  private clearPositionTimer(): void {
    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer)
      this.positionTimer = null
    }
  }

  private revokeObjectUrls(): void {
    for (const url of this.currentObjectUrls) {
      URL.revokeObjectURL(url)
    }
    this.currentObjectUrls = []
  }

  private async startSequence(
    srcs: string[],
    options: PlayOptions | undefined,
    isReplay = false,
  ): Promise<PlaybackOutcome> {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') {
      throw new Error('AudioPlayer が unlock されていません（unlock() をユーザー操作内で呼ぶこと）')
    }
    this.stop() // 前回再生が残っていれば打ち切る
    if (!isReplay) {
      this.lastSrcs = [...srcs]
      this.lastOptions = options
    }
    this.stopped = false
    // 呼び出しごとに世代を進める（並行 startSequence 競合対策。playGeneration のコメント参照）
    const generation = ++this.playGeneration

    // rate!==1.0 指定時のみ HTMLAudioElement 経路（J-27: playbackRate + preservesPitch）
    if (options?.rate !== undefined && options.rate !== 1) {
      return this.startRateSequence(srcs, options, generation)
    }

    const buffers = await Promise.all(srcs.map((src) => this.loadBuffer(src)))
    // 読み込み待ちの間に stop() された場合、または後続の startSequence に追い越された場合は
    // 再生しない。いずれも「この呼び出しは完走しなかった」ので 'interrupted' を返す
    // （後続呼び出しが再生を引き継ぐケースを含む。呼び出し側が周回を数えてはいけない）
    if (this.stopped || generation !== this.playGeneration) return 'interrupted'

    return new Promise<PlaybackOutcome>((resolve) => {
      this.pendingResolve = resolve
      const sources: AudioBufferSourceNode[] = []
      let remaining = buffers.length
      const sequenceStartTime = ctx.currentTime
      let startTime = sequenceStartTime
      if (options?.onPosition) {
        const onPosition = options.onPosition
        const baseMs = options.startMs ?? 0
        this.positionTimer = setInterval(() => {
          onPosition(baseMs + Math.max(0, (ctx.currentTime - sequenceStartTime) * 1000))
        }, POSITION_NOTIFY_INTERVAL_MS)
      }
      const finishOne = () => {
        remaining -= 1
        if (remaining <= 0) {
          this.clearPositionTimer()
          this.pendingResolve = null
          resolve('ended')
        }
      }
      for (const buffer of buffers) {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = finishOne
        const offsetSec = Math.min((options?.startMs ?? 0) / 1000, buffer.duration)
        if (options?.durationMs !== undefined) {
          const durationSec = options.durationMs / 1000
          source.start(startTime, offsetSec, durationSec)
          startTime += durationSec
        } else {
          const playDurationSec = Math.max(buffer.duration - offsetSec, 0)
          source.start(startTime, offsetSec)
          startTime += playDurationSec
        }
        sources.push(source)
      }
      this.currentSources = sources
    })
  }

  /**
   * rate経路（HTMLAudioElement）での連結再生。AudioBufferSourceNode.playbackRate は
   * ピッチが変わるため使わず（J-27）、PackCache の Blob を ObjectURL 化して再生する。
   * 複数srcは前の要素の再生完了（onended）を待って順に再生する。
   */
  private async startRateSequence(
    srcs: string[],
    options: PlayOptions,
    generation: number,
  ): Promise<PlaybackOutcome> {
    const rate = options.rate!
    const blobs = await Promise.all(srcs.map((src) => this.loadBlob(src)))
    // 読み込み待ちの間に stop() された場合、または後続の startSequence に追い越された場合は
    // 再生しない（AudioBuffer経路と同じ世代チェック。同じく 'interrupted' を返す）
    if (this.stopped || generation !== this.playGeneration) return 'interrupted'

    return new Promise<PlaybackOutcome>((resolve, reject) => {
      this.pendingResolve = resolve
      let remaining = blobs.length
      let index = 0

      const playNext = (): void => {
        if (this.stopped || index >= blobs.length) return
        const blob = blobs[index]!
        index += 1
        const url = URL.createObjectURL(blob)
        const audio = this.createAudioElement()
        this.currentAudioElements = [audio]
        this.currentObjectUrls = [url]
        audio.src = url
        audio.playbackRate = rate
        audio.preservesPitch = true
        // Safari向け（標準APIに未追加のためunknown経由でアクセス）
        ;(audio as unknown as { webkitPreservesPitch?: boolean }).webkitPreservesPitch = true

        const startSec = (options.startMs ?? 0) / 1000

        const cleanupAndAdvance = () => {
          audio.onended = null
          audio.ontimeupdate = null
          audio.onerror = null
          URL.revokeObjectURL(url)
          this.clearPositionTimer()
          remaining -= 1
          if (remaining <= 0 || this.stopped) {
            this.pendingResolve = null
            // stopped 経由なら stop() が既に 'interrupted' で解決しているが（Promiseの解決は
            // 先着のみ有効）、経路として正しい値を渡しておく
            resolve(this.stopped ? 'interrupted' : 'ended')
          } else {
            playNext()
          }
        }

        // play() の拒否（iOS Safariの自動再生制限等）・メディアエラーを握りつぶすと
        // Promise が永遠に未解決になり、呼び出し側が「再生中…」のまま固まる。
        // reject して呼び出し側の既存 audioError 表示（リトライ導線）に乗せる
        const fail = (err: unknown) => {
          audio.onended = null
          audio.ontimeupdate = null
          audio.onloadedmetadata = null
          audio.onerror = null
          this.revokeObjectUrls()
          this.clearPositionTimer()
          this.pendingResolve = null
          reject(err instanceof Error ? err : new Error(`音声の再生に失敗: ${audio.src}`))
        }
        audio.onerror = () => fail(new Error(`音声の再生に失敗: ${audio.src}`))

        if (options.onPosition) {
          const onPosition = options.onPosition
          // 通知はファイル先頭からの絶対位置に統一する（AudioBuffer経路と同一の座標系）。
          // 問題パックの timing は先頭からの絶対msなので、startMs 起点を足し戻さないと
          // 区間リピート・3秒戻し（startMs>0）でカラオケハイライトが先頭語に戻ってずれる
          const baseMs = startSec * 1000
          this.positionTimer = setInterval(() => {
            onPosition(baseMs + Math.max(0, (audio.currentTime - startSec) * 1000))
          }, POSITION_NOTIFY_INTERVAL_MS)
        }
        if (options.durationMs !== undefined) {
          const endSec = startSec + options.durationMs / 1000
          audio.ontimeupdate = () => {
            if (audio.currentTime >= endSec) {
              audio.pause()
              cleanupAndAdvance()
            }
          }
        }
        audio.onended = cleanupAndAdvance

        const start = () => {
          audio.currentTime = startSec
          void audio.play().catch(fail)
        }
        if (audio.readyState >= 1) {
          start()
        } else {
          audio.onloadedmetadata = () => {
            audio.onloadedmetadata = null
            start()
          }
        }
      }

      playNext()
    })
  }

  /** キャッシュ→フォールバックfetchで Blob を取得する（rate経路。デコード不要） */
  private async loadBlob(src: string): Promise<Blob> {
    const cachedBlob = await this.packCache.get(src)
    if (cachedBlob) return cachedBlob
    const blob = await this.fetchAudio(src)
    await this.writeBackToCache(src, blob)
    return blob
  }

  /** キャッシュファースト（メモリ→PackCache→fetch）で AudioBuffer を取得する */
  private async loadBuffer(src: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(src)
    if (cached) return cached

    const ctx = this.ctx
    if (!ctx) throw new Error('AudioContext が未初期化です')

    const cachedBlob = await this.packCache.get(src)
    let blob = cachedBlob
    if (!blob) {
      blob = await this.fetchAudio(src)
      await this.writeBackToCache(src, blob)
    }
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    this.cacheBuffer(src, buffer)
    return buffer
  }

  /**
   * fetchフォールバックで取得したBlobをPackCacheへ書き戻す（T-183・Q-13）。
   * 書き戻しに失敗しても再生自体は継続する（キャッシュ書き込みは付随処理であり、
   * 失敗しても次回同じmissを踏むだけで再生を止める理由にはならない）
   */
  private async writeBackToCache(src: string, blob: Blob): Promise<void> {
    try {
      await this.packCache.put(src, blob)
    } catch {
      // 無視（次回のfetchフォールバックで再試行される）
    }
  }

  private cacheBuffer(src: string, buffer: AudioBuffer): void {
    if (this.bufferCache.size >= BUFFER_CACHE_LIMIT) {
      const oldestKey = this.bufferCache.keys().next().value
      if (oldestKey !== undefined) this.bufferCache.delete(oldestKey)
    }
    this.bufferCache.set(src, buffer)
  }
}
