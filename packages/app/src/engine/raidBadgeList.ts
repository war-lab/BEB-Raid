// レイドバッジの一覧組み立て（T-150。正本: docs/25 6.4節、docs/07 6節「未取得はシルエット表示」）。
//
// 【なぜ「全バッジ定義の列挙」にしないか】バッジは2系統ある。
//   - `raid-first-clear`: 固定で1個
//   - `raid-clear:<bossId>`: 週次ボスごとに増える（boss-2026-W33 等）
// 後者は将来分を列挙できず、過去分も端末には現在週の `raidState` しか残らないため、
// 「全バッジ」を静的に持つことはそもそもできない。
//
// そこで未取得表示の対象を「固定バッジ＋進行中ボスの討伐バッジ」に定める（発起人判断 2026-08-13）。
// 「今週これを取れる」が見えることが表示の目的で、過去週の取り逃しを並べることではない。
// 過去に獲得したバッジは badges ストアに残るので、取得済みとしてそのまま並ぶ。

import { RAID_FIRST_CLEAR_BADGE_ID, raidClearBadgeId } from '../services/raidSync'
import type { BadgeRecord } from '../db/schema'

/** 画面に並べる1件。earnedAt が null なら未取得（シルエット表示） */
export interface RaidBadgeListItem {
  badgeId: string
  earnedAt: number | null
}

/**
 * 取得済みバッジと進行中ボスから、画面へ並べる一覧を作る。
 *
 * 並び順は「取得済み（獲得が新しい順）→未取得」とする。取得済みを先に置くのは、
 * 07の6節が求める「静かな学習・騒がしい報酬」に沿って、達成の記録を主役にするため。
 *
 * @param earned badges ストアの全件
 * @param currentBossId 進行中ボスのid（未参加・未取得・共有API未設定なら null）
 */
export function buildRaidBadgeList(
  earned: readonly BadgeRecord[],
  currentBossId: string | null,
): RaidBadgeListItem[] {
  const earnedIds = new Set(earned.map((b) => b.badgeId))
  const items: RaidBadgeListItem[] = [...earned]
    .sort((a, b) => b.earnedAt - a.earnedAt)
    .map((b) => ({ badgeId: b.badgeId, earnedAt: b.earnedAt }))

  // 未取得の候補。固定バッジ→今週の討伐バッジの順に並べる
  const candidates = [RAID_FIRST_CLEAR_BADGE_ID]
  if (currentBossId !== null) candidates.push(raidClearBadgeId(currentBossId))
  for (const badgeId of candidates) {
    if (!earnedIds.has(badgeId)) items.push({ badgeId, earnedAt: null })
  }
  return items
}
