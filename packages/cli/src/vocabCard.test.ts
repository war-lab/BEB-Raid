// T-26 完了条件のテスト（純粋ロジック層）:
// - 200語のvocab_card Questionが正しく組み立てられる
// - バリデータ（shared-schema validatePack）を通過する
// - phraseAudioが予約パスになっている（T-31で実音声に差し替える前提）
// M2・T-59 完了条件のテスト（語彙カードA/B各200語拡充）:
// - freqRank/levelBandを指定してQuestionを組み立てられる（A=730/B=860=J-22）
// - 文型の機械的重複検出（対象語だけ置換した用例文の単調な重複を検出）
import { describe, expect, it } from 'vitest'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { WORDS_A } from './data/freqListWordsA.js'
import { WORDS_B } from './data/freqListWordsB.js'
import {
  buildVocabCardDrafts,
  buildVocabCardQuestions,
  LEVEL_BAND_FOR_RANK,
  reservedPhraseAudioPath,
  validatePhraseVariety,
  validateVocabCardQuestions,
  vocabCardQuestion,
  VOCAB_CARDS_S,
  VOCAB_CARD_LEVEL_BAND,
} from './vocabCard.js'

describe('VOCAB_CARDS_S（データ本体）', () => {
  it('200語ある', () => {
    expect(VOCAB_CARDS_S).toHaveLength(200)
  })

  it('freqList.tsのWORDS_Sと同じ200語（順序も一致）', async () => {
    const { WORDS_S } = await import('./freqList.js')
    expect(VOCAB_CARDS_S.map((v) => v.word)).toEqual(WORDS_S.map((w) => w.word))
  })

  it('全語にback（和訳）とphrase（用例文）があり、phraseは単語自体を含む', () => {
    for (const entry of VOCAB_CARDS_S) {
      expect(entry.back.trim()).not.toBe('')
      expect(entry.phrase.trim()).not.toBe('')
      expect(entry.phrase.toLowerCase()).toContain(entry.word.toLowerCase())
    }
  })

  it('単語が重複しない', () => {
    const words = VOCAB_CARDS_S.map((v) => v.word.toLowerCase())
    expect(new Set(words).size).toBe(words.length)
  })

  // T-345（K-86）: 全語にtagsが付与されていること（空配列だと弱点タグ判定が機能しない）
  it('全語にtagsが1件以上付与されている', () => {
    for (const entry of VOCAB_CARDS_S) {
      expect(entry.tags.length).toBeGreaterThan(0)
    }
  })
})

describe('vocabCardQuestion', () => {
  it('vocab_card形式のQuestionを組み立てる（phraseAudioは予約パス）', () => {
    const question = vocabCardQuestion({
      word: 'submit',
      tags: ['会議・文書・オフィスコミュニケーション'],
      back: '提出する',
      phrase: 'Please submit the report.',
    })
    expect(question.part).toBe(0)
    expect(question.format).toBe('vocab_card')
    expect(question.front).toBe('submit')
    expect(question.back).toBe('提出する')
    expect(question.freqRank).toBe('S')
    expect(question.levelBand).toBe(VOCAB_CARD_LEVEL_BAND)
    expect(question.phraseAudio).toBe(reservedPhraseAudioPath('submit'))
  })

  // T-345（K-86）: 語彙カードのtagsが常に空配列だったため、engine/quickPack.tsの弱点タグ判定
  // （question.tags.some((t) => weakTags.has(t))）が一度も真にならず、弱点ドメインの語彙カードが
  // 優先出題されなかった。エントリのtagsをQuestionへ反映する
  it('エントリのtagsがQuestion.tagsへ反映される（弱点タグ判定に使われるため空配列にしない）', () => {
    const question = vocabCardQuestion({
      word: 'submit',
      tags: ['会議・文書・オフィスコミュニケーション'],
      back: '提出する',
      phrase: 'Please submit the report.',
    })
    expect(question.tags).toEqual(['会議・文書・オフィスコミュニケーション'])
  })

  // T-345（K-86）: difficultyが全語一律1固定だったため、S/A/B（易→難）の実態を反映していなかった。
  // freqRankに応じた難易度を割り当てる
  it.each([
    ['S', 2],
    ['A', 3],
    ['B', 4],
  ] as const)('freqRank=%sのときdifficulty=%iになる', (freqRank, expectedDifficulty) => {
    const question = vocabCardQuestion(
      {
        word: 'submit',
        tags: ['会議・文書・オフィスコミュニケーション'],
        back: '提出する',
        phrase: 'Please submit the report.',
      },
      freqRank,
    )
    expect(question.difficulty).toBe(expectedDifficulty)
  })
})

describe('buildVocabCardQuestions / validateVocabCardQuestions', () => {
  it('200件のQuestionを組み立て、バリデータを通過する', () => {
    const questions = buildVocabCardQuestions()
    expect(questions).toHaveLength(200)
    expect(validateVocabCardQuestions(questions)).toEqual([])
  })

  it('IDが全て一意', () => {
    const ids = buildVocabCardQuestions().map((q) => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('freqRankやlevelBandが不正だとバリデータが検出する', () => {
    const questions = buildVocabCardQuestions()
    const tampered = [...questions.slice(1), { ...questions[0]!, levelBand: undefined as never }]
    const problems = validateVocabCardQuestions(tampered)
    expect(problems.length).toBeGreaterThan(0)
  })
})

describe('buildVocabCardDrafts', () => {
  it('T-30のGeneratedItemDraft形式（id/kind/preview/payload）で200件出力する', () => {
    const drafts = buildVocabCardDrafts()
    expect(drafts).toHaveLength(200)
    for (const d of drafts) {
      expect(d.kind).toBe('vocab_card')
      expect(d.preview.length).toBeGreaterThan(0)
      expect((d.payload as { format: string }).format).toBe('vocab_card')
    }
  })
})

describe.each([
  ['A', VOCAB_CARDS_A, WORDS_A, 730],
  ['B', VOCAB_CARDS_B, WORDS_B, 860],
] as const)('VOCAB_CARDS_%s（M2・T-59データ本体）', (rank, cards, words, expectedBand) => {
  it('200語あり、freqListの対応ランクと同じ200語（順不同で一致）', () => {
    expect(cards).toHaveLength(200)
    expect(new Set(cards.map((c) => c.word))).toEqual(new Set(words.map((w) => w.word)))
  })

  it('全語にback（和訳）とphrase（用例文）があり、phraseは単語自体を含む', () => {
    for (const entry of cards) {
      expect(entry.back.trim()).not.toBe('')
      expect(entry.phrase.trim()).not.toBe('')
      expect(entry.phrase.toLowerCase()).toContain(entry.word.toLowerCase())
    }
  })

  it('単語が重複しない', () => {
    const list = cards.map((c) => c.word.toLowerCase())
    expect(new Set(list).size).toBe(list.length)
  })

  it('文型の機械的重複が無い（対象語だけ置換した用例文が単調に重複していない）', () => {
    expect(validatePhraseVariety(cards)).toEqual([])
  })

  // T-345（K-86）: 全語にtagsが付与されていること（空配列だと弱点タグ判定が機能しない）
  it('全語にtagsが1件以上付与されている', () => {
    for (const entry of cards) {
      expect(entry.tags.length).toBeGreaterThan(0)
    }
  })

  it(`freqRank=${rank}・levelBand=${expectedBand}（J-22）でQuestionを組み立て、バリデータを通過する`, () => {
    expect(LEVEL_BAND_FOR_RANK[rank]).toBe(expectedBand)
    const questions = buildVocabCardQuestions(cards, rank)
    expect(questions).toHaveLength(200)
    expect(questions.every((q) => q.freqRank === rank)).toBe(true)
    expect(questions.every((q) => q.levelBand === expectedBand)).toBe(true)
    expect(validateVocabCardQuestions(questions, expectedBand)).toEqual([])
  })
})

describe('S/A/B語彙カード間で単語が重複しない（M2・T-59）', () => {
  it('全600語を通して重複語が無い', () => {
    const all = [...VOCAB_CARDS_S, ...VOCAB_CARDS_A, ...VOCAB_CARDS_B].map((c) =>
      c.word.toLowerCase(),
    )
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('validatePhraseVariety', () => {
  it('対象語だけ置換した文型が完全一致すると重複を検出する', () => {
    const entries = [
      {
        word: 'submit',
        tags: ['ビジネス'] as [string],
        back: '提出する',
        phrase: 'Please submit the report by Friday.',
      },
      {
        word: 'revise',
        tags: ['ビジネス'] as [string],
        back: '修正する',
        phrase: 'Please revise the report by Friday.',
      },
    ]
    const problems = validatePhraseVariety(entries)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('文型が異なれば重複扱いしない', () => {
    const entries = [
      {
        word: 'submit',
        tags: ['ビジネス'] as [string],
        back: '提出する',
        phrase: 'Please submit the report by Friday.',
      },
      {
        word: 'revise',
        tags: ['ビジネス'] as [string],
        back: '修正する',
        phrase: 'The manager asked her to revise the draft.',
      },
    ]
    expect(validatePhraseVariety(entries)).toEqual([])
  })
})
