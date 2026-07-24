// ゴースト週のボス役選定（正本: docs/22 3.3節）。
// 週次cron（generateWeeklyBoss）から呼ばれる。承認済み記録（ghost:<deviceToken>）のうち
// lastUsedBossIdが直近2週のbossIdに含まれないものから、createdAtが最も古い1件を選ぶ

import type { Env } from './env'
import { deviceTokenFromGhostKey, GHOST_KEY_PREFIX, type GhostRecord } from './ghostStore'

export interface SelectedGhost {
  deviceToken: string
  record: GhostRecord
}

export async function selectGhostRecord(
  env: Env,
  recentBossIds: readonly string[],
): Promise<SelectedGhost | undefined> {
  const listed = await env.MEMBERS.list({ prefix: GHOST_KEY_PREFIX })

  let best: SelectedGhost | undefined
  for (const key of listed.keys) {
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
