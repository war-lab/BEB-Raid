// エクスポート/インポートサービス（T-08。正本: docs/04 3節、01のR-5）。
//
// 全ストアをJSON1ファイルに書き出し/読み込みする。iOSストレージ退避・機種変への
// 保険＋実測補正（T-34）の入力経路。呼び出すUI（設定画面）は T-23 で作る。
//
// インポートの方針:
// - attempts 以外のストア: クリアしてから復元（バックアップの内容で置き換え）
// - attempts: 追記マージのみ（削除禁止の不変条件。同一IDは主キーで冪等、
//   バックアップに無い既存ログも残る=ログはいかなる経路でも失われない）

import type { BebRaidDatabase } from '../db/database'
import type {
  AttemptRecord,
  BadgeRecord,
  PendingSyncRecord,
  PhaseRecord,
  ProfileRecord,
  RatingHistoryRecord,
  RatingRecord,
  SettingRecord,
  SrsCardRecord,
  StreakRecord,
  TagStatRecord,
} from '../db/schema'

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
] as const satisfies readonly (keyof BackupStores)[]

/** 全ストアを1つのバックアップオブジェクトに書き出す（JSON.stringify 可能な形） */
export async function exportAll(db: BebRaidDatabase): Promise<BackupFile> {
  const tables = STORE_NAMES.map((name) => db.table(name))
  return db.transaction('r', tables, async () => {
    const stores = {} as Record<keyof BackupStores, unknown[]>
    for (const name of STORE_NAMES) {
      stores[name] = await db.table(name).toArray()
    }
    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      dbVersion: db.verno,
      exportedAt: Date.now(),
      stores: stores as unknown as BackupStores,
    }
  })
}

/** バックアップの構造検証。不正なら理由の配列を返す（空なら妥当） */
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
  for (const name of STORE_NAMES) {
    if (!Array.isArray(stores[name])) {
      problems.push(`stores.${name} が配列ではない`)
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

  const tables = STORE_NAMES.map((name) => db.table(name))
  await db.transaction('rw', tables, async () => {
    for (const name of STORE_NAMES) {
      const rows = backup.stores[name]
      if (name === 'attempts') {
        // 追記マージのみ（クリアは deleting フックでも遮断される）
        await db.attempts.bulkPut(rows as AttemptRecord[])
      } else {
        await db.table(name).clear()
        await db.table(name).bulkPut(rows)
      }
    }
  })
}
