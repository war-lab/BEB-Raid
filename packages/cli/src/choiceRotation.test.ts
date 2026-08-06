// T-294（K-21）: 選択肢ローテーションの共通ヘルパー（T-266・正本: docs/30 17節）に
// 専用テストが無かった。決定的な一定差分循環（29のQ-79）の再発防止策そのものの
// 正しさを担保する。scripts/shuffle-cyclic-choices.mjsと実装を揃える前提のため、
// FNV-1aの既知の性質（決定性・分散）とrotationAmountの値域を検証する
import { describe, expect, it } from 'vitest'

import { fnv1a, rotationAmount } from './choiceRotation'

describe('fnv1a', () => {
  it('同じ文字列は常に同じハッシュ値を返す（決定的）', () => {
    expect(fnv1a('vocab-submit')).toBe(fnv1a('vocab-submit'))
  })

  it('異なる文字列は異なるハッシュ値になる（分散。衝突ゼロは保証しないため代表例で確認）', () => {
    const hashes = new Set(['a', 'b', 'c', 'd', 'e'].map(fnv1a))
    expect(hashes.size).toBe(5)
  })

  it('常に非負の32bit符号なし整数を返す', () => {
    for (const s of ['', 'x', 'a-very-long-seed-string-for-hashing-purposes']) {
      const h = fnv1a(s)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
      expect(Number.isInteger(h)).toBe(true)
    }
  })

  it('空文字列でも例外にならず、FNV-1aのオフセットバイアス値をそのまま返す', () => {
    // FNV-1a: ループ0回のためhash初期値（オフセットバイアス）がそのまま>>>0される
    expect(fnv1a('')).toBe(0x811c9dc5)
  })
})

describe('rotationAmount', () => {
  it('戻り値は常に[0, modulus)の範囲に収まる', () => {
    const seeds = ['A', 'submit', 'vocab-card-123', '語彙カード']
    for (const seed of seeds) {
      for (const modulus of [1, 2, 3, 4, 5]) {
        const amount = rotationAmount(seed, modulus)
        expect(amount).toBeGreaterThanOrEqual(0)
        expect(amount).toBeLessThan(modulus)
      }
    }
  })

  it('同じseedKeyとmodulusなら常に同じ値になる（決定的）', () => {
    expect(rotationAmount('keyVocabWord-attend', 4)).toBe(rotationAmount('keyVocabWord-attend', 4))
  })

  it('fnv1a(seedKey) % modulusと一致する（配列内位置=indexに依存しないことの根拠。29のQ-79の再発防止）', () => {
    expect(rotationAmount('submit', 4)).toBe(fnv1a('submit') % 4)
    expect(rotationAmount('question-001', 4)).toBe(fnv1a('question-001') % 4)
  })
})
