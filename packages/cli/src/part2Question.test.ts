// T-27 完了条件のテスト（純粋ロジック層）:
// - 50問のaudio_qa Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - keyVocabがSランク200語と実際に一致する（freqRank='S'の裏付け）
// - audio/audioMetaが予約値になっている（T-31で実音声に差し替える前提）
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildPart2Drafts,
  buildPart2Questions,
  estimateDurationMs,
  part2Question,
  PART2_ENTRIES_S,
  reservedAudioPath,
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
