// GET /raid/current・POST /raid/sync（正本: docs/17_M3実装計画.md 3.1節・5節T-95シート）。
// 認証（Bearer）はindex.tsのroute()側で行い、ここには認証済みdeviceTokenを渡す

import type { DamageSyncPayload } from '@beb-raid/shared-schema'

import type { Env } from './env'
import { isRaidSyncRequest } from './raidValidation'
import { bossIdFor, isoWeekInfo } from './raidWeek'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

function currentBossId(now: number): string {
  return bossIdFor(isoWeekInfo(now))
}

export async function handleRaidCurrent(
  env: Env,
  deviceToken: string,
  now: number,
): Promise<Response> {
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(currentBossId(now)))
  const boss = await stub.getBossState(now, deviceToken)
  if (!boss) return errorResponse(404, 'boss_not_found', '今週のボスがまだ生成されていません')
  return jsonResponse(boss)
}

/** payload.bossId単位でグループ化する（週境界を跨いだ古いbossId宛のpayloadも正しく届けるため） */
function groupByBossId(payloads: DamageSyncPayload[]): Map<string, DamageSyncPayload[]> {
  const grouped = new Map<string, DamageSyncPayload[]>()
  for (const payload of payloads) {
    const list = grouped.get(payload.bossId) ?? []
    list.push(payload)
    grouped.set(payload.bossId, list)
  }
  return grouped
}

export async function handleRaidSync(
  request: Request,
  env: Env,
  deviceToken: string,
  receivedAt: number,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isRaidSyncRequest(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  const acceptedIds: string[] = []
  for (const [bossId, payloads] of groupByBossId(body.payloads)) {
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const entries = payloads.map((payload) => ({
      attemptId: payload.attemptId,
      damage: payload.damage,
      questionCount: payload.questionCount,
      answeredAt: payload.answeredAt,
    }))
    try {
      const result = await stub.syncDamage(deviceToken, entries, receivedAt)
      acceptedIds.push(...result.acceptedIds)
    } catch (e) {
      // 主に「未初期化のbossId宛」（クライアントは観測済みraidStateのbossIdしか送らない
      // ため実運用では稀）だが、DO側の想定外エラー（SQLite障害等）もここに落ちる。
      // acceptedIdsに入らないため該当payloadはクライアントに残り、次回同期で再送される
      console.warn(`raid/sync: bossId=${bossId} へのDO呼び出しに失敗`, e)
    }
  }

  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(currentBossId(receivedAt)))
  const boss = await stub.getBossState(receivedAt, deviceToken)
  if (!boss) return errorResponse(404, 'boss_not_found', '今週のボスがまだ生成されていません')

  return jsonResponse({ acceptedIds, boss })
}
