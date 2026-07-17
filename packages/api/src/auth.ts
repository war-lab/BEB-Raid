// Bearer認証ミドルウェア（正本: docs/17_M3実装計画.md 3.2節）。
// T-95以降の認証付きエンドポイント（/raid/*・/stats/questions・/reports）が共用する

import type { Env, MemberRecord } from './env.js'
import { memberKey } from './env.js'

const BEARER_PREFIX = 'Bearer '

export interface AuthSuccess {
  deviceToken: string
  member: MemberRecord
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header || !header.startsWith(BEARER_PREFIX)) return null
  const token = header.slice(BEARER_PREFIX.length).trim()
  return token.length > 0 ? token : null
}

/**
 * Authorization: Bearer <deviceToken> を検証する。
 * deviceTokenがKVに存在すればmemberレコードを返し、失敗時は401 Responseを返す
 * （呼び出し側は戻り値がResponseかどうかで分岐する）
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthSuccess | Response> {
  const token = extractBearerToken(request)
  if (!token) {
    return jsonError(401, 'unauthorized', 'Authorizationヘッダが必要です')
  }

  const raw = await env.MEMBERS.get(memberKey(token))
  if (!raw) {
    return jsonError(401, 'unregistered', '未登録のdeviceTokenです')
  }

  return { deviceToken: token, member: JSON.parse(raw) as MemberRecord }
}
