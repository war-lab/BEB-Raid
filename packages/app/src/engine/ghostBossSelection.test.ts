import type { Question, QuestionFormat } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'
import {
  GHOST_BOSS_MIN_INVENTORY,
  GHOST_BOSS_QUESTION_COUNT,
  selectGhostBossQuestions,
} from './ghostBossSelection'

function q(id: string, format: QuestionFormat, difficulty: number): Question {
  return {
    id,
    part: format === 'vocab_card' ? 0 : 5,
    format,
    difficulty,
    tags: [],
    keyVocab: format === 'vocab_card' ? [] : [{ word: 'w', sense: 's', freqRank: 'S' }],
    question: 'Q',
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
    ],
    answer: 'A',
    explanation: 'E',
  }
}

/** 決定的な擬似乱数（テスト間で再現できるようにする） */
function fixedRng(seedValues: number[]): () => number {
  let i = 0
  return () => seedValues[i++ % seedValues.length]!
}

describe('selectGhostBossQuestions', () => {
  it('difficulty>=4が30問以上あれば、difficulty===3を使わず30問抽選する', () => {
    const pool = Array.from({ length: 40 }, (_, i) => q(`h${i}`, 'text_blank', 4))
    const result = selectGhostBossQuestions(pool, fixedRng([0.1, 0.5, 0.9]))
    expect(result).not.toBeNull()
    expect(result!.questions).toHaveLength(GHOST_BOSS_QUESTION_COUNT)
    expect(result!.backfilled).toBe(false)
    expect(result!.questions.every((x) => x.difficulty >= 4)).toBe(true)
  })

  it('difficulty>=4が30問未満なら、difficulty===3で30問まで補填する', () => {
    const pool = [
      ...Array.from({ length: 12 }, (_, i) => q(`h${i}`, 'text_blank', 4)),
      ...Array.from({ length: 25 }, (_, i) => q(`m${i}`, 'text_blank', 3)),
    ]
    const result = selectGhostBossQuestions(pool)
    expect(result).not.toBeNull()
    expect(result!.questions).toHaveLength(GHOST_BOSS_QUESTION_COUNT)
    expect(result!.backfilled).toBe(true)
    const highCount = result!.questions.filter((x) => x.difficulty >= 4).length
    expect(highCount).toBe(12)
  })

  it('difficulty>=3の合計がGHOST_BOSS_MIN_INVENTORY未満ならnullを返す（在庫不足の停止条件）', () => {
    const pool = Array.from({ length: GHOST_BOSS_MIN_INVENTORY - 1 }, (_, i) =>
      q(`h${i}`, 'text_blank', 4),
    )
    const result = selectGhostBossQuestions(pool)
    expect(result).toBeNull()
  })

  it('difficulty>=3の合計がちょうどGHOST_BOSS_MIN_INVENTORYならnullにならない（境界値）', () => {
    const pool = Array.from({ length: GHOST_BOSS_MIN_INVENTORY }, (_, i) =>
      q(`h${i}`, 'text_blank', 4),
    )
    const result = selectGhostBossQuestions(pool)
    expect(result).not.toBeNull()
    expect(result!.questions).toHaveLength(GHOST_BOSS_MIN_INVENTORY)
  })

  it('vocab_card・shadowing・dictationは対象外の除外formatを含めても選ばれない', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => q(`h${i}`, 'text_blank', 4)),
      ...Array.from({ length: 50 }, (_, i) => q(`v${i}`, 'vocab_card', 5)),
      ...Array.from({ length: 50 }, (_, i) => q(`s${i}`, 'shadowing', 5)),
      ...Array.from({ length: 50 }, (_, i) => q(`d${i}`, 'dictation', 5)),
    ]
    const result = selectGhostBossQuestions(pool)
    expect(result).toBeNull() // 除外formatを引いた在庫は5問のみ=在庫不足
  })

  it('difficulty===2以下は補填対象にならない', () => {
    const pool = [
      ...Array.from({ length: 5 }, (_, i) => q(`h${i}`, 'text_blank', 4)),
      ...Array.from({ length: 50 }, (_, i) => q(`l${i}`, 'text_blank', 2)),
    ]
    const result = selectGhostBossQuestions(pool)
    expect(result).toBeNull()
  })

  it('Part7（長文）はテンポが崩れるためバトル系のボス役出題から除外される（T-363・K-97）', () => {
    const part7 = (id: string): Question => ({ ...q(id, 'text_passage', 4), part: 7 })
    const pool = [
      ...Array.from({ length: 40 }, (_, i) => part7(`p7-${i}`)),
      ...Array.from({ length: 40 }, (_, i) => q(`p5-${i}`, 'text_blank', 4)),
    ]
    const result = selectGhostBossQuestions(pool, fixedRng([0.1, 0.5, 0.9]))
    expect(result).not.toBeNull()
    expect(result!.questions.some((question) => question.part === 7)).toBe(false)
  })
})
