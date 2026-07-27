// GET /raid/summary（正本: docs/22 3.8節）。運用者が係数調整のために手動確認する管理用
// エンドポイントで、クライアントアプリはこれを呼ばない（statsHandlers.tsのhandleGetStatsと同格）。
// 認証（Bearer）はindex.tsのroute()側で行う

import type { RaidSummary } from '@beb-raid/shared-schema'

import type { Env } from './env'
import { RAID_SUMMARY_KEY_PREFIX } from './raidSummaryStore'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleGetRaidSummary(env: Env): Promise<Response> {
  const listed = await env.MEMBERS.list({ prefix: RAID_SUMMARY_KEY_PREFIX })
  const summaries: RaidSummary[] = []
  for (const key of listed.keys) {
    const raw = await env.MEMBERS.get(key.name)
    if (!raw) continue
    summaries.push(JSON.parse(raw) as RaidSummary)
  }
  return jsonResponse(summaries)
}
