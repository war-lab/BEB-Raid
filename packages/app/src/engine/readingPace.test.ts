// T-145 完了条件のテスト（正本: docs/24 3.5節・4節T-145）。
// 何を防ぐか: 読解のペース指標が「読解以外の解答」や「0ms・時間切れ」を混ぜて算出され、
// 実際より速い/遅い数字を出すこと。目的は時間切れで解き切れない層の底上げなので、
// 数字そのものが信用できないと判断材料にならない。

import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import type { AttemptRecord } from '../db/schema'
import {
  computeReadingPace,
  formatPaceDuration,
  RC_PACE_MIN_SAMPLE,
  RC_TARGET_MS_PER_QUESTION,
} from './readingPace'
import type { QuestionLookup } from './types'

function readingQuestion(id: string, subCount = 3): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    passages: [{ id: `${id}-p1`, kind: 'email', text: '本文' }],
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
}

function part5Question(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: 'dummy',
    choices: [{ key: 'A', text: 'a' }],
    answer: 'A',
  }
}

let seq = 0
function attempt(questionId: string, responseMs: number, over: Partial<AttemptRecord> = {}) {
  return {
    id: `a-${++seq}`,
    questionId,
    mode: 'solo',
    isCorrect: true,
    responseMs,
    isTimeout: false,
    isGuess: false,
    answeredAt: 1000 + seq,
    ...over,
  } as AttemptRecord
}

const LOOKUP: QuestionLookup = new Map(
  [readingQuestion('p7-1', 3), readingQuestion('p6-1', 4), part5Question('p5-1')].map((q) => [
    q.id,
    q,
  ]),
)

describe('computeReadingPace', () => {
  it('読解サブ設問の平均解答時間と目標ペースとの差を返す', () => {
    // 5件（=最小サンプル）。平均72秒 → 目標60秒より12秒遅い
    const attempts = [
      attempt('p7-1-q0', 60_000),
      attempt('p7-1-q1', 70_000),
      attempt('p7-1-q2', 80_000),
      attempt('p6-1-q0', 75_000),
      attempt('p6-1-q1', 75_000),
    ]

    const pace = computeReadingPace(attempts, LOOKUP)

    expect(pace).not.toBeNull()
    expect(pace!.count).toBe(5)
    expect(pace!.averageMs).toBe(72_000)
    expect(pace!.diffMs).toBe(12_000)
  })

  it('目標より速い場合は差が負になる', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => attempt(`p7-1-q${i % 3}`, 45_000))

    const pace = computeReadingPace(attempts, LOOKUP)

    expect(pace!.averageMs).toBe(45_000)
    expect(pace!.diffMs).toBe(45_000 - RC_TARGET_MS_PER_QUESTION)
    expect(pace!.diffMs).toBeLessThan(0)
  })

  // 何を防ぐか: Part5やPart2の解答（1問あたりが短い）が混ざって「速い」と誤表示すること
  it('読解以外の解答は集計に混ぜない', () => {
    const attempts = [
      ...Array.from({ length: 5 }, () => attempt('p7-1-q0', 90_000)),
      // Part5は1問30秒想定。混ざると平均が大きく下がる
      ...Array.from({ length: 20 }, () => attempt('p5-1', 10_000)),
    ]

    const pace = computeReadingPace(attempts, LOOKUP)

    expect(pace!.count).toBe(5)
    expect(pace!.averageMs).toBe(90_000)
  })

  it('親questionIdで記録された解答は対象外（読解は必ずサブ設問単位で記録される）', () => {
    const attempts = Array.from({ length: 6 }, () => attempt('p7-1', 90_000))

    expect(computeReadingPace(attempts, LOOKUP)).toBeNull()
  })

  it('lookupに親が無いサブ設問IDは対象外（別パックの残骸を拾わない）', () => {
    const attempts = Array.from({ length: 6 }, (_, i) => attempt(`unknown-q${i}`, 90_000))

    expect(computeReadingPace(attempts, LOOKUP)).toBeNull()
  })

  // 何を防ぐか: 0msや時間切れが平均へ混ざって「実際より速い」数字になること
  it('responseMs=0 と時間切れは除外する', () => {
    const attempts = [
      ...Array.from({ length: 5 }, () => attempt('p7-1-q0', 80_000)),
      attempt('p7-1-q1', 0),
      attempt('p7-1-q2', 5_000, { isTimeout: true }),
    ]

    const pace = computeReadingPace(attempts, LOOKUP)

    expect(pace!.count).toBe(5)
    expect(pace!.averageMs).toBe(80_000)
  })

  it('サンプルが最小数に届かなければnullを返す（1問の当たり外れで揺れる平均を出さない）', () => {
    const attempts = Array.from({ length: RC_PACE_MIN_SAMPLE - 1 }, () =>
      attempt('p7-1-q0', 80_000),
    )

    expect(computeReadingPace(attempts, LOOKUP)).toBeNull()
    expect(computeReadingPace([], LOOKUP)).toBeNull()
  })
})

describe('formatPaceDuration', () => {
  it('1分以上は「N分M秒」、1分未満は「M秒」で表す', () => {
    expect(formatPaceDuration(80_000)).toBe('1分20秒')
    expect(formatPaceDuration(60_000)).toBe('1分0秒')
    expect(formatPaceDuration(48_000)).toBe('48秒')
    expect(formatPaceDuration(0)).toBe('0秒')
  })

  it('負値は0秒に丸める（差分表示は符号を別に出すため）', () => {
    expect(formatPaceDuration(-5_000)).toBe('0秒')
  })
})
