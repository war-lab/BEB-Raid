// T-126完了条件のテスト（正本: docs/22_M4実装計画.md 3.2節・6節T-126シート）:
// - Part2:Part5=6:6（計12問）の抽選比率
// - 在庫不足時は他方で補填する
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import { BATTLE_QUESTION_COUNT, drawBattleQuestionSet } from './battleLottery'

function q(id: string, part: number): Question {
  return {
    id,
    part,
    format: part === 2 ? 'audio_qa' : 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
  }
}

function pool(part2Count: number, part5Count: number, otherCount = 0): Question[] {
  const items: Question[] = []
  for (let i = 0; i < part2Count; i++) items.push(q(`p2-${i}`, 2))
  for (let i = 0; i < part5Count; i++) items.push(q(`p5-${i}`, 5))
  for (let i = 0; i < otherCount; i++) items.push(q(`p7-${i}`, 7))
  return items
}

describe('drawBattleQuestionSet: 在庫十分時の比率', () => {
  it('Part2:Part5=6:6の12問を抽選する', () => {
    const result = drawBattleQuestionSet(pool(20, 20), () => 0.3)
    expect(result).toHaveLength(BATTLE_QUESTION_COUNT)
    expect(result.filter((r) => r.part === 2)).toHaveLength(6)
    expect(result.filter((r) => r.part === 5)).toHaveLength(6)
  })

  it('Part2/Part5以外（Part7等）は抽選対象に含めない', () => {
    const result = drawBattleQuestionSet(pool(20, 20, 20), () => 0.3)
    expect(result.every((r) => r.part === 2 || r.part === 5)).toBe(true)
  })

  it('重複なく選ばれる', () => {
    const result = drawBattleQuestionSet(pool(20, 20), () => 0.3)
    expect(new Set(result.map((r) => r.id)).size).toBe(result.length)
  })
})

describe('drawBattleQuestionSet: 在庫不足時の補填', () => {
  it('Part2が不足（2問）していてもPart5で補填し12問に達する', () => {
    const result = drawBattleQuestionSet(pool(2, 20), () => 0.3)
    expect(result).toHaveLength(BATTLE_QUESTION_COUNT)
    expect(result.filter((r) => r.part === 2)).toHaveLength(2)
    expect(result.filter((r) => r.part === 5)).toHaveLength(10)
  })

  it('Part5が不足（3問）していてもPart2で補填し12問に達する', () => {
    const result = drawBattleQuestionSet(pool(20, 3), () => 0.3)
    expect(result).toHaveLength(BATTLE_QUESTION_COUNT)
    expect(result.filter((r) => r.part === 5)).toHaveLength(3)
    expect(result.filter((r) => r.part === 2)).toHaveLength(9)
  })

  it('両方合わせても12問に満たない場合は在庫分だけを返す', () => {
    const result = drawBattleQuestionSet(pool(2, 3), () => 0.3)
    expect(result).toHaveLength(5)
  })

  it('在庫が全く無ければ空配列を返す', () => {
    const result = drawBattleQuestionSet(pool(0, 0), () => 0.3)
    expect(result).toHaveLength(0)
  })
})

describe('drawBattleQuestionSet: rng省略時', () => {
  it('Math.randomでも12問の比率が保たれる', () => {
    const result = drawBattleQuestionSet(pool(20, 20))
    expect(result).toHaveLength(BATTLE_QUESTION_COUNT)
    expect(result.filter((r) => r.part === 2)).toHaveLength(6)
    expect(result.filter((r) => r.part === 5)).toHaveLength(6)
  })
})
