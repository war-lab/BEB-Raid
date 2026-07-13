// AudioPlayer の Web 実装（T-15 本実装）。
// セッション開始タップでの AudioContext 解放（iOS Safari の自動再生制限対策）＋
// Web Audio API による連結スケジュール再生を行う。

import type { AudioPlayer, PlayOptions } from './AudioPlayer'
import type { PackCache } from '../cache/PackCache'

/** テスト用に AudioContext の生成を差し替え可能にする */
export type AudioContextFactory = () => AudioContext

/** キャッシュmiss時のフォールバック取得（テスト用に差し替え可能） */
export type AudioFetch = (src: string) => Promise<Blob>

const defaultFetch: AudioFetch = async (src) => {
  const res = await fetch(src)
  if (!res.ok) throw new Error(`音声の取得に失敗: ${src}`)
  return res.blob()
}

/** デコード済み AudioBuffer のメモリキャッシュ上限（1セッションの出題数を上回る概算値） */
const BUFFER_CACHE_LIMIT = 50

export class WebAudioPlayer implements AudioPlayer {
  private ctx: AudioContext | null = null
  private readonly bufferCache = new Map<string, AudioBuffer>()
  private currentSources: AudioBufferSourceNode[] = []
  private lastSrcs: string[] = []
  private lastOptions: PlayOptions | undefined
  private stopped = false
  /** 再生中の startSequence を stop() から即時解決するためのハンドル */
  private pendingResolve: (() => void) | null = null

  constructor(
    private readonly packCache: PackCache,
    private readonly createContext: AudioContextFactory = () => new AudioContext(),
    private readonly fetchAudio: AudioFetch = defaultFetch,
  ) {}

  async unlock(): Promise<void> {
    if (!this.ctx) {
      this.ctx = this.createContext()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    // 無音バッファを1発再生し、iOS Safari の自動再生制限を解除する
    const silence = this.ctx.createBuffer(1, 1, this.ctx.sampleRate)
    const source = this.ctx.createBufferSource()
    source.buffer = silence
    source.connect(this.ctx.destination)
    source.start(0)
  }

  async play(src: string, options?: PlayOptions): Promise<void> {
    await this.startSequence([src], options)
  }

  async playSequence(srcs: string[], options?: PlayOptions): Promise<void> {
    await this.startSequence(srcs, options)
  }

  async replay(): Promise<void> {
    if (this.lastSrcs.length === 0) return
    await this.startSequence(this.lastSrcs, this.lastOptions, true)
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
    if (this.pendingResolve) {
      const resolve = this.pendingResolve
      this.pendingResolve = null
      resolve()
    }
  }

  private async startSequence(
    srcs: string[],
    options: PlayOptions | undefined,
    isReplay = false,
  ): Promise<void> {
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

    const buffers = await Promise.all(srcs.map((src) => this.loadBuffer(src)))
    // 読み込み待ちの間に stop() された場合、残りは再生しない
    if (this.stopped) return

    return new Promise((resolve) => {
      this.pendingResolve = resolve
      const sources: AudioBufferSourceNode[] = []
      let remaining = buffers.length
      let startTime = ctx.currentTime
      const finishOne = () => {
        remaining -= 1
        if (remaining <= 0) {
          this.pendingResolve = null
          resolve()
        }
      }
      for (const buffer of buffers) {
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.connect(ctx.destination)
        source.onended = finishOne
        // options.rate は予約のみ（J-6）。M1では適用しない
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

  /** キャッシュファースト（メモリ→PackCache→fetch）で AudioBuffer を取得する */
  private async loadBuffer(src: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(src)
    if (cached) return cached

    const ctx = this.ctx
    if (!ctx) throw new Error('AudioContext が未初期化です')

    const cachedBlob = await this.packCache.get(src)
    const blob = cachedBlob ?? (await this.fetchAudio(src))
    const arrayBuffer = await blob.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer)
    this.cacheBuffer(src, buffer)
    return buffer
  }

  private cacheBuffer(src: string, buffer: AudioBuffer): void {
    if (this.bufferCache.size >= BUFFER_CACHE_LIMIT) {
      const oldestKey = this.bufferCache.keys().next().value
      if (oldestKey !== undefined) this.bufferCache.delete(oldestKey)
    }
    this.bufferCache.set(src, buffer)
  }
}
