// 共有API本体（正本: docs/17_M3実装計画.md 3.1節・3.10節、docs/16）。
// T-90時点は/healthのみだった。/stats/questionsはT-100、/reportsはT-101で追加した

import { authenticateRequest } from './auth'
import { handlePreflight, withCors } from './cors'
import type { Env } from './env'
import { handleRaidCurrent, handleRaidSync } from './raidHandlers'
import { handleRegister } from './register'
import { generateWeeklyBoss } from './scheduled'
import { handleGetStats, handlePostReport, handlePostStats } from './statsHandlers'

export { RaidBossDO } from './raidBossDo'
export { StatsDO } from './statsDo'

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

  if (request.method === 'GET' && url.pathname === '/raid/current') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleRaidCurrent(env, auth.deviceToken, Date.now())
  }

  if (request.method === 'POST' && url.pathname === '/raid/sync') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleRaidSync(request, env, auth.deviceToken, Date.now())
  }

  if (request.method === 'POST' && url.pathname === '/stats/questions') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handlePostStats(request, env)
  }

  if (request.method === 'GET' && url.pathname === '/stats/questions') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleGetStats(env)
  }

  if (request.method === 'POST' && url.pathname === '/reports') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handlePostReport(request, env)
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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(generateWeeklyBoss(env, controller.scheduledTime))
  },
} satisfies ExportedHandler<Env>
