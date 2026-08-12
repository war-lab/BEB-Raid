// T-62 完了条件のテスト（純粋ロジック層）:
// - 30本のshadowing Questionが正しく組み立てられる（既存Part3/4/Part2素材の流用。新規執筆なし）
// - バリデータ（shared-schema validatePack。timing/script整合含む）を通過する
// - keyVocabWordがS/A/B語彙カード（600語）に実在する
import { describe, expect, it } from 'vitest'
import { SHADOWING_ENTRIES_S } from './data/shadowingS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildShadowingDrafts,
  buildShadowingQuestions,
  shadowingQuestion,
  validateShadowingQuestions,
} from './shadowingQuestion.js'

describe('SHADOWING_ENTRIES_S（データ本体）', () => {
  it('30本ある', () => {
    expect(SHADOWING_ENTRIES_S).toHaveLength(30)
  })

  it('idが全て一意', () => {
    const ids = SHADOWING_ENTRIES_S.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全問のkeyVocabWordがS/A/B語彙カード（600語）のいずれかに実在し、scriptに含まれる', () => {
    const pool = new Set([
      ...VOCAB_CARDS_S.map((v) => v.word),
      ...VOCAB_CARDS_A.map((v) => v.word),
      ...VOCAB_CARDS_B.map((v) => v.word),
    ])
    for (const entry of SHADOWING_ENTRIES_S) {
      expect(pool.has(entry.keyVocabWord)).toBe(true)
      expect(entry.script.toLowerCase()).toContain(entry.keyVocabWord.toLowerCase())
    }
  })

  // T-340（K-87）: idのプレフィックス（p2/p3/p4）と実際の抜粋元partが一致すること。
  // 修正前はshadowingQuestion.tsがpart:3を全問固定していたため、p4-verbatim・p2-response
  // 由来の20件がPart3として誤配信されていた
  it('idのプレフィックス（p2/p3/p4）とpartフィールドが一致する', () => {
    for (const entry of SHADOWING_ENTRIES_S) {
      const expectedPart = Number(entry.id.match(/^shadow-p(\d)-/)?.[1])
      expect(entry.part).toBe(expectedPart)
    }
  })

  // T-340（K-87）: part2QuestionsS.ts/S2.tsの正答choiceと完全一致する文言が残っていないこと。
  // 完全一致していると、シャドーイングを先に学習した利用者がPart2側の正答を覚えてしまう
  it('part2の正答choiceと完全一致するscriptが無い（正答の先出し防止）', () => {
    const leakedAnswers = [
      'It comes with a two-year warranty.',
      'Yes, we passed the audit last week.',
      'We are still waiting on client feedback.',
      'Yes, but the technician already fixed it.',
      'We plan to partner with a local distributor.',
      'Our procurement manager will handle it.',
      "I'll check with the warehouse right away.",
      "We're still discussing the budget for it.",
      "We're still waiting to hear from headquarters.",
      'The company has sponsored local events for years.',
    ]
    for (const entry of SHADOWING_ENTRIES_S) {
      expect(leakedAnswers).not.toContain(entry.script)
    }
  })
})

describe('shadowingQuestion', () => {
  it('shadowing形式のQuestionを組み立てる（keyVocab・audio予約パス・timingを含む）', () => {
    const entry = SHADOWING_ENTRIES_S[0]!
    const question = shadowingQuestion(entry, 0)
    expect(question.format).toBe('shadowing')
    expect(question.id).toBe(entry.id)
    expect(question.keyVocab).toHaveLength(1)
    expect(question.audio).toBe(`audio/shadowing/${entry.id}.mp3`)
    expect(question.audioMeta?.voice).toBe('pending-tts')
    expect(question.timing).toBeTruthy()
    expect(question.timing).toHaveLength(
      entry.script.split(/\s+/).filter((w) => w.length > 0).length,
    )
  })

  it('timingが単調増加（非減少）で全て0以上', () => {
    for (const entry of SHADOWING_ENTRIES_S) {
      const question = shadowingQuestion(entry, 0)
      const timing = question.timing!
      expect(timing.every((t) => t >= 0)).toBe(true)
      for (let i = 1; i < timing.length; i++) {
        expect(timing[i]!).toBeGreaterThanOrEqual(timing[i - 1]!)
      }
    }
  })

  it('存在しないkeyVocabWordはエラーになる（S/A/B語彙カードとの整合を強制）', () => {
    expect(() =>
      shadowingQuestion({ ...SHADOWING_ENTRIES_S[0]!, keyVocabWord: 'not-a-real-word' }, 0),
    ).toThrow()
  })
})

describe('buildShadowingQuestions / validateShadowingQuestions', () => {
  it('30件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildShadowingQuestions()
    expect(questions).toHaveLength(30)
    expect(validateShadowingQuestions(questions)).toEqual([])
  })

  it('IDが全て一意', () => {
    const ids = buildShadowingQuestions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildShadowingDrafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で30件出力する', () => {
    const drafts = buildShadowingDrafts()
    expect(drafts).toHaveLength(30)
    for (const d of drafts) {
      expect(d.kind).toBe('shadowing')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('shadowing')
    }
  })
})
