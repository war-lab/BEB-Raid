// T-89完了条件①のテスト: ダメージ=基礎点×モード係数（03の6.1）。
// 係数はdamageConfig.jsonの仮値（J-47。docs/16）を前提に検証する
import { describe, expect, it } from 'vitest'

import { computeDamage, type DamageModeConfig } from './damage'

describe('computeDamage', () => {
  it('raidモードは係数1.0（基礎点そのまま）', () => {
    expect(computeDamage(80, 'raid')).toBe(80)
  })

  it('soloモードは係数0.5', () => {
    expect(computeDamage(80, 'solo')).toBe(40)
  })

  it('srsモードは係数0（ダメージ0）', () => {
    expect(computeDamage(80, 'srs')).toBe(0)
  })

  it('係数未定義のmode（battle等）は0を返す（別式の対象外・エラーにはしない）', () => {
    expect(computeDamage(80, 'battle')).toBe(0)
  })

  it('configを差し替えれば係数を変えられる（J-47の仮値からの調整を想定した構造）', () => {
    const custom: DamageModeConfig = { raid: 2, solo: 1, srs: 0.1 }
    expect(computeDamage(50, 'raid', custom)).toBe(100)
    expect(computeDamage(50, 'solo', custom)).toBe(50)
    expect(computeDamage(50, 'srs', custom)).toBe(5)
  })
})
