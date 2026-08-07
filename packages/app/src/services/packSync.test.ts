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
): PackCache & { putCalls: Array<[string, Blob]> } {
  const putCalls: Array<[string, Blob]> = []
  return {
    putCalls,
    // 既定は「キャッシュ実体が健全に残っている」通常ケース。T-183 Q-11の再現テストは
    // 明示的に false へ上書きする（手動削除・iOSストレージ退避で実体が失われた状態）
    has: vi.fn(async () => true),
    get: vi.fn(async () => null),
    put: vi.fn(async (url: string, blob: Blob) => {
      putCalls.push([url, blob])
    }),
    addAll: vi.fn(async () => {}),
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

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 404): Response {
  return {
    ok,
    status,
    json: async () => body,
    blob: async () => new Blob([JSON.stringify(body)]),
  } as unknown as Response
}

/** 音声等のバイナリ取得を模擬するレスポンス（T-321: 音声はfetch+putの逐次経路になった） */
function blobResponse(content = 'audio', ok = true, status = ok ? 200 : 404): Response {
  return { ok, status, blob: async () => new Blob([content]) } as unknown as Response
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

  // T-239（Q-82）: Manifest型にランタイムバリデータが無く、`as Manifest` の型アサーションを
  // 信用していたため、配信物が壊れている場合（GitHub Pages側の不整合・手動編集ミス等）に
  // syncPacks内部で未捕捉の例外（例: packsがundefinedでfor...ofが投げる）になっていた。
  // 「オフライン・manifest取得失敗時はnullを返す」という既存の契約に、manifest自体の
  // 構造不正も含める（例外を表面化させない）
  it('manifestの構造が不正なら例外を投げずnullを返す（配信物の破損を取得失敗と同様に扱う）', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const fetchImpl = vi.fn(async () => jsonResponse({}))
    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result).toBeNull()
    expect(packCache.addAll).not.toHaveBeenCalled()
  })

  it('manifestのpacksエントリが不正（sizeBytesが負等）でもnullを返す', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const brokenManifest = {
      schemaVersion: 2,
      packs: [{ id: 'p', title: 'p', targetLevel: [600, 600], sizeBytes: -1, hash: 'abc' }],
    }
    const fetchImpl = vi.fn(async () => jsonResponse(brokenManifest))
    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result).toBeNull()
    expect(packCache.addAll).not.toHaveBeenCalled()
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
      if (url === '/audio/part2/a.mp3') return blobResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/', now: 123 })
    expect(result).toEqual({ synced: ['pack-a'], skipped: [], totalSizeBytes: 100 })
    expect(packCache.putCalls.map(([url]) => url)).toEqual([
      '/manifest.json',
      '/packs/pack-a.json',
      '/audio/part2/a.mp3',
    ])

    const state = await loadPackSyncState(db)
    expect(state).toEqual({
      packHashes: { 'pack-a': 'h1' },
      totalSizeBytes: 100,
      lastSyncedAt: 123,
    })
  })

  // 何を防ぐか（T-321・K-54）: 旧実装は音声を含む全URLを1回のaddAllへ渡していた。
  // addAllは1件でも失敗すると全件を巻き戻す仕様のため、駅間の短い接続で音声の一部が
  // 取得できないと、取得できていた分も含めて0バイトのまま次回に持ち越されていた。
  // 1URL単位のfetch+putに分ければ、失敗した音声だけが欠け、成功した分はキャッシュに残る
  it('一部の音声取得が失敗しても、成功した音声はキャッシュに残る（addAllの全件巻き戻しを回避）', async () => {
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
              audio: 'audio/ok.mp3',
              audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
              script: 's',
              choices: [{ key: 'A', text: 'x' }],
              answer: 'A',
            },
            {
              id: 'q2',
              part: 2,
              format: 'audio_qa',
              difficulty: 1,
              tags: [],
              keyVocab: [],
              audio: 'audio/fail.mp3',
              audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
              script: 's',
              choices: [{ key: 'A', text: 'x' }],
              answer: 'A',
            },
          ]),
        )
      }
      if (url === '/audio/ok.mp3') return blobResponse('ok')
      if (url === '/audio/fail.mp3') throw new Error('network error（駅間切断を模擬）')
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })

    // パック自体は同期成功として扱われる（T-322でskip判定に音声実体チェックを足すため、
    // 欠けた音声は次回同期時に自己修復される）
    expect(result?.synced).toEqual(['pack-a'])
    expect(packCache.putCalls.map(([url]) => url)).toEqual([
      '/manifest.json',
      '/packs/pack-a.json',
      '/audio/ok.mp3',
    ])
  })

  // 何を防ぐか（T-321・K-59）: 進捗表示が無いと、大きいパックの取得中にUIが
  // 「何も起きていない」ように見え、途中で切断したのか単に時間がかかっているのか
  // 判別できない
  it('音声取得の進捗が完了ごとに通知される', async () => {
    const db = newDb()
    const packCache = fakePackCache()
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') {
        return jsonResponse(
          pack(
            ['a', 'b', 'c'].map((letter) => ({
              id: `q-${letter}`,
              part: 2,
              format: 'audio_qa' as const,
              difficulty: 1,
              tags: [],
              keyVocab: [],
              audio: `audio/${letter}.mp3`,
              audioMeta: { accent: 'US' as const, tts: true, voice: 'v', durationMs: 100 },
              script: 's',
              choices: [{ key: 'A', text: 'x' }],
              answer: 'A',
            })),
          ),
        )
      }
      return blobResponse()
    })
    const progressCalls: Array<{ packId: string; completed: number; total: number }> = []

    await syncPacks({
      db,
      packCache,
      fetchImpl,
      baseUrl: '/',
      onAudioProgress: (info) => progressCalls.push(info),
    })

    expect(progressCalls).toHaveLength(3)
    expect(progressCalls.every((c) => c.packId === 'pack-a' && c.total === 3)).toBe(true)
    expect(progressCalls.map((c) => c.completed).sort()).toEqual([1, 2, 3])
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
    // T-325: manifest.json自体はパックのskip/sync結果に関わらずcache-first用に書き戻す
    expect(packCache.putCalls.map(([url]) => url)).toEqual(['/manifest.json'])
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

  it('1パックのキャッシュ書き込み失敗は他パックの同期を止めず、失敗したパックのhashは更新しない', async () => {
    const db = newDb()
    const packCache = fakePackCache({
      put: vi.fn(async (url: string) => {
        if (url.includes('pack-fail')) throw new Error('cache write failed')
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

  it('T-73: 改版で不要になった旧URLをキャッシュから掃除する（現行manifest未参照分のみ）', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: {
        packHashes: { 'pack-a': 'old-hash', 'pack-b': 'unchanged' },
        totalSizeBytes: 0,
        lastSyncedAt: 0,
      },
    })
    const cachedPackB = pack([
      {
        id: 'b-1',
        part: 2,
        format: 'audio_qa',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        audio: 'audio/b.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
        script: 's',
        choices: [{ key: 'A', text: 'x' }],
        answer: 'A',
      },
    ])
    const packCache = fakePackCache({
      keys: vi.fn(async () => [
        '/packs/pack-a.json',
        '/audio/old.mp3', // pack-a旧版の音声。新版では参照されなくなる
        '/packs/pack-b.json',
        '/audio/b.mp3',
      ]),
      get: vi.fn(async (url: string) =>
        url === '/packs/pack-b.json' ? new Blob([JSON.stringify(cachedPackB)]) : null,
      ),
    })
    const m = manifest([
      { id: 'pack-a', hash: 'new-hash', sizeBytes: 50 },
      { id: 'pack-b', hash: 'unchanged', sizeBytes: 30 },
    ])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') {
        return jsonResponse(
          pack([
            {
              id: 'a-1',
              part: 2,
              format: 'audio_qa',
              difficulty: 1,
              tags: [],
              keyVocab: [],
              audio: 'audio/new.mp3',
              audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
              script: 's',
              choices: [{ key: 'A', text: 'x' }],
              answer: 'A',
            },
          ]),
        )
      }
      if (url === '/audio/new.mp3') return blobResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })

    await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })

    expect(packCache.delete).toHaveBeenCalledWith(['/audio/old.mp3'])
  })

  it('掃除の回帰: keys()が実ブラウザ同様の絶対URLを返しても、現行分を全削除しない（相対/絶対の表記差を吸収）', async () => {
    // 実ブラウザのCacheStoragePackCache.keys()はRequest.url=絶対URLを返す。
    // 本ファイルの既存フェイク（相対キーを返す）ではこの表記差のバグ
    // （validUrlsとの単純比較で全エントリがstale判定され毎回全削除）を検出できなかったため、
    // このテストは絶対URLを返すフェイクで検証する
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: {}, totalSizeBytes: 0, lastSyncedAt: 0 },
    })
    const abs = (path: string) => new URL(path, location.href).href
    const packCache = fakePackCache({
      keys: vi.fn(async () => [abs('/packs/pack-a.json'), abs('/audio/part2/a.mp3')]),
    })
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
      if (url === '/audio/part2/a.mp3') return blobResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })

    await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })

    // 直前にキャッシュした現行分（絶対URL表記でキャッシュ済み）が誤ってstale判定・削除されない
    expect(packCache.delete).not.toHaveBeenCalled()
  })

  it('掃除の回帰: keys()が絶対URLを返す場合でも、真に不要なURLだけを元の文字列のまま削除する', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 0 },
    })
    const abs = (path: string) => new URL(path, location.href).href
    const packCache = fakePackCache({
      keys: vi.fn(async () => [abs('/packs/pack-a.json'), abs('/audio/removed.mp3')]),
      get: vi.fn(async (url: string) =>
        url === '/packs/pack-a.json' ? new Blob([JSON.stringify(pack([]))]) : null,
      ),
    })
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async () => jsonResponse(m))

    await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })

    // deleteへ渡すのはkeys()が返した元の文字列（正規化後の文字列に置き換えない）
    expect(packCache.delete).toHaveBeenCalledWith([abs('/audio/removed.mp3')])
  })

  it('T-183 Q-11: ハッシュが一致していてもキャッシュの実体が無ければskipせず再取得する（手動削除・iOS退避からの自己修復）', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 0 },
    })
    // ハッシュはpack-syncState通り一致しているが、実体はキャッシュに存在しない
    // （手動削除・iOSストレージ退避を模擬）
    const packCache = fakePackCache({ has: vi.fn(async () => false) })
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') return jsonResponse(pack([]))
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.synced).toEqual(['pack-a'])
    expect(result?.skipped).toEqual([])
    expect(packCache.putCalls.map(([url]) => url)).toEqual(['/manifest.json', '/packs/pack-a.json'])
  })

  // 何を防ぐか（T-322・K-55）: T-321で音声が1URL単位のfetch+putになったため、
  // パックJSON自体は完全に同期成功してhashが更新されても、一部の音声だけが
  // 欠けた状態になり得る。旧来のskip判定（ハッシュ一致＋パックJSONの実体確認のみ）は
  // この「音声だけ欠けた」状態を検知できず、二度と再取得されなくなる
  it('ハッシュ・パックJSONの実体は一致していても音声サンプルが欠けていればskipせず再取得する（自己修復）', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 0 },
    })
    const cachedPack = pack([
      {
        id: 'q1',
        part: 2,
        format: 'audio_qa',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        audio: 'audio/a.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
        script: 's',
        choices: [{ key: 'A', text: 'x' }],
        answer: 'A',
      },
    ])
    const packCache = fakePackCache({
      get: vi.fn(async (url: string) =>
        url === '/packs/pack-a.json' ? new Blob([JSON.stringify(cachedPack)]) : null,
      ),
      // パックJSONの実体はあるが、参照している音声だけキャッシュに存在しない
      // （T-321導入前にaddAllで部分失敗していた等）
      has: vi.fn(async (url: string) => url === '/packs/pack-a.json'),
    })
    const m = manifest([{ id: 'pack-a', hash: 'h1', sizeBytes: 100 }])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') return jsonResponse(cachedPack)
      if (url === '/audio/a.mp3') return blobResponse()
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.skipped).toEqual([])
    expect(result?.synced).toEqual(['pack-a'])
    expect(packCache.putCalls.map(([url]) => url)).toEqual([
      '/manifest.json',
      '/packs/pack-a.json',
      '/audio/a.mp3',
    ])
  })

  it('T-73: 再同期に失敗したパックの既存URLは掃除で消さない', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-a': 'old-hash' }, totalSizeBytes: 0, lastSyncedAt: 0 },
    })
    const cachedPackA = pack([
      {
        id: 'a-1',
        part: 2,
        format: 'audio_qa',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        audio: 'audio/old.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 100 },
        script: 's',
        choices: [{ key: 'A', text: 'x' }],
        answer: 'A',
      },
    ])
    const packCache = fakePackCache({
      keys: vi.fn(async () => ['/packs/pack-a.json', '/audio/old.mp3']),
      get: vi.fn(async (url: string) =>
        url === '/packs/pack-a.json' ? new Blob([JSON.stringify(cachedPackA)]) : null,
      ),
    })
    const m = manifest([{ id: 'pack-a', hash: 'new-hash', sizeBytes: 50 }])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-a.json') throw new Error('network error')
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.synced).toEqual([])
    expect(packCache.delete).not.toHaveBeenCalled()
  })

  // 何を防ぐか（T-323・K-56）: 取得失敗したパックの既存URL保護はcollectCachedAudioUrls
  // （キャッシュ済みJSONのパース）に依存する。このフォールバック自体が空配列を返す
  // 状況（キャッシュ済みJSONが読めない等）では保護が効かず、無関係な旧URLの掃除に
  // 巻き込まれて現行の音声まで削除されうる。「1パックでも失敗していれば掃除自体を
  // 全面的に見送る」という、フォールバックの成否に依存しないより厳格な条件にする
  it('T-323: 1パックでも同期に失敗していれば、掃除処理自体を実行しない', async () => {
    const db = newDb()
    await db.settings.put({
      key: 'packSyncState',
      value: { packHashes: { 'pack-ok': 'h1' }, totalSizeBytes: 0, lastSyncedAt: 0 },
    })
    const packCache = fakePackCache({
      // pack-failの保護フォールバック（collectCachedAudioUrls）が効かない状況を模擬
      // （キャッシュ済みJSONが読めない＝get()がnullを返す）
      get: vi.fn(async () => null),
      // /audio/orphan.mp3はどのパックにも現行では参照されない、無関係な旧キャッシュ
      keys: vi.fn(async () => ['/packs/pack-ok.json', '/audio/orphan.mp3']),
    })
    const m = manifest([
      { id: 'pack-ok', hash: 'h1', sizeBytes: 10 },
      { id: 'pack-fail', hash: 'h2', sizeBytes: 20 },
    ])
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      if (url === '/manifest.json') return jsonResponse(m)
      if (url === '/packs/pack-fail.json') throw new Error('network error')
      throw new Error(`unexpected fetch: ${url}`)
    })

    const result = await syncPacks({ db, packCache, fetchImpl, baseUrl: '/' })
    expect(result?.skipped).toEqual(['pack-ok'])
    expect(result?.synced).toEqual([])
    // pack-failが同期できていない以上、/audio/orphan.mp3が本当に不要かどうか判断できない。
    // 掃除自体を見送り、削除しない
    expect(packCache.delete).not.toHaveBeenCalled()
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

  it('T-73: fetchが404を返した場合、JSONパースエラーではなく明示的なエラーを投げる', async () => {
    const packCache = fakePackCache()
    const fetchImpl = vi.fn(async () => jsonResponse('<html>Not Found</html>', false, 404))
    await expect(loadPackQuestions(packCache, '/packs/missing.json', fetchImpl)).rejects.toThrow(
      /HTTP 404/,
    )
  })

  it('T-183 Q-13: fetchフォールバックで取得したパック内容をキャッシュへ書き戻す（次回のmissを防ぐ）', async () => {
    const p = pack([])
    const putCalls: Array<[string, Blob]> = []
    const packCache = fakePackCache({
      get: vi.fn(async () => null),
      put: vi.fn(async (url: string, blob: Blob) => {
        putCalls.push([url, blob])
      }),
    })
    const fetchImpl = vi.fn(async () => jsonResponse(p))

    await loadPackQuestions(packCache, '/packs/x.json', fetchImpl)

    expect(putCalls).toHaveLength(1)
    expect(putCalls[0]![0]).toBe('/packs/x.json')
    const written = JSON.parse(await putCalls[0]![1].text())
    expect(written).toEqual(p)
  })
})
