// 共有API本体（正本: docs/17_M3実装計画.md 3.1節・3.10節、docs/16）。
// T-90時点は/healthのみだった。/stats/questionsはT-100、/reportsはT-101で追加した

import { authenticateRequest } from './auth'
import { handleCreateBattleRoom } from './battleHandlers'
import { handlePreflight, withCors } from './cors'
import type { Env } from './env'
import { handleDeleteGhostOwn, handlePostGhost } from './ghostHandlers'
import { handleRaidCurrent, handleRaidSync } from './raidHandlers'
import { handleGetRaidSummary } from './raidSummaryHandlers'
import { handleRegister } from './register'
import { generateWeeklyBoss } from './scheduled'
import { handleGetStats, handlePostReport, handlePostStats } from './statsHandlers'

export { BattleRoomDO } from './battleRoomDo'
export { RaidBossDO } from './raidBossDo'
export { StatsDO } from './statsDo'

/** GET /battle/rooms/:code/ws のコード部分を取り出す（4文字英数字大文字のみ許可） */
const BATTLE_WS_PATH = /^\/battle\/rooms\/([A-Z0-9]{4})\/ws$/

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

  if (request.method === 'POST' && url.pathname === '/ghosts') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handlePostGhost(request, env, auth.deviceToken, Date.now())
  }

  if (request.method === 'DELETE' && url.pathname === '/ghosts/own') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleDeleteGhostOwn(env, auth.deviceToken, Date.now())
  }

  if (request.method === 'GET' && url.pathname === '/raid/summary') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleGetRaidSummary(env)
  }

  if (request.method === 'POST' && url.pathname === '/battle/rooms') {
    const auth = await authenticateRequest(request, env)
    if (auth instanceof Response) return auth
    return handleCreateBattleRoom(env, auth.deviceToken, Date.now())
  }

  // WebSocket Upgradeのため認証はBearerヘッダではなくSec-WebSocket-Protocol経由
  // （BattleRoomDO.fetch()内で行う。docs/22 3.1節）。ここではDOへ転送するのみ
  const wsMatch = url.pathname.match(BATTLE_WS_PATH)
  if (request.method === 'GET' && wsMatch) {
    const code = wsMatch[1]!
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))
    return stub.fetch(request)
  }

  return notFound()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = handlePreflight(request, env)
    if (preflight) return preflight

    // route()内の想定外例外（DO/KV障害等）もCORS付きの500に変換する。
    // ここで包まないとエラーレスポンスにCORSヘッダが付かず、ブラウザからは
    // サーバー障害が「CORSエラー」に見えて原因究明を誤誘導する
    let response: Response
    try {
      response = await route(request, env)
    } catch (e) {
      console.error(`${request.method} ${new URL(request.url).pathname} で想定外のエラー`, e)
      response = jsonResponse(
        { error: { code: 'internal', message: 'サーバー内部でエラーが発生しました' } },
        500,
      )
    }
    // 101(WebSocket Upgrade)はResponseに`webSocket`という非標準プロパティを持つが、
    // withCors内の`new Response(response.body, {...})`はこれを引き継がないため
    // webSocketが失われて接続が壊れる。WSハンドシェイクはfetch/XHRと異なりブラウザの
    // Access-Control-Allow-Origin相当のチェック対象外（ブラウザは実装上ブロックしない）
    // なので、CORSヘッダ付与をスキップしてそのまま返す
    if (response.status === 101) return response
    return withCors(request, env, response)
  },
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    // waitUntil経由の失敗は既定では完全に無音になるため、必ずログに残す
    // （週1回しか走らないボス生成の失敗は致命的で、無音だと発見が翌週になる）
    ctx.waitUntil(
      generateWeeklyBoss(env, controller.scheduledTime).catch((e) => {
        console.error('週次ボス生成に失敗しました', e)
      }),
    )
  },
} satisfies ExportedHandler<Env>
