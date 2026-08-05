// エクスポート/インポートサービス（T-08。正本: docs/04 3節、01のR-5）。
//
// 全ストアをJSON1ファイルに書き出し/読み込みする。iOSストレージ退避・機種変への
// 保険＋実測補正（T-34）の入力経路。呼び出すUI（設定画面）は T-23 で作る。
//
// インポートの方針:
// - attempts 以外のストア: クリアしてから復元（バックアップの内容で置き換え）
// - attempts: 追記マージのみ（削除・更新禁止の不変条件。既存IDはスキップし
//   バックアップに無い既存ログも残る=ログはいかなる経路でも失われず書き換わらない）

import type { BebRaidDatabase } from '../db/database'
import type {
  AttemptRecord,
  BadgeRecord,
  ExamScoreRecord,
  PendingSyncRecord,
  PhaseRecord,
  ProfileRecord,
  RaidStateRecord,
  RatingHistoryRecord,
  RatingRecord,
  SettingRecord,
  SrsCardRecord,
  StreakRecord,
  TagStatRecord,
} from '../db/schema'
import { PACK_SYNC_STATE_KEY } from './packSync'
import { ACTIVE_SESSION_KEY } from './session'
import { BYOK_API_KEY_KEY, QUESTION_STATS_LAST_SENT_AT_KEY } from './settingsKeys'

/** バックアップファイル自体のフォーマット世代（DBスキーマ変更時に上げる） */
export const BACKUP_FORMAT_VERSION = 1

export interface BackupStores {
  profile: ProfileRecord[]
  attempts: AttemptRecord[]
  srsCards: SrsCardRecord[]
  ratings: RatingRecord[]
  ratingHistory: RatingHistoryRecord[]
  tagStats: TagStatRecord[]
  phase: PhaseRecord[]
  streak: StreakRecord[]
  badges: BadgeRecord[]
  pendingSync: PendingSyncRecord[]
  settings: SettingRecord[]
  /** T-42（C-2改訂）で追加。旧バージョンのバックアップには存在しない（インポート側は空扱いで許容） */
  examScores: ExamScoreRecord[]
  /** T-88（C-2改訂）で追加。旧バージョンのバックアップには存在しない（インポート側は空扱いで許容） */
  raidState: RaidStateRecord[]
}

/**
 * settings のうちエクスポートJSONに含めないキー（T-42=C-2改訂。レビューフォローアップ必須項目）。
 * - BYOK APIキー: 端末外に出さない不変条件（05の5節）のため、エクスポート・インポートの
 *   両方でこのキーを除外する
 * - packSyncState: 端末ローカルのCache Storageと対になる状態のため、他端末へ持ち込むと
 *   「packHashesは同期済みなのにキャッシュは空」となり、パックが永久にピン留めされない。
 *   復元先端末は自前のpackSyncState（無ければ空=初回同期扱い）を使うのが正しい
 * - activeSession（T-190・Q-111）: 進行中セッションの一時スナップショット。他端末・別時点の
 *   ものを復元すると、復元先で進行中のセッション（あれば）を上書きしてしまう、または
 *   存在しないattemptIds/questionIdsを指す壊れたスナップショットを持ち込みかねない
 * - questionStatsLastSentAt（T-190・Q-111）: questionStats送信のwatermarkは端末固有の
 *   送信済み位置。他端末の値を持ち込むと、この端末でまだ送っていないattemptsが
 *   未送信のまま取りこぼされる（watermarkだけ進んでしまう）
 */
export const EXPORT_EXCLUDED_KEYS: readonly string[] = [
  BYOK_API_KEY_KEY,
  PACK_SYNC_STATE_KEY,
  ACTIVE_SESSION_KEY,
  QUESTION_STATS_LAST_SENT_AT_KEY,
]

/**
 * 各ストアが導入されたDexieスキーマバージョン（database.ts の version() と対応）。
 * バックアップの dbVersion がこの値未満なら、そのストアが欠落していても
 * 「まだ存在しなかった」として許容する（T-42=C-2改訂で追加した examScores 用）
 */
const STORE_INTRODUCED_AT: Record<keyof BackupStores, number> = {
  profile: 1,
  attempts: 1,
  srsCards: 1,
  ratings: 1,
  ratingHistory: 1,
  tagStats: 1,
  phase: 1,
  streak: 1,
  badges: 1,
  pendingSync: 1,
  settings: 1,
  examScores: 2,
  raidState: 3,
}

export interface BackupFile {
  formatVersion: typeof BACKUP_FORMAT_VERSION
  /** エクスポート時点の Dexie スキーマバージョン（将来のマイグレーション判定用） */
  dbVersion: number
  exportedAt: number
  stores: BackupStores
}

const STORE_NAMES = [
  'profile',
  'attempts',
  'srsCards',
  'ratings',
  'ratingHistory',
  'tagStats',
  'phase',
  'streak',
  'badges',
  'pendingSync',
  'settings',
  'examScores',
  'raidState',
] as const satisfies readonly (keyof BackupStores)[]

/**
 * 全ストアを1つのバックアップオブジェクトに書き出す（JSON.stringify 可能な形）。
 * settings は EXPORT_EXCLUDED_KEYS（BYOK APIキー等）を除外する
 */
export async function exportAll(db: BebRaidDatabase): Promise<BackupFile> {
  const tables = STORE_NAMES.map((name) => db.table(name))
  return db.transaction('r', tables, async () => {
    const stores = {} as Record<keyof BackupStores, unknown[]>
    for (const name of STORE_NAMES) {
      const rows = await db.table(name).toArray()
      stores[name] =
        name === 'settings'
          ? (rows as SettingRecord[]).filter((r) => !EXPORT_EXCLUDED_KEYS.includes(r.key))
          : rows
    }
    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      dbVersion: db.verno,
      exportedAt: Date.now(),
      stores: stores as unknown as BackupStores,
    }
  })
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}
function isStr(v: unknown): v is string {
  return typeof v === 'string'
}
function isNum(v: unknown): v is number {
  return typeof v === 'number'
}
function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean'
}
function isNumOrNull(v: unknown): boolean {
  return v === null || isNum(v)
}
function isStrOrNull(v: unknown): boolean {
  return v === null || isStr(v)
}

/**
 * 各ストアのレコード単位の型検証（T-190・Q-100）。「storesが配列か」だけでは、
 * id欠落のattempts・型不正のsrsCards等がそのままbulkAdd/bulkPutされてしまう
 * （実行時エラー、あるいはサイレントな不整合データの混入）。網羅的なスキーマ検証ではなく、
 * 破損・改ざんされたバックアップの取込を防ぐ最低限（必須フィールドの型）の検査
 */
const RECORD_VALIDATORS: Record<keyof BackupStores, (r: unknown) => boolean> = {
  profile: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isStr(r.displayName) &&
    isNumOrNull(r.initialToeic) &&
    isNum(r.createdAt) &&
    isStr(r.deviceToken),
  attempts: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isStr(r.questionId) &&
    isStr(r.mode) &&
    isBool(r.isCorrect) &&
    isNum(r.responseMs) &&
    isBool(r.isTimeout) &&
    isBool(r.isGuess) &&
    isNum(r.answeredAt),
  srsCards: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isStr(r.refType) &&
    isStr(r.refId) &&
    isNum(r.stage) &&
    isNum(r.dueAt) &&
    isNum(r.lapses),
  ratings: (r) => isObj(r) && isStr(r.section) && isNum(r.rating) && isNum(r.updatedAt),
  ratingHistory: (r) => isObj(r) && isStr(r.date) && isStr(r.section) && isNum(r.rating),
  tagStats: (r) => isObj(r) && isStr(r.tag) && isNum(r.windowCorrect) && isNum(r.windowTotal),
  phase: (r) => isObj(r) && isStr(r.season) && isStr(r.criteriaJson) && isNumOrNull(r.achievedAt),
  streak: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isNum(r.currentDays) &&
    isNum(r.bestDays) &&
    isStrOrNull(r.lastActiveDate) &&
    isStrOrNull(r.protectionUsedAt),
  badges: (r) => isObj(r) && isStr(r.badgeId) && isNum(r.earnedAt),
  pendingSync: (r) => isObj(r) && isStr(r.kind) && isStr(r.payloadJson) && isNum(r.createdAt),
  settings: (r) => isObj(r) && isStr(r.key),
  examScores: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isStr(r.date) &&
    isNum(r.listening) &&
    isNum(r.reading) &&
    isNum(r.total) &&
    isStr(r.source),
  raidState: (r) =>
    isObj(r) &&
    isStr(r.id) &&
    isStr(r.bossId) &&
    isStr(r.profileJson) &&
    isNum(r.hp) &&
    isNum(r.maxHp) &&
    isNum(r.myDamage) &&
    isBool(r.joined) &&
    isNum(r.startAt) &&
    isNum(r.endAt) &&
    isNum(r.lastSyncedAt),
}

/**
 * バックアップの構造検証。不正なら理由の配列を返す（空なら妥当）。
 * ストアが未定義の場合、バックアップの dbVersion がそのストアの導入バージョン未満なら
 * 「まだ存在しなかった」として許容する（STORE_INTRODUCED_AT）。それ以外（本来存在すべき
 * ストアの欠落・値が配列でない・配列内のレコードが必須フィールドの型を満たさない）は
 * エラーとする
 */
export function validateBackup(data: unknown): string[] {
  const problems: string[] = []
  if (typeof data !== 'object' || data === null) {
    return ['バックアップがオブジェクトではない']
  }
  const d = data as Record<string, unknown>
  if (d.formatVersion !== BACKUP_FORMAT_VERSION) {
    problems.push(`未対応の formatVersion: ${JSON.stringify(d.formatVersion)}`)
  }
  if (typeof d.stores !== 'object' || d.stores === null) {
    problems.push('stores がない')
    return problems
  }
  const stores = d.stores as Record<string, unknown>
  const backupDbVersion = typeof d.dbVersion === 'number' ? d.dbVersion : 0
  for (const name of STORE_NAMES) {
    const value = stores[name]
    if (value === undefined) {
      if (backupDbVersion < STORE_INTRODUCED_AT[name]) continue
      problems.push(`stores.${name} が配列ではない`)
    } else if (!Array.isArray(value)) {
      problems.push(`stores.${name} が配列ではない`)
    } else {
      const invalidCount = value.filter((r) => !RECORD_VALIDATORS[name](r)).length
      if (invalidCount > 0) {
        problems.push(`stores.${name} に型不正なレコードが${invalidCount}件ある`)
      }
    }
  }
  return problems
}

/**
 * バックアップから全ストアを復元する。
 * 全ストアを単一トランザクションで処理する（途中失敗時は全体がロールバックされ、
 * 中途半端な復元状態を残さない）。
 */
export async function importAll(db: BebRaidDatabase, data: unknown): Promise<void> {
  const problems = validateBackup(data)
  if (problems.length > 0) {
    throw new Error(`バックアップが不正: ${problems.join(' / ')}`)
  }
  const backup = data as BackupFile

  // バックアップが現在のDBより新しいスキーマで書き出されている場合は復元を拒否する
  // （レビューフォローアップ3.8節。未対応フィールドを持つ新形式データで復元すると
  // 古いアプリ側のロジックが想定外のレコード形状を読むことになるため）
  if (backup.dbVersion > db.verno) {
    throw new Error(
      `バックアップの dbVersion(${backup.dbVersion}) が現在のDB(${db.verno})より新しい。アプリを更新してから復元してください。`,
    )
  }

  const tables = STORE_NAMES.map((name) => db.table(name))
  await db.transaction('rw', tables, async () => {
    for (const name of STORE_NAMES) {
      // 旧バージョンのバックアップに存在しない新規ストア（例: examScores）は空扱いにする
      const rows = backup.stores[name] ?? []
      if (name === 'attempts') {
        // 追記マージのみ。既存IDは内容が異なっても上書きしない（改ざん・破損した
        // バックアップで生ログが書き換わるのを防ぐ。削除・更新はフックでも遮断される）。
        // T-190・Q-101: バックアップファイル内でIDが重複していると、そのままbulkAddに
        // 渡した場合ConstraintErrorのBulkErrorでトランザクション全体が中断するため、
        // 先に同一ID内で1件（先勝ち）に統合してからDB照合する
        const incoming = [...new Map((rows as AttemptRecord[]).map((r) => [r.id, r])).values()]
        const existing = await db.attempts.bulkGet(incoming.map((r) => r.id))
        const fresh = incoming.filter((_, i) => existing[i] === undefined)
        await db.attempts.bulkAdd(fresh)
      } else if (name === 'phase') {
        // T-190: phaseストアは「常に1行だけ存在する」が不変条件（services/phase.ts）。
        // 通常のexportAllは0〜1行しか出力しないが、改ざん・破損したバックアップで
        // 複数行が含まれていても不変条件を破らないよう、先頭の1行のみを復元する
        const incoming = rows as PhaseRecord[]
        await db.table(name).clear()
        if (incoming.length > 0) {
          await db.table(name).put(incoming[0])
        }
      } else if (name === 'settings') {
        // BYOK APIキー等はエクスポート時に既に除外されているが、外部編集された
        // バックアップファイルに万一含まれていても復元しない（多層防御）
        const incoming = (rows as SettingRecord[]).filter(
          (r) => !EXPORT_EXCLUDED_KEYS.includes(r.key),
        )
        // T-72: EXPORT_EXCLUDED_KEYS該当（BYOK APIキー等）は端末内にしかない値のため、
        // clear前に退避し復元後に書き戻す（以前はclearで消えたまま二度と戻らないバグだった）
        const preserved = (await db.table(name).toArray()).filter((r: SettingRecord) =>
          EXPORT_EXCLUDED_KEYS.includes(r.key),
        )
        await db.table(name).clear()
        await db.table(name).bulkPut([...incoming, ...preserved])
      } else {
        await db.table(name).clear()
        await db.table(name).bulkPut(rows)
      }
    }
  })
}
