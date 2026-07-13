// T-35 完了条件のテスト:
// - manifest ハッシュ変化で再取得、無変化でスキップ（PackCacheモック）
// - オフライン起動（manifest取得失敗）でエラーが表面化しない（例外を投げずnullを返す）
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Manifest, QuestionPack } from '@beb-raid/shared-schema'
import { BebRaidDatabase } from '../db/database'
import type { PackCache } from '../platform'
import { loadPackQuestions, loadPackSyncState, syncPacks } from './packSync'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`pack-sync-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function fakePackCache(
  overrides: Partial<PackCache> = {},
): PackCache & { addAllCalls: string[][] } {
  const addAllCalls: string[][] = []
  return {
    addAllCalls,
    has: vi.fn(async () => false),
    get: vi.fn(async () => null),
    addAll: vi.fn(async (urls: string[]) => {
      addAllCalls.push(urls)
    }),
    delete: vi.fn(async () => {}),
    keys: vi.fn(async () => []),
    usage: vi.fn(async () => ({ bytes: 0, entries: 0 })),
    clear: vi.fn(async () => {}),
    ...overrides,
  }
}

function manifest(entries: { id: string; hash: string; sizeBytes: number }[]): Manifest {
  return {
    schemaVersion: 2,
    packs: entries.map((e) => ({
      id: e.id,
      title: e.id,
      targetLevel: [600, 600],
      sizeBytes: e.sizeBytes,
      hash: e.hash,
    })),
  }
}

function pack(questions: QuestionPack['questions']): QuestionPack {
  return {
    schemaVersion: 2,
    pack: {
      id: 'p',
      title: 'p',
      license: 'internal-original',
      origin: 'test',
      targetLevel: [600, 600],
    },
    questions,
  }
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as unknown as Response
}

describe('syncPacks', () => {
  it('manifest取得に失敗したら例外を投げずnullを返す（オフラインが正常系）', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const fetchImpl = vi.fn(async () => {
      throw new Error('network error')
    })
    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result).toBeNull()
    expect(packCache.addAll).not.toHaveBeenCalled()
  })

  it('manifestがokでなければnullを返す', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const fetchImpl = vi.fn(async () => jsonResponse(null, false))
    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result).toBeNull()
  })

  it('初回同期: 全パックが新規としてピン留めされ、状態が保存される', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') {
        return jsonResponse(
          pack([
            {
              id: 'q1',
              part: 2,
              format: 'audio_qa',
              difficulty: 1,
              tags: [],
              keyVocab: [],
              audio: 'audio/part2/a.mp3',
              audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
              script: 's',
              choices: [{ key: 'A', text: 'x' }],
              answer: 'A',
            },
          ]),
        )
      }
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/', now: 123 })
    expect(result).toEqual({ synced: ['pack-a'], skipped: [], totalSizeBytes: 100 })
    expect(packCache.addAllCalls).toEqual([['/packs/pack-a.json', '/audio/part2/a.mp3']])

    const state = await loadPackSyncState(db)
    expect(state).toEqual({
      packHashes: { 'pack-a': 'h1' },
      totalSizeBytes: 100,
      lastSyncedAt: 123,
    })
  })

  it('ハッシュが前回と同じならスキップし、addAllを呼ばない', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 0 },
    })
    const packCache = fakePackCache()
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async () => jsonResponse(m))

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result).toEqual({ synced: [], skipped: ['pack-a'], totalSizeBytes: 100 })
    expect(packCache.addAll).not.toHaveBeenCalled()
    // manifest.json以外はfetchされない（パックJSON自体も取りに行かない）
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('ハッシュが変化したパックだけ再ピン留めし、既存の状態を保持する', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: {
        packHashes: { 'pack-a': 'old-hash', 'pack-b': 'still-same' },
        totalSizeBytes: 0,
        lastSyncedAt: 0,
      },
    })
    const packCache = fakePackCache()
    const m = manifest([
      { id: 'pack-a', hash: 'new-hash', sizeBytes: 50 },
      { id: 'pack-b', hash: 'still-same', sizeBytes: 30 },
    ])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') return jsonResponse(pack([]))
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.synced).toEqual(['pack-a'])
    expect(result?.skipped).toEqual(['pack-b'])

    const state = await loadPackSyncState(db)
    expect(state.packHashes).toEqual({ 'pack-a': 'new-hash', 'pack-b': 'still-same' })
  })

  it('1パックのaddAll失敗は他パックの同期を止めず、失敗したパックのhashは更新しない', async () => {
    const db = newDb()
    const packCache = fakePackCache({
      addAll: vi.fn(async (urls: string[]) => {
        if (urls.some((u) => u.includes('pack-fail'))) throw new Error('cache write failed')
      }),
    })
    const m = manifest([
      { id: 'pack-fail', hash: 'h1', sizeBytes: 10 },
      { id: 'pack-ok', hash: 'h2', sizeBytes: 20 },
    ])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      return jsonResponse(pack([]))
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.synced).toEqual(['pack-ok'])

    const state = await loadPackSyncState(db)
    expect(state.packHashes).toEqual({ 'pack-ok': 'h2' })
  })
})

describe('loadPackQuestions', () => {
  it('キャッシュヒット時はfetchを呼ばずキャッシュ済みBlobから読む', async () => {
    const p = pack([])
    const packCache = fakePackCache({
      get: vi.fn(async () => new Blob([JSON.stringify(p)])),
    })
    const fetchImpl = vi.fn()
    const questions = await loadPackQuestions(packCache, '/packs/x.json', fetchImpl)
    expect(questions).toEqual([])
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('キャッシュmiss時はfetchにフォールバックする', async () => {
    const p = pack([])
    const packCache = fakePackCache()
    const fetchImpl = vi.fn(async () => jsonResponse(p))
    const questions = await loadPackQuestions(packCache, '/packs/x.json', fetchImpl)
    expect(questions).toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith('/packs/x.json')
  })
})
