// コンテンツ配信・キャッシュ統合（T-35。正本: docs/05 3節、docs/04 2.1節・6節、docs/10 T-35行）。
//
// 起動時（オンラインのみ）に manifest.json を取得し、ハッシュに変化のあるパックだけを
// PackCache.addAll で自動ピン留めする。オフライン・取得失敗時は例外を投げず静かに
// スキップする（オフラインが正常系。CLAUDE.md不変条件）。M1はオンデマンド/LRUを
// 実装せず全パック常時ピン留め（実装指示4。容量閾値超過時の扱いはM1範囲外）。
//
// 【設計判断・docs未記載】1パックのピン留めに失敗しても他パックの同期は継続する
// （PackCache.addAllは1件でも失敗すると例外を投げる=パック単位の整合性を守る実装のため、
// 失敗したパックのhashだけ更新せず次回同期時に再試行させ、他パックを巻き込まない）。

import type { Manifest, Question, QuestionPack } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { PackCache } from '../platform'

const PACK_SYNC_STATE_KEY = 'packSyncState'

export interface PackSyncState {
  /** パックID → 最後に同期成功したmanifestのhash */
  packHashes: Record<string, string>
  /** manifest記載のsizeBytes合計（S9の使用量表示の参考値。実キャッシュ使用量とは別概念） */
  totalSizeBytes: number
  lastSyncedAt: number
}

const EMPTY_STATE: PackSyncState = { packHashes: {}, totalSizeBytes: 0, lastSyncedAt: 0 }

/** 直近の同期状態を読む（未同期なら空の状態） */
export async function loadPackSyncState(db: BebRaidDatabase): Promise<PackSyncState> {
  const record = await db.settings.get(PACK_SYNC_STATE_KEY)
  return (record?.value as PackSyncState | undefined) ?? EMPTY_STATE
}

async function savePackSyncState(db: BebRaidDatabase, state: PackSyncState): Promise<void> {
  await db.settings.put({ key: PACK_SYNC_STATE_KEY, value: state })
}

export interface SyncPacksOptions {
  db: BebRaidDatabase
  packCache: PackCache
  /** テスト注入用。省略時はグローバルfetch */
  fetchImpl?: typeof fetch
  /** テスト注入用。省略時は import.meta.env.BASE_URL（Pagesサブパス対応。App.tsxの音声パス修正と同じ理由） */
  baseUrl?: string
  now?: number
}

export interface SyncPacksResult {
  synced: string[]
  skipped: string[]
  totalSizeBytes: number
}

/** パック内のQuestionが参照する音声URL一覧（重複除去） */
function collectAudioUrls(baseUrl: string, questions: readonly Question[]): string[] {
  const urls = new Set<string>()
  for (const q of questions) {
    if (q.audio) urls.add(`${baseUrl}${q.audio}`)
    if (q.phraseAudio) urls.add(`${baseUrl}${q.phraseAudio}`)
  }
  return [...urls]
}

/**
 * manifest.jsonを取得し、ハッシュに変化のあるパックだけをPackCacheへピン留めする。
 * オフライン・manifest取得失敗時はnullを返す（呼び出し側はエラーUIを出さない）
 */
export async function syncPacks(options: SyncPacksOptions): Promise<SyncPacksResult | null> {
  const { db, packCache } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
  const now = options.now ?? Date.now()

  let manifest: Manifest
  try {
    const res = await fetchImpl(`${baseUrl}manifest.json`)
    if (!res.ok) return null
    manifest = (await res.json()) as Manifest
  } catch {
    return null
  }

  const state = await loadPackSyncState(db)
  const packHashes = { ...state.packHashes }
  const synced: string[] = []
  const skipped: string[] = []

  for (const entry of manifest.packs) {
    if (packHashes[entry.id] === entry.hash) {
      skipped.push(entry.id)
      continue
    }
    try {
      const packUrl = `${baseUrl}packs/${entry.id}.json`
      const packRes = await fetchImpl(packUrl)
      if (!packRes.ok) continue
      const pack = (await packRes.json()) as QuestionPack
      const urls = [packUrl, ...collectAudioUrls(baseUrl, pack.questions)]
      await packCache.addAll(urls)
      packHashes[entry.id] = entry.hash
      synced.push(entry.id)
    } catch {
      // このパックの同期失敗は無視し、他パックの同期は継続する（次回起動時に再試行）
      continue
    }
  }

  const totalSizeBytes = manifest.packs.reduce((sum, p) => sum + p.sizeBytes, 0)
  await savePackSyncState(db, { packHashes, totalSizeBytes, lastSyncedAt: now })

  return { synced, skipped, totalSizeBytes }
}

/**
 * 問題データ読み込み（実装指示3: PackCacheファースト、cache miss時のみfetch）。
 * 個別のUIコンポーネントがfetchを直接呼ばず、この関数経由でパックを読むことで
 * 読み込み経路を一本化する
 */
export async function loadPackQuestions(
  packCache: PackCache,
  packUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Question[]> {
  const cached = await packCache.get(packUrl)
  if (cached) {
    const pack = JSON.parse(await cached.text()) as QuestionPack
    return pack.questions
  }
  const res = await fetchImpl(packUrl)
  const pack = (await res.json()) as QuestionPack
  return pack.questions
}
