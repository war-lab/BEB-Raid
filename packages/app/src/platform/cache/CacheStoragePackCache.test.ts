// T-294（K-21）: PackCacheの実運用実装（Cache Storage直叩き）に専用テストが無かった。
// オフラインが正常系という設計の実際の成立点（パックJSON・音声の永続化）を担うため、
// 主要分岐（有無判定・取得・格納・一括ピン留めの原子性・削除・列挙・使用量算出・全消去）を検証する。
//
// jsdomはCache Storage APIを実装しないため、テスト専用の最小フェイクをglobalThis.cachesへ
// スタブする（本クラスがcaches.open/cache.match等をどう呼ぶかだけを検証する目的のため、
// 実ブラウザの厳密な仕様準拠までは再現しない）
//
// T-325（K-60）: usage()が全エントリを並列に問い合わせることも検証する
// （旧実装はfor...ofでcache.match()を1件ずつawaitしていた。実測960ファイル規模では
// 1件あたり数msでも直列だと起動時の合計待ちが大きくなる）。match()に人工的な
// 非同期遅延を入れ、同時に何件が実行中かを記録することで、usage()の並列度を外部から観測する
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CacheStoragePackCache } from './CacheStoragePackCache'

/**
 * jsdom環境のグローバルBlobとfetch実装（undici由来）のResponseは別実装で、
 * `new Response(new Blob([...]))` が `blob.stream is not a function` で失敗する。
 * Response.blob() が返すBlobはResponse側と同じ実装のため、これ経由で作る
 */
async function nativeBlob(content: string): Promise<Blob> {
  return await new Response(content).blob()
}

/** キャッシュAPIはmatch/put/deleteに文字列URLだけでなくRequest相当のオブジェクトも
 * 渡せる（usage()はkeys()が返したオブジェクトをそのままmatch()へ渡す）。両方を吸収する */
function urlOf(request: string | { url: string }): string {
  return typeof request === 'string' ? request : request.url
}

class FakeCache {
  store = new Map<string, Response>()
  inFlight = 0
  maxInFlight = 0

  async match(request: string | { url: string }): Promise<Response | undefined> {
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    // 同時実行数を観測するため、他のmatch()呼び出しが追いつけるだけの間だけ待つ
    await new Promise((r) => setTimeout(r, 5))
    this.inFlight -= 1
    return this.store.get(urlOf(request))
  }

  async put(request: string | { url: string }, response: Response): Promise<void> {
    this.store.set(urlOf(request), response)
  }

  async delete(request: string | { url: string }): Promise<boolean> {
    return this.store.delete(urlOf(request))
  }

  async keys(): Promise<{ url: string }[]> {
    return [...this.store.keys()].map((url) => ({ url }))
  }

  /** 実Cache.addAllと同じく、1件でも失敗すると何も書き込まず全体を失敗させる（原子性） */
  async addAll(urls: string[]): Promise<void> {
    const responses = await Promise.all(urls.map((url) => fetch(url)))
    urls.forEach((url, i) => this.store.set(url, responses[i]!))
  }
}

class FakeCacheStorage {
  caches = new Map<string, FakeCache>()

  async open(name: string): Promise<FakeCache> {
    if (!this.caches.has(name)) this.caches.set(name, new FakeCache())
    return this.caches.get(name)!
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name)
  }
}

let fakeCaches: FakeCacheStorage

beforeEach(() => {
  fakeCaches = new FakeCacheStorage()
  vi.stubGlobal('caches', fakeCaches)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CacheStoragePackCache', () => {
  it('put→hasで存在判定できる。未putのurlはfalse', async () => {
    const cache = new CacheStoragePackCache()
    expect(await cache.has('/packs/a.json')).toBe(false)

    await cache.put('/packs/a.json', await nativeBlob('{}'))
    expect(await cache.has('/packs/a.json')).toBe(true)
  })

  it('put→getで格納したBlobの内容を取得できる。未putのurlはnullを返す', async () => {
    const cache = new CacheStoragePackCache()
    expect(await cache.get('/packs/missing.json')).toBeNull()

    await cache.put('/packs/a.json', await nativeBlob('{"pack":"a"}'))
    const got = await cache.get('/packs/a.json')
    expect(await got?.text()).toBe('{"pack":"a"}')
  })

  it('addAllは全件成功時にすべて格納される', async () => {
    const cache = new CacheStoragePackCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(`body:${url}`)),
    )

    await cache.addAll(['/packs/a.json', '/packs/b.json'])

    expect(await cache.has('/packs/a.json')).toBe(true)
    expect(await cache.has('/packs/b.json')).toBe(true)
  })

  it('addAllは1件でも失敗すると何も格納しない（パック単位の整合性）', async () => {
    const cache = new CacheStoragePackCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/packs/bad.json') throw new Error('network error')
        return new Response(`body:${url}`)
      }),
    )

    await expect(cache.addAll(['/packs/a.json', '/packs/bad.json'])).rejects.toThrow()
    expect(await cache.has('/packs/a.json')).toBe(false)
  })

  it('deleteは指定urlのみ削除し、他のエントリは残る', async () => {
    const cache = new CacheStoragePackCache()
    await cache.put('/packs/a.json', await nativeBlob('a'))
    await cache.put('/packs/b.json', await nativeBlob('b'))

    await cache.delete(['/packs/a.json'])

    expect(await cache.has('/packs/a.json')).toBe(false)
    expect(await cache.has('/packs/b.json')).toBe(true)
  })

  it('keysは格納済みの全url一覧を返す', async () => {
    const cache = new CacheStoragePackCache()
    await cache.put('/packs/a.json', await nativeBlob('a'))
    await cache.put('/audio/x.mp3', await nativeBlob('x'))

    const keys = await cache.keys()
    expect(new Set(keys)).toEqual(new Set(['/packs/a.json', '/audio/x.mp3']))
  })

  // 何を防ぐか（T-325・K-60）: 旧実装はfor...ofでcache.match()を1件ずつawaitしていた。
  // 実測960ファイル規模では、1件あたり数msでも直列だと起動時の合計待ちが大きくなる。
  // Promise.allで並列化すれば、同時に複数件を問い合わせられる
  it('usageは全エントリを並列に問い合わせる（同時実行数が1件ずつの逐次にならない）', async () => {
    const cache = new CacheStoragePackCache()
    for (let i = 0; i < 5; i++) await cache.put(`/audio/${i}.mp3`, await nativeBlob('x'))

    const fakeCache = await fakeCaches.open('beb-pack-cache-v1')
    await cache.usage()

    expect(fakeCache.maxInFlight).toBeGreaterThan(1)
  })

  it('usageはcontent-lengthヘッダがあればそれを合算する', async () => {
    // put()は内部でnew Response(blob)へ包み直すため、通常はcontent-lengthが付かない
    // （下のフォールバックテストで確認する）。ヘッダつきレスポンスが来る経路
    // （SW経由の取得等）を模擬するため、フェイクの内部ストアへ直接投入する
    const cache = new CacheStoragePackCache()
    const fakeCache = await fakeCaches.open('beb-pack-cache-v1')
    fakeCache.store.set(
      '/packs/a.json',
      new Response('12345', { headers: { 'content-length': '5' } }),
    )

    const usage = await cache.usage()
    expect(usage.entries).toBe(1)
    expect(usage.bytes).toBe(5)
  })

  it('usageはcontent-lengthヘッダが無い場合、blob.sizeへフォールバックする', async () => {
    const cache = new CacheStoragePackCache()
    await cache.put('/packs/a.json', await nativeBlob('12345')) // 5バイト、ヘッダ無し

    const usage = await cache.usage()
    expect(usage.entries).toBe(1)
    expect(usage.bytes).toBe(5)
  })

  it('clearは名前空間ごとキャッシュを削除する（以後の再openは空になる）', async () => {
    const cache = new CacheStoragePackCache()
    await cache.put('/packs/a.json', await nativeBlob('a'))
    expect(await cache.has('/packs/a.json')).toBe(true)

    await cache.clear()

    expect(await cache.has('/packs/a.json')).toBe(false)
  })
})
