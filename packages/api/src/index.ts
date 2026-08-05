// 共有API本体（正本: docs/17_M3実装計画.md 3.1節・3.10節、docs/16）。
// T-90時点は/healthのみだった。/stats/questionsはT-100、/reportsはT-101で追加した

import { handleAdminGenerateBoss } from './adminHandlers'
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

/**
 * 週次ボス生成のcron式（wrangler.toml の `[triggers] crons` と一字一句一致させる）。
 * triggersは名前付き環境（env.dev/env.production）へ継承されるため、この1本が全環境共通。
 *
 * cron式をここで定数化するのは、scheduled()が`controller.cron`を見ずに全cronで
 * generateWeeklyBossを走らせる実装だったため。cronを1本追加した瞬間に週次ボス生成が
 * 追加cronの発火でも走り、emaDailyDamage（翌週以降のボスHP算出に使う）のEMA平滑化が
 * 崩れて前週値へ収束する＝レイド難易度調整が無症状で壊れる事故経路になっていた。
 * cron追加時は必ずここに分岐を足すこと（式を文字列リテラルで散らさない）
 *
 * 曜日フィールドは使わず日次発火にする（docs/30 J-100・T-180）。「Cloudflareは1=日曜〜
 * 7=土曜」という解釈が本番ログで確定していないため、曜日番号の書き換えでは解釈が誤っていた
 * 場合に発火日を別の誤った曜日へ動かしてしまう。generateWeeklyBossはRaidBossDO側で週の
 * 生成権を主張する形で完全に冪等化した（T-179）ため、日次発火でも週1回しか生成されない
 */
const CRON_WEEKLY_BOSS = '0 0 * * *'

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

  // 運用用（2026-08-03）。cronが発火しなかった週のボスを手当てする。
  // 認証は専用シークレット（ADMIN_TOKEN）で、メンバー認証（authenticateRequest）とは別系統。
  // 未設定の環境では handleAdminGenerateBoss が404を返す＝ルートが無いのと同じになる
  if (request.method === 'POST' && url.pathname === '/admin/raid/generate') {
    return handleAdminGenerateBoss(request, env, Date.now())
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
    // どのcronで発火したかで処理を出し分ける。全cronで無条件にボス生成を走らせると
    // 週次以外のcronを追加した時点でEMAが壊れる（CRON_WEEKLY_BOSSのコメント参照）
    switch (controller.cron) {
      case CRON_WEEKLY_BOSS:
        // waitUntil経由の失敗は既定では完全に無音になるため、必ずログに残す
        // （週1回しか走らないボス生成の失敗は致命的で、無音だと発見が翌週になる）
        ctx.waitUntil(
          generateWeeklyBoss(env, controller.scheduledTime).catch((e) => {
            console.error('週次ボス生成に失敗しました', e)
          }),
        )
        break
      default:
        // 未知のcron式は「何もしない」を選ぶ。誤ってボス生成へフォールバックさせると
        // wrangler.tomlへのcron追加ミスがEMA破壊という無症状の障害に直結するため。
        // ただし黙って捨てるとcron追加が動いていないことに永久に気づけないので必ず警告を残す
        console.warn(`未知のcron式で発火したため何も実行しませんでした: cron=${controller.cron}`)
        break
    }
  },
} satisfies ExportedHandler<Env>
