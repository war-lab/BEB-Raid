// T-175 完了条件のテスト（docs/27 のS-26）。
// 何を防ぐか: 進捗の分母に item 数を使い続けること。audio_set は1itemで3サブ設問、
// text_passage は1itemでサブ設問全問を要求するため、「7分・20問」と表示して実際の
// 解答回数が数十回になり、1item内で答えても進捗バーが動かなかった。

import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import type { SessionItem } from '../services/session'
import { answerSlotsBefore, answerSlotsOf, totalAnswerSlots } from './answerSlots'
import type { QuestionLookup } from './types'

function question(id: string, format: Question['format'], subCount = 0): Question {
  return {
    id,
    part: format === 'audio_set' ? 3 : 5,
    format,
    difficulty: 2,
    tags: [],
    keyVocab: [],
    ...(subCount > 0
      ? {
          subQuestions: Array.from({ length: subCount }, (_, i) => ({
            id: `${id}-q${i}`,
            question: `設問${i}`,
            choices: [
              { key: 'A', text: 'a' },
              { key: 'B', text: 'b' },
            ],
            answer: 'A',
            explanation: '',
            translation: '',
          })),
        }
      : {}),
  }
}

function lookupOf(questions: Question[]): QuestionLookup {
  return new Map(questions.map((q) => [q.id, q]))
}

function itemsOf(ids: string[]): SessionItem[] {
  return ids.map((questionId) => ({ questionId, mode: 'solo' }))
}

describe('answerSlotsOf', () => {
  it('サブ設問を持たないformatは1回', () => {
    expect(answerSlotsOf(question('q1', 'text_blank'))).toBe(1)
    expect(answerSlotsOf(question('q2', 'audio_qa'))).toBe(1)
    expect(answerSlotsOf(question('q3', 'vocab_card'))).toBe(1)
    expect(answerSlotsOf(question('q4', 'dictation'))).toBe(1)
  })

  it('audio_set・text_passage はサブ設問の件数を数える', () => {
    expect(answerSlotsOf(question('s1', 'audio_set', 3))).toBe(3)
    expect(answerSlotsOf(question('p1', 'text_passage', 4))).toBe(4)
  })

  it('サブ設問を持つformatなのに件数0のときは1に丸める（0除算・進捗停止を避ける）', () => {
    expect(answerSlotsOf(question('s2', 'audio_set', 0))).toBe(1)
  })

  it('未解決のitem（問題が引けない）は1回として数える', () => {
    expect(answerSlotsOf(undefined)).toBe(1)
  })
})

describe('totalAnswerSlots / answerSlotsBefore', () => {
  const questions = [
    question('q1', 'text_blank'),
    question('s1', 'audio_set', 3),
    question('p1', 'text_passage', 4),
  ]
  const lookup = lookupOf(questions)

  it('item数ではなく解答回数の合計を返す', () => {
    const items = itemsOf(['q1', 's1', 'p1'])
    // item数は3だが、実際の解答回数は 1 + 3 + 4 = 8
    expect(items.length).toBe(3)
    expect(totalAnswerSlots(items, lookup)).toBe(8)
  })

  it('表示中itemより前の消費回数を返す', () => {
    const items = itemsOf(['q1', 's1', 'p1'])
    expect(answerSlotsBefore(items, lookup, 0)).toBe(0)
    expect(answerSlotsBefore(items, lookup, 1)).toBe(1)
    expect(answerSlotsBefore(items, lookup, 2)).toBe(4) // q1(1) + s1(3)
  })

  it('プールに無いitemも1回として数える（合計が目減りしない）', () => {
    const items = itemsOf(['q1', 'unknown'])
    expect(totalAnswerSlots(items, lookup)).toBe(2)
  })
})
