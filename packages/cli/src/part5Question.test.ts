// T-28 完了条件のテスト（純粋ロジック層）:
// - 50問のtext_blank Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - keyVocabがSランク200語と実際に一致する（freqRank='S'の裏付け）
// - 空所記法が"___"で統一されている
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildPart5Drafts,
  buildPart5Questions,
  part5Question,
  PART5_ENTRIES_S,
  validatePart5Questions,
} from './part5Question.js'

describe('PART5_ENTRIES_S（データ本体）', () => {
  it('50問ある', () => {
    expect(PART5_ENTRIES_S).toHaveLength(50)
  })

  it('全問のkeyVocabWordがSランク200語（vocabCardsS）に実在する', () => {
    const sWords = new Set(VOCAB_CARDS_S.map((v) => v.word))
    for (const entry of PART5_ENTRIES_S) {
      expect(sWords.has(entry.keyVocabWord)).toBe(true)
    }
  })

  it('全問のtags[0]が文法系タグである（03の7.1節）', () => {
    const GRAMMAR_TAGS = new Set(['品詞', '動詞の形', '代名詞・関係詞', '接続詞vs前置詞', '比較'])
    for (const entry of PART5_ENTRIES_S) {
      expect(GRAMMAR_TAGS.has(entry.tags[0]!)).toBe(true)
    }
  })

  it('全問でquestionが空所記法___を含む', () => {
    for (const entry of PART5_ENTRIES_S) {
      expect(entry.question).toContain('___')
    }
  })

  it('全問でanswerが選択肢keyのいずれかと一致し、選択肢は4つでkeyが重複しない', () => {
    for (const entry of PART5_ENTRIES_S) {
      expect(entry.choices).toHaveLength(4)
      expect(new Set(entry.choices.map((c) => c.key)).size).toBe(4)
      expect(entry.choices.some((c) => c.key === entry.answer)).toBe(true)
    }
  })

  it('keyVocabWordがquestion+choicesのいずれかに含まれる（バリデータの部分一致照合に対応）', () => {
    for (const entry of PART5_ENTRIES_S) {
      const target = (
        entry.question +
        ' ' +
        entry.choices.map((c) => c.text).join(' ')
      ).toLowerCase()
      expect(target).toContain(entry.keyVocabWord.toLowerCase())
    }
  })
})

describe('part5Question', () => {
  it('text_blank形式のQuestionを組み立てる', () => {
    const entry = PART5_ENTRIES_S[0]!
    const question = part5Question(entry)
    expect(question.part).toBe(5)
    expect(question.format).toBe('text_blank')
    expect(question.keyVocab).toHaveLength(1)
    expect(question.keyVocab[0]?.word).toBe(entry.keyVocabWord)
    expect(question.keyVocab[0]?.freqRank).toBe('S')
    expect(question.question).toBe(entry.question)
  })

  it('存在しないkeyVocabWordはエラーになる（Sランク200語との整合を強制）', () => {
    expect(() =>
      part5Question({ ...PART5_ENTRIES_S[0]!, keyVocabWord: 'not-a-real-s-rank-word' }),
    ).toThrow()
  })
})

describe('buildPart5Questions / validatePart5Questions', () => {
  it('50件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildPart5Questions()
    expect(questions).toHaveLength(50)
    expect(validatePart5Questions(questions)).toEqual([])
  })

  it('IDが全て一意', () => {
    const ids = buildPart5Questions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('answerが選択肢に無いと検出する', () => {
    const questions = buildPart5Questions()
    const tampered = [...questions.slice(1), { ...questions[0]!, answer: 'Z' }]
    const problems = validatePart5Questions(tampered)
    expect(problems.some((p) => p.includes('answer'))).toBe(true)
  })
})

describe('buildPart5Drafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で50件出力する', () => {
    const drafts = buildPart5Drafts()
    expect(drafts).toHaveLength(50)
    for (const d of drafts) {
      expect(d.kind).toBe('text_blank')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('text_blank')
    }
  })
})
