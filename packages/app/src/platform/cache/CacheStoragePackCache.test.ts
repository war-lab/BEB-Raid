// T-325（K-60）完了条件のテスト:
// - usage() が全エントリを並列に問い合わせる（逐次だと960ファイル規模で起動が遅くなる）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheStoragePackCache } from './CacheStoragePackCache'

/**
 * Cache Storage APIの最小フェイク（jsdomは未実装のため）。
 * match()に人工的な非同期遅延を入れ、同時に何件が実行中かを記録することで、
 * usage()が逐次待ちか並列実行かを外部から観測できるようにする
 */
class FakeCache {
  private readonly store = new Map<string, { size: number; withContentLength: boolean }>()
  inFlight = 0
  maxInFlight = 0

  set(url: string, size: number, withContentLength = false): void {
    this.store.set(url, { size, withContentLength })
  }

  async match(req: string | Request): Promise<Response | undefined> {
    const url = typeof req === 'string' ? req : new URL(req.url).pathname
    const entry = this.store.get(url)
    if (!entry) return undefined
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    // 同時実行数を観測するため、他のmatch()呼び出しが追いつけるだけの間だけ待つ
    await new Promise((r) => setTimeout(r, 5))
    this.inFlight -= 1
    const body = 'x'.repeat(entry.size)
    const headers: Record<string, string> = entry.withContentLength
      ? { 'content-length': String(entry.size) }
      : {}
    return new Response(body, { headers })
  }

  async keys(): Promise<Request[]> {
    return [...this.store.keys()].map((url) => new Request(new URL(url, 'http://localhost/')))
  }
}

describe('CacheStoragePackCache.usage()', () => {
  let fakeCache: FakeCache

  beforeEach(() => {
    fakeCache = new FakeCache()
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache as unknown as Cache) })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // 何を防ぐか（T-325・K-60）: 旧実装はfor...ofでcache.match()を1件ずつawaitしていた。
  // 実測960ファイル規模では、1件あたり数msでも直列だと起動時の合計待ちが大きくなる。
  // Promise.allで並列化すれば、同時に複数件を問い合わせられる
  it('全エントリを並列に問い合わせる（同時実行数が1件ずつの逐次にならない）', async () => {
    const packCache = new CacheStoragePackCache()
    for (let i = 0; i < 5; i++) fakeCache.set(`/audio/${i}.mp3`, 10)

    await packCache.usage()

    expect(fakeCache.maxInFlight).toBeGreaterThan(1)
  })

  it('content-lengthがあればそれをバイト数として使う', async () => {
    const packCache = new CacheStoragePackCache()
    fakeCache.set('/a.mp3', 123, true)

    const usage = await packCache.usage()

    expect(usage).toEqual({ bytes: 123, entries: 1 })
  })

  it('content-lengthが無ければBlobサイズから合算する', async () => {
    const packCache = new CacheStoragePackCache()
    fakeCache.set('/a.mp3', 50, false)
    fakeCache.set('/b.mp3', 70, false)

    const usage = await packCache.usage()

    expect(usage).toEqual({ bytes: 120, entries: 2 })
  })
})
