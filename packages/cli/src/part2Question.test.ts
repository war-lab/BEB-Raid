// T-27 完了条件のテスト（純粋ロジック層）:
// - 50問のaudio_qa Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - keyVocabがSランク200語と実際に一致する（freqRank='S'の裏付け）
// - audio/audioMetaが予約値になっている（T-31で実音声に差し替える前提）
// M2・T-60 完了条件のテスト（Part2追加100問）:
// - keyVocabWordがS/A/B語彙カード（600語）から選ばれ、freqRankが正しく解決される
// - 難易度2〜4に分散し、間接応答（difficulty=4）が2割程度含まれる
// - 正答キーの決定的ローテーションがA/B/Cにほぼ均等分散する
// - 音声知覚系タグ必須
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import { PART2_ENTRIES_S2_RAW } from './data/part2QuestionsS2.js'
import {
  buildPart2Drafts,
  buildPart2EntriesS2,
  buildPart2Questions,
  estimateDurationMs,
  part2EntryFromRaw,
  part2Question,
  PART2_ENTRIES_S,
  reservedAudioPath,
  rotatePart2Choices,
  validatePart2Questions,
} from './part2Question.js'

describe('PART2_ENTRIES_S（データ本体）', () => {
  it('50問ある', () => {
    expect(PART2_ENTRIES_S).toHaveLength(50)
  })

  it('全問のkeyVocabWordがSランク200語（vocabCardsS）に実在する', () => {
    const sWords = new Set(VOCAB_CARDS_S.map((v) => v.word))
    for (const entry of PART2_ENTRIES_S) {
      expect(sWords.has(entry.keyVocabWord)).toBe(true)
    }
  })

  it('全問のtags[0]が音声知覚系タグである（03の7.1節）', () => {
    const LISTENING_TAGS = new Set([
      '疑問詞聞き取り',
      '弱形・連結',
      '数字・時刻',
      '米英豪加アクセント',
    ])
    for (const entry of PART2_ENTRIES_S) {
      expect(LISTENING_TAGS.has(entry.tags[0]!)).toBe(true)
    }
  })

  it('全問でanswerが選択肢keyのいずれかと一致する', () => {
    for (const entry of PART2_ENTRIES_S) {
      expect(entry.choices.some((c) => c.key === entry.answer)).toBe(true)
    }
  })

  it('全問で選択肢が3つ、keyが重複しない', () => {
    for (const entry of PART2_ENTRIES_S) {
      expect(entry.choices).toHaveLength(3)
      expect(new Set(entry.choices.map((c) => c.key)).size).toBe(3)
    }
  })

  it('scriptがkeyVocabWordを含む', () => {
    for (const entry of PART2_ENTRIES_S) {
      expect(entry.script.toLowerCase()).toContain(entry.keyVocabWord.toLowerCase())
    }
  })
})

describe('part2Question', () => {
  it('audio_qa形式のQuestionを組み立てる（keyVocab・audio予約パスを含む）', () => {
    const entry = PART2_ENTRIES_S[0]!
    const question = part2Question(entry, 0)
    expect(question.part).toBe(2)
    expect(question.format).toBe('audio_qa')
    expect(question.keyVocab).toHaveLength(1)
    expect(question.keyVocab[0]?.word).toBe(entry.keyVocabWord)
    expect(question.keyVocab[0]?.freqRank).toBe('S')
    expect(question.audio).toBe(reservedAudioPath(entry.keyVocabWord))
    expect(question.audioMeta?.voice).toBe('pending-tts')
    expect(question.audioMeta?.tts).toBe(true)
  })

  it('accentが米/英2値をローテーションする（T-31でPiperにen_AUが無いと判明し縮退。生成段階の暫定値で、実合成時にttsBatch.tsが実際のaccentへ上書きする）', () => {
    const entry = PART2_ENTRIES_S[0]!
    expect(part2Question(entry, 0).audioMeta?.accent).toBe('US')
    expect(part2Question(entry, 1).audioMeta?.accent).toBe('UK')
    expect(part2Question(entry, 2).audioMeta?.accent).toBe('US')
    expect(part2Question(entry, 3).audioMeta?.accent).toBe('UK')
  })

  it('存在しないkeyVocabWordはエラーになる（Sランク200語との整合を強制）', () => {
    expect(() =>
      part2Question({ ...PART2_ENTRIES_S[0]!, keyVocabWord: 'not-a-real-s-rank-word' }, 0),
    ).toThrow()
  })
})

describe('estimateDurationMs', () => {
  it('語数に応じて増加し、最低値を下回らない', () => {
    expect(estimateDurationMs('a')).toBeGreaterThanOrEqual(1500)
    expect(estimateDurationMs('one two three four five six seven eight')).toBeGreaterThan(
      estimateDurationMs('one two'),
    )
  })
})

describe('buildPart2Questions / validatePart2Questions', () => {
  it('50件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildPart2Questions()
    expect(questions).toHaveLength(50)
    expect(validatePart2Questions(questions)).toEqual([])
  })

  it('IDが全て一意', () => {
    const ids = buildPart2Questions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('answerが選択肢に無いと検出する', () => {
    const questions = buildPart2Questions()
    const tampered = [...questions.slice(1), { ...questions[0]!, answer: 'Z' }]
    const problems = validatePart2Questions(tampered)
    expect(problems.some((p) => p.includes('answer'))).toBe(true)
  })
})

describe('buildPart2Drafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で50件出力する', () => {
    const drafts = buildPart2Drafts()
    expect(drafts).toHaveLength(50)
    for (const d of drafts) {
      expect(d.kind).toBe('audio_qa')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('audio_qa')
    }
  })
})

const LISTENING_TAGS = new Set(['疑問詞聞き取り', '弱形・連結', '数字・時刻', '米英豪加アクセント'])

describe('PART2_ENTRIES_S2_RAW（M2・T-60データ本体）', () => {
  it('100問ある', () => {
    expect(PART2_ENTRIES_S2_RAW).toHaveLength(100)
  })

  it('keyVocabWordが重複せず、既存Sランク50問とも重複しない', () => {
    const words = PART2_ENTRIES_S2_RAW.map((e) => e.keyVocabWord.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
    const sWords = new Set(PART2_ENTRIES_S.map((e) => e.keyVocabWord.toLowerCase()))
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
    for (const entry of PART2_ENTRIES_S2_RAW) {
      expect(pool.has(entry.keyVocabWord)).toBe(true)
    }
  })

  it('全問のtags[0]が音声知覚系タグである', () => {
    for (const entry of PART2_ENTRIES_S2_RAW) {
      expect(LISTENING_TAGS.has(entry.tags[0]!)).toBe(true)
    }
  })

  it('scriptがkeyVocabWordを含み、em dash区切りを持つ', () => {
    for (const entry of PART2_ENTRIES_S2_RAW) {
      expect(entry.script.toLowerCase()).toContain(entry.keyVocabWord.toLowerCase())
      expect(entry.script).toContain('—')
    }
  })

  it('難易度は2〜4のみで、4（間接応答）はおよそ2割以下', () => {
    for (const entry of PART2_ENTRIES_S2_RAW) {
      expect([2, 3, 4]).toContain(entry.difficulty)
    }
    const d4Count = PART2_ENTRIES_S2_RAW.filter((e) => e.difficulty === 4).length
    expect(d4Count).toBeGreaterThan(0)
    expect(d4Count / PART2_ENTRIES_S2_RAW.length).toBeLessThanOrEqual(0.2)
  })

  it('distractorsは常に2件で、correctTextと重複しない', () => {
    for (const entry of PART2_ENTRIES_S2_RAW) {
      expect(entry.distractors).toHaveLength(2)
      expect(entry.distractors).not.toContain(entry.correctText)
      expect(entry.distractors[0]).not.toBe(entry.distractors[1])
    }
  })
})

describe('rotatePart2Choices（正答キーの決定的ローテーション。M1レビュー⑦の方式）', () => {
  it('index%3に応じてcorrectTextの位置が機械的に決まる', () => {
    const raw = PART2_ENTRIES_S2_RAW[0]!
    const r0 = rotatePart2Choices(raw, 0)
    const r1 = rotatePart2Choices(raw, 1)
    const r2 = rotatePart2Choices(raw, 2)
    const r3 = rotatePart2Choices(raw, 3)
    expect(r0.choices.find((c) => c.key === r0.answer)?.text).toBe(raw.correctText)
    expect(r1.choices.find((c) => c.key === r1.answer)?.text).toBe(raw.correctText)
    expect(r2.choices.find((c) => c.key === r2.answer)?.text).toBe(raw.correctText)
    expect(r3.answer).toBe(r0.answer) // 周期3なのでindex 0と3は同じ結果になる
  })

  it('100問を通してA/B/Cの正答キーがほぼ均等に分散する（同じ記号への偏りを防ぐ）', () => {
    const entries = buildPart2EntriesS2()
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 }
    for (const entry of entries) counts[entry.answer] = (counts[entry.answer] ?? 0) + 1
    for (const key of ['A', 'B', 'C']) {
      expect(counts[key]).toBeGreaterThanOrEqual(30)
      expect(counts[key]).toBeLessThanOrEqual(37)
    }
  })
})

describe('part2EntryFromRaw', () => {
  it('rawエントリをPart2Entry（choices/answer確定済み）に変換する', () => {
    const raw = PART2_ENTRIES_S2_RAW[0]!
    const entry = part2EntryFromRaw(raw, 0)
    expect(entry.keyVocabWord).toBe(raw.keyVocabWord)
    expect(entry.choices).toHaveLength(3)
    expect(entry.choices.some((c) => c.key === entry.answer)).toBe(true)
  })
})

describe('buildPart2EntriesS2 / buildPart2Questions（S2）', () => {
  it('100件のQuestionを組み立て、バリデータを通過する（freqRankがA/Bにも解決される）', () => {
    const entries = buildPart2EntriesS2()
    const questions = buildPart2Questions(entries)
    expect(questions).toHaveLength(100)
    expect(validatePart2Questions(questions)).toEqual([])
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(questions.some((q) => q.keyVocab[0]?.freqRank === 'B')).toBe(true)
  })

  it('IDが全て一意で、既存Sランク50問のIDとも重複しない', () => {
    const s2Ids = new Set(buildPart2Questions(buildPart2EntriesS2()).map((q) => q.id))
    const sIds = buildPart2Questions().map((q) => q.id)
    for (const id of sIds) {
      expect(s2Ids.has(id)).toBe(false)
    }
  })
})
