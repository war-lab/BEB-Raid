// T-49 完了条件のテスト（audio_setセット正解判定。正本: docs/13 3.6節）:
// - セット正解/不正解の判定（2/3以上正解でセット正解）
import { describe, expect, it } from 'vitest'

import { computeSetResult } from './audioSet'

describe('computeSetResult', () => {
  it('3問中2問正解ならセット正解', () => {
    const result = computeSetResult('set-1', [true, true, false])
    expect(result.correctCount).toBe(2)
    expect(result.totalQuestions).toBe(3)
    expect(result.isSetCorrect).toBe(true)
  })

  it('3問中1問正解ならセット不正解', () => {
    const result = computeSetResult('set-1', [true, false, false])
    expect(result.isSetCorrect).toBe(false)
  })

  it('全問正解ならセット正解', () => {
    const result = computeSetResult('set-1', [true, true, true])
    expect(result.isSetCorrect).toBe(true)
  })

  it('0問（空配列）ならセット不正解', () => {
    const result = computeSetResult('set-1', [])
    expect(result.isSetCorrect).toBe(false)
    expect(result.totalQuestions).toBe(0)
  })

  it('setIdがそのまま返る', () => {
    const result = computeSetResult('my-set-id', [true])
    expect(result.setId).toBe('my-set-id')
  })
})
