// POST /admin/raid/generate（運用用。2026-08-03追加）。
//
// 週次ボスは cron（`0 0 * * 1`）でしか生成されず、**発火しなかった週を手当てする手段が
// 無かった**。2026-07-27・2026-08-03 の自動発火がいずれも確認できなかった（docs/STATUS.md
// 「本番の週次ボスが生成されていない」）ため、cronの原因調査と切り離して今週のレイドを
// 成立させられる経路を用意する。
//
// 【安全側の設計】既に今週のボスがあれば**生成処理を呼ばずに現状を返す**。
// `generateWeeklyBoss` は③ボスDO初期化は冪等だが、①emaDailyDamageの更新は冪等でない
// （同じ週の実績でEMAを二度平滑化すると翌週以降のHP算出が前週値へ寄る）。
// したがって「無いときだけ生成する」を関数の外側で守る。
//
// 認証は専用シークレット `ADMIN_TOKEN`（Bearer）。**未設定なら 404 を返して存在しない扱い**に
// する（設定するまで攻撃面を作らない）。招待コード（INVITE_CODE）は流用しない——
// あれは登録済みメンバー全員が知っている値で、運用操作の認可には強度が足りない。
//
// 【T-249・29のQ-31】このADMIN_TOKEN認可は「管理用」の他エンドポイント
// （GET /stats/questions・GET /raid/summary）とも共有する。以前はこの2経路が
// authenticateRequest（一般メンバーのBearer）で保護されており、「管理用」という
// 注記とアクセス制御が一致していなかった。index.ts側の呼び出しでこのファイルの
// authenticateAdminRequest を使う
//
// 【T-250・29のQ-32】adminトークンの照合は`!==`ではなくタイミングセーフな比較
// （timingSafeStringEqual）を使う。招待コードの照合（register.ts）も同じ理由で同関数を使う

import type { Env } from './env'
import { bossIdFor, isoWeekInfo } from './raidWeek'
import { generateWeeklyBoss } from './scheduled'
import { timingSafeStringEqual } from './timingSafeEqual'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

/** Bearerトークンを取り出す（authenticateRequestと同じ形式。あちらはKV照合なので共用しない） */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token === '' ? null : token
}

/**
 * ADMIN_TOKENによる認可の共通チェック（T-249・T-250）。問題が無ければnull、
 * 問題があれば返すべきResponseを返す（呼び出し側はnullでなければそのまま返す）。
 * 未設定の環境では404（ルートが無いものとして扱う。設定するまで攻撃面を作らない）
 */
export function authenticateAdminRequest(request: Request, env: Env): Response | null {
  const adminToken = env.ADMIN_TOKEN
  if (!adminToken) return errorResponse(404, 'not_found', 'not found')

  const provided = bearerToken(request)
  if (!provided || !timingSafeStringEqual(provided, adminToken)) {
    return errorResponse(401, 'unauthorized', 'Authorizationヘッダが必要です')
  }
  return null
}

export async function handleAdminGenerateBoss(
  request: Request,
  env: Env,
  now: number,
): Promise<Response> {
  const authError = authenticateAdminRequest(request, env)
  if (authError) return authError

  const bossId = bossIdFor(isoWeekInfo(now))
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
  // 存在確認は不要なDO呼び出しを避けるための最適化。重複防止の責務そのものは
  // generateWeeklyBoss側（週の生成権の主張）に移った（docs/30 J-101・T-179）
  // deviceTokenを渡さないので myDamage は0になる（存在確認だけが目的）
  const existing = await stub.getBossState(now)
  if (existing) {
    return jsonResponse({ created: false, bossId, boss: existing })
  }

  // createdは主張の結果（実際にこの呼び出しが生成処理を行ったか）から返す。
  // 上のexisting確認とgenerateWeeklyBoss呼び出しの間で他の生成（cronや並行リクエスト）が
  // 割り込んだ場合、claimGeneration()がfalseを返すのでcreated:falseが正しく返る
  const created = await generateWeeklyBoss(env, now)
  const boss = await stub.getBossState(now)
  return jsonResponse({ created, bossId, boss: boss ?? null })
}
