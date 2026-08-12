// T-62 完了条件のテスト（純粋ロジック層）:
// - Part3×10・Part4×10=20セット・60設問がaudio_set Questionとして正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - keyVocabWordsがS/A/B語彙カード（600語）に実在し、scriptに文字列として含まれる
// - 各設問（subQuestions）が4択（A〜D）で正答キーが決定的ローテーションで分散する
import { describe, expect, it } from 'vitest'
import { validateContentLintBlocking } from './contentLint.js'
import { PART34_ENTRIES_S } from './data/part34SetsS.js'
import { PART34_ENTRIES_S2 } from './data/part34SetsS2.js'
import { PART34_ENTRIES_S3 } from './data/part34SetsS3.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildPart34Drafts,
  buildPart34Questions,
  part34Question,
  rotateSubQuestionChoices,
  validatePart34Questions,
} from './part34Question.js'

const SKILL_TAGS = new Set([
  '先読み',
  '意図推定',
  'パラフレーズ照合',
  '速読',
  '図表参照',
  '数字・時刻',
])

describe('PART34_ENTRIES_S（データ本体）', () => {
  it('20セット（Part3×10・Part4×10）ある', () => {
    expect(PART34_ENTRIES_S).toHaveLength(20)
    expect(PART34_ENTRIES_S.filter((e) => e.part === 3)).toHaveLength(10)
    expect(PART34_ENTRIES_S.filter((e) => e.part === 4)).toHaveLength(10)
  })

  it('setIdが全て一意', () => {
    const ids = PART34_ENTRIES_S.map((e) => e.setId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全セットが3設問を持つ', () => {
    for (const entry of PART34_ENTRIES_S) {
      expect(entry.subQuestions).toHaveLength(3)
    }
  })

  it('全セットのtags[0]が解法/音声知覚系タグである', () => {
    for (const entry of PART34_ENTRIES_S) {
      expect(SKILL_TAGS.has(entry.tags[0]!)).toBe(true)
    }
  })

  it('全セットのkeyVocabWordsがS/A/B語彙カード（600語）に実在し、scriptに含まれる', () => {
    const pool = new Set([
      ...VOCAB_CARDS_S.map((v) => v.word),
      ...VOCAB_CARDS_A.map((v) => v.word),
      ...VOCAB_CARDS_B.map((v) => v.word),
    ])
    for (const entry of PART34_ENTRIES_S) {
      expect(entry.keyVocabWords.length).toBeGreaterThanOrEqual(1)
      for (const word of entry.keyVocabWords) {
        expect(pool.has(word)).toBe(true)
        expect(entry.script.toLowerCase()).toContain(word.toLowerCase())
      }
    }
  })

  it('各設問でdistractorsが3件、correctTextと重複せず相互に重複しない', () => {
    for (const entry of PART34_ENTRIES_S) {
      for (const sub of entry.subQuestions) {
        expect(sub.distractors).toHaveLength(3)
        expect(sub.distractors).not.toContain(sub.correctText)
        expect(new Set(sub.distractors).size).toBe(3)
      }
    }
  })
})

describe('rotateSubQuestionChoices（正答キーの決定的ローテーション。M1レビュー⑦の方式）', () => {
  it('choicesが4つで、answerが実際にcorrectTextの位置と一致する', () => {
    const raw = PART34_ENTRIES_S[0]!.subQuestions[0]!
    const r = rotateSubQuestionChoices(raw)
    expect(r.choices).toHaveLength(4)
    expect(r.choices.find((c) => c.key === r.answer)?.text).toBe(raw.correctText)
  })

  it('同じrawエントリなら常に同じ結果になる（配列内位置に依存しない決定的な値。T-266）', () => {
    const raw = PART34_ENTRIES_S[0]!.subQuestions[0]!
    expect(rotateSubQuestionChoices(raw)).toEqual(rotateSubQuestionChoices(raw))
  })

  // 【T-266】ローテーション量が設問文＋correctTextのハッシュ由来になったため、
  // globalIndex%4の厳密な周期分散ではなく統計的な分散になった。極端な偏りだけを検出する
  // 目安として「公平配分の半分〜倍」を許容範囲にする（part5Question.test.tsと同じ考え方）
  it('60設問を通してA/B/C/Dの正答キーが極端に偏らず分散する', () => {
    const questions = buildPart34Questions()
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
    let total = 0
    for (const q of questions) {
      for (const sub of q.subQuestions ?? []) {
        counts[sub.answer] = (counts[sub.answer] ?? 0) + 1
        total += 1
      }
    }
    expect(counts.A! + counts.B! + counts.C! + counts.D!).toBe(60)
    const fairShare = total / 4
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(counts[key]).toBeGreaterThanOrEqual(Math.floor(fairShare / 2))
      expect(counts[key]).toBeLessThanOrEqual(Math.ceil(fairShare * 2))
    }
  })

  // T-266（29のQ-79）: 修正前はrotateSubQuestionChoicesがglobalIndex%4（呼び出し側が渡す
  // セット横断の連番）をローテーション量に使っており、1セット3問という固定長ゆえにセット内の
  // 差分が常に一定になり、かつセットをまたいでも同じ差分になる決定的循環が生じていた
  // （T-237で既存パックを手動シャッフルする対処をした根本原因）。修正後は設問文＋correctText
  // のハッシュ由来のため循環しないことを、contentLint.tsの実検出ロジック
  // （checkAnswerKeyCycle）で確認する。S・S2・S3すべてで確認する
  it('T-266: S/S2/S3を通しで生成してもsubQuestionsの正答キー列が一定差分の決定的循環にならない', () => {
    const sProblems = validateContentLintBlocking(buildPart34Questions(), 'test-pack-p34-s')
    expect(sProblems.some((p) => p.includes('決定的循環'))).toBe(false)

    const s2Problems = validateContentLintBlocking(
      buildPart34Questions(PART34_ENTRIES_S2),
      'test-pack-p34-s2',
    )
    expect(s2Problems.some((p) => p.includes('決定的循環'))).toBe(false)

    const s3Problems = validateContentLintBlocking(
      buildPart34Questions(PART34_ENTRIES_S3),
      'test-pack-p34-s3',
    )
    expect(s3Problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })
})

describe('part34Question', () => {
  it('audio_set形式のQuestionを組み立てる（keyVocab・audio予約パス・subQuestionsを含む）', () => {
    const entry = PART34_ENTRIES_S[0]!
    const question = part34Question(entry, 0)
    expect(question.part).toBe(3)
    expect(question.format).toBe('audio_set')
    expect(question.id).toBe(`p34-${entry.setId}`)
    expect(question.keyVocab).toHaveLength(entry.keyVocabWords.length)
    expect(question.audio).toBe(`audio/part34/${entry.setId}.mp3`)
    expect(question.audioMeta?.voice).toBe('pending-tts')
    expect(question.subQuestions).toHaveLength(3)
    expect(question.subQuestions?.[0]?.id).toBe(`p34-${entry.setId}-q1`)
    expect(question.subQuestions?.[1]?.id).toBe(`p34-${entry.setId}-q2`)
    expect(question.subQuestions?.[2]?.id).toBe(`p34-${entry.setId}-q3`)
  })

  it('存在しないkeyVocabWordはエラーになる（S/A/B語彙カードとの整合を強制）', () => {
    const entry = { ...PART34_ENTRIES_S[0]!, keyVocabWords: ['not-a-real-word'] }
    expect(() => part34Question(entry, 0)).toThrow()
  })
})

describe('buildPart34Questions / validatePart34Questions', () => {
  it('20件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildPart34Questions()
    expect(questions).toHaveLength(20)
    expect(validatePart34Questions(questions)).toEqual([])
  })

  it('IDが全て一意（設問IDも含めてパック内で重複しない）', () => {
    const questions = buildPart34Questions()
    const ids = questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    const subIds = questions.flatMap((q) => (q.subQuestions ?? []).map((s) => s.id))
    expect(new Set(subIds).size).toBe(subIds.length)
  })

  it('answerが選択肢に無いと検出する', () => {
    const questions = buildPart34Questions()
    const tampered = [...questions.slice(1)]
    const first = { ...questions[0]! }
    first.subQuestions = [
      { ...first.subQuestions![0]!, answer: 'Z' },
      ...first.subQuestions!.slice(1),
    ]
    const problems = validatePart34Questions([first, ...tampered])
    expect(problems.some((p) => p.includes('answer'))).toBe(true)
  })
})

describe('buildPart34Drafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で20件出力する', () => {
    const drafts = buildPart34Drafts()
    expect(drafts).toHaveLength(20)
    for (const d of drafts) {
      expect(d.kind).toBe('audio_set')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('audio_set')
    }
  })
})

describe('本試験長尺化（T-352・docs/32のK-81完了ゲート）', () => {
  it('S/S2/S3を通したscript語数の中央値が90語以上になる', () => {
    const words = [...PART34_ENTRIES_S, ...PART34_ENTRIES_S2, ...PART34_ENTRIES_S3]
      .map(
        (e) =>
          e.script
            .replace(/^[AB]:\s*/gm, '')
            .split(/\s+/)
            .filter(Boolean).length,
      )
      .sort((a, b) => a - b)
    const mid = Math.floor(words.length / 2)
    const median = words.length % 2 ? words[mid]! : (words[mid - 1]! + words[mid]!) / 2
    expect(median).toBeGreaterThanOrEqual(90)
  })
})
