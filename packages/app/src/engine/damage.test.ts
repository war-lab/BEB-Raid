// T-89完了条件①のテスト: ダメージ=基礎点×モード係数（03の6.1）。
// 係数はdamageConfig.jsonの仮値（J-47。docs/16）を前提に検証する
import { describe, expect, it } from 'vitest'

import { computeDamage, validateDamageConfig, type DamageModeConfig } from './damage'

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

// 何を防ぐか（T-311・K-41）: 従来は検証が無く、負値・NaN・非数値がJSON差し替え時に
// 静かに素通りし、ダメージが負・NaNになりうる
describe('validateDamageConfig（T-311・K-41）', () => {
  it('同梱の damageConfig.json は検証を通る', () => {
    expect(() => validateDamageConfig({ raid: 1.0, solo: 0.5, srs: 0 })).not.toThrow()
  })

  it('0は許容される（srs:0が既定値のため）', () => {
    expect(() => validateDamageConfig({ srs: 0 })).not.toThrow()
  })

  it('負の係数は拒否される', () => {
    expect(() => validateDamageConfig({ raid: -1 })).toThrow(/raid/)
  })

  it('NaN・Infinityは拒否される', () => {
    expect(() => validateDamageConfig({ raid: NaN })).toThrow(/raid/)
    expect(() => validateDamageConfig({ raid: Infinity })).toThrow(/raid/)
  })

  it('未定義のmodeは検証対象外（computeDamageの既定0と同じ扱い）', () => {
    expect(() => validateDamageConfig({})).not.toThrow()
  })
})
