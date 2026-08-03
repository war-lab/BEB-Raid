// 間違えた問題一覧の集計（発起人の要望、2026-08-03）。
// 何を防ぐか:
// - 複合問題（読解・audio_set）の誤答が一覧から落ちること（attemptsはサブ設問IDで記録されるため、
//   lookupを直接引くだけでは解決できない）
// - 同じ問題を何度も間違えた分が別行に散ること
// - その後正解した問題を「できていない」ままに見せること
// - 復習セッションの出題が1パッセージで複数itemに膨らむこと
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import type { AttemptRecord } from '../db/schema'
import {
  collectWrongAnswers,
  formatWrongAnswerDate,
  wrongAnswerCorrectText,
  wrongAnswerPrompt,
  wrongAnswerReviewIds,
} from './wrongAnswers'

function part5(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [],
    question: `Please ___ the ${id}.`,
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

function passage(id: string, subCount = 3): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: ['推論'],
    keyVocab: [],
    passages: [{ id: `${id}-p1`, kind: 'email', text: '本文' }],
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `設問${i}`,
      choices: [
        { key: 'A', text: `正解${i}` },
        { key: 'B', text: `誤答${i}` },
      ],
      answer: 'A',
      explanation: `設問${i}の解説`,
      translation: `設問${i}の和訳`,
    })),
  }
}

function attempt(overrides: Partial<AttemptRecord> & { questionId: string }): AttemptRecord {
  return {
    id: `a-${overrides.questionId}-${overrides.answeredAt ?? 0}`,
    mode: 'solo',
    isCorrect: false,
    responseMs: 5000,
    isTimeout: false,
    isGuess: false,
    answeredAt: 1_000,
    ...overrides,
  }
}

function lookup(questions: Question[]) {
  return new Map(questions.map((q) => [q.id, q]))
}

describe('collectWrongAnswers', () => {
  it('誤答のみを新しい順に並べ、正解は載せない', () => {
    const q1 = part5('q-1')
    const q2 = part5('q-2')
    const q3 = part5('q-3')
    const { entries } = collectWrongAnswers(
      [
        attempt({ questionId: 'q-1', answeredAt: 100 }),
        attempt({ questionId: 'q-2', answeredAt: 300 }),
        attempt({ questionId: 'q-3', answeredAt: 200, isCorrect: true }),
      ],
      lookup([q1, q2, q3]),
    )

    expect(entries.map((e) => e.attemptQuestionId)).toEqual(['q-2', 'q-1'])
  })

  it('同じ問題の複数回の誤答は1行に畳んで回数を数える', () => {
    const q = part5('q-1')
    const { entries } = collectWrongAnswers(
      [
        attempt({ questionId: 'q-1', answeredAt: 100, isGuess: true }),
        attempt({ questionId: 'q-1', answeredAt: 500, isTimeout: true }),
      ],
      lookup([q]),
    )

    expect(entries).toHaveLength(1)
    expect(entries[0]!.wrongCount).toBe(2)
    expect(entries[0]!.lastWrongAt).toBe(500)
    // 注記は**直近の誤答**のものを出す（当て勘→時間切れと変われば後者）
    expect(entries[0]!.lastWrongTimeout).toBe(true)
    expect(entries[0]!.lastWrongGuess).toBe(false)
  })

  it('誤答のあとに正解していれば recovered、さらに間違え直せば戻る', () => {
    const q = part5('q-1')
    const recovered = collectWrongAnswers(
      [
        attempt({ questionId: 'q-1', answeredAt: 100 }),
        attempt({ questionId: 'q-1', answeredAt: 200, isCorrect: true }),
      ],
      lookup([q]),
    )
    expect(recovered.entries[0]!.recovered).toBe(true)

    const again = collectWrongAnswers(
      [
        attempt({ questionId: 'q-1', answeredAt: 100 }),
        attempt({ questionId: 'q-1', answeredAt: 200, isCorrect: true }),
        attempt({ questionId: 'q-1', answeredAt: 300 }),
      ],
      lookup([q]),
    )
    expect(again.entries[0]!.recovered).toBe(false)
    expect(again.entries[0]!.wrongCount).toBe(2)
  })

  it('複合問題のサブ設問IDを親から解決し、設問文と正解はサブ設問のものを出す', () => {
    const p = passage('p7-1')
    const { entries } = collectWrongAnswers(
      [attempt({ questionId: 'p7-1-q1', answeredAt: 100 })],
      lookup([p]),
    )

    expect(entries).toHaveLength(1)
    // 出題に使うのは親（復習セッションはitem単位）
    expect(entries[0]!.question.id).toBe('p7-1')
    expect(entries[0]!.subQuestion?.id).toBe('p7-1-q1')
    expect(wrongAnswerPrompt(entries[0]!)).toBe('設問1')
    expect(wrongAnswerCorrectText(entries[0]!)).toBe('A. 正解1')
  })

  it('問題データを引けない誤答は件数として残す（黙って捨てない）', () => {
    const { entries, unresolvedCount } = collectWrongAnswers(
      [
        attempt({ questionId: 'vocab:submit', answeredAt: 100 }),
        attempt({ questionId: 'removed-pack-q', answeredAt: 200 }),
        // 正解は一覧に関係しないので未解決件数にも数えない
        attempt({ questionId: 'vocab:other', answeredAt: 300, isCorrect: true }),
      ],
      lookup([]),
    )

    expect(entries).toHaveLength(0)
    expect(unresolvedCount).toBe(2)
  })

  it('音声問題は設問文を持たないため指示文を出す', () => {
    const audio: Question = {
      id: 'q-audio',
      part: 2,
      format: 'audio_qa',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      audio: '/a.mp3',
      audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 1000 },
      choices: [{ key: 'A', text: 'a' }],
      answer: 'A',
      explanation: '',
      translation: '',
    }
    const { entries } = collectWrongAnswers(
      [attempt({ questionId: 'q-audio', answeredAt: 100 })],
      lookup([audio]),
    )
    expect(wrongAnswerPrompt(entries[0]!)).toBe('（音声問題）')
  })
})

describe('wrongAnswerReviewIds', () => {
  it('サブ設問の誤答は親itemへ畳み、上限で切る', () => {
    const p = passage('p7-1')
    const q1 = part5('q-1')
    const ids = wrongAnswerReviewIds(
      [{ question: p }, { question: p }, { question: q1 }, { question: part5('q-2') }],
      3,
    )
    expect(ids).toEqual(['p7-1', 'q-1', 'q-2'])

    expect(wrongAnswerReviewIds([{ question: p }, { question: q1 }], 1)).toEqual(['p7-1'])
  })
})

describe('formatWrongAnswerDate', () => {
  it('M/D で出す（相対表示にしない）', () => {
    const ts = new Date(2026, 7, 3, 12, 0, 0).getTime()
    expect(formatWrongAnswerDate(ts)).toBe('8/3')
  })
})
