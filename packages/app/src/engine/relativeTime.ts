// 相対時刻の表示整形（M3・T-99。正本: docs/17_M3実装計画.md 3.7節）。
// raidState.lastSyncedAtから「最終同期: N分前」（60分超は「N時間前」、24時間超は「N日前」）を作る

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * 経過時間（ms）を「たった今」/「N分前」/「N時間前」/「N日前」に整形する（負値は0扱い）。
 * 60秒未満は「0分前」という不自然な表示を避けて「たった今」にする
 */
export function formatRelativeTime(elapsedMs: number): string {
  const elapsed = Math.max(0, elapsedMs)
  if (elapsed < MINUTE_MS) return 'たった今'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}分前`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}時間前`
  return `${Math.floor(elapsed / DAY_MS)}日前`
}
