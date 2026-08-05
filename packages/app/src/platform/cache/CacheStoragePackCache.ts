// PackCache の Web 実装: Cache Storage を SW を介さず直接使う。
// アプリシェルの precache（vite-plugin-pwa / Workbox 管理）とは別名のキャッシュを持つ。

import type { CacheUsage, PackCache } from './PackCache'

/** パック用キャッシュ名（Workbox の precache 名前空間と衝突しない独自名） */
const CACHE_NAME = 'beb-pack-cache-v1'

export class CacheStoragePackCache implements PackCache {
  private open(): Promise<Cache> {
    return caches.open(CACHE_NAME)
  }

  async has(url: string): Promise<boolean> {
    const cache = await this.open()
    return (await cache.match(url)) !== undefined
  }

  async get(url: string): Promise<Blob | null> {
    const cache = await this.open()
    const res = await cache.match(url)
    return res ? res.blob() : null
  }

  async put(url: string, blob: Blob): Promise<void> {
    const cache = await this.open()
    await cache.put(url, new Response(blob))
  }

  async addAll(urls: string[]): Promise<void> {
    const cache = await this.open()
    // Cache.addAll は1件でも失敗すると reject する（パック単位の整合性はこの挙動に乗る）
    await cache.addAll(urls)
  }

  async delete(urls: string[]): Promise<void> {
    const cache = await this.open()
    await Promise.all(urls.map((url) => cache.delete(url)))
  }

  async keys(): Promise<string[]> {
    const cache = await this.open()
    const requests = await cache.keys()
    return requests.map((req) => req.url)
  }

  async usage(): Promise<CacheUsage> {
    const cache = await this.open()
    const requests = await cache.keys()
    let bytes = 0
    for (const req of requests) {
      const res = await cache.match(req)
      if (!res) continue
      const len = res.headers.get('content-length')
      if (len) {
        bytes += Number(len)
      } else {
        bytes += (await res.clone().blob()).size
      }
    }
    return { bytes, entries: requests.length }
  }

  async clear(): Promise<void> {
    await caches.delete(CACHE_NAME)
  }
}
