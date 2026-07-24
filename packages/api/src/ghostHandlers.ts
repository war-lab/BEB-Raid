// POST /ghosts・DELETE /ghosts/own（正本: docs/22 3.1節・3.3節）。
// 認証（Bearer）はindex.tsのroute()側で行い、ここには認証済みdeviceTokenを渡す

import type { OkResponse } from '@beb-raid/shared-schema'

import { bossProfileForWeek } from './bossProfiles'
import type { Env } from './env'
import type { GhostRecord } from './ghostStore'
import { ghostKey } from './ghostStore'
import { isGhostRecordPayload } from './ghostValidation'
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

/**
 * ボス役の記録を受領しKVへ保存する。1人1記録で、再POSTは全体を上書きする
 * （「記録の作り直し」= createdAt/defeatedCount/lastUsedBossIdも初期化する。docs/22 3.3節）
 */
export async function handlePostGhost(
  request: Request,
  env: Env,
  deviceToken: string,
  now: number,
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isGhostRecordPayload(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  const record: GhostRecord = {
    displayName: body.displayName,
    consent: true,
    records: body.records,
    createdAt: now,
    defeatedCount: 0,
    lastUsedBossId: null,
  }
  await env.MEMBERS.put(ghostKey(deviceToken), JSON.stringify(record))
  return jsonResponse({ ok: true } satisfies OkResponse)
}

/**
 * ボス役の記録をKVから即時削除する（記録が無くても200・冪等）。
 * 当週ボスがこの記録由来なら、当週DOへsynthetic相当への差し替えを指示する
 * （HP・累計ダメージ・討伐状態は維持。docs/22 3.3節）
 */
export async function handleDeleteGhostOwn(
  env: Env,
  deviceToken: string,
  now: number,
): Promise<Response> {
  await env.MEMBERS.delete(ghostKey(deviceToken))

  const current = isoWeekInfo(now)
  const bossId = bossIdFor(current)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
  const replacement = bossProfileForWeek(current.isoWeek)
  await stub.revokeGhostIfOwner(deviceToken, replacement)

  return jsonResponse({ ok: true } satisfies OkResponse)
}
