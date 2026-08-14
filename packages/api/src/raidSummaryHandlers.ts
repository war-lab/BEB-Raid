// GET /raid/summary（正本: docs/22 3.8節）。運用者が係数調整のために手動確認する管理用
// エンドポイントで、クライアントアプリはこれを呼ばない（statsHandlers.tsのhandleGetStatsと同格）。
// 認可（ADMIN_TOKEN）はindex.ts側でauthenticateAdminRequestを通す（T-249・29のQ-31。
// 以前は一般メンバーのdeviceToken Bearerでも読めており「管理用」の意図とアクセス制御が
// 一致していなかった）

import type { RaidSummary } from '@beb-raid/shared-schema'

import type { Env } from './env'
import { listAllKeys } from './kvList'
import { RAID_SUMMARY_KEY_PREFIX } from './raidSummaryStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleGetRaidSummary(env: Env): Promise<Response> {
  // 【T-244・29のQ-23】週次サマリは毎週1件ずつ蓄積されるため、運用が長引くと
  // 1,000件を超えうる。KV.list()は1ページ最大1,000件までしか返さないため、
  // cursorが尽きるまで全ページ読み切らないと古いサマリが無言で欠落する
  const listed = await listAllKeys(env.MEMBERS, { prefix: RAID_SUMMARY_KEY_PREFIX })
  const summaries: RaidSummary[] = []
  for (const key of listed) {
    const raw = await env.MEMBERS.get(key.name)
    if (!raw) continue
    summaries.push(JSON.parse(raw) as RaidSummary)
  }
  return jsonResponse(summaries)
}
