// 語彙SRSの多肢選択リコールテスト完了条件:
// - 正解が必ず含まれる
// - ダミー選択肢は他のvocab_cardのbackから選ばれ、自分自身・重複backは除外される
// - プール不足時は取得できた分だけの選択肢数になる
import { describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import { buildVocabQuizChoices } from './vocabQuiz'

function vocabQuestion(word: string, back: string): Question {
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
