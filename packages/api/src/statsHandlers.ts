// POST/GET /stats/questions・POST /reports（正本: docs/17_M3実装計画.md 3.1節・3.8節）。
// 認証（Bearer）はindex.tsのroute()側で行う。ここにはdeviceTokenを一切渡さない
// （14の4.4-④: ハンドラへはペイロードのみを渡し、保存レコード型にdeviceToken列を持たせない）

import type { QuestionStatsRequest } from '@beb-raid/shared-schema'

import { isQuestionReportPayload, isQuestionStatsRequest } from './statsValidation'
import { STATS_DO_NAME } from './statsDo'
import type { Env } from './env'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

/**
 * リクエストボディの解析・検証のみを行う（T-334・K-69）。
 * この関数だけがRequest（=deviceTokenを含むBearerヘッダを持つ元リクエスト）に触れる。
 * questionStatsの匿名性はDOの保存形式（deviceToken列を持たない）だけでは保証されず、
 * 伝送・処理の途中でRequestとペイロードが同じ関数呼び出しに同席していると、
 * 将来のログ出力追加等でdeviceTokenと統計値が同じログ行に結合されるリスクが残る
 * （29のK-69・仮説。確定した漏洩ではないが、構造的に塞いでおく）。
 * handlePostStats本体には検証済みペイロードのみを渡し、Requestを一切渡さない
 */
export async function parseStatsRequestBody(
  request: Request,
): Promise<QuestionStatsRequest | 'invalid_json' | 'invalid_shape'> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return 'invalid_json'
  }
  if (!isQuestionStatsRequest(body)) return 'invalid_shape'
  return body
}

export async function handlePostStats(env: Env, payload: QuestionStatsRequest): Promise<Response> {
  const stub = env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
  await stub.addStats(payload.stats)
  return jsonResponse({ accepted: payload.stats.length })
}

/**
 * 管理用（3.8節: cliの自動取得はM3では実装せず、手動確認・投入用に用意する）。
 * 認可はADMIN_TOKEN（index.ts側でauthenticateAdminRequestを通す。T-249・29のQ-31。
 * 以前は一般メンバーのdeviceToken Bearerでも読めており「管理用」の意図とアクセス制御が
 * 一致していなかった）
 */
export async function handleGetStats(env: Env, request: Request): Promise<Response> {
  const stub = env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
  const url = new URL(request.url)
  const cursor = url.searchParams.get('cursor')
  const limitParam = url.searchParams.get('limit')
  const limit = limitParam !== null ? Number(limitParam) : undefined
  const page = await stub.getAllStats(cursor, Number.isFinite(limit) ? limit : undefined)
  return jsonResponse({ stats: page.items, nextCursor: page.nextCursor })
}

export async function handlePostReport(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isQuestionReportPayload(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  const stub = env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
  await stub.addReport(body.questionId, body.reason)
  return jsonResponse({ ok: true })
}
