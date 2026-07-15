// Dexie による IndexedDB スキーマ定義（T-06。正本: docs/04_データ設計.md 3節）。
//
// 【不変条件】attempts は全解答の生ログであり削除しない（追記のみ）。
// このモジュールは削除を Dexie の deleting フックで実行時にも遮断する。
// サービス層（src/services/）も attempts への削除・更新APIを提供しないこと。

import Dexie, { type EntityTable } from 'dexie'

import type {
  AttemptRecord,
  BadgeRecord,
  ExamScoreRecord,
  PendingSyncRecord,
  PhaseRecord,
  ProfileRecord,
  RatingHistoryRecord,
  RatingRecord,
  SettingRecord,
  SrsCardRecord,
  StreakRecord,
  TagStatRecord,
} from './schema'

/** 既定のデータベース名（テストでは別名を渡して分離する） */
export const DB_NAME = 'beb-raid'

export class BebRaidDatabase extends Dexie {
  profile!: EntityTable<ProfileRecord, 'id'>
  attempts!: EntityTable<AttemptRecord, 'id'>
  srsCards!: EntityTable<SrsCardRecord, 'id'>
  ratings!: EntityTable<RatingRecord, 'section'>
  ratingHistory!: Dexie.Table<RatingHistoryRecord, [string, string]>
  tagStats!: EntityTable<TagStatRecord, 'tag'>
  phase!: EntityTable<PhaseRecord, 'season'>
  streak!: EntityTable<StreakRecord, 'id'>
  badges!: EntityTable<BadgeRecord, 'badgeId'>
  pendingSync!: EntityTable<PendingSyncRecord, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>
  examScores!: EntityTable<ExamScoreRecord, 'id'>

  constructor(name: string = DB_NAME) {
    super(name)

    // J-7: 全ストアを最初に定義する（後からのマイグレーションを減らす）。
    // 2つ目以降のフィールドはインデックス。インデックスしないフィールドは
    // スキーマ宣言に書かない（Dexie の流儀。レコード型は schema.ts が正）
    this.version(1).stores({
      profile: 'id',
      attempts: 'id, questionId, mode, answeredAt',
      srsCards: 'id, refType, refId, dueAt',
      ratings: 'section',
      ratingHistory: '[date+section], date, section',
      tagStats: 'tag',
      phase: 'season',
      streak: 'id',
      badges: 'badgeId',
      pendingSync: '++id, createdAt',
      settings: 'key',
    })

    // version(2): T-42（C-2改訂・M2）。examScores を新設し、phase.listeningStage を
    // 非インデックスフィールドとして追加（既存ストアの定義文字列自体は変更不要）。
    // 既存ストアの定義は version(1) と同一のまま再宣言する（Dexieの規約: 変更しない
    // ストアも version アップ時は明示する必要がある）
    this.version(2).stores({
      profile: 'id',
      attempts: 'id, questionId, mode, answeredAt',
      srsCards: 'id, refType, refId, dueAt',
      ratings: 'section',
      ratingHistory: '[date+section], date, section',
      tagStats: 'tag',
      phase: 'season',
      streak: 'id',
      badges: 'badgeId',
      pendingSync: '++id, createdAt',
      settings: 'key',
      examScores: 'id, date',
    })

    // attempts の削除・更新禁止（追記のみ）。delete / clear / put / update を
    // 実行時に遮断する（バックアップ復元は既存IDを除外した bulkAdd で追記する）
    this.attempts.hook('deleting', () => {
      throw new Error('attempts は追記のみ（全解答ログは分析の基盤なので消さない）')
    })
    this.attempts.hook('updating', () => {
      throw new Error('attempts は追記のみ（既存の解答ログは書き換えない）')
    })
  }
}

let instance: BebRaidDatabase | null = null

/** アプリ本体用のシングルトンを返す */
export function getDb(): BebRaidDatabase {
  if (!instance) {
    instance = new BebRaidDatabase()
  }
  return instance
}
