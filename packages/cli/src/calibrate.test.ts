// T-34 完了条件のテスト:
// - エクスポートJSON→問題別正答率・key単語誤答関与回数の集計
// - 難易度D・頻出度ランクの補正値ファイル算出（サンプル不足・境界値の扱いを含む）
import { describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import {
  aggregateQuestionStats,
  aggregateWordMissCounts,
  buildCorrections,
  correctDifficulty,
  correctFreqRank,
  MIN_MISS_FOR_PROMOTION,
  MIN_SAMPLE_SIZE,
  parseExportedAttempts,
  type ExportedAttempt,
} from './calibrate.js'

function attempt(questionId: string, isCorrect: boolean): ExportedAttempt {
  return { questionId, isCorrect }
}

describe('parseExportedAttempts', () => {
  it('BackupFile形式（stores.attempts）からattemptsを取り出す', () => {
    const data = { stores: { attempts: [{ questionId: 'q-1', isCorrect: true, extra: 'x' }] } }
    expect(parseExportedAttempts(data)).toEqual([{ questionId: 'q-1', isCorrect: true }])
  })

  it('storesが無ければエラー', () => {
    expect(() => parseExportedAttempts({})).toThrow()
  })

  it('attemptsが配列でなければエラー', () => {
    expect(() => parseExportedAttempts({ stores: { attempts: 'x' } })).toThrow()
  })

  it('要素にquestionId/isCorrectが無ければエラー', () => {
    expect(() => parseExportedAttempts({ stores: { attempts: [{ foo: 1 }] } })).toThrow()
  })
})

describe('aggregateQuestionStats', () => {
  it('問題ID別に正答率を集計する', () => {
    const stats = aggregateQuestionStats([
      attempt('q-1', true),
      attempt('q-1', false),
      attempt('q-1', true),
      attempt('q-2', false),
    ])
    expect(stats.get('q-1')).toEqual({ attempts: 3, correct: 2 })
    expect(stats.get('q-2')).toEqual({ attempts: 1, correct: 0 })
  })

  it('vocab:プレフィックスのattemptsは除外する（語彙SRS復習。問題別統計の対象外）', () => {
    const stats = aggregateQuestionStats([attempt('vocab:submit', true), attempt('q-1', true)])
    expect(stats.has('vocab:submit')).toBe(false)
    expect(stats.get('q-1')).toEqual({ attempts: 1, correct: 1 })
  })
})

describe('correctDifficulty', () => {
  it('サンプル不足なら現状維持', () => {
    expect(
      correctDifficulty(3, { attempts: MIN_SAMPLE_SIZE - 1, correct: MIN_SAMPLE_SIZE - 1 }),
    ).toBe(3)
  })

  it('正答率が高すぎれば易化（D-1）', () => {
    expect(correctDifficulty(3, { attempts: 10, correct: 9 })).toBe(2)
  })

  it('正答率が低すぎれば難化（D+1）', () => {
    expect(correctDifficulty(3, { attempts: 10, correct: 2 })).toBe(4)
  })

  it('レンジ内なら現状維持', () => {
    expect(correctDifficulty(3, { attempts: 10, correct: 6 })).toBe(3)
  })

  it('D=1はこれ以上易化せず1のまま', () => {
    expect(correctDifficulty(1, { attempts: 10, correct: 10 })).toBe(1)
  })

  it('D=5はこれ以上難化せず5のまま', () => {
    expect(correctDifficulty(5, { attempts: 10, correct: 0 })).toBe(5)
  })
})

describe('correctFreqRank', () => {
  it('しきい値未満なら現状維持', () => {
    expect(correctFreqRank('B', MIN_MISS_FOR_PROMOTION - 1)).toBe('B')
  })

  it('しきい値以上なら1段階昇格する', () => {
    expect(correctFreqRank('C', MIN_MISS_FOR_PROMOTION)).toBe('B')
    expect(correctFreqRank('B', MIN_MISS_FOR_PROMOTION)).toBe('A')
    expect(correctFreqRank('A', MIN_MISS_FOR_PROMOTION)).toBe('S')
  })

  it('Sは上限のためそのまま', () => {
    expect(correctFreqRank('S', MIN_MISS_FOR_PROMOTION)).toBe('S')
  })
})

function part2Question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'part2-submit',
    part: 2,
    format: 'audio_qa',
    difficulty: 3,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'B' }],
    audio: 'audio/part2/submit.mp3',
    audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
    script: 'When should I submit it? — By Friday.',
    choices: [
      { key: 'A', text: 'By Friday.' },
      { key: 'B', text: 'Yes, I did.' },
    ],
    answer: 'A',
    explanation: '',
    translation: '',
    ...overrides,
  }
}

function vocabQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'vocab-submit',
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: 'submit',
    phrase: 'Please submit the report.',
    phraseAudio: 'audio/vocab/submit.mp3',
    back: '提出する',
    freqRank: 'B',
    levelBand: 600,
    ...overrides,
  }
}

describe('aggregateWordMissCounts', () => {
  it('keyVocabを持つ問題の誤答回数を単語ごとに合算する', () => {
    const questions = [
      part2Question({
        id: 'p2-1',
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'B' }],
      }),
      part2Question({
        id: 'p2-2',
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'B' }],
      }),
    ]
    const stats = new Map([
      ['p2-1', { attempts: 10, correct: 3 }], // 誤答7
      ['p2-2', { attempts: 5, correct: 4 }], // 誤答1
    ])
    const misses = aggregateWordMissCounts(questions, stats)
    expect(misses.get('submit')).toBe(8)
  })

  it('vocab_card自体もfrontを対象に含める', () => {
    const questions = [vocabQuestion()]
    const stats = new Map([['vocab-submit', { attempts: 10, correct: 4 }]])
    expect(aggregateWordMissCounts(questions, stats).get('submit')).toBe(6)
  })

  it('統計の無い問題・正答のみの問題は集計に含めない', () => {
    const questions = [part2Question({ id: 'p2-x' })]
    expect(aggregateWordMissCounts(questions, new Map()).size).toBe(0)
    const allCorrect = new Map([['p2-x', { attempts: 5, correct: 5 }]])
    expect(aggregateWordMissCounts(questions, allCorrect).size).toBe(0)
  })
})

describe('buildCorrections', () => {
  it('difficultyが変化した項目のみを含む補正値ファイルを組み立てる（誤答絡みしきい値未満ならfreqRankは空のまま）', () => {
    const questions = [
      part2Question({ id: 'p2-easy', difficulty: 3 }),
      vocabQuestion({ id: 'vocab-easy', front: 'easy', freqRank: 'B' }),
    ]
    // p2-easy: 10問中9正解＝正答率0.9 → 易化（D-1）。10件の誤答絡み条件は満たさない（誤答1のみ）
    const attempts: ExportedAttempt[] = [
      ...Array.from({ length: 9 }, () => attempt('p2-easy', true)),
      attempt('p2-easy', false),
    ]
    const corrections = buildCorrections(questions, attempts, 1_720_000_000_000)
    expect(corrections.schemaVersion).toBe(1)
    expect(corrections.generatedAt).toBe(1_720_000_000_000)
    expect(corrections.questionDifficulty).toEqual({ 'p2-easy': 2 })
    expect(corrections.wordFreqRank).toEqual({})
  })

  it('誤答絡み回数がしきい値以上ならfreqRankも補正に含む', () => {
    const questions = [
      part2Question({
        id: 'p2-hard-word',
        difficulty: 3,
        keyVocab: [{ word: 'tricky', sense: '難語', freqRank: 'C' }],
      }),
    ]
    // 10問中0正解＝正答率0 → 難化（D+1）。誤答10件で昇格しきい値ちょうど
    const attempts: ExportedAttempt[] = Array.from({ length: MIN_MISS_FOR_PROMOTION }, () =>
      attempt('p2-hard-word', false),
    )
    const corrections = buildCorrections(questions, attempts, 0)
    expect(corrections.questionDifficulty).toEqual({ 'p2-hard-word': 4 })
    expect(corrections.wordFreqRank).toEqual({ tricky: 'B' })
  })

  it('サンプル不足・しきい値未満なら補正値は空', () => {
    const questions = [part2Question({ id: 'p2-tiny' })]
    const attempts: ExportedAttempt[] = [attempt('p2-tiny', false)]
    const corrections = buildCorrections(questions, attempts, 0)
    expect(corrections.questionDifficulty).toEqual({})
    expect(corrections.wordFreqRank).toEqual({})
  })

  it('vocab:プレフィックスのattemptsは無視される', () => {
    const questions = [vocabQuestion()]
    const attempts: ExportedAttempt[] = Array.from({ length: 20 }, () =>
      attempt('vocab:submit', false),
    )
    const corrections = buildCorrections(questions, attempts, 0)
    expect(corrections.questionDifficulty).toEqual({})
    expect(corrections.wordFreqRank).toEqual({})
  })
})
