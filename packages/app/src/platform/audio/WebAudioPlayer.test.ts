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

/** AudioContext の最小フェイク。decodeAudioData はテキスト内容から仕込んだ長さを返す */
class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  currentTime = 0
  sampleRate = 44100
  destination = {}
  createdSources: FakeAudioBufferSourceNode[] = []
  durations = new Map<string, number>()

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
    return { duration } as AudioBuffer
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

function createPlayer(durations: Record<string, number> = {}, { seedCache = true } = {}) {
  const ctx = new FakeAudioContext()
  const packCache = new FakePackCache()
  for (const [src, duration] of Object.entries(durations)) {
    ctx.durations.set(src, duration)
    if (seedCache) packCache.setBlob(src, src)
  }
  const fetchAudio = vi.fn(async (src: string) => new Blob([src]))
  const player = new WebAudioPlayer(packCache, () => ctx as unknown as AudioContext, fetchAudio)
  return { player, ctx, packCache, fetchAudio }
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

  it('stop で連結再生の残りを打ち切り、play の Promise は解決する', async () => {
    const { player, ctx } = createPlayer({ 'a.mp3': 2, 'b.mp3': 3 })
    await player.unlock()
    ctx.createdSources = []

    const done = player.playSequence(['a.mp3', 'b.mp3'])
    await tick()
    expect(ctx.createdSources.length).toBe(2)

    player.stop()
    await expect(done).resolves.toBeUndefined()
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

  it('replay は再生履歴がなければ何もしない', async () => {
    const { player } = createPlayer()
    await player.unlock()
    await expect(player.replay()).resolves.toBeUndefined()
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
})
