// RaidSyncRequestの型検証（正本: docs/17_M3実装計画.md 3.1節）

import type { DamageSyncPayload, RaidSyncRequest } from '@beb-raid/shared-schema'

function isDamageSyncPayload(value: unknown): value is DamageSyncPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.attemptId === 'string' &&
    v.attemptId.length > 0 &&
    typeof v.bossId === 'string' &&
    v.bossId.length > 0 &&
    typeof v.damage === 'number' &&
    typeof v.questionCount === 'number' &&
    typeof v.answeredAt === 'number'
  )
}

export function isRaidSyncRequest(body: unknown): body is RaidSyncRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return Array.isArray(b.payloads) && b.payloads.every(isDamageSyncPayload)
}
