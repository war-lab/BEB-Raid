// POST /register（正本: docs/17_M3実装計画.md 3.2節）。
// 招待コード検証→deviceTokenをKVへ登録（新規発行はしない。端末が既に発行済みのprofile.deviceTokenを受け取る）。
// 再登録（同一deviceTokenでの再POST）はdisplayName/dailyGoalの上書き手段を兼ねる（専用の更新APIを作らない）。
// registeredAt・emaDailyDamageは既存レコードがあればそのまま引き継ぐ
// （表示名変更のたびにHP算出用のEMAが消えるのは意図しない副作用のため）

import type { DailyGoal, RegisterRequest } from '@beb-raid/shared-schema'

import type { Env, MemberRecord } from './env.js'
import { memberKey } from './env.js'

function isDailyGoal(value: unknown): value is DailyGoal {
  return value === 'light' || value === 'normal' || value === 'heavy'
}

function isRegisterRequest(body: unknown): body is RegisterRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.inviteCode === 'string' &&
    typeof b.deviceToken === 'string' &&
    b.deviceToken.length > 0 &&
    typeof b.displayName === 'string' &&
    b.displayName.length > 0 &&
    isDailyGoal(b.dailyGoal)
  )
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isRegisterRequest(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  if (body.inviteCode !== env.INVITE_CODE) {
    return errorResponse(401, 'invalid_invite_code', '招待コードが一致しません')
  }

  const existingRaw = await env.MEMBERS.get(memberKey(body.deviceToken))
  const existing = existingRaw ? (JSON.parse(existingRaw) as MemberRecord) : undefined

  const record: MemberRecord = {
    displayName: body.displayName,
    dailyGoal: body.dailyGoal,
    registeredAt: existing?.registeredAt ?? Date.now(),
    emaDailyDamage: existing?.emaDailyDamage,
  }

  await env.MEMBERS.put(memberKey(body.deviceToken), JSON.stringify(record))

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
