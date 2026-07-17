import { describe, expect, it } from 'vitest'

import {
  BOSS_HP_FACTOR,
  DAILY_GOAL_QUESTIONS,
  DAMAGE_PER_QUESTION,
  MIN_BOSS_HP,
  RAID_DAYS,
} from './raidConfig'

describe('raidConfig', () => {
  it('DAILY_GOAL_QUESTIONSはlight<normal<heavyの順に増える', () => {
    expect(DAILY_GOAL_QUESTIONS.light).toBeLessThan(DAILY_GOAL_QUESTIONS.normal)
    expect(DAILY_GOAL_QUESTIONS.normal).toBeLessThan(DAILY_GOAL_QUESTIONS.heavy)
  })

  it('MIN_BOSS_HPはnormal1人分の想定日次ダメージ×5日×係数と一致する', () => {
    const expected = Math.round(
      DAILY_GOAL_QUESTIONS.normal * DAMAGE_PER_QUESTION * RAID_DAYS * BOSS_HP_FACTOR,
    )
    expect(MIN_BOSS_HP).toBe(expected)
    expect(MIN_BOSS_HP).toBeGreaterThan(0)
  })

  it('BOSS_HP_FACTORはdocs/03 6.2の討伐率係数0.85と一致する', () => {
    expect(BOSS_HP_FACTOR).toBe(0.85)
  })
})
