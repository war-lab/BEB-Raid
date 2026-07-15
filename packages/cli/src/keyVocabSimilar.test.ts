// T-29 完了条件のテスト（純粋ロジック層）:
// - 対象語（Part2/Part5双方に出現した19語）1語につき3問の類題が組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - 対象単語がquestion/choicesに含まれることの明示的チェック（実装指示の「包含チェック」）
// M2・T-63 完了条件のテスト（追加60問）:
// - 対象語（T-60/T-61/T-62でPart横断・形式横断に出現した頻出20語）1語につき3問
// - keyVocabのsense/freqRankがS/A/B語彙カード（600語）横断で解決される
// - 既存19語（T-29）とは重複しない
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildKeyVocabSimilarDrafts,
  buildKeyVocabSimilarQuestions,
  KEY_VOCAB_SIMILAR_ENTRIES,
  KEY_VOCAB_SIMILAR_ENTRIES_S2,
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

describe('KEY_VOCAB_SIMILAR_ENTRIES_S2（M2・T-63データ本体）', () => {
  it('20語×3問=60問ある', () => {
    expect(KEY_VOCAB_SIMILAR_ENTRIES_S2).toHaveLength(60)
    const counts = new Map<string, number>()
    for (const e of KEY_VOCAB_SIMILAR_ENTRIES_S2) {
      counts.set(e.word, (counts.get(e.word) ?? 0) + 1)
    }
    expect(counts.size).toBe(20)
    for (const count of counts.values()) {
      expect(count).toBe(3)
    }
  })

  it('既存19語（T-29）とは重複しない', () => {
    const existingWords = new Set(KEY_VOCAB_SIMILAR_ENTRIES.map((e) => e.word))
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES_S2) {
      expect(existingWords.has(entry.word)).toBe(false)
    }
  })

  it('全問の対象語がS/A/B語彙カード（600語）のいずれかに実在する', () => {
    const pool = new Set([
      ...VOCAB_CARDS_S.map((v) => v.word),
      ...VOCAB_CARDS_A.map((v) => v.word),
      ...VOCAB_CARDS_B.map((v) => v.word),
    ])
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES_S2) {
      expect(pool.has(entry.word)).toBe(true)
    }
  })

  it('全問でquestionが空所記法___を含み、対象語を含む選択肢がちょうど1つで正解と一致する', () => {
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES_S2) {
      expect(entry.question).toContain('___')
      const matching = entry.choices.filter((c) =>
        c.text.toLowerCase().includes(entry.word.toLowerCase()),
      )
      expect(matching).toHaveLength(1)
      expect(matching[0]?.key).toBe(entry.answer)
    }
  })

  it('正答キーがA〜Dにほぼ均等に分散する（同じ記号への偏りを防ぐ）', () => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
    for (const entry of KEY_VOCAB_SIMILAR_ENTRIES_S2) counts[entry.answer]!++
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(counts[key]).toBeGreaterThanOrEqual(10)
      expect(counts[key]).toBeLessThanOrEqual(20)
    }
  })
})

describe('buildKeyVocabSimilarQuestions（S2）/ validate', () => {
  it('60件のQuestionを組み立て、バリデータを通過する（freqRankがA/Bにも解決される）', () => {
    const questions = buildKeyVocabSimilarQuestions(KEY_VOCAB_SIMILAR_ENTRIES_S2)
    expect(questions).toHaveLength(60)
    expect(validateKeyVocabSimilarQuestions(questions)).toEqual([])
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'B')).toBe(true)
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'S')).toBe(true)
  })

  it('IDが全て一意で、既存57問のIDとも重複しない', () => {
    const s2Ids = new Set(
      buildKeyVocabSimilarQuestions(KEY_VOCAB_SIMILAR_ENTRIES_S2).map((q) => q.id),
    )
    const sIds = buildKeyVocabSimilarQuestions().map((q) => q.id)
    for (const id of sIds) {
      expect(s2Ids.has(id)).toBe(false)
    }
  })

  it('validateTargetWordCoverageは対象語の包含チェックに合格する', () => {
    expect(validateTargetWordCoverage(KEY_VOCAB_SIMILAR_ENTRIES_S2)).toEqual([])
  })
})

describe('buildKeyVocabSimilarDrafts（S2）', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で60件出力する', () => {
    const drafts = buildKeyVocabSimilarDrafts(KEY_VOCAB_SIMILAR_ENTRIES_S2)
    expect(drafts).toHaveLength(60)
    for (const d of drafts) {
      expect(d.kind).toBe('text_blank')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('text_blank')
    }
  })
})
