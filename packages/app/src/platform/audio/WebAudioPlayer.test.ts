import { describe, expect, it, vi } from 'vitest'
import { WebAudioPlayer } from './WebAudioPlayer'
import type { CacheUsage, PackCache } from '../cache/PackCache'

/** マイクロタスク＋α（fetch/decode等の非同期チェーン）を進める */
const tick = () => new Promise((r) => setTimeout(r, 0))

/** AudioBufferSourceNode の最小フェイク（jsdom は Web Audio API 未実装のため） */
class FakeAudioBufferSourceNode {
  buffer: AudioBuffer | null = null
  onended: (() => void) | null = null
  stopped = false
  startCalls: Array<{ when: number; offset?: number; duration?: number }> = []
  connect(): void {}
  start(when = 0, offset?: number, duration?: number): void {
    this.startCalls.push({ when, offset, duration })
  }
  stop(): void {
    this.stopped = true
  }
  /** テストから再生完了を模擬する */
  end(): void {
    this.onended?.()
  }
}

/** AudioContext の最小フェイク。decodeAudioData はテキスト内容から仕込んだ長さ・サイズを返す */
class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended'
  currentTime = 0
  sampleRate = 44100
  destination = {}
  createdSources: FakeAudioBufferSourceNode[] = []
  durations = new Map<string, number>()
  private stateChangeListeners: Array<() => void> = []

  addEventListener(type: string, listener: () => void): void {
    if (type === 'statechange') this.stateChangeListeners.push(listener)
  }
  removeEventListener(type: string, listener: () => void): void {
    if (type !== 'statechange') return
    this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener)
  }
  /** テストからiOSの通話割り込み等によるAudioContext状態変化を模擬する（T-324・K-57） */
  setState(state: 'suspended' | 'running' | 'closed' | 'interrupted'): void {
    this.state = state
    for (const listener of this.stateChangeListeners) listener()
  }
  /**
   * T-222（Q-16）: バイト数基準のキャッシュ上限をテストするため、srcごとに
   * decodeAudioData が返すAudioBufferの疑似サイズ（バイト）を仕込めるようにする。
   * 実際にその容量を確保するわけではなく、length/numberOfChannelsの値を
   * 逆算するだけ（4バイト/サンプル=Float32のPCM表現）
   */
  sizesBytes = new Map<string, number>()

  async resume(): Promise<void> {
    this.state = 'running'
  }

  createBuffer(): AudioBuffer {
    return { duration: 0 } as AudioBuffer
  }

  createBufferSource(): AudioBufferSourceNode {
    const node = new FakeAudioBufferSourceNode()
    this.createdSources.push(node)
    return node as unknown as AudioBufferSourceNode
  }

  async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    const text = new TextDecoder().decode(arrayBuffer)
    const duration = this.durations.get(text) ?? 1
    const bytes = this.sizesBytes.get(text) ?? 4 // 既定は極小（duration系テストへの影響を避ける）
    return { duration, length: bytes / 4, numberOfChannels: 1 } as AudioBuffer
  }
}

/** HTMLAudioElement の最小フェイク（T-45: rate経路。jsdomのAudio再生は未実装のため差し替える） */
class FakeAudioElement {
  src = ''
  playbackRate = 1
  preservesPitch = false
  currentTime = 0
  /** HAVE_ENOUGH_DATA 相当。テストでは即座に再生開始できる状態を既定にする */
  readyState = 4
  onended: (() => void) | null = null
  ontimeupdate: (() => void) | null = null
  onloadedmetadata: (() => void) | null = null
  onerror: (() => void) | null = null
  playCalls = 0
  pauseCalls = 0
  /** trueならplay()が拒否される（iOS Safariの自動再生制限の模擬。E4a） */
  playRejects = false

  async play(): Promise<void> {
    this.playCalls += 1
    if (this.playRejects) throw new Error('NotAllowedError: 自動再生が拒否された（模擬）')
  }
  pause(): void {
    this.pauseCalls += 1
  }
  /** テストから再生完了を模擬する */
  end(): void {
    this.onended?.()
  }
  /** テストからメディアエラーを模擬する */
  fireError(): void {
    this.onerror?.()
  }
  /** テストから timeupdate を模擬する（currentTime を進めてイベント発火） */
  tick(currentTime: number): void {
    this.currentTime = currentTime
    this.ontimeupdate?.()
  }
}

/** PackCache の最小フェイク */
class FakePackCache implements PackCache {
  private readonly blobs = new Map<string, Blob>()
  getCalls: string[] = []

  setBlob(url: string, content: string): void {
    this.blobs.set(url, new Blob([content]))
  }
  async has(url: string): Promise<boolean> {
    return this.blobs.has(url)
  }
  async get(url: string): Promise<Blob | null> {
    this.getCalls.push(url)
    return this.blobs.get(url) ?? null
  }
  async put(url: string, blob: Blob): Promise<void> {
    this.blobs.set(url, blob)
  }
  async addAll(): Promise<void> {}
  async delete(): Promise<void> {}
  async keys(): Promise<string[]> {
    return [...this.blobs.keys()]
  }
  async usage(): Promise<CacheUsage> {
    return { bytes: 0, entries: this.blobs.size }
  }
  async clear(): Promise<void> {
    this.blobs.clear()
  }
}

function createPlayer(
  durations: Record<string, number> = {},
  { seedCache = true, playRejects = false } = {},
) {
  const ctx = new FakeAudioContext()
  const packCache = new FakePackCache()
  for (const [src, duration] of Object.entries(durations)) {
    ctx.durations.set(src, duration)
    if (seedCache) packCache.setBlob(src, src)
  }
  const fetchAudio = vi.fn(async (src: string) => new Blob([src]))
  const audioElements: FakeAudioElement[] = []
  const createAudioElement = () => {
    const el = new FakeAudioElement()
    el.playRejects = playRejects
    audioElements.push(el)
    return el as unknown as HTMLAudioElement
  }
  const player = new WebAudioPlayer(
    packCache,
    () => ctx as unknown as AudioContext,
    fetchAudio,
    createAudioElement,
  )
  return { player, ctx, packCache, fetchAudio, audioElements }
}

describe('WebAudioPlayer', () => {
  it('unlock 前に play すると拒否される', async () => {
    const { player } = createPlayer({ 'a.mp3': 1 })
    await expect(player.play('a.mp3')).rejects.toThrow()
  })

  it('unlock で AudioContext が resume され、無音バッファが再生される（自動再生制限解除）', async () => {
    const { player, ctx } = createPlayer()
    await player.unlock()
    expect(ctx.state).toBe('running')
    expect(ctx.createdSources.length).toBe(1)
    expect(ctx.createdSources[0]!.startCalls.length).toBe(1)
  })

  it('startMs 指定で再生開始位置（オフセット秒）が計算される', async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3', { startMs: 1500 })
    await tick()
    const [source] = ctx.createdSources
    expect(source!.startCalls[0]!.offset).toBeCloseTo(1.5)

    source!.end()
    await done
  })

  it('durationMs 指定で部分再生の長さが AudioBufferSourceNode.start に渡る', async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3', { durationMs: 800 })
    await tick()
    const [source] = ctx.createdSources
    expect(source!.startCalls[0]!.duration).toBeCloseTo(0.8)

    source!.end()
    await done
  })

  it('playSequence は前の音源の長さ分ずらして連結スケジュールする', async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2, 'b.mp3': 3 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.playSequence(['a.mp3', 'b.mp3'])
    await tick()
    expect(ctx.createdSources.length).toBe(2)
    const [sourceA, sourceB] = ctx.createdSources
    expect(sourceA!.startCalls[0]!.when).toBeCloseTo(0)
    expect(sourceB!.startCalls[0]!.when).toBeCloseTo(2) // a.mp3 の長さ(2秒)分ずれる

    sourceA!.end()
    sourceB!.end()
    await done
  })

  it("stop で連結再生の残りを打ち切り、play の Promise は 'interrupted' で解決する", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2, 'b.mp3': 3 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.playSequence(['a.mp3', 'b.mp3'])
    await tick()
    expect(ctx.createdSources.length).toBe(2)

    player.stop()
    await expect(done).resolves.toBe('interrupted')
    expect(ctx.createdSources[0]!.stopped).toBe(true)
    expect(ctx.createdSources[1]!.stopped).toBe(true)
  })

  it('replay は直前の再生をもう一度行う（バッファはキャッシュから再利用）', async () => {
    const { player, ctx, packCache } = createPlayer({ 'a.mp3': 1 })
    await player.unlock()
    ctx.createdSources = []

    const first = player.play('a.mp3')
    await tick()
    ctx.createdSources[0]!.end()
    await first

    const second = player.replay()
    await tick()
    expect(ctx.createdSources.length).toBe(2)
    ctx.createdSources[1]!.end()
    await second

    // デコード済み AudioBuffer はメモリキャッシュされ、2回目は PackCache を再取得しない
    expect(packCache.getCalls.filter((url) => url === 'a.mp3').length).toBe(1)
  })

  it("replay は再生履歴がなければ何もせず 'interrupted' を返す", async () => {
    const { player } = createPlayer()
    await player.unlock()
    // 何も再生していない＝完走していないため 'interrupted'（契約=AudioPlayer.ts）
    await expect(player.replay()).resolves.toBe('interrupted')
  })

  it('PackCache がキャッシュmissの場合は fetch にフォールバックする', async () => {
    const { player, ctx, fetchAudio } = createPlayer({ 'a.mp3': 1 }, { seedCache: false })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3')
    await tick()
    expect(fetchAudio).toHaveBeenCalledWith('a.mp3')

    ctx.createdSources[0]!.end()
    await done
  })

  // 何を防ぐか: フォールバック取得した内容をキャッシュへ書き戻さないと、オンラインの間は
  // fetchでしのげてしまい気づかないまま、次回以降も同じmissを繰り返す。
  // オフラインに入った瞬間に再生できなくなる（T-183 Q-13）
  it('T-183 Q-13: AudioBuffer経路のフォールバック取得結果をPackCacheへ書き戻す', async () => {
    const { player, ctx, packCache } = createPlayer({ 'a.mp3': 1 }, { seedCache: false })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3')
    await tick()
    ctx.createdSources[0]!.end()
    await done

    expect(await packCache.get('a.mp3')).not.toBeNull()
  })

  it('T-183 Q-13: rate経路のフォールバック取得結果をPackCacheへ書き戻す', async () => {
    const { player, ctx, packCache, audioElements } = createPlayer(
      { 'a.mp3': 1 },
      { seedCache: false },
    )
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3', { rate: 0.85 })
    await tick()
    audioElements[0]!.end()
    await done

    expect(await packCache.get('a.mp3')).not.toBeNull()
  })
})

describe('WebAudioPlayer: onPosition（T-45・3.7節）', () => {
  it('AudioBuffer経路で単調増加の再生位置を通知する', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []
    const onPosition = vi.fn()

    const done = player.play('a.mp3', { onPosition })
    await tick()

    ctx.currentTime = 0.1
    await vi.advanceTimersByTimeAsync(100)
    ctx.currentTime = 0.2
    await vi.advanceTimersByTimeAsync(100)

    expect(onPosition.mock.calls.map((c) => c[0])).toEqual([100, 200])

    ctx.createdSources[0]!.end()
    await done
    vi.useRealTimers()
  })

  // 何を防ぐか: 問題パックの timing（単語開始ms）はファイル先頭からの絶対msなので、
  // onPosition が区間相対位置を返すとシャドーイングの3秒戻し・文タップの区間リピート
  // （startMs>0）でカラオケハイライトが先頭語に戻り、音声とずれる
  it('AudioBuffer経路で startMs>0 のとき絶対位置（startMs起点）を通知する', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []
    const onPosition = vi.fn()

    const done = player.play('a.mp3', { startMs: 2000, onPosition })
    await tick()

    ctx.currentTime = 0.1
    await vi.advanceTimersByTimeAsync(100)
    ctx.currentTime = 0.2
    await vi.advanceTimersByTimeAsync(100)

    expect(onPosition.mock.calls.map((c) => c[0])).toEqual([2100, 2200])

    ctx.createdSources[0]!.end()
    await done
    vi.useRealTimers()
  })

  it('rate経路（HTMLAudioElement）で startMs>0 のとき絶対位置を通知する', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    const onPosition = vi.fn()

    const done = player.play('a.mp3', { rate: 0.85, startMs: 2000, onPosition })
    await tick()
    const audio = audioElements[0]!
    expect(audio.currentTime).toBeCloseTo(2) // startMs へシークされている

    audio.currentTime = 2.1
    await vi.advanceTimersByTimeAsync(100)
    audio.currentTime = 2.2
    await vi.advanceTimersByTimeAsync(100)

    expect(onPosition.mock.calls.map((c) => c[0])).toEqual([2100, 2200])

    audio.end()
    await done
    vi.useRealTimers()
  })

  // 何を防ぐか: 2経路の座標系の食い違い（片方が絶対位置・片方が区間相対位置）の再発
  it('同一 startMs に対して両経路が同じ座標系（絶対位置）を返す', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const startMs = 1500

    // AudioBuffer経路: 再生開始から300ms経過
    const bufferPath = createPlayer({ 'a.mp3': 5 })
    await bufferPath.player.unlock()
    bufferPath.ctx.createdSources = []
    const bufferPositions: number[] = []
    const bufferDone = bufferPath.player.play('a.mp3', {
      startMs,
      onPosition: (ms) => bufferPositions.push(ms),
    })
    await tick()
    bufferPath.ctx.currentTime = 0.3
    await vi.advanceTimersByTimeAsync(100)
    bufferPath.ctx.createdSources[0]!.end()
    await bufferDone

    // rate経路: 同じく再生開始から300ms相当（メディア時間で startMs+300ms）
    const ratePath = createPlayer({ 'a.mp3': 5 })
    await ratePath.player.unlock()
    const ratePositions: number[] = []
    const rateDone = ratePath.player.play('a.mp3', {
      startMs,
      rate: 0.85,
      onPosition: (ms) => ratePositions.push(ms),
    })
    await tick()
    ratePath.audioElements[0]!.currentTime = startMs / 1000 + 0.3
    await vi.advanceTimersByTimeAsync(100)
    ratePath.audioElements[0]!.end()
    await rateDone

    expect(bufferPositions[0]).toBeCloseTo(1800)
    expect(ratePositions[0]).toBeCloseTo(1800)
    vi.useRealTimers()
  })

  it('停止すると位置通知タイマーも止まる', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []
    const onPosition = vi.fn()

    const done = player.play('a.mp3', { onPosition })
    await tick()
    player.stop()
    await done

    onPosition.mockClear()
    await vi.advanceTimersByTimeAsync(500)
    expect(onPosition).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})

describe('WebAudioPlayer: rate（T-45・J-27・3.7節）', () => {
  it('rate指定時は HTMLAudioElement 経路が選ばれ、playbackRate/preservesPitch が設定される', async () => {
    const { player, ctx, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3', { rate: 0.85 })
    await tick()

    expect(ctx.createdSources.length).toBe(0) // AudioBufferSourceNode経路は使われない
    expect(audioElements.length).toBe(1)
    expect(audioElements[0]!.playbackRate).toBe(0.85)
    expect(audioElements[0]!.preservesPitch).toBe(true)
    expect(audioElements[0]!.playCalls).toBe(1)

    audioElements[0]!.end()
    await done
  })

  it('rateが1のときはAudioBufferSourceNode経路のまま（HTMLAudioElementは使わない）', async () => {
    const { player, ctx, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3', { rate: 1 })
    await tick()
    expect(ctx.createdSources.length).toBe(1)
    expect(audioElements.length).toBe(0)

    ctx.createdSources[0]!.end()
    await done
  })

  it('rate経路でも startMs（再生開始位置）と durationMs（部分再生の長さ）が機能する', async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()

    const done = player.play('a.mp3', { rate: 1.3, startMs: 1000, durationMs: 500 })
    await tick()

    const audio = audioElements[0]!
    expect(audio.currentTime).toBeCloseTo(1)

    audio.tick(1.5) // startSec(1) + durationSec(0.5) に到達
    await done
    expect(audio.pauseCalls).toBe(1)
  })

  it("stop で rate経路の再生を打ち切り、play の Promise は 'interrupted' で解決する", async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()

    const done = player.play('a.mp3', { rate: 0.85 })
    await tick()

    player.stop()
    await expect(done).resolves.toBe('interrupted')
    expect(audioElements[0]!.pauseCalls).toBeGreaterThanOrEqual(1)
  })

  it('replay は rate経路でも直前の再生をもう一度行う', async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()

    const first = player.play('a.mp3', { rate: 0.85 })
    await tick()
    audioElements[0]!.end()
    await first

    const second = player.replay()
    await tick()
    expect(audioElements.length).toBe(2)
    expect(audioElements[1]!.playbackRate).toBe(0.85)

    audioElements[1]!.end()
    await second
  })

  // 何を防ぐか: play()拒否（iOS Safariの自動再生制限等）を握りつぶすとPromiseが永遠に
  // 未解決になり、await している呼び出し側（DrillScreen等）が「再生中…」のまま固まる
  it('rate経路: audio.play() の拒否で play の Promise が reject する', async () => {
    const { player } = createPlayer({ 'a.mp3': 5 }, { playRejects: true })
    await player.unlock()

    await expect(player.play('a.mp3', { rate: 0.85 })).rejects.toThrow()
  })

  it('rate経路: メディアエラー（onerror）でも play の Promise が reject する', async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()

    const done = player.play('a.mp3', { rate: 0.85 })
    await tick()
    audioElements[0]!.fireError()

    await expect(done).rejects.toThrow()
  })

  it('rate経路でも onPosition が通知される（シャドーイングのカラオケハイライト用途）', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { player, audioElements } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    const onPosition = vi.fn()

    const done = player.play('a.mp3', { rate: 1.15, onPosition })
    await tick()
    const audio = audioElements[0]!

    audio.currentTime = 0.1
    await vi.advanceTimersByTimeAsync(100)
    audio.currentTime = 0.2
    await vi.advanceTimersByTimeAsync(100)

    expect(onPosition.mock.calls.map((c) => c[0])).toEqual([100, 200])

    audio.end()
    await done
    vi.useRealTimers()
  })
})

describe('WebAudioPlayer: 並行startSequenceの競合とAudioContext状態（レビュー修正E4）', () => {
  // 何を防ぐか: バッファ読込await中に2回目のstartSequenceが入ると（自動再生effectと
  // 手動タップの重なり・シャドーイングの連打）、stopped=falseリセットで両方が再生
  // スケジュールされ二重再生になり、pendingResolve上書きで片方のPromiseが永遠に未解決になる
  it('バッファ読込await中に後続のstartSequenceが入っても、先行Promiseは解決し二重再生されない', async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2, 'b.mp3': 3 })
    await player.unlock()
    ctx.createdSources = []

    const first = player.play('a.mp3')
    const second = player.play('b.mp3') // 読込await中の割り込み（tickを挟まず即時）
    await tick()

    // 先行呼び出しは再生せず解決する（永遠に未解決にならない）。完走していないので 'interrupted'
    await expect(first).resolves.toBe('interrupted')
    // 後続のb.mp3のみがスケジュールされる（二重再生しない）
    expect(ctx.createdSources.length).toBe(1)

    ctx.createdSources[0]!.end()
    await second
  })

  it('rate経路でも読込await中の後続呼び出しが優先され、先行Promiseは解決する', async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 2, 'b.mp3': 3 })
    await player.unlock()

    const first = player.play('a.mp3', { rate: 0.85 })
    const second = player.play('b.mp3', { rate: 0.85 })
    await tick()

    await expect(first).resolves.toBe('interrupted')
    expect(audioElements.length).toBe(1) // 後続分のHTMLAudioElementだけが生成される

    audioElements[0]!.end()
    await second
  })

  // 何を防ぐか: iOSでは通話・Siri等の割り込みで非標準の'interrupted'状態になることがあり、
  // 'suspended'限定のresumeでは復帰できず再生不能のままになる（効果は環境依存）
  it("unlock は 'suspended' 以外の非running状態（'interrupted'等）でも resume を試みる", async () => {
    const { player, ctx } = createPlayer()
    ;(ctx as unknown as { state: string }).state = 'interrupted'

    await player.unlock()

    expect(ctx.state).toBe('running')
  })
})

describe('WebAudioPlayer: 完走と中断の区別（T-155）', () => {
  // 何を防ぐか: 呼び出し側が await の解決を「完走」と誤認すること。シャドーイングが
  // 3秒戻し（=中断）で周回を加算していた不具合（docs/27 のS-1）の再発防止で、
  // 契約側（戻り値）が完走と中断を区別できることを担保する
  it("最後まで再生し切ると 'ended' を返す", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3')
    await tick()
    ctx.createdSources[0]!.end()

    await expect(done).resolves.toBe('ended')
  })

  it("再生中に stop() を呼ぶと 'interrupted' を返す", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3')
    await tick()
    player.stop()

    await expect(done).resolves.toBe('interrupted')
  })

  it("playSequence を全ソース再生し切ると 'ended' を返す", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 1, 'b.mp3': 1 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.playSequence(['a.mp3', 'b.mp3'])
    await tick()
    ctx.createdSources[0]!.end()
    ctx.createdSources[1]!.end()

    await expect(done).resolves.toBe('ended')
  })

  it("連結再生の途中で stop() を呼ぶと 'interrupted' を返し、残りを再生しない", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 1, 'b.mp3': 3 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.playSequence(['a.mp3', 'b.mp3'])
    await tick()
    ctx.createdSources[0]!.end() // 1本目だけ再生し終える
    player.stop()

    await expect(done).resolves.toBe('interrupted')
    expect(ctx.createdSources[1]!.stopped).toBe(true)
  })

  it("rate経路でも最後まで再生し切ると 'ended' を返す", async () => {
    const { player, audioElements } = createPlayer({ 'a.mp3': 2 })
    await player.unlock()

    const done = player.play('a.mp3', { rate: 0.85 })
    await tick()
    audioElements[0]!.end()

    await expect(done).resolves.toBe('ended')
  })

  it("replay の完走は 'ended'、途中の stop() は 'interrupted' を返す", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2 })
    await player.unlock()
    ctx.createdSources = []

    const first = player.play('a.mp3')
    await tick()
    ctx.createdSources[0]!.end()
    await first

    const replayed = player.replay()
    await tick()
    ctx.createdSources[1]!.end()
    await expect(replayed).resolves.toBe('ended')

    const interrupted = player.replay()
    await tick()
    player.stop()
    await expect(interrupted).resolves.toBe('interrupted')
  })

  // 何を防ぐか（T-324・K-57）: iOSの通話・Siri等の割り込みでAudioContextが
  // running以外へ落ちても、source.onendedは発火しないため誰も待っているPromiseを
  // 解決せず、呼び出し側（DrillScreen等）が「再生中…」のUIで固着する
  it("再生中にAudioContextがrunning以外へ落ちると、UIが固着せず'interrupted'を返す", async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 5 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.play('a.mp3')
    await tick()
    ctx.setState('interrupted')

    await expect(done).resolves.toBe('interrupted')
  })
})

// T-222（Q-16）: デコード済みAudioBufferのキャッシュ上限が件数50のみで、バイト数を
// 見ていなかった。decodeAudioDataはサンプルレートに応じたfloat32 PCMへ展開するため、
// Part3/4級（30秒前後）の音声は1件あたり数MB〜10MB超になりうる。件数ではなく
// バイト数基準の上限に変える
describe('WebAudioPlayer: デコード済みバッファのキャッシュ上限（T-222・Q-16）', () => {
  it('合計サイズが上限を超えると、古いエントリだけを追い出してPackCacheを再取得させる', async () => {
    const { player, ctx, packCache } = createPlayer({
      'a.mp3': 1,
      'b.mp3': 1,
      'c.mp3': 1,
      'd.mp3': 1,
    })
    // 1件で上限の大部分を占める疑似サイズを仕込む（実容量は確保しない）
    ctx.sizesBytes.set('a.mp3', 50 * 1024 * 1024)
    ctx.sizesBytes.set('b.mp3', 10 * 1024 * 1024)
    ctx.sizesBytes.set('c.mp3', 10 * 1024 * 1024)
    ctx.sizesBytes.set('d.mp3', 20 * 1024 * 1024)
    await player.unlock()
    ctx.createdSources = []

    // a→b→cの順でロードする（合計70MiBは上限80MiBに収まるため、まだ何も追い出されない）
    for (const src of ['a.mp3', 'b.mp3', 'c.mp3']) {
      const done = player.play(src)
      await tick()
      ctx.createdSources[ctx.createdSources.length - 1]!.end()
      await done
    }

    // d（20MiB）を追加すると合計90MiBが上限(既定80MiB)を超えるため、
    // 最も古いa（50MiB）だけが追い出される（b・cは残り、合計は40MiBに収まる）
    const dDone = player.play('d.mp3')
    await tick()
    ctx.createdSources[ctx.createdSources.length - 1]!.end()
    await dDone

    // b・cはまだキャッシュに残っているはず（1回目の取得のみ）。
    // a.mp3のチェックより先に行う——a.mp3を再ロードするとまた追い出しが起き、
    // ここでの判定が汚染されるため
    const replayB = player.play('b.mp3')
    await tick()
    expect(packCache.getCalls.filter((url) => url === 'b.mp3').length).toBe(1)
    ctx.createdSources[ctx.createdSources.length - 1]!.end()
    await replayB

    const replayC = player.play('c.mp3')
    await tick()
    expect(packCache.getCalls.filter((url) => url === 'c.mp3').length).toBe(1)
    ctx.createdSources[ctx.createdSources.length - 1]!.end()
    await replayC

    // a.mp3 は追い出されているため、再生するとPackCacheへ再取得しにいく
    const replayA = player.play('a.mp3')
    await tick()
    expect(packCache.getCalls.filter((url) => url === 'a.mp3').length).toBe(2)
    ctx.createdSources[ctx.createdSources.length - 1]!.end()
    await replayA
  })

  it('単独で上限を超える大きさのバッファも拒否せずキャッシュする（再生に必要なため）', async () => {
    const { player, ctx, packCache } = createPlayer({ 'huge.mp3': 1 })
    ctx.sizesBytes.set('huge.mp3', 200 * 1024 * 1024) // 単独で既定上限(80MiB)を超える
    await player.unlock()
    ctx.createdSources = []

    const first = player.play('huge.mp3')
    await tick()
    ctx.createdSources[0]!.end()
    await first

    // 2回目はメモリキャッシュから再利用され、PackCacheを再取得しない
    const second = player.play('huge.mp3')
    await tick()
    expect(packCache.getCalls.filter((url) => url === 'huge.mp3').length).toBe(1)
    ctx.createdSources[1]!.end()
    await second
  })

  it('件数が50件未満でも、合計サイズが上限を超えれば追い出す（従来の件数50上限は撤廃）', async () => {
    const { player, ctx, packCache } = createPlayer()
    const srcs = Array.from({ length: 5 }, (_, i) => `f${i}.mp3`)
    for (const src of srcs) {
      packCache.setBlob(src, src)
      ctx.durations.set(src, 1)
      // 5件×20MiB=100MiBで既定上限80MiBを超える
      ctx.sizesBytes.set(src, 20 * 1024 * 1024)
    }
    await player.unlock()
    ctx.createdSources = []

    for (let i = 0; i < srcs.length; i++) {
      const done = player.play(srcs[i]!)
      await tick()
      ctx.createdSources[i]!.end()
      await done
    }

    // 最初のエントリ（f0.mp3）は追い出されているはず（件数は50件を大きく下回るが
    // バイト数超過で追い出される）
    const replay = player.play(srcs[0]!)
    await tick()
    expect(packCache.getCalls.filter((url) => url === srcs[0]).length).toBe(2)
    ctx.createdSources[srcs.length]!.end()
    await replay
  })
})
