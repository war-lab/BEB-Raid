// T-150 完了条件のテスト（正本: docs/25 6.4節、docs/07 6節）:
// - 未取得バッジが一覧に並ぶこと（固定バッジ＋進行中ボスの討伐バッジ）
// - 取得済みは重複して未取得側に出ないこと
import { describe, expect, it } from 'vitest'

import { buildRaidBadgeList } from './raidBadgeList'

const earned = (badgeId: string, earnedAt: number) => ({ badgeId, earnedAt })

describe('buildRaidBadgeList（T-150）', () => {
  it('未参加（ボス未取得）でも固定バッジを未取得として出す', () => {
    expect(buildRaidBadgeList([], null)).toEqual([{ badgeId: 'raid-first-clear', earnedAt: null }])
  })

  it('進行中ボスがあれば、その週の討伐バッジも未取得として出す', () => {
    expect(buildRaidBadgeList([], 'boss-2026-W33')).toEqual([
      { badgeId: 'raid-first-clear', earnedAt: null },
      { badgeId: 'raid-clear:boss-2026-W33', earnedAt: null },
    ])
  })

  it('取得済みのバッジは未取得側へ重複して出さない', () => {
    const list = buildRaidBadgeList([earned('raid-first-clear', 1000)], 'boss-2026-W33')
    expect(list).toEqual([
      { badgeId: 'raid-first-clear', earnedAt: 1000 },
      { badgeId: 'raid-clear:boss-2026-W33', earnedAt: null },
    ])
  })

  it('取得済みを先に、獲得が新しい順で並べる', () => {
    const list = buildRaidBadgeList(
      [earned('raid-clear:boss-2026-W31', 1000), earned('raid-clear:boss-2026-W32', 3000)],
      null,
    )
    expect(list.map((b) => b.badgeId)).toEqual([
      'raid-clear:boss-2026-W32',
      'raid-clear:boss-2026-W31',
      'raid-first-clear',
    ])
  })

  it('過去週の取り逃しは並べない（列挙できないため対象外。発起人判断 2026-08-13）', () => {
    // W31に参加せず未取得でも、進行中がW33なら並ぶのはW33だけ
    const list = buildRaidBadgeList([earned('raid-first-clear', 1000)], 'boss-2026-W33')
    expect(list.some((b) => b.badgeId === 'raid-clear:boss-2026-W31')).toBe(false)
  })

  it('全て取得済みなら未取得は1件も出ない', () => {
    const list = buildRaidBadgeList(
      [earned('raid-first-clear', 1000), earned('raid-clear:boss-2026-W33', 2000)],
      'boss-2026-W33',
    )
    expect(list.every((b) => b.earnedAt !== null)).toBe(true)
    expect(list).toHaveLength(2)
  })
})
