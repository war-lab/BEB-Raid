// 語彙SRSの多肢選択リコールテスト完了条件:
// - 正解が必ず含まれる
// - ダミー選択肢は他のvocab_cardのbackから選ばれ、自分自身・重複backは除外される
// - プール不足時は取得できた分だけの選択肢数になる
import { describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import { buildVocabQuizChoices } from './vocabQuiz'

function vocabQuestion(word: string, back: string, overrides: Partial<Question> = {}): Question {
  return {
    id: `vocab-${word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: word,
    phrase: `Please ${word} it.`,
    back,
    freqRank: 'S',
    levelBand: 600,
    ...overrides,
  }
}

/** 固定シーケンスを順に返す疑似rng（テストの決定性確保） */
function sequenceRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('buildVocabQuizChoices', () => {
  it('正解を必ず1件含む4択を組み立てる', () => {
    const target = vocabQuestion('submit', '提出する')
    const pool = [
      target,
      vocabQuestion('attend', '出席する'),
      vocabQuestion('negotiate', '交渉する'),
      vocabQuestion('postpone', '延期する'),
    ]
    const choices = buildVocabQuizChoices(target, pool, sequenceRng([0.1, 0.2, 0.3, 0.4, 0.5]))
    expect(choices).toHaveLength(4)
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1)
    expect(choices.find((c) => c.isCorrect)?.text).toBe('提出する')
    expect(new Set(choices.map((c) => c.key))).toEqual(new Set(['A', 'B', 'C', 'D']))
  })

  it('対象語自身はダミー候補から除外される', () => {
    const target = vocabQuestion('submit', '提出する')
    const pool = [target, vocabQuestion('attend', '出席する')]
    const choices = buildVocabQuizChoices(target, pool, sequenceRng([0.1, 0.2, 0.3]))
    // submit自身の'提出する'が重複して2回入ることはない
    expect(choices.filter((c) => c.text === '提出する')).toHaveLength(1)
  })

  it('backが重複する語は1つに丸められる（同じ意味の選択肢が並ばない）', () => {
    const target = vocabQuestion('submit', '提出する')
    const pool = [
      target,
      vocabQuestion('hand-in', '提出する'), // submitと同義のダミー（重複back）
      vocabQuestion('attend', '出席する'),
    ]
    const choices = buildVocabQuizChoices(target, pool, sequenceRng([0.1, 0.2, 0.3, 0.4]))
    const texts = choices.map((c) => c.text)
    expect(new Set(texts).size).toBe(texts.length) // 重複なし
  })

  it('プールが少なければ選択肢数もそれに応じて減る（正解は必ず残る）', () => {
    const target = vocabQuestion('submit', '提出する')
    const choices = buildVocabQuizChoices(target, [target], sequenceRng([0.1]))
    expect(choices).toHaveLength(1)
    expect(choices[0]?.isCorrect).toBe(true)
  })
})

// ダミーの同質化（2026-07-29）: 難易度帯・頻出度がかけ離れた語が並ぶと、意味を知らなくても
// 消去法で当たり正答率が実力を過大評価する。同 freqRank・levelBand を優先して選ぶ
describe('buildVocabQuizChoices: ダミーの同質化', () => {
  const rng = () => 0.5

  it('同じ freqRank・levelBand の候補が足りていれば、別の帯の語は選ばれない', () => {
    const target = vocabQuestion('procure', '調達する', { freqRank: 'B', levelBand: 860 })
    const sameTier = [
      vocabQuestion('mitigate', '緩和する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('delegate', '委任する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('consolidate', '統合する', { freqRank: 'B', levelBand: 860 }),
    ]
    const otherTier = [
      vocabQuestion('meeting', '会議', { freqRank: 'S', levelBand: 600 }),
      vocabQuestion('agenda', '議題', { freqRank: 'S', levelBand: 600 }),
      vocabQuestion('minutes', '議事録', { freqRank: 'S', levelBand: 600 }),
    ]
    const choices = buildVocabQuizChoices(target, [target, ...otherTier, ...sameTier], rng)
    const texts = choices.map((c) => c.text)
    expect(texts).toHaveLength(4)
    for (const q of otherTier) expect(texts).not.toContain(q.back)
  })

  it('同 rank/band が2件しかなければ下位のグループへフォールバックして4択を埋める', () => {
    const target = vocabQuestion('procure', '調達する', { freqRank: 'B', levelBand: 860 })
    const pool = [
      target,
      vocabQuestion('mitigate', '緩和する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('delegate', '委任する', { freqRank: 'B', levelBand: 860 }),
      // 同 band・別 rank（tier 1）
      vocabQuestion('waive', '放棄する', { freqRank: 'A', levelBand: 860 }),
      // 別 band（tier 2）
      vocabQuestion('meeting', '会議', { freqRank: 'S', levelBand: 600 }),
    ]
    const choices = buildVocabQuizChoices(target, pool, rng)
    expect(choices).toHaveLength(4)
    const texts = choices.map((c) => c.text)
    expect(texts).toContain('放棄する')
    expect(texts).not.toContain('会議')
  })

  it('levelBand の差が小さい帯から先に選ぶ', () => {
    const target = vocabQuestion('procure', '調達する', { freqRank: 'B', levelBand: 860 })
    const pool = [
      target,
      vocabQuestion('waive', '放棄する', { freqRank: 'B', levelBand: 730 }), // 差130
      vocabQuestion('itinerary', '旅程', { freqRank: 'B', levelBand: 730 }), // 差130
      vocabQuestion('appraisal', '査定', { freqRank: 'B', levelBand: 730 }), // 差130
      vocabQuestion('meeting', '会議', { freqRank: 'S', levelBand: 600 }), // 差260
    ]
    const choices = buildVocabQuizChoices(target, pool, rng)
    const texts = choices.map((c) => c.text)
    // 差130の帯だけで3件埋まるので、差260の語は選ばれない
    expect(texts).toEqual(expect.arrayContaining(['放棄する', '旅程', '査定']))
    expect(texts).not.toContain('会議')
  })

  it('levelBand が引けない候補は最後のグループになる（同質性を判定できないため）', () => {
    const target = vocabQuestion('procure', '調達する', { freqRank: 'B', levelBand: 860 })
    const pool = [
      target,
      vocabQuestion('unknown1', '不明1', { levelBand: null }),
      vocabQuestion('mitigate', '緩和する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('delegate', '委任する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('consolidate', '統合する', { freqRank: 'B', levelBand: 860 }),
    ]
    const choices = buildVocabQuizChoices(target, pool, rng)
    expect(choices.map((c) => c.text)).not.toContain('不明1')
  })

  it('対象語の levelBand が無ければ全候補が同列に扱われる（従来挙動）', () => {
    const target = vocabQuestion('procure', '調達する', { levelBand: null })
    const pool = [
      target,
      vocabQuestion('meeting', '会議', { freqRank: 'S', levelBand: 600 }),
      vocabQuestion('mitigate', '緩和する', { freqRank: 'B', levelBand: 860 }),
      vocabQuestion('waive', '放棄する', { freqRank: 'A', levelBand: 730 }),
    ]
    const choices = buildVocabQuizChoices(target, pool, rng)
    expect(choices).toHaveLength(4)
    expect(choices.filter((c) => c.isCorrect)).toHaveLength(1)
  })
})
