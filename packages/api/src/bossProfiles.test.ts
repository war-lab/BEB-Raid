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

  // T-292（K-19）: 上の2件は「決定的」「周期性」しか見ておらず、周期を縮める変更
  // （例: `% BOSS_PROFILES.length` を誤って `% (BOSS_PROFILES.length - 1)` にする、
  // 配列に重複を混入させる）があっても検出できない。連続する週の出力集合が
  // 全プロファイルと一致することまで確認する
  it('連続するBOSS_PROFILES.length週の出力集合が全プロファイルと一致する', () => {
    const produced = new Set(
      Array.from({ length: BOSS_PROFILES.length }, (_, week) => bossProfileForWeek(week)),
    )
    expect(produced).toEqual(new Set(BOSS_PROFILES))
  })

  it('全プロファイルにnameとflavorが存在する', () => {
    for (const profile of BOSS_PROFILES) {
      expect(profile.name.length).toBeGreaterThan(0)
      expect(profile.flavor.length).toBeGreaterThan(0)
    }
  })
})
