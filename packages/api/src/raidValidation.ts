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
    typeof v.bossId === 'string' &&
    v.bossId.length > 0 &&
    v.bossId.length <= 200 &&
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
