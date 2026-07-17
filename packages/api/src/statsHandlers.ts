// POST/GET /stats/questions（正本: docs/17_M3実装計画.md 3.1節・3.8節）。
// 認証（Bearer）はindex.tsのroute()側で行う。ここにはdeviceTokenを一切渡さない
// （14の4.4-④: ハンドラへはペイロードのみを渡し、保存レコード型にdeviceToken列を持たせない）

import { isQuestionStatsRequest } from './statsValidation'
import { STATS_DO_NAME } from './statsDo'
import type { Env } from './env'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

export async function handlePostStats(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isQuestionStatsRequest(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  const stub = env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
  await stub.addStats(body.stats)
  return jsonResponse({ accepted: body.stats.length })
}

/** 管理用（3.8節: cliの自動取得はM3では実装せず、手動確認・投入用に用意する） */
export async function handleGetStats(env: Env): Promise<Response> {
  const stub = env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
  const stats = await stub.getAllStats()
  return jsonResponse({ stats })
}
