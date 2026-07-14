// T-25 完了条件のテスト（純粋ロジック層）:
// - S200語がランク根拠付きで組み立てられる
// - 出典コーパス不使用（corpusSource/corpusLicense=null）の免責事項がmetaに記録される
// - 重複語・根拠欠落を検出できる
// M2・T-58 完了条件のテスト（A/B各200語拡充）:
// - S/A/B計600語が組み立てられ、重複なし・全語根拠付きであること
import { describe, expect, it } from 'vitest'
import {
  buildFreqList,
  validateFreqList,
  WORDS_A,
  WORDS_B,
  WORDS_S,
  type FreqList,
} from './freqList.js'

describe('buildFreqList', () => {
  it('S/A/B計600語とmeta（免責事項・コーパス不使用の記録）を組み立てる', () => {
    const list = buildFreqList('2026-07-10')
    expect(list.words).toHaveLength(600)
    expect(list.words.filter((w) => w.freqRank === 'S')).toHaveLength(200)
    expect(list.words.filter((w) => w.freqRank === 'A')).toHaveLength(200)
    expect(list.words.filter((w) => w.freqRank === 'B')).toHaveLength(200)
    expect(list.words.every((w) => w.rankSource === 'llm')).toBe(true)
    expect(list.meta.corpusSource).toBeNull()
    expect(list.meta.corpusLicense).toBeNull()
    expect(list.meta.disclaimer).toContain('未検証')
    expect(list.meta.generatedAt).toBe('2026-07-10')
  })
})

describe.each([
  ['WORDS_S', WORDS_S],
  ['WORDS_A', WORDS_A],
  ['WORDS_B', WORDS_B],
])('%s（データ本体）', (_name, words) => {
  it('200語すべてに空でない根拠(rationale)がある', () => {
    expect(words).toHaveLength(200)
    expect(words.every((w) => w.rationale.trim() !== '')).toBe(true)
  })

  it('単語が重複しない', () => {
    const lower = words.map((w) => w.word.toLowerCase())
    expect(new Set(lower).size).toBe(lower.length)
  })
})

describe('WORDS_S/A/B間で単語が重複しない（M2・T-58）', () => {
  it('S・A・B・全体を通して重複語が無い', () => {
    const all = [...WORDS_S, ...WORDS_A, ...WORDS_B].map((w) => w.word.toLowerCase())
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('validateFreqList', () => {
  it('正しいリストは問題なし', () => {
    expect(validateFreqList(buildFreqList('2026-07-10'))).toEqual([])
  })

  it('いずれかのランクが200語未満になると検出する', () => {
    const list = buildFreqList('2026-07-10')
    const tampered: FreqList = {
      ...list,
      words: [...list.words.slice(0, -1), { ...list.words[0]!, freqRank: 'C' }],
    }
    const problems = validateFreqList(tampered)
    expect(problems.some((p) => p.includes('200語'))).toBe(true)
  })

  it('重複語を検出する', () => {
    const list = buildFreqList('2026-07-10')
    const tampered: FreqList = { ...list, words: [...list.words, list.words[0]!] }
    const problems = validateFreqList(tampered)
    expect(problems.some((p) => p.includes('重複'))).toBe(true)
  })

  it('根拠が空の語を検出する', () => {
    const list = buildFreqList('2026-07-10')
    const tampered: FreqList = {
      ...list,
      words: [{ ...list.words[0]!, rationale: '' }, ...list.words.slice(1)],
    }
    const problems = validateFreqList(tampered)
    expect(problems.some((p) => p.includes('根拠'))).toBe(true)
  })
})
