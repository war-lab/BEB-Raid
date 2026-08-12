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

import {
  validateManifest,
  type Manifest,
  type Question,
  type QuestionPack,
} from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { PackCache } from '../platform'

/** settingsストア上の同期状態キー（backup.tsのEXPORT_EXCLUDED_KEYSからも参照する） */
export const PACK_SYNC_STATE_KEY = 'packSyncState'

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

// T-284（K-7）: 圏外遷移・電波不良でfetchが応答不能なまま待ち続けると、マウント時同期・
// online再同期のどちらも長時間止まる（inFlightが解放されず次回再同期の機会も失う）。
// manifestは小さく速いことを期待する一方、パック本体は音声参照を含むJSONでやや大きいため
// 別値にする
const MANIFEST_FETCH_TIMEOUT_MS = 5_000
const PACK_FETCH_TIMEOUT_MS = 15_000

/**
 * 掃除処理の比較専用にURLを絶対URLへ正規化する。
 * validUrlsはBASE_URL相対（例: `/packs/a.json`）で組み立てられる一方、実ブラウザの
 * CacheStoragePackCache.keys()はRequest.url=絶対URL（例: `http://host/packs/a.json`）を
 * 返すため、表記のまま比較すると全エントリがstale判定され毎回全削除される。
 * location未定義環境（テスト等）ではダミーのベースで解決する（相対同士の比較には十分）
 */
function toAbsoluteUrl(url: string): string {
  return new URL(url, globalThis.location?.href ?? 'http://localhost/').href
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
 * 既にキャッシュ済みのパック内容からURL一覧を読む（cache-onlyで再fetchしない）。
 * T-73: 掃除処理が「同期未変化（skip）」「再同期に失敗」のパックの現行URLを
 * 誤って削除しないよう保護するために使う。読めなければ空配列（掃除対象から守れないが、
 * 同期失敗自体は既存の再試行に任せるため例外にはしない）
 */
async function collectCachedAudioUrls(
  packCache: PackCache,
  baseUrl: string,
  packUrl: string,
): Promise<string[]> {
  try {
    const cached = await packCache.get(packUrl)
    if (!cached) return []
    const pack = JSON.parse(await cached.text()) as QuestionPack
    return collectAudioUrls(baseUrl, pack.questions)
  } catch {
    return []
  }
}

/**
 * manifest.jsonを取得し、ハッシュに変化のあるパックだけをPackCacheへピン留めする。
 * オフライン・manifest取得失敗時はnullを返す（呼び出し側はエラーUIを出さない）。
 * T-239（Q-82）: `as Manifest` の型アサーションのみで実行時検証が無かったため、配信物が
 * 壊れている場合（GitHub Pages側の不整合・手動編集ミス等）に未捕捉の例外になりうる
 * 経路があった（例: packsが配列でないとfor...ofが投げる）。構造不正も取得失敗と同様に
 * 扱い、nullを返す（オフラインが正常系という既存の縮退設計を配信物破損にも適用する）
 */
export async function syncPacks(options: SyncPacksOptions): Promise<SyncPacksResult | null> {
  const { db, packCache } = options
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
  const now = options.now ?? Date.now()

  let manifest: Manifest
  try {
    const res = await fetchImpl(`${baseUrl}manifest.json`, {
      signal: AbortSignal.timeout(MANIFEST_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (!validateManifest(body).ok) return null
    manifest = body as Manifest
  } catch {
    return null
  }

  const state = await loadPackSyncState(db)
  const packHashes = { ...state.packHashes }
  const synced: string[] = []
  const skipped: string[] = []
  // T-73: 現行manifestに対応するURL集合（パックJSON＋全音声）。掃除処理の「削除してよいか」判定に使う
  const validUrls = new Set<string>()

  for (const entry of manifest.packs) {
    const packUrl = `${baseUrl}packs/${entry.id}.json`
    validUrls.add(packUrl)
    // T-183 Q-11: ハッシュ一致だけでは実体の有無を確認できない。手動でのキャッシュ削除や
    // iOSのストレージ退避で実体が失われていてもハッシュは残るため、skipすると
    // 二度と再取得されなくなる。実体の有無を確認し、無ければ通常の同期経路へ落とす
    if (packHashes[entry.id] === entry.hash && (await packCache.has(packUrl))) {
      skipped.push(entry.id)
      for (const url of await collectCachedAudioUrls(packCache, baseUrl, packUrl)) {
        validUrls.add(url)
      }
      continue
    }
    let syncSucceeded = false
    try {
      const packRes = await fetchImpl(packUrl, {
        signal: AbortSignal.timeout(PACK_FETCH_TIMEOUT_MS),
      })
      if (packRes.ok) {
        const pack = (await packRes.json()) as QuestionPack
        const urls = [packUrl, ...collectAudioUrls(baseUrl, pack.questions)]
        await packCache.addAll(urls)
        packHashes[entry.id] = entry.hash
        synced.push(entry.id)
        for (const url of urls) validUrls.add(url)
        syncSucceeded = true
      }
    } catch {
      // このパックの同期失敗は無視し、他パックの同期は継続する（次回起動時に再試行）
    }
    if (!syncSucceeded) {
      // 新版の取得に失敗した場合、旧版の内容を掃除で誤って消さないよう既存キャッシュから保護する
      for (const url of await collectCachedAudioUrls(packCache, baseUrl, packUrl)) {
        validUrls.add(url)
      }
    }
  }

  // 現行manifestに含まれないURL（旧バージョンのパック・差し替え済み音声）を掃除する。
  // 掃除自体が失敗しても同期の成立には影響しないため無視する（次回同期時に再試行される）
  try {
    const cachedKeys = await packCache.keys()
    // keys()は絶対URLを返しうるため、双方を絶対URLへ正規化してから比較する
    // （deleteに渡すのはkeys()が返した元の文字列。正規化はあくまで比較専用）
    const validAbsoluteUrls = new Set([...validUrls].map(toAbsoluteUrl))
    const staleUrls = cachedKeys.filter((url) => !validAbsoluteUrls.has(toAbsoluteUrl(url)))
    if (staleUrls.length > 0) {
      await packCache.delete(staleUrls)
    }
  } catch {
    // 無視（掃除は次回同期時にも再試行される）
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
  if (!res.ok) throw new Error(`パック取得に失敗（HTTP ${res.status}）: ${packUrl}`)
  const pack = (await res.json()) as QuestionPack
  // T-183 Q-13: fetchフォールバックの取得結果をキャッシュへ書き戻す（書き戻さないと次回もmissする）。
  // 書き戻し失敗は無視する（次回のfetchフォールバックで再試行されるだけで、読み込み自体は止めない）
  try {
    await packCache.put(packUrl, new Blob([JSON.stringify(pack)]))
  } catch {
    // 無視
  }
  return pack.questions
}
