// 共有API本体（正本: docs/17_M3実装計画.md 3.1節・3.10節、docs/16）。
// T-90時点は/healthのみだった。以降のエンドポイントはT-95（/raid/*）・
// T-100（/stats/questions）・T-101（/reports）で追加する

import { handlePreflight, withCors } from './cors'
import type { Env } from './env'
import { handleRegister } from './register'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function notFound(): Response {
  return jsonResponse({ error: { code: 'not_found', message: 'not found' } }, 404)
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return jsonResponse({ ok: true })
  }

  if (request.method === 'POST' && url.pathname === '/register') {
    return handleRegister(request, env)
  }

  return notFound()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = handlePreflight(request, env)
    if (preflight) return preflight

    const response = await route(request, env)
    return withCors(request, env, response)
  },
} satisfies ExportedHandler<Env>
