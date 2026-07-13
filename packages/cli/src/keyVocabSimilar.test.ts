// T-29 完了条件のテスト（純粋ロジック層）:
// - 対象語（Part2/Part5双方に出現した19語）1語につき3問の類題が組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - 対象単語がquestion/choicesに含まれることの明示的チェック（実装指示の「包含チェック」）
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildKeyVocabSimilarDrafts,
  buildKeyVocabSimilarQuestions,
  KEY_VOCAB_SIMILAR_ENTRIES,
  keyVocabSimilarQuestion,
  validateKeyVocabSimilarQuestions,
  validateTargetWordCoverage,
} from './keyVocabSimilar.js'

describe('KEY_VOCAB_SIMILAR_ENTRIES（データ本体）', () => {
  it('19語×3問=57問ある', () => {
    expect(KEY_VOCAB_SIMILAR_ENTRIES).toHaveLength(57)
    const counts = new Map<string, number>()
    for (const e of KEY_VOCAB_SIMILAR_ENTRIES) {
      counts.set(e.word, (counts.get(e.word) ?? 0) + 1)
    }
    expect(counts.size).toBe(19)
    for (const count of counts.values()) {
      expect(count).toBe(3)
    }
  })

  it('全問の対象語がSランク200語（vocabCardsS）に実在する', () => {
    const sWords = new Set(VOCAB_CARDS_S.map((v) => v.word))
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES) {
      expect(sWords.has(entry.word)).toBe(true)
    }
  })

  it('全問でquestionが空所記法___を含み、対象語を含む選択肢がちょうど1つで正解と一致する', () => {
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES) {
      expect(entry.question).toContain('___')
      const matching = entry.choices.filter((c) =>
        c.text.toLowerCase().includes(entry.word.toLowerCase()),
      )
      expect(matching).toHaveLength(1)
      expect(matching[0]?.key).toBe(entry.answer)
    }
  })

  it('問題文が重複しない（57問すべて異なる文）', () => {
    const questions = KEY_VOCAB_SIMILAR_ENTRIES.map((e) => e.question)
    expect(new Set(questions).size).toBe(questions.length)
  })
})

describe('keyVocabSimilarQuestion', () => {
  it('text_blank形式のQuestionを組み立て、idに対象語と連番を含む', () => {
    const entry = KEY_VOCAB_SIMILAR_ENTRIES[0]!
    const question = keyVocabSimilarQuestion(entry, 0)
    expect(question.format).toBe('text_blank')
    expect(question.id).toBe(`similar-${entry.word}-1`)
    expect(question.keyVocab[0]?.word).toBe(entry.word)
    expect(question.keyVocab[0]?.freqRank).toBe('S')
  })
})

describe('buildKeyVocabSimilarQuestions / validate', () => {
  it('57件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildKeyVocabSimilarQuestions()
    expect(questions).toHaveLength(57)
    expect(validateKeyVocabSimilarQuestions(questions)).toEqual([])
  })

  it('IDが全て一意（同一語内は連番で区別される）', () => {
    const ids = buildKeyVocabSimilarQuestions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('validateTargetWordCoverageは対象語の包含チェックに合格する', () => {
    expect(validateTargetWordCoverage(KEY_VOCAB_SIMILAR_ENTRIES)).toEqual([])
  })

  it('validateTargetWordCoverageは対象語が含まれないエントリを検出する', () => {
    const tampered = [{ ...KEY_VOCAB_SIMILAR_ENTRIES[0]!, word: 'nonexistent-word-xyz' }]
    const problems = validateTargetWordCoverage(tampered)
    expect(problems.length).toBeGreaterThan(0)
  })
})

describe('buildKeyVocabSimilarDrafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で57件出力する', () => {
    const drafts = buildKeyVocabSimilarDrafts()
    expect(drafts).toHaveLength(57)
    for (const d of drafts) {
      expect(d.kind).toBe('text_blank')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('text_blank')
    }
  })
})
