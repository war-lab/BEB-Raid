// ゴースト週のボス役選定（正本: docs/22 3.3節）。
// 週次cron（generateWeeklyBoss）から呼ばれる。承認済み記録（ghost:<deviceToken>）のうち
// lastUsedBossIdが直近2週のbossIdに含まれないものから、createdAtが最も古い1件を選ぶ

import type { Env } from './env'
import { deviceTokenFromGhostKey, GHOST_KEY_PREFIX, type GhostRecord } from './ghostStore'
import { listAllKeys } from './kvList'

export interface SelectedGhost {
  deviceToken: string
  record: GhostRecord
}

export async function selectGhostRecord(
  env: Env,
  recentBossIds: readonly string[],
): Promise<SelectedGhost | undefined> {
  // 【T-244・29のQ-23】KV.list()は1ページ最大1,000件までしか返さない。cursorが尽きるまで
  // 全ページ読み切らないと、承認済み記録が1,000件を超えた時点でキー順が後ろの記録が
  // 無言で選定候補から漏れる（実際に1,000件超で検証し再現した）
  const listed = await listAllKeys(env.MEMBERS, { prefix: GHOST_KEY_PREFIX })

  let best: SelectedGhost | undefined
  for (const key of listed) {
    const raw = await env.MEMBERS.get(key.name)
    if (!raw) continue
    const record = JSON.parse(raw) as GhostRecord
    if (record.lastUsedBossId && recentBossIds.includes(record.lastUsedBossId)) continue
    if (!best || record.createdAt < best.record.createdAt) {
      best = { deviceToken: deviceTokenFromGhostKey(key.name), record }
    }
  }
  return best
}
