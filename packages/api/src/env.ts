// Workerバインディングの単一定義（正本: docs/17_M3実装計画.md 3.2節・3.10節）。
// DO(STATS)は追加のたびにここへ足していく（T-100。T-124でBATTLE_ROOMを追加）

import type { DailyGoal } from '@beb-raid/shared-schema'

import type { BattleRoomDO } from './battleRoomDo'
import type { InviteRateLimitDo } from './inviteRateLimitDo'
import type { RaidBossDO } from './raidBossDo'
import type { StatsDO } from './statsDo'

export interface Env {
  ALLOWED_ORIGINS: string
  /** 招待コード（wrangler secret / .dev.vars。リポジトリには実値を置かない） */
  INVITE_CODE: string
  /**
   * 運用操作（POST /admin/raid/generate）の認可トークン（wrangler secret / .dev.vars）。
   * **未設定なら該当ルートは404を返す**（設定するまで攻撃面を作らない）。
   * INVITE_CODEを流用しないのは、あれが登録済みメンバー全員の知る値だから
   */
  ADMIN_TOKEN?: string
  MEMBERS: KVNamespace
  RAID_BOSS: DurableObjectNamespace<RaidBossDO>
  STATS: DurableObjectNamespace<StatsDO>
  BATTLE_ROOM: DurableObjectNamespace<BattleRoomDO>
  /** T-329（K-64）: 招待コード誤りのレート制限カウンタ（IPごとに1インスタンス） */
  INVITE_RATE_LIMIT: DurableObjectNamespace<InviteRateLimitDo>
}

/** KVの `member:<deviceToken>` キーに保存する値（正本: docs/17 3.2節） */
export interface MemberRecord {
  displayName: string
  dailyGoal: DailyGoal
  registeredAt: number
  /** 週次cronが更新する指数移動平均（初回登録時は未設定。J-48・T-94で書き込む） */
  emaDailyDamage?: number
}

export function memberKey(deviceToken: string): string {
  return `member:${deviceToken}`
}
