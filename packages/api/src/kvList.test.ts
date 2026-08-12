// listAllKeysのテスト（正本: docs/30_改修計画_全量レビュー棚卸し.md T-244・29のQ-23、
// docs/32 T-337・K-72の反復上限）
import { describe, expect, it, vi } from 'vitest'

import { listAllKeys } from './kvList'

/** cursorが尽きるまでページを返すフェイクKV */
function fakeKv(pageCount: number): KVNamespace {
  let calls = 0
  return {
    list: vi.fn(async () => {
      calls += 1
      const isLast = calls >= pageCount
      return {
        keys: [{ name: `key-${calls}` }],
        list_complete: isLast,
        cursor: isLast ? undefined : `cursor-${calls}`,
      }
    }),
  } as unknown as KVNamespace
}

/** list_completeが永遠にfalseを返すフェイクKV（無限ループ再現用） */
function neverCompletingKv(): KVNamespace {
  let calls = 0
  return {
    list: vi.fn(async () => {
      calls += 1
      return { keys: [{ name: `key-${calls}` }], list_complete: false, cursor: `cursor-${calls}` }
    }),
  } as unknown as KVNamespace
}

describe('listAllKeys', () => {
  it('list_completeになるまで全ページを読み切る', async () => {
    const kv = fakeKv(3)
    const keys = await listAllKeys(kv, { prefix: 'member:' })
    expect(keys.map((k) => k.name)).toEqual(['key-1', 'key-2', 'key-3'])
  })

  // 何を防ぐか（T-337・K-72）: 旧実装は`for (;;)`でlist_completeだけを終了条件にしており、
  // KV側の不具合等でlist_completeが真にならない場合に無限ループへ陥る構造だった。
  // 反復上限を超えたら明示的な例外にする（無限ループで気づかれないまま
  // メモリ・実行時間を消費し続けるより、失敗として検出できる方が安全）
  it('list_completeが永遠に返らない場合、反復上限に達すると明示的な例外になる（無限ループしない）', async () => {
    const kv = neverCompletingKv()
    await expect(listAllKeys(kv, { prefix: 'member:' })).rejects.toThrow(/ページ反復数の上限/)
  })
})
