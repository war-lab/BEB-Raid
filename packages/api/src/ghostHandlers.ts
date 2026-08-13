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
 *
 * 【T-251・29のQ-26】表示名は body.displayName（自己申告・最大100字）を使わず、
 * 呼び出し側（index.ts）がBearer認証時に取得した登録済みメンバーの表示名
 * （member:<deviceToken>のdisplayName。register.tsで32字上限・trim済み）を使う。
 * 以前は自己申告を無検証で採用しており、他メンバーの表示名を騙ったゴースト
 * （＝ボス名として全参加者に配信される）を誰でも作れた。ペイロードのdisplayNameは
 * 引き続き型検証の対象だが値は使わない（shared-schemaのGhostRecordPayload契約・
 * 既存クライアントの送信を壊さないための後方互換）
 */
export async function handlePostGhost(
  request: Request,
  env: Env,
  deviceToken: string,
  memberDisplayName: string,
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

  // 記録の作り直しでは createdAt / defeatedCount / lastUsedBossId を初期化する（docs/22 3.3節）。
  // ただし usedBossIds（過去にこのゴーストが使われた週）は**引き継ぐ**（レビュー2巡目 指摘5）。
  // 初期化すると、W20で使用→再POST→W23で使用→W24で撤回、のときW20のRaidBossDOに
  // 本人の正誤詳細（defenseJson）が残り、同意画面の「撤回すると即時削除」を満たさない。
  // 撤回時は全件を消したうえでレコードごと削除するので、撤回を挟んだ場合は空から始まる
  const previousRaw = await env.MEMBERS.get(ghostKey(deviceToken))
  const previous = previousRaw ? (JSON.parse(previousRaw) as GhostRecord) : null

  const record: GhostRecord = {
    displayName: memberDisplayName,
    consent: true,
    records: body.records,
    createdAt: now,
    defeatedCount: 0,
    lastUsedBossId: null,
    usedBossIds: previous?.usedBossIds ?? [],
  }
  await env.MEMBERS.put(ghostKey(deviceToken), JSON.stringify(record))
  return jsonResponse({ ok: true } satisfies OkResponse)
}

/**
 * ボス役の記録をKVから即時削除する（記録が無くても200・冪等）。
 * 当週ボスがこの記録由来なら、当週DOへsynthetic相当への差し替えを指示する
 * （HP・累計ダメージ・討伐状態は維持。docs/22 3.3節）。
 *
 * 【T-335・K-70】同意画面（docs/22 3.5節）は「いつでも撤回でき撤回すると記録が
 * サーバーから即時削除される」と説明する（ADR 0013）。しかし旧実装は当週ボスの
 * defense/ghostJsonしか差し替えず、この記録が直近の別の週で使われていた場合、
 * その週のRaidBossDOには依然としてdefense（questionIdごとの倍率＝問題別正誤詳細）が
 * 残り続けていた（次回cronで別のghostが選ばれた後は、その週のDOは誰からも参照されず
 * 静かに取りこぼされる）。GhostRecord.lastUsedBossIdを削除前に読み、それが当週と
 * 異なればそちらのDOにも同じ差し替えを指示する（記録は`lastUsedBossId`1件しか
 * 保持しないため、直近1週分まで確実にカバーできる）
 */
export async function handleDeleteGhostOwn(
  env: Env,
  deviceToken: string,
  now: number,
): Promise<Response> {
  const raw = await env.MEMBERS.get(ghostKey(deviceToken))
  const record = raw ? (JSON.parse(raw) as GhostRecord) : null

  await env.MEMBERS.delete(ghostKey(deviceToken))

  const current = isoWeekInfo(now)
  const currentBossId = bossIdFor(current)
  const replacement = bossProfileForWeek(current.isoWeek)
  // 当週と、このゴーストが使われた全ての週から派生データ（defenseJson＝本人の問題別正誤に
  // 1対1で対応する防御倍率）を消す。lastUsedBossIdだけを見ていた頃は直近1週しか辿れず、
  // W20とW23で使われたゴーストをW24に撤回するとW20のDOに正誤詳細が残っていた（レビュー指摘5）
  const targets = new Set<string>([currentBossId])
  for (const id of record?.usedBossIds ?? []) targets.add(id)
  // usedBossIdsを持たない既存レコードのために lastUsedBossId も見る（後方互換）
  if (record?.lastUsedBossId) targets.add(record.lastUsedBossId)
  for (const bossId of targets) {
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    await stub.revokeGhostIfOwner(deviceToken, replacement)
  }

  return jsonResponse({ ok: true } satisfies OkResponse)
}
