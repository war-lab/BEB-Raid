// T-273 完了条件のテスト:
// - 追加した読解素材（Part6・Part7単一）がURL・メールアドレスを含む
// - 生成結果がbuildPart6Questions/buildPart7SingleQuestions経由でtext_passage Questionとして
//   正しく組み立てられ、既存のバリデータ（validatePart6Questions/validatePart7SingleQuestions。
//   shared-schema validatePackを内部で呼ぶ）を通過する
// - 少なくとも1件が390px幅での折返し検証に使える「ハイフン・スラッシュを含まない
//   50文字超の連続トークン」を持つ（T-227の実データ検証向け。docs/30 17節「T-273の位置づけ」）
// - 既存の初期在庫（PART6_ENTRIES_S・PART7_SINGLE_ENTRIES_S。配信済みpack-reading-*のソース）は
//   本ファイルの追加によって変更されていない
import { describe, expect, it } from 'vitest'
import { PART6_ENTRIES_S } from './data/part6PassagesS.js'
import { PART6_URL_ENTRIES_S } from './data/part6UrlPassagesS.js'
import { PART7_SINGLE_ENTRIES_S } from './data/part7SinglePassagesS.js'
import { PART7_SINGLE_URL_ENTRIES_S } from './data/part7SingleUrlPassagesS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import {
  buildPart6Drafts,
  buildPart6Questions,
  buildPart7SingleDrafts,
  buildPart7SingleQuestions,
  validatePart6Questions,
  validatePart7SingleQuestions,
} from './textPassageQuestion.js'

const VOCAB_POOL = new Set([
  ...VOCAB_CARDS_S.map((v) => v.word),
  ...VOCAB_CARDS_A.map((v) => v.word),
  ...VOCAB_CARDS_B.map((v) => v.word),
])

/** 簡易URL検出（http(s)://およびドメインらしき文字列）。実データ検証用途で厳密なRFC準拠は要らない */
const URL_PATTERN = /https?:\/\/[^\s]+|\b[a-z0-9-]+(\.[a-z0-9-]+)+\.(com|org|net)\b/i
/** 簡易メールアドレス検出 */
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i

/**
 * ハイフン・スラッシュを含まない連続した英数字トークンの最大長を求める
 * （T-227の折返し検証に使えるかの判定。空白・ハイフン・スラッシュは改行可能点になりうるため除く）
 */
function longestUnbrokenTokenLength(text: string): number {
  const tokens = text.split(/[\s/-]+/)
  return tokens.reduce((max, t) => Math.max(max, t.length), 0)
}

describe('PART6_URL_ENTRIES_S / PART7_SINGLE_URL_ENTRIES_S（T-273追加データ）', () => {
  it('既存の初期在庫（配信済みパックのソース）はセット数・setIdとも変更されていない', () => {
    expect(PART6_ENTRIES_S).toHaveLength(30)
    expect(PART7_SINGLE_ENTRIES_S).toHaveLength(40)
    expect(PART6_ENTRIES_S.some((e) => e.setId.startsWith('p6url-'))).toBe(false)
    expect(PART7_SINGLE_ENTRIES_S.some((e) => e.setId.startsWith('p7url-'))).toBe(false)
  })

  it('setIdが既存在庫と重複しない一意なIDである', () => {
    const existingP6Ids = new Set(PART6_ENTRIES_S.map((e) => e.setId))
    const existingP7Ids = new Set(PART7_SINGLE_ENTRIES_S.map((e) => e.setId))
    for (const e of PART6_URL_ENTRIES_S) {
      expect(existingP6Ids.has(e.setId)).toBe(false)
    }
    for (const e of PART7_SINGLE_URL_ENTRIES_S) {
      expect(existingP7Ids.has(e.setId)).toBe(false)
    }
    const allIds = [
      ...PART6_URL_ENTRIES_S.map((e) => e.setId),
      ...PART7_SINGLE_URL_ENTRIES_S.map((e) => e.setId),
    ]
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('keyVocabWordsがS/A/B語彙カード（600語）に実在する', () => {
    for (const entry of [...PART6_URL_ENTRIES_S, ...PART7_SINGLE_URL_ENTRIES_S]) {
      expect(entry.keyVocabWords.length).toBeGreaterThanOrEqual(1)
      for (const word of entry.keyVocabWords) {
        expect(VOCAB_POOL.has(word)).toBe(true)
      }
    }
  })

  it('URL・メールアドレスを含む設問が1件以上ある（本タスクの主目的）', () => {
    const allTexts = [
      ...PART6_URL_ENTRIES_S.map((e) => e.passageText),
      ...PART7_SINGLE_URL_ENTRIES_S.map((e) => e.passageText),
    ]
    expect(allTexts.some((t) => URL_PATTERN.test(t))).toBe(true)
    expect(allTexts.some((t) => EMAIL_PATTERN.test(t))).toBe(true)
  })

  it('各追加セットがURLまたはメールアドレスの少なくとも一方を含む', () => {
    for (const entry of [...PART6_URL_ENTRIES_S, ...PART7_SINGLE_URL_ENTRIES_S]) {
      const hasUrl = URL_PATTERN.test(entry.passageText)
      const hasEmail = EMAIL_PATTERN.test(entry.passageText)
      expect(hasUrl || hasEmail).toBe(true)
    }
  })

  it('少なくとも1件が390px幅での折返し検証に使える50文字超の連続トークンを持つ（T-227向け）', () => {
    const allTexts = [
      ...PART6_URL_ENTRIES_S.map((e) => e.passageText),
      ...PART7_SINGLE_URL_ENTRIES_S.map((e) => e.passageText),
    ]
    const maxLen = Math.max(...allTexts.map((t) => longestUnbrokenTokenLength(t)))
    expect(maxLen).toBeGreaterThan(50)
  })

  it('p7url-002（Webサイト・メールとも長大トークン）がT-227検証用の指定セットである', () => {
    const entry = PART7_SINGLE_URL_ENTRIES_S.find((e) => e.setId === 'p7url-002')
    expect(entry).toBeDefined()
    expect(longestUnbrokenTokenLength(entry!.passageText)).toBeGreaterThan(50)
    expect(URL_PATTERN.test(entry!.passageText)).toBe(true)
    expect(EMAIL_PATTERN.test(entry!.passageText)).toBe(true)
  })
})

describe('buildPart6Questions(PART6_URL_ENTRIES_S) / validatePart6Questions', () => {
  it('text_passage Questionとして正しく組み立てられ、バリデータを通過する', () => {
    const questions = buildPart6Questions(PART6_URL_ENTRIES_S)
    expect(questions).toHaveLength(PART6_URL_ENTRIES_S.length)
    expect(validatePart6Questions(questions)).toEqual([])
    for (const q of questions) {
      expect(q.format).toBe('text_passage')
      expect(q.part).toBe(6)
      expect(q.subQuestions).toHaveLength(4)
    }
  })

  it('レビュー往復用ドラフト（GeneratedItemDraft）に包める（配信はH-R1のレビュー後）', () => {
    const drafts = buildPart6Drafts(PART6_URL_ENTRIES_S)
    expect(drafts).toHaveLength(PART6_URL_ENTRIES_S.length)
    for (const d of drafts) {
      expect(d.kind).toBe('text_passage')
      expect((d.payload as { format: string }).format).toBe('text_passage')
    }
  })
})

describe('buildPart7SingleQuestions(PART7_SINGLE_URL_ENTRIES_S) / validatePart7SingleQuestions', () => {
  it('text_passage Questionとして正しく組み立てられ、バリデータを通過する', () => {
    const questions = buildPart7SingleQuestions(PART7_SINGLE_URL_ENTRIES_S)
    expect(questions).toHaveLength(PART7_SINGLE_URL_ENTRIES_S.length)
    expect(validatePart7SingleQuestions(questions)).toEqual([])
    for (const q of questions) {
      expect(q.format).toBe('text_passage')
      expect(q.part).toBe(7)
      expect(q.subQuestions!.length).toBeGreaterThanOrEqual(2)
      expect(q.subQuestions!.length).toBeLessThanOrEqual(4)
    }
  })

  it('レビュー往復用ドラフト（GeneratedItemDraft）に包める（配信はH-R1のレビュー後）', () => {
    const drafts = buildPart7SingleDrafts(PART7_SINGLE_URL_ENTRIES_S)
    expect(drafts).toHaveLength(PART7_SINGLE_URL_ENTRIES_S.length)
    for (const d of drafts) {
      expect(d.kind).toBe('text_passage')
      expect((d.payload as { format: string }).format).toBe('text_passage')
    }
  })
})
