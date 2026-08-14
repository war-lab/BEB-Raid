// Workerバインディングの単一定義（正本: docs/17_M3実装計画.md 3.2節・3.10節）。
// DO(STATS)は追加のたびにここへ足していく（T-100。T-124でBATTLE_ROOMを追加）

import type { DailyGoal } from '@beb-raid/shared-schema'

import type { BattleRoomDO } from './battleRoomDo'
import type { InviteRateLimitDo } from './inviteRateLimitDo'
import type { RegistryDo } from './registryDo'
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
  /** 登録枠と表示名予約を強整合に確定させる単一インスタンスDO（レビュー指摘1・4） */
  REGISTRY: DurableObjectNamespace<RegistryDo>
}

/** KVの `member:<deviceToken>` キーに保存する値（正本: docs/17 3.2節） */
export interface MemberRecord {
  displayName: string
  dailyGoal: DailyGoal
  registeredAt: number
  /** 週次cronが更新する指数移動平均（初回登録時は未設定。J-48・T-94で書き込む） */
  emaDailyDamage?: number
  /**
   * emaDailyDamage をどの週の実績まで反映したか（生成対象週のbossId）。
   *
   * 週次生成はメンバーを1人ずつKVへ書き戻すため、途中で失敗すると生成権が解放され
   * （ボスが作れないまま週が固定されるのを防ぐため意図的にそうしている）、翌日の再実行で
   * 先頭から作り直す。EMAは「前回値 × (1-w) + 今週実績 × w」で前回値に依存するので、
   * マーカーが無いと更新済みのメンバーだけ二度平滑化されて実力を過小評価する。
   * 同じ週のマーカーが既に入っていればEMA更新を飛ばすことで再実行を冪等にする
   */
  emaUpdatedForBossId?: string
}

/** `member:` プレフィックス。register.ts・scheduled.ts・registryDo.ts で共有する */
export const MEMBER_KEY_PREFIX = 'member:'

export function memberKey(deviceToken: string): string {
  return `member:${deviceToken}`
}
