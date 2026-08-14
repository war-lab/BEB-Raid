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
  /**
   * 音声取得の進捗通知（T-321・K-59）。パックごとに呼ばれる（音声を持たないパックでは
   * 呼ばれない）。取得中の帯域・接続状況をUIに出すための用途で、失敗したURLも
   * completedに数える（進捗が止まって見えることを防ぐ）
   */
  onAudioProgress?: (info: { packId: string; completed: number; total: number }) => void
}

/**
 * 音声URL群の並行度を絞った逐次fetch+put（T-321・K-54）。
 * 旧実装はパックJSON＋全音声を1回のPackCache.addAllへ渡していたが、addAllは1件でも
 * 失敗すると全件を巻き戻す仕様（キャッシュに書き込みし積んだ0バイトも残らない）。
 * 駅間の20〜40秒の接続では大きいパック（9MiB超）を1本のバッチで取り切れないことがあり、
 * 帯域だけ消費してキャッシュが1バイトも増えない。1URL単位のfetch+putに分ければ、
 * 途中で切断しても取得済み分はキャッシュに残る
 */
const AUDIO_FETCH_CONCURRENCY = 4

/**
 * 音声1件あたりの取得タイムアウト。付けないと1件がハングしただけで
 * syncPacks全体（と inFlight フラグ）が解放されず、以後の同期が始まらない
 */
const AUDIO_FETCH_TIMEOUT_MS = 15_000

/**
 * 取得できなかったURLの件数を返す。呼び出し側はこれが0でないときにパックを
 * 「同期済み」と確定してはならない（確定するとハッシュ一致でskipされ、
 * 欠けた音声が二度と取得されなくなる）
 */
async function fetchAndCacheAudio(
  packCache: PackCache,
  fetchImpl: typeof fetch,
  packId: string,
  urls: string[],
  onProgress?: SyncPacksOptions['onAudioProgress'],
): Promise<number> {
  const total = urls.length
  if (total === 0) return 0
  let completed = 0
  let failed = 0
  let nextIndex = 0
  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= urls.length) return
      const url = urls[index]!
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(AUDIO_FETCH_TIMEOUT_MS) })
        if (res.ok) {
          await packCache.put(url, await res.blob())
        } else {
          failed += 1
        }
      } catch {
        // 個別音声の取得失敗はここでは止めない（取得できた分はキャッシュに残す）。
        // ただし件数は数え、呼び出し側がパックを同期済みにしないための材料にする
        failed += 1
      }
      completed += 1
      onProgress?.({ packId, completed, total })
    }
  }
  const workerCount = Math.min(AUDIO_FETCH_CONCURRENCY, total)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return failed
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

/** skip判定でハッシュ一致・実体確認に加えて音声の実在をどれだけ確認するか（T-322・K-55） */
const AUDIO_SAMPLE_CHECK_SIZE = 3

/**
 * skipするパックの音声が実際にキャッシュに残っているかをサンプル確認する（T-322・K-55）。
 * T-321で音声取得が1URL単位のfetch+putになったことで、パックJSON自体は同期成功として
 * hashが更新されても、一部の音声だけが欠けた状態になり得る。従来のskip判定は
 * パックJSONの実体しか見ておらず、この「音声だけ欠けた」状態を検知できず
 * 永久にskipし続けてしまう（K-55）。全音声を確認すると起動ごとの走査コストが大きいため、
 * 先頭のAUDIO_SAMPLE_CHECK_SIZE件だけを確認する（サンプル。全件保証ではない）
 */
async function hasAudioSample(
  packCache: PackCache,
  audioUrls: readonly string[],
): Promise<boolean> {
  for (const url of audioUrls.slice(0, AUDIO_SAMPLE_CHECK_SIZE)) {
    if (!(await packCache.has(url))) return false
  }
  return true
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

  const manifestUrl = `${baseUrl}manifest.json`
  let manifest: Manifest
  try {
    const res = await fetchImpl(manifestUrl, {
      signal: AbortSignal.timeout(MANIFEST_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const body: unknown = await res.json()
    if (!validateManifest(body).ok) return null
    manifest = body as Manifest
  } catch {
    return null
  }
  // T-325（K-60）: App.tsx起動時のloadQuestionPoolがPACK_IDS由来ではなく、この
  const state = await loadPackSyncState(db)
  const packHashes = { ...state.packHashes }
  const synced: string[] = []
  const skipped: string[] = []
  // T-73: 現行manifestに対応するURL集合（パックJSON＋全音声）。掃除処理の「削除してよいか」判定に使う
  // T-325: manifest.json自体もキャッシュに書き戻すため、掃除で消されないよう保護対象に含める
  const validUrls = new Set<string>([manifestUrl])

  for (const entry of manifest.packs) {
    const packUrl = `${baseUrl}packs/${entry.id}.json`
    validUrls.add(packUrl)
    // T-183 Q-11: ハッシュ一致だけでは実体の有無を確認できない。手動でのキャッシュ削除や
    // iOSのストレージ退避で実体が失われていてもハッシュは残るため、skipすると
    // 二度と再取得されなくなる。実体の有無を確認し、無ければ通常の同期経路へ落とす
    if (packHashes[entry.id] === entry.hash && (await packCache.has(packUrl))) {
      const cachedAudioUrls = await collectCachedAudioUrls(packCache, baseUrl, packUrl)
      // T-322（K-55）: T-321で音声が1URL単位のfetch+putになったため、パックJSONは
      // 完全でも音声だけ一部欠けた状態がありうる。サンプル確認して欠けていればskipせず
      // 通常の同期経路（再fetch+put）へ落として自己修復する
      if (await hasAudioSample(packCache, cachedAudioUrls)) {
        skipped.push(entry.id)
        for (const url of cachedAudioUrls) validUrls.add(url)
        continue
      }
    }
    let syncSucceeded = false
    try {
      const packRes = await fetchImpl(packUrl, {
        signal: AbortSignal.timeout(PACK_FETCH_TIMEOUT_MS),
      })
      if (packRes.ok) {
        const pack = (await packRes.json()) as QuestionPack
        const audioUrls = collectAudioUrls(baseUrl, pack.questions)
        // 【重要】パックJSONの差し替えは全音声が揃ってから行う（レビュー2巡目 指摘2）。
        // 先に書くと、音声が一部失敗した状態でも次回起動時に新しいJSONが読まれ、
        // 欠落した音声を参照する問題がそのまま出題される（他パックの同期成功で
        // 再読込が走ればその場でも露出する）。取得できた音声は個別にキャッシュへ
        // 残るので、JSONの切替だけを最後に回しても部分取得の利点は失われない
        const failedAudio = await fetchAndCacheAudio(
          packCache,
          fetchImpl,
          entry.id,
          audioUrls,
          options.onAudioProgress,
        )
        // 取得済みのURLは次回の掃除で消さないよう残す（部分取得でもキャッシュは有効）
        for (const url of [packUrl, ...audioUrls]) validUrls.add(url)
        if (failedAudio === 0) {
          await packCache.put(packUrl, new Blob([JSON.stringify(pack)]))
          packHashes[entry.id] = entry.hash
          synced.push(entry.id)
          syncSucceeded = true
        } else {
          // ハッシュを確定しないので次回起動時にこのパックが再び同期経路へ入る。
          // 確定してしまうと、hasAudioSampleは先頭AUDIO_SAMPLE_CHECK_SIZE件しか見ないため、
          // それ以降だけ欠けた場合に永久にskipされ続ける（レビュー指摘3）
          console.warn(
            `[packSync] ${entry.id}: 音声${failedAudio}/${audioUrls.length}件の取得に失敗。次回起動時に再試行する`,
          )
        }
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
  // T-323（K-56）: 取得失敗したパックはcollectCachedAudioUrls（JSONパース等）に
  // 依存したvalidUrls保護しか無く、それ自体が失敗すれば保護が効かず現行の音声を
  // 誤って削除しうる。「manifest取得成功かつ全パックがsyncedまたはskipped」を掃除実行の
  // 必須条件にし、1パックでも失敗していれば掃除自体を全面的に見送る（次回同期時に再試行）
  const allPacksHandled = synced.length + skipped.length === manifest.packs.length

  // manifest.jsonのキャッシュ書き戻しは**全パックが揃ってから**行う（レビュー3巡目 指摘2）。
  // 先に書くと、resolvePackIds（App.tsx）がキャッシュ済みの新manifestから新パックidを解決し、
  // loadPackQuestionsがそのパックJSONを直接fetchしてキャッシュへ書き戻してしまう。
  // 音声が揃っていないパックでもこの経路でJSONだけが公開され、欠落音声を参照する問題が
  // 出題される（20→24パックの追加で新規パックがある状態が現に成立する）。
  // manifest・パックJSON・音声を同じ「完成状態」としてまとめて公開する。
  // 書き戻し失敗は無視する（次回同期のfetchで再試行されるだけで、同期自体は止めない）
  if (allPacksHandled) {
    try {
      await packCache.put(manifestUrl, new Blob([JSON.stringify(manifest)]))
    } catch {
      // 無視
    }
  }

  if (allPacksHandled) {
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
  baseUrl: string = import.meta.env.BASE_URL,
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
  //
  // ただし書き戻すのは**音声が全て揃っているパックだけ**に限る（レビュー3巡目 指摘1）。
  // キャッシュが空の初回起動では、起動時のloadQuestionPoolと背景のsyncPacksが並行して走り、
  // resolvePackIdsがmanifestを直fetchして解決するため、この経路が音声の完成状態と無関係に
  // 動く。音声取得が一部失敗するとsyncPacksはmanifestもパックJSONも書かない（同期未完成）
  // のに、この書き戻しだけがJSONを残す。次回のオフライン起動ではmanifestを読めずPACK_IDSへ
  // フォールバックするため、残ったJSONから欠落音声を参照する問題が出題される。
  // 音声を持たないパック（語彙・Part5・読解）は判定が自明に真になるためQ-13の利点は残る。
  // 書き戻し失敗は無視する（次回のfetchフォールバックで再試行されるだけで、読み込み自体は止めない）
  try {
    if (await hasAllAudio(packCache, collectAudioUrls(baseUrl, pack.questions))) {
      await packCache.put(packUrl, new Blob([JSON.stringify(pack)]))
    }
  } catch {
    // 無視
  }
  return pack.questions
}

/** 音声URLが1件残らずキャッシュに載っているか（hasAudioSampleと違いサンプルでなく全件見る） */
async function hasAllAudio(packCache: PackCache, audioUrls: readonly string[]): Promise<boolean> {
  for (const url of audioUrls) {
    if (!(await packCache.has(url))) return false
  }
  return true
}
