// T-107 完了条件のテスト（純粋ロジック層）:
// - Part6×30セット・Part7単一×40セットがtext_passage Questionとして正しく組み立てられる
// - バリデータ（shared-schema validatePack。T-103でtext_passage対応済み）を通過する
// - Part6の空所マーカー[[1]]〜[[4]]と設問数の整合が取れている（マーカー4個・設問4問）
// - Part7単一のsubQuestionsが2〜4問の範囲に収まる（docs/24 3.1節）
// - keyVocabWordsがS/A/B語彙カード（600語）に実在し、passages本文またはsubQuestionsの
//   question/choicesに文字列として含まれる
// - 各設問（subQuestions）が4択（A〜D）で正答キーが決定的ローテーションで分散する
import { describe, expect, it } from 'vitest'
import { PART6_ENTRIES_S } from './data/part6PassagesS.js'
import { PART7_MULTI_ENTRIES_S } from './data/part7MultiPassagesS.js'
import { PART7_SINGLE_ENTRIES_S } from './data/part7SinglePassagesS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildPart6Drafts,
  buildPart6Questions,
  buildPart7MultiDrafts,
  buildPart7MultiQuestions,
  buildPart7SingleDrafts,
  buildPart7SingleQuestions,
  CROSS_REFERENCE_TAG,
  part6Question,
  part7SingleQuestion,
  rotateTextPassageChoices,
  validatePart6Questions,
  validatePart7MultiQuestions,
  validatePart7SingleQuestions,
  type Part7MultiRawEntry,
} from './textPassageQuestion.js'

const VOCAB_POOL = new Set([
  ...VOCAB_CARDS_S.map((v) => v.word),
  ...VOCAB_CARDS_A.map((v) => v.word),
  ...VOCAB_CARDS_B.map((v) => v.word),
])

/** 本文中の[[n]]マーカー番号を出現順に取り出す（shared-schemaのextractMarkerIndicesと同じ考え方） */
function extractMarkers(text: string): number[] {
  return [...text.matchAll(/\[\[(\d+)\]\]/g)].map((m) => Number(m[1]))
}

describe('PART6_ENTRIES_S（データ本体）', () => {
  it('30セットある', () => {
    expect(PART6_ENTRIES_S).toHaveLength(30)
  })

  it('setIdが全て一意', () => {
    const ids = PART6_ENTRIES_S.map((e) => e.setId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全セットが4設問を持ち、4問目がinsertion（文挿入）である', () => {
    for (const entry of PART6_ENTRIES_S) {
      expect(entry.subQuestions).toHaveLength(4)
      expect(entry.subQuestions[3]!.kind).toBe('insertion')
    }
  })

  it('本文の空所マーカーが[[1]]〜[[4]]の連番・重複なしで設問数と一致する', () => {
    for (const entry of PART6_ENTRIES_S) {
      const markers = extractMarkers(entry.passageText)
      expect(markers).toEqual([1, 2, 3, 4])
      expect(markers.length).toBe(entry.subQuestions.length)
    }
  })

  it('全セットのkeyVocabWordsがS/A/B語彙カード（600語）に実在する', () => {
    for (const entry of PART6_ENTRIES_S) {
      expect(entry.keyVocabWords.length).toBeGreaterThanOrEqual(1)
      for (const word of entry.keyVocabWords) {
        expect(VOCAB_POOL.has(word)).toBe(true)
      }
    }
  })

  it('各設問でdistractorsが3件、correctTextと重複せず相互に重複しない', () => {
    for (const entry of PART6_ENTRIES_S) {
      for (const sub of entry.subQuestions) {
        expect(sub.distractors).toHaveLength(3)
        expect(sub.distractors).not.toContain(sub.correctText)
        expect(new Set(sub.distractors).size).toBe(3)
      }
    }
  })
})

describe('PART7_SINGLE_ENTRIES_S（データ本体）', () => {
  it('40セットある', () => {
    expect(PART7_SINGLE_ENTRIES_S).toHaveLength(40)
  })

  it('setIdが全て一意', () => {
    const ids = PART7_SINGLE_ENTRIES_S.map((e) => e.setId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('全セットのsubQuestionsが2〜4問（docs/24 3.1節「Part7単一」）', () => {
    for (const entry of PART7_SINGLE_ENTRIES_S) {
      expect(entry.subQuestions.length).toBeGreaterThanOrEqual(2)
      expect(entry.subQuestions.length).toBeLessThanOrEqual(4)
    }
  })

  it('設問数の合計がおよそ150問（docs/24 3.6節の初期在庫目標＋T-350の追加設問）', () => {
    const total = PART7_SINGLE_ENTRIES_S.reduce((sum, e) => sum + e.subQuestions.length, 0)
    expect(total).toBeGreaterThanOrEqual(140)
    expect(total).toBeLessThanOrEqual(160)
  })

  it('全セットのkeyVocabWordsがS/A/B語彙カード（600語）に実在する', () => {
    for (const entry of PART7_SINGLE_ENTRIES_S) {
      expect(entry.keyVocabWords.length).toBeGreaterThanOrEqual(1)
      for (const word of entry.keyVocabWords) {
        expect(VOCAB_POOL.has(word)).toBe(true)
      }
    }
  })

  it('各設問でdistractorsが3件、correctTextと重複せず相互に重複しない', () => {
    for (const entry of PART7_SINGLE_ENTRIES_S) {
      for (const sub of entry.subQuestions) {
        expect(sub.distractors).toHaveLength(3)
        expect(sub.distractors).not.toContain(sub.correctText)
        expect(new Set(sub.distractors).size).toBe(3)
      }
    }
  })
})

describe('rotateTextPassageChoices（正答キーの決定的ローテーション。M1レビュー⑦の方式）', () => {
  it('globalIndex%4に応じてcorrectTextの位置が機械的に決まる', () => {
    const raw = PART6_ENTRIES_S[0]!.subQuestions[0]!
    const r0 = rotateTextPassageChoices(raw, 0)
    const r1 = rotateTextPassageChoices(raw, 1)
    const r4 = rotateTextPassageChoices(raw, 4)
    expect(r0.choices.find((c) => c.key === r0.answer)?.text).toBe(raw.correctText)
    expect(r1.choices.find((c) => c.key === r1.answer)?.text).toBe(raw.correctText)
    expect(r4.answer).toBe(r0.answer)
  })
})

describe('part6Question', () => {
  it('text_passage形式のQuestionを組み立てる（Part6・passages1件・subQuestions4問）', () => {
    const entry = PART6_ENTRIES_S[0]!
    const question = part6Question(entry, 0)
    expect(question.part).toBe(6)
    expect(question.format).toBe('text_passage')
    expect(question.id).toBe(entry.setId)
    expect(question.passages).toHaveLength(1)
    expect(question.passages?.[0]?.text).toBe(entry.passageText)
    expect(question.subQuestions).toHaveLength(4)
    expect(question.subQuestions?.[0]?.id).toBe(`${entry.setId}-q1`)
  })

  it('存在しないkeyVocabWordはエラーになる（S/A/B語彙カードとの整合を強制）', () => {
    const entry = { ...PART6_ENTRIES_S[0]!, keyVocabWords: ['not-a-real-word'] }
    expect(() => part6Question(entry, 0)).toThrow()
  })
})

describe('part7SingleQuestion', () => {
  it('text_passage形式のQuestionを組み立てる（Part7・passages1件）', () => {
    const entry = PART7_SINGLE_ENTRIES_S[0]!
    const question = part7SingleQuestion(entry, 0)
    expect(question.part).toBe(7)
    expect(question.format).toBe('text_passage')
    expect(question.id).toBe(entry.setId)
    expect(question.passages).toHaveLength(1)
    expect(question.subQuestions).toHaveLength(entry.subQuestions.length)
  })
})

describe('buildPart6Questions / validatePart6Questions', () => {
  it('30件のQuestionを組み立て、バリデータ（shared-schema・Part6マーカー整合含む）を通過する', () => {
    const questions = buildPart6Questions()
    expect(questions).toHaveLength(30)
    expect(validatePart6Questions(questions)).toEqual([])
  })

  it('IDが全て一意（設問IDも含めてパック内で重複しない）', () => {
    const questions = buildPart6Questions()
    const ids = questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    const subIds = questions.flatMap((q) => (q.subQuestions ?? []).map((s) => s.id))
    expect(new Set(subIds).size).toBe(subIds.length)
  })

  it('マーカー数と設問数が不一致だとvalidatePart6Questionsが検出する', () => {
    const questions = buildPart6Questions()
    const tampered = [...questions.slice(1)]
    const first = { ...questions[0]! }
    // 空所マーカーを1個減らして不整合を作る（[[4]]を削除）
    first.passages = [
      { ...first.passages![0]!, text: first.passages![0]!.text.replace('[[4]]', '') },
    ]
    const problems = validatePart6Questions([first, ...tampered])
    expect(problems.some((p) => p.includes('空所マーカー数'))).toBe(true)
  })

  it('60設問超のA/B/C/Dの正答キーがほぼ均等に分散する', () => {
    const questions = buildPart6Questions()
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 }
    for (const q of questions) {
      for (const sub of q.subQuestions ?? []) {
        counts[sub.answer] = (counts[sub.answer] ?? 0) + 1
      }
    }
    expect(counts.A! + counts.B! + counts.C! + counts.D!).toBe(120)
    for (const key of ['A', 'B', 'C', 'D']) {
      expect(counts[key]).toBeGreaterThanOrEqual(20)
      expect(counts[key]).toBeLessThanOrEqual(40)
    }
  })
})

describe('buildPart7SingleQuestions / validatePart7SingleQuestions', () => {
  it('40件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildPart7SingleQuestions()
    expect(questions).toHaveLength(40)
    expect(validatePart7SingleQuestions(questions)).toEqual([])
  })

  it('IDが全て一意（設問IDも含めてパック内で重複しない）', () => {
    const questions = buildPart7SingleQuestions()
    const ids = questions.map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    const subIds = questions.flatMap((q) => (q.subQuestions ?? []).map((s) => s.id))
    expect(new Set(subIds).size).toBe(subIds.length)
  })

  it('subQuestionsが2問未満・4問超だと検出する（docs/24 3.1節「Part7単一」の業務ルール）', () => {
    const questions = buildPart7SingleQuestions()
    const tampered = [...questions.slice(1)]
    const first = { ...questions[0]! }
    first.subQuestions = first.subQuestions!.slice(0, 1) // 1問に削って2〜4問の範囲外にする
    const problems = validatePart7SingleQuestions([first, ...tampered])
    expect(problems.some((p) => p.includes('2〜4問'))).toBe(true)
  })

  it('answerが選択肢に無いと検出する', () => {
    const questions = buildPart7SingleQuestions()
    const tampered = [...questions.slice(1)]
    const first = { ...questions[0]! }
    first.subQuestions = [
      { ...first.subQuestions![0]!, answer: 'Z' },
      ...first.subQuestions!.slice(1),
    ]
    const problems = validatePart7SingleQuestions([first, ...tampered])
    expect(problems.some((p) => p.includes('answer'))).toBe(true)
  })
})

describe('buildPart6Drafts / buildPart7SingleDrafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で出力する', () => {
    const p6Drafts = buildPart6Drafts()
    expect(p6Drafts).toHaveLength(30)
    for (const d of p6Drafts) {
      expect(d.kind).toBe('text_passage')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('text_passage')
    }

    const p7Drafts = buildPart7SingleDrafts()
    expect(p7Drafts).toHaveLength(40)
    for (const d of p7Drafts) {
      expect(d.kind).toBe('text_passage')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('text_passage')
    }
  })
})

describe('Part7複数パッセージ（T-144。docs/24 3.1節・3.6節）', () => {
  // 何を防ぐか: 複数文書にしたのに突き合わせを要求する設問が無い（＝単一で足りる）セットや、
  // タブ表示のkeyが壊れる文書IDの不整合を配信前に見逃すこと
  it('初期在庫が構造検証とパック検証を通る', () => {
    const questions = buildPart7MultiQuestions()

    expect(questions.length).toBeGreaterThan(0)
    expect(validatePart7MultiQuestions(questions)).toEqual([])
  })

  it('各セットが2〜3文書・5問で、相互参照タグ付きの設問を持つ', () => {
    for (const q of buildPart7MultiQuestions()) {
      expect(q.passages!.length).toBeGreaterThanOrEqual(2)
      expect(q.passages!.length).toBeLessThanOrEqual(3)
      expect(q.subQuestions).toHaveLength(5)
      const crossRefs = q.subQuestions!.filter((s) => s.tags?.includes(CROSS_REFERENCE_TAG))
      expect(crossRefs.length).toBeGreaterThan(0)
    }
  })

  it('文書idは <setId>-docN の連番になる（タブ表示のkeyに使う）', () => {
    for (const q of buildPart7MultiQuestions()) {
      expect(q.passages!.map((p) => p.id)).toEqual(q.passages!.map((_, i) => `${q.id}-doc${i + 1}`))
    }
  })

  it('4択は決定的にローテーションされ、正解が同じ記号に偏らない', () => {
    const answers = buildPart7MultiQuestions().flatMap((q) => q.subQuestions!.map((s) => s.answer))
    // 全問が同じ記号になっていない（丸暗記対策のローテーションが効いている）
    expect(new Set(answers).size).toBeGreaterThan(1)
    // 同じ入力から同じ結果が出る（決定的）
    expect(buildPart7MultiQuestions().flatMap((q) => q.subQuestions!.map((s) => s.answer))).toEqual(
      answers,
    )
  })

  it('相互参照タグが1問も無いセットは検証で弾く', () => {
    const [entry] = PART7_MULTI_ENTRIES_S
    const withoutCrossRef: Part7MultiRawEntry = {
      ...entry!,
      subQuestions: entry!.subQuestions.map((s) => ({ ...s, crossReference: false })),
    }

    const problems = validatePart7MultiQuestions(buildPart7MultiQuestions([withoutCrossRef]))

    expect(problems.some((p) => p.includes('cross-reference'))).toBe(true)
  })

  it('文書が1件だけのセットは検証で弾く（複数パッセージの形式ではない）', () => {
    const [entry] = PART7_MULTI_ENTRIES_S
    const single: Part7MultiRawEntry = {
      ...entry!,
      passages: [entry!.passages[0]!],
    }

    const problems = validatePart7MultiQuestions(buildPart7MultiQuestions([single]))

    expect(problems.some((p) => p.includes('passagesは2〜3件'))).toBe(true)
  })

  it('レビュー往復用ドラフトに包める（配信はH-R1のレビュー後）', () => {
    const drafts = buildPart7MultiDrafts()

    expect(drafts).toHaveLength(PART7_MULTI_ENTRIES_S.length)
    expect(drafts[0]!.kind).toBe('text_passage')
    expect(drafts[0]!.preview).toContain('[Part7複数/')
  })
})
