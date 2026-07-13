// T-25 完了条件のテスト（純粋ロジック層）:
// - S200語がランク根拠付きで組み立てられる
// - 出典コーパス不使用（corpusSource/corpusLicense=null）の免責事項がmetaに記録される
// - 重複語・根拠欠落を検出できる
import { describe, expect, it } from 'vitest'
import { buildFreqList, validateFreqList, WORDS_S, type FreqList } from './freqList.js'

describe('buildFreqList', () => {
  it('S200語とmeta（免責事項・コーパス不使用の記録）を組み立てる', () => {
    const list = buildFreqList('2026-07-10')
    expect(list.words).toHaveLength(200)
    expect(list.words.every((w) => w.freqRank === 'S')).toBe(true)
    expect(list.words.every((w) => w.rankSource === 'llm')).toBe(true)
    expect(list.meta.corpusSource).toBeNull()
    expect(list.meta.corpusLicense).toBeNull()
    expect(list.meta.disclaimer).toContain('未検証')
    expect(list.meta.generatedAt).toBe('2026-07-10')
  })
})

describe('WORDS_S（データ本体）', () => {
  it('200語すべてに空でない根拠(rationale)がある', () => {
    expect(WORDS_S).toHaveLength(200)
    expect(WORDS_S.every((w) => w.rationale.trim() !== '')).toBe(true)
  })

  it('単語が重複しない', () => {
    const words = WORDS_S.map((w) => w.word.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
  })
})

describe('validateFreqList', () => {
  it('正しいリストは問題なし', () => {
    expect(validateFreqList(buildFreqList('2026-07-10'))).toEqual([])
  })

  it('S以外を混ぜてSランクが200語未満になると検出する', () => {
    const list = buildFreqList('2026-07-10')
    const tampered: FreqList = {
      ...list,
      words: [...list.words.slice(0, -1), { ...list.words[0]!, freqRank: 'A' }],
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
