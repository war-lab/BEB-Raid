// CORS共通処理（正本: docs/17_M3実装計画.md 3.10節、docs/16 2節4行）。
// Pages（*.github.io）とWorkers（*.workers.dev）は別オリジンのため、
// ALLOWED_ORIGINSに完全一致したOriginにのみCORSヘッダを付与する。
// 不一致Originにはヘッダを付与しない（ブラウザ側がレスポンス読み取りをブロックする）

import type { Env } from './env.js'

function parseAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}

/** リクエストのOriginがホワイトリストに完全一致すればそのOriginを返す。不一致・Origin無しはnull */
export function resolveAllowedOrigin(requestOrigin: string | null, env: Env): string | null {
  if (!requestOrigin) return null
  return parseAllowedOrigins(env).includes(requestOrigin) ? requestOrigin : null
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    Vary: 'Origin',
  }
}

/** OPTIONSプリフライトの応答を返す（対象外のメソッドはnull） */
export function handlePreflight(request: Request, env: Env): Response | null {
  if (request.method !== 'OPTIONS') return null
  const origin = resolveAllowedOrigin(request.headers.get('Origin'), env)
  return new Response(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) })
}

/** 通常レスポンスにCORSヘッダを付与する（不許可Originの場合は無付与のまま返す） */
export function withCors(request: Request, env: Env, response: Response): Response {
  const origin = resolveAllowedOrigin(request.headers.get('Origin'), env)
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value)
  }
  return new Response(response.body, { status: response.status, headers })
}
