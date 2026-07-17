// Workerバインディングの単一定義（正本: docs/17_M3実装計画.md 3.2節・3.10節）。
// DO(STATS)は追加のたびにここへ足していく（T-100）

import type { DailyGoal } from '@beb-raid/shared-schema'

import type { RaidBossDO } from './raidBossDo'
import type { StatsDO } from './statsDo'

export interface Env {
  ALLOWED_ORIGINS: string
  /** 招待コード（wrangler secret / .dev.vars。リポジトリには実値を置かない） */
  INVITE_CODE: string
  MEMBERS: KVNamespace
  RAID_BOSS: DurableObjectNamespace<RaidBossDO>
  STATS: DurableObjectNamespace<StatsDO>
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
