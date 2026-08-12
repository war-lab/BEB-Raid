// T-47 完了条件のテスト（ディクテーション。正本: docs/13 3.4節）:
// - ワードバンクに正解語が必ず含まれ・重複がない
// - 全穴正解/1穴誤りの判定
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import { buildWordBank, judgeDictation } from './dictation'

function dictationQuestion(
  id: string,
  script: string,
  blanks: { index: number; answer: string }[],
): Question {
  return {
    id,
    part: 2,
    format: 'dictation',
    difficulty: 2,
    tags: ['弱形・連結'],
    keyVocab: [],
    audio: `/audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script,
    blanks,
  }
}

const firstPick = () => 0

describe('buildWordBank', () => {
  it('正解語が必ず含まれる（1穴）', () => {
    const target = dictationQuestion('d-1', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    const bank = buildWordBank(target, [target], firstPick)
    expect(bank.words).toContain('submit')
  })

  it('計6語（正解1＋ダミー5）になる（プール十分な場合）', () => {
    const target = dictationQuestion('d-1', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    const others = Array.from({ length: 10 }, (_, i) =>
      dictationQuestion(`d-other-${i}`, `word${i} text`, [{ index: 0, answer: `word${i}` }]),
    )
    const bank = buildWordBank(target, [target, ...others], firstPick)
    expect(bank.words).toHaveLength(6)
    expect(new Set(bank.words).size).toBe(6) // 重複なし
  })

  it('複数穴の場合は正解語N＋ダミー(6-N)になる', () => {
    const target = dictationQuestion('d-1', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
      { index: 3, answer: 'report' },
    ])
    const bank = buildWordBank(target, [target], firstPick)
    expect(bank.words).toContain('submit')
    expect(bank.words).toContain('report')
    expect(bank.words).toHaveLength(6)
  })

  it('他問題のプールが無ければフォールバックプールから補う', () => {
    const target = dictationQuestion('d-1', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    const bank = buildWordBank(target, [target], firstPick)
    expect(bank.words).toHaveLength(6)
    expect(new Set(bank.words).size).toBe(6)
  })

  // T-341（K-79）: 内容語の穴を混ぜる際、ワードバンクのダミーが機能語ばかりだと
  // 内容語の正解が一目で分かってしまう（逆も同様）。クラス（機能語/内容語）を揃えて
  // ダミーを選ぶことで、この見た目だけでの識別を防ぐ
  it('内容語の穴には内容語のダミーが選ばれ、機能語は混ざらない', () => {
    const target = dictationQuestion('d-content', 'The team confirmed the shipment yesterday', [
      { index: 3, answer: 'shipment' },
    ])
    const others = [
      dictationQuestion('d-func-1', 'She would like to leave', [{ index: 1, answer: 'would' }]),
      dictationQuestion('d-func-2', 'They should call the office', [
        { index: 1, answer: 'should' },
      ]),
    ]
    const bank = buildWordBank(target, [target, ...others], firstPick)
    expect(bank.words).toContain('shipment')
    expect(bank.words).not.toContain('would')
    expect(bank.words).not.toContain('should')
    expect(bank.words).toHaveLength(6)
  })

  it('機能語の穴には機能語のダミーが選ばれ、内容語は混ざらない', () => {
    const target = dictationQuestion('d-func', 'She would like to confirm it', [
      { index: 1, answer: 'would' },
    ])
    const others = [
      dictationQuestion('d-content-1', 'The team confirmed the shipment yesterday', [
        { index: 3, answer: 'shipment' },
      ]),
      dictationQuestion('d-content-2', 'The manager reviewed the invoice today', [
        { index: 3, answer: 'invoice' },
      ]),
    ]
    const bank = buildWordBank(target, [target, ...others], firstPick)
    expect(bank.words).toContain('would')
    expect(bank.words).not.toContain('shipment')
    expect(bank.words).not.toContain('invoice')
    expect(bank.words).toHaveLength(6)
  })
})

describe('judgeDictation', () => {
  const blanks = [
    { index: 1, answer: 'submit' },
    { index: 3, answer: 'report' },
  ]

  it('全穴正解なら正解', () => {
    const result = judgeDictation(blanks, [
      { blankIndex: 1, word: 'submit' },
      { blankIndex: 3, word: 'report' },
    ])
    expect(result.isCorrect).toBe(true)
    expect(result.blankResults.every((r) => r.isCorrect)).toBe(true)
  })

  it('1穴でも誤りなら不正解（部分点なし）', () => {
    const result = judgeDictation(blanks, [
      { blankIndex: 1, word: 'submit' },
      { blankIndex: 3, word: 'wrong' },
    ])
    expect(result.isCorrect).toBe(false)
    expect(result.blankResults.find((r) => r.blankIndex === 1)?.isCorrect).toBe(true)
    expect(result.blankResults.find((r) => r.blankIndex === 3)?.isCorrect).toBe(false)
  })

  it('大文字小文字を無視して判定する', () => {
    const result = judgeDictation(blanks, [
      { blankIndex: 1, word: 'Submit' },
      { blankIndex: 3, word: 'REPORT' },
    ])
    expect(result.isCorrect).toBe(true)
  })

  it('未回答の穴は不一致として扱う', () => {
    const result = judgeDictation(blanks, [{ blankIndex: 1, word: 'submit' }])
    expect(result.isCorrect).toBe(false)
  })
})
