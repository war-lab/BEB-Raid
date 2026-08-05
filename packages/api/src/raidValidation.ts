// RaidSyncRequestの型検証（正本: docs/17_M3実装計画.md 3.1節）

import type { DamageSyncPayload, RaidSyncRequest } from '@beb-raid/shared-schema'

/**
 * 1payloadあたりのdamage上限。クライアント算出値を信用する設計（J-47）のため
 * 厳密な検算はしないが、負数（HP回復・討伐判定の逆行）や桁違いの値で
 * 集計が破壊されることだけは構造的に防ぐ。1問の理論値は128前後（raidConfig.ts）
 */
const MAX_DAMAGE_PER_PAYLOAD = 10_000
/** 1リクエストあたりのpayload件数上限（クライアントのバッチ上限200に余裕を持たせた値） */
export const MAX_SYNC_PAYLOADS = 500

/**
 * bossIdの形式（正本: docs/17_M3実装計画.md 3.4節。`boss-<ISO年>-W<ISO週番号2桁>`）。
 * 【T-243・29のQ-22】以前は「1〜200字の非空文字列」としか検証しておらず、認証済みメンバーが
 * 任意の文字列をbossIdとして送ると`idFromName(bossId)`経由で任意個のRaidBossDOインスタンスを
 * 作れてしまっていた（コンストラクタでSQLiteテーブルをCREATEするため、未初期化ボス宛でも
 * 永続ストレージが発生する。1リクエストで最大500件=MAX_SYNC_PAYLOADS分を一括生成可能だった）。
 * 実際にサーバー側が生成するbossIdはこの形式のみのため、これ以外は構造的に弾く
 */
const BOSS_ID_PATTERN = /^boss-\d{4}-W\d{2}$/

function isValidBossId(value: unknown): value is string {
  return typeof value === 'string' && BOSS_ID_PATTERN.test(value)
}

/** 集計を破壊しうる値（負数・非整数・桁違い）を弾く。0は許容する */
function isDamageValue(value: unknown, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

function isDamageSyncPayload(value: unknown): value is DamageSyncPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.attemptId === 'string' &&
    v.attemptId.length > 0 &&
    v.attemptId.length <= 200 &&
    isValidBossId(v.bossId) &&
    isDamageValue(v.damage, MAX_DAMAGE_PER_PAYLOAD) &&
    isDamageValue(v.questionCount, 1_000) &&
    typeof v.answeredAt === 'number' &&
    Number.isFinite(v.answeredAt) &&
    v.answeredAt >= 0
  )
}

export function isRaidSyncRequest(body: unknown): body is RaidSyncRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    Array.isArray(b.payloads) &&
    b.payloads.length <= MAX_SYNC_PAYLOADS &&
    b.payloads.every(isDamageSyncPayload)
  )
}
