// raidValidation.tsの検証テスト（T-330・K-65）。
// 1payloadあたりのdamage上限がクランプされていることを確認する
import { describe, expect, it } from 'vitest'

import { isRaidSyncRequest, MAX_SYNC_PAYLOADS } from './raidValidation'

function payload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    attemptId: 'a-1',
    bossId: 'boss-2027-W01',
    damage: 100,
    questionCount: 1,
    answeredAt: 0,
    ...overrides,
  }
}

describe('isRaidSyncRequest', () => {
  it('通常の値は受理される', () => {
    expect(isRaidSyncRequest({ payloads: [payload()] })).toBe(true)
  })

  // 何を防ぐか（T-330・K-65）: 旧上限10,000のままだとMAX_SYNC_PAYLOADS（500件）との
  // 組み合わせで1リクエスト最大5,000,000ダメージを送れ、実HPの30倍規模になっていた。
  // 実測の1問あたり最大ダメージ（基礎点上限130×raid係数1.0=130）に対して、
  // 500は十分な安全マージンを保ちつつ桁違いの値は弾く
  it('1payloadのdamageが500を超えると拒否される（旧上限10,000は現在拒否される）', () => {
    expect(isRaidSyncRequest({ payloads: [payload({ damage: 500 })] })).toBe(true)
    expect(isRaidSyncRequest({ payloads: [payload({ damage: 501 })] })).toBe(false)
    expect(isRaidSyncRequest({ payloads: [payload({ damage: 10_000 })] })).toBe(false)
  })

  it('負数・非整数のdamageは拒否される', () => {
    expect(isRaidSyncRequest({ payloads: [payload({ damage: -1 })] })).toBe(false)
    expect(isRaidSyncRequest({ payloads: [payload({ damage: 1.5 })] })).toBe(false)
  })

  it(`payloadsがMAX_SYNC_PAYLOADS（${MAX_SYNC_PAYLOADS}）を超えると拒否される`, () => {
    const payloads = Array.from({ length: MAX_SYNC_PAYLOADS + 1 }, (_, i) =>
      payload({ attemptId: `a-${i}` }),
    )
    expect(isRaidSyncRequest({ payloads })).toBe(false)
  })
})
