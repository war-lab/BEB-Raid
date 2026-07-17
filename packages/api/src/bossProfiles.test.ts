import { describe, expect, it } from 'vitest'

import { BOSS_PROFILES, bossProfileForWeek } from './bossProfiles'

describe('bossProfileForWeek', () => {
  it('週番号mod配列長で決定的に選ばれる（同じ週番号は常に同じボス）', () => {
    const a = bossProfileForWeek(30)
    const b = bossProfileForWeek(30)
    expect(a).toEqual(b)
  })

  it('週番号がBOSS_PROFILES.lengthだけずれても同じボスになる（ローテーション）', () => {
    const a = bossProfileForWeek(1)
    const b = bossProfileForWeek(1 + BOSS_PROFILES.length)
    expect(a).toEqual(b)
  })

  it('全プロファイルにnameとflavorが存在する', () => {
    for (const profile of BOSS_PROFILES) {
      expect(profile.name.length).toBeGreaterThan(0)
      expect(profile.flavor.length).toBeGreaterThan(0)
    }
  })
})
