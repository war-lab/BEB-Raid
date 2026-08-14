// timingSafeStringEqual（正本: docs/30 T-250・29のQ-32）。
// 何を防ぐか: 招待コード・adminトークンの比較に`!==`を使うと、不一致文字までの
// 応答時間差から秘密値を推測されうる（タイミング攻撃）。ここでは関数の正しさ
// （一致/不一致の判定自体は従来と同じ）のみを検証する（タイミングそのものはユニット
// テストで測定できないため、adminHandlers.test.ts・register.test.tsの既存テスト＝
// 長さの異なる不正トークンでの401/429確認が実質的な回帰網羅を兼ねる）
import { describe, expect, it } from 'vitest'

import { timingSafeStringEqual } from './timingSafeEqual'

describe('timingSafeStringEqual', () => {
  it('同一文字列はtrue', () => {
    expect(timingSafeStringEqual('test-admin-token', 'test-admin-token')).toBe(true)
  })

  it('長さが同じで内容が違う文字列はfalse', () => {
    expect(timingSafeStringEqual('test-admin-token', 'test-Xdmin-token')).toBe(false)
  })

  it('長さが異なる文字列はfalse（RangeErrorを投げない）', () => {
    expect(timingSafeStringEqual('short', 'much-longer-token')).toBe(false)
    expect(timingSafeStringEqual('much-longer-token', 'short')).toBe(false)
  })

  it('空文字列同士はtrue、片方だけ空文字列はfalse', () => {
    expect(timingSafeStringEqual('', '')).toBe(true)
    expect(timingSafeStringEqual('', 'x')).toBe(false)
  })

  it('マルチバイト文字（日本語）でも正しく判定する', () => {
    expect(timingSafeStringEqual('招待コード', '招待コード')).toBe(true)
    expect(timingSafeStringEqual('招待コード', '招待こーど')).toBe(false)
  })
})
