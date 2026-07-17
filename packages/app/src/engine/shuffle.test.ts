// T-79完了条件①のテスト: シード注入（決定的なrng）でシャッフル結果が
// 再現可能な順序になること、かつ要素の欠落・重複が起きないことを確認する
import { describe, expect, it } from 'vitest'

import { shuffle } from './shuffle'

describe('shuffle', () => {
  it('rngが常に0を返す場合、決定的な並びになる（Fisher-Yatesの手順を固定した検証）', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1])
  })

  it('要素の欠落・重複が起きず、元の配列を破壊しない', () => {
    const original = ['a', 'b', 'c', 'd', 'e']
    const result = shuffle(original, () => 0.5)
    expect([...result].sort()).toEqual([...original].sort())
    expect(original).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('rng省略時はMath.randomを使い、要素数を保ったまま並び替える', () => {
    const original = [1, 2, 3]
    const result = shuffle(original)
    expect(result).toHaveLength(3)
    expect([...result].sort()).toEqual([1, 2, 3])
  })
})
