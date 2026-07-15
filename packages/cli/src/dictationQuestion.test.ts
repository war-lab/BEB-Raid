// T-62 完了条件のテスト（純粋ロジック層）:
// - 40問のdictation Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack。blanks/script整合含む）を通過する
// - 全問tags[0]='弱形・連結'固定
// - keyVocabWordがS/A/B語彙カード（600語）に実在し重複しない
import { describe, expect, it } from 'vitest'
import { DICTATION_ENTRIES_S } from './data/dictationS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildDictationDrafts,
  buildDictationQuestions,
  dictationQuestion,
  validateDictationQuestions,
} from './dictationQuestion.js'

describe('DICTATION_ENTRIES_S（データ本体）', () => {
  it('40問ある', () => {
    expect(DICTATION_ENTRIES_S).toHaveLength(40)
  })

  it('keyVocabWordが重複しない', () => {
    const words = DICTATION_ENTRIES_S.map((e) => e.keyVocabWord.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
  })

  it('全問のkeyVocabWordがS/A/B語彙カード（600語）のいずれかに実在し、scriptに含まれる', () => {
    const pool = new Set([
      ...VOCAB_CARDS_S.map((v) => v.word),
      ...VOCAB_CARDS_A.map((v) => v.word),
      ...VOCAB_CARDS_B.map((v) => v.word),
    ])
    for (const entry of DICTATION_ENTRIES_S) {
      expect(pool.has(entry.keyVocabWord)).toBe(true)
      expect(entry.script.toLowerCase()).toContain(entry.keyVocabWord.toLowerCase())
    }
  })

  it('全問のtags[0]が弱形・連結固定', () => {
    for (const entry of DICTATION_ENTRIES_S) {
      expect(entry.tags[0]).toBe('弱形・連結')
    }
  })

  it('全問で1文8〜14語、blanksが1〜3穴', () => {
    for (const entry of DICTATION_ENTRIES_S) {
      const wc = entry.script.split(/\s+/).filter((w) => w.length > 0).length
      expect(wc).toBeGreaterThanOrEqual(8)
      expect(wc).toBeLessThanOrEqual(14)
      expect(entry.blanks.length).toBeGreaterThanOrEqual(1)
      expect(entry.blanks.length).toBeLessThanOrEqual(3)
    }
  })

  it('blanksのindexがscriptの該当位置の語（句読点無視）と一致する', () => {
    const normalize = (w: string) => w.toLowerCase().replace(/^[.,?!;:'"]+|[.,?!;:'"]+$/g, '')
    for (const entry of DICTATION_ENTRIES_S) {
      const words = entry.script.split(/\s+/).filter((w) => w.length > 0)
      for (const b of entry.blanks) {
        expect(normalize(words[b.index]!)).toBe(normalize(b.answer))
      }
    }
  })
})

describe('dictationQuestion', () => {
  it('dictation形式のQuestionを組み立てる（keyVocab・audio予約パス・blanksを含む）', () => {
    const entry = DICTATION_ENTRIES_S[0]!
    const question = dictationQuestion(entry, 0)
    expect(question.format).toBe('dictation')
    expect(question.id).toBe(`dictation-${entry.keyVocabWord}`)
    expect(question.keyVocab).toHaveLength(1)
    expect(question.keyVocab[0]?.word).toBe(entry.keyVocabWord)
    expect(question.audio).toBe(`audio/dictation/${entry.keyVocabWord}.mp3`)
    expect(question.audioMeta?.voice).toBe('pending-tts')
    expect(question.blanks).toHaveLength(entry.blanks.length)
  })

  it('存在しないkeyVocabWordはエラーになる（S/A/B語彙カードとの整合を強制）', () => {
    expect(() =>
      dictationQuestion({ ...DICTATION_ENTRIES_S[0]!, keyVocabWord: 'not-a-real-word' }, 0),
    ).toThrow()
  })
})

describe('buildDictationQuestions / validateDictationQuestions', () => {
  it('40件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildDictationQuestions()
    expect(questions).toHaveLength(40)
    expect(validateDictationQuestions(questions)).toEqual([])
  })

  it('IDが全て一意', () => {
    const ids = buildDictationQuestions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildDictationDrafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で40件出力する', () => {
    const drafts = buildDictationDrafts()
    expect(drafts).toHaveLength(40)
    for (const d of drafts) {
      expect(d.kind).toBe('dictation')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('dictation')
    }
  })
})
