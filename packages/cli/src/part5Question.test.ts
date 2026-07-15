// T-28 完了条件のテスト（純粋ロジック層）:
// - 50問のtext_blank Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - keyVocabがSランク200語と実際に一致する（freqRank='S'の裏付け）
// - 空所記法が"___"で統一されている
// M2・T-61 完了条件のテスト（Part5追加100問）:
// - keyVocabWordがS/A/B語彙カード（600語）から選ばれ、freqRankが正しく解決される
// - 文法タグ5分類（品詞/動詞の形/代名詞・関係詞/接続詞vs前置詞/比較）が各最低10問
// - 正答キーの決定的ローテーションがA/B/C/Dにほぼ均等分散する
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import { PART5_ENTRIES_S2_RAW } from './data/part5QuestionsS2.js'
import {
  buildPart5Drafts,
  buildPart5EntriesS2,
  buildPart5Questions,
  part5EntryFromRaw,
  part5Question,
  PART5_ENTRIES_S,
  rotatePart5Choices,
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

const GRAMMAR_TAGS = new Set(['品詞', '動詞の形', '代名詞・関係詞', '接続詞vs前置詞', '比較'])

describe('PART5_ENTRIES_S2_RAW（M2・T-61データ本体）', () => {
  it('100問ある', () => {
    expect(PART5_ENTRIES_S2_RAW).toHaveLength(100)
  })

  it('keyVocabWordが重複せず、既存Sランク50問とも重複しない', () => {
    const words = PART5_ENTRIES_S2_RAW.map((e) => e.keyVocabWord.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
    const sWords = new Set(PART5_ENTRIES_S.map((e) => e.keyVocabWord.toLowerCase()))
    for (const w of words) {
      expect(sWords.has(w)).toBe(false)
    }
  })

  it('全問のkeyVocabWordがS/A/B語彙カード（600語）のいずれかに実在する', () => {
    const pool = new Set([
      ...VOCAB_CARDS_S.map((v) => v.word),
      ...VOCAB_CARDS_A.map((v) => v.word),
      ...VOCAB_CARDS_B.map((v) => v.word),
    ])
    for (const entry of PART5_ENTRIES_S2_RAW) {
      expect(pool.has(entry.keyVocabWord)).toBe(true)
    }
  })

  it('全問のtags[0]が文法系タグであり、5分類が各最低10問ある（T-61完了条件）', () => {
    const counts: Record<string, number> = {}
    for (const entry of PART5_ENTRIES_S2_RAW) {
      expect(GRAMMAR_TAGS.has(entry.tags[0]!)).toBe(true)
      counts[entry.tags[0]!] = (counts[entry.tags[0]!] ?? 0) + 1
    }
    for (const tag of GRAMMAR_TAGS) {
      expect(counts[tag]).toBeGreaterThanOrEqual(10)
    }
  })

  it('全問でquestionが空所記法___を含む', () => {
    for (const entry of PART5_ENTRIES_S2_RAW) {
      expect(entry.question).toContain('___')
    }
  })

  it('keyVocabWordがquestion+correctText+distractorsのいずれかに含まれる（バリデータの部分一致照合に対応）', () => {
    for (const entry of PART5_ENTRIES_S2_RAW) {
      const target = (
        entry.question +
        ' ' +
        entry.correctText +
        ' ' +
        entry.distractors.join(' ')
      ).toLowerCase()
      expect(target).toContain(entry.keyVocabWord.toLowerCase())
    }
  })

  it('distractorsは常に3件で、correctTextと重複せず、相互に重複しない', () => {
    for (const entry of PART5_ENTRIES_S2_RAW) {
      expect(entry.distractors).toHaveLength(3)
      expect(entry.distractors).not.toContain(entry.correctText)
      expect(new Set(entry.distractors).size).toBe(3)
    }
  })
})

describe('rotatePart5Choices（正答キーの決定的ローテーション。M1レビュー⑦の方式）', () => {
  it('index%4に応じてcorrectTextの位置が機械的に決まる', () => {
    const raw = PART5_ENTRIES_S2_RAW[0]!
    const r0 = rotatePart5Choices(raw, 0)
    const r1 = rotatePart5Choices(raw, 1)
    const r2 = rotatePart5Choices(raw, 2)
    const r3 = rotatePart5Choices(raw, 3)
    const r4 = rotatePart5Choices(raw, 4)
    expect(r0.choices.find((c) => c.key === r0.answer)?.text).toBe(raw.correctText)
    expect(r1.choices.find((c) => c.key === r1.answer)?.text).toBe(raw.correctText)
    expect(r2.choices.find((c) => c.key === r2.answer)?.text).toBe(raw.correctText)
    expect(r3.choices.find((c) => c.key === r3.answer)?.text).toBe(raw.correctText)
    expect(r4.answer).toBe(r0.answer) // 周期4なのでindex 0と4は同じ結果になる
  })

  it('100問を通してA/B/C/Dの正答キーがほぼ均等に分散する（同じ記号への偏りを防ぐ）', () => {
    const entries = buildPart5EntriesS2()
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
    for (const entry of entries) counts[entry.answer] = (counts[entry.answer] ?? 0) + 1
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(counts[key]).toBeGreaterThanOrEqual(20)
      expect(counts[key]).toBeLessThanOrEqual(30)
    }
  })
})

describe('part5EntryFromRaw', () => {
  it('rawエントリをPart5Entry（choices/answer確定済み）に変換する', () => {
    const raw = PART5_ENTRIES_S2_RAW[0]!
    const entry = part5EntryFromRaw(raw, 0)
    expect(entry.keyVocabWord).toBe(raw.keyVocabWord)
    expect(entry.choices).toHaveLength(4)
    expect(entry.choices.some((c) => c.key === entry.answer)).toBe(true)
  })
})

describe('buildPart5EntriesS2 / buildPart5Questions（S2）', () => {
  it('100件のQuestionを組み立て、バリデータを通過する（freqRankがA/Bにも解決される）', () => {
    const entries = buildPart5EntriesS2()
    const questions = buildPart5Questions(entries)
    expect(questions).toHaveLength(100)
    expect(validatePart5Questions(questions)).toEqual([])
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'B')).toBe(true)
  })

  it('IDが全て一意で、既存Sランク50問のIDとも重複しない', () => {
    const s2Ids = new Set(buildPart5Questions(buildPart5EntriesS2()).map((q) => q.id))
    const sIds = buildPart5Questions().map((q) => q.id)
    for (const id of sIds) {
      expect(s2Ids.has(id)).toBe(false)
    }
  })
})
