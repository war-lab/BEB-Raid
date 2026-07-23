// T-80/T-81完了条件のテスト（正本: docs/15 T-80・T-81行）:
// - 5ルールの単体テスト（①Part2応答部一致 ②keyVocab出現 ③カジュアル縮約 ④text_blank本文長 ⑤文頭偏り）
// - 全パック（実コンテンツ）に対する一括検査で、T-81修正後は①③の検出が0件になる
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import { validateContentLint } from './contentLint.js'
import { buildDictationQuestions } from './dictationQuestion.js'
import {
  buildKeyVocabSimilarQuestions,
  KEY_VOCAB_SIMILAR_ENTRIES,
  KEY_VOCAB_SIMILAR_ENTRIES_S2,
} from './keyVocabSimilar.js'
import { buildPart2EntriesS2, buildPart2Questions } from './part2Question.js'
import { buildPart34Questions } from './part34Question.js'
import { buildPart5EntriesS2, buildPart5Questions } from './part5Question.js'
import { buildShadowingQuestions } from './shadowingQuestion.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { buildVocabCardQuestions } from './vocabCard.js'

function part2Question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'part2-test',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: 'audio/part2/test.mp3',
    audioMeta: { accent: 'US', tts: true, voice: 'piper:en_US-lessac-medium', durationMs: 3000 },
    script: 'When should I submit it? — By Friday.',
    choices: [
      { key: 'A', text: 'By Friday.' },
      { key: 'B', text: 'Yes, I did.' },
    ],
    answer: 'A',
    explanation: '解説テキスト',
    translation: '和訳',
    ...overrides,
  }
}

function part5Question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'part5-test',
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    question: 'Please submit the report by Friday.',
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: '解説テキスト',
    translation: '和訳',
    ...overrides,
  }
}

function textPassageQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'p7s-test',
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'S' }],
    passages: [{ id: 'p7s-test-doc1', kind: 'email', text: 'Please review the attached invoice.' }],
    subQuestions: [
      {
        id: 'p7s-test-q1',
        question: 'What is attached to the email?',
        choices: [
          { key: 'A', text: 'An invoice' },
          { key: 'B', text: 'A resume' },
        ],
        answer: 'A',
        explanation: '解説テキスト',
        translation: '和訳',
      },
    ],
    ...overrides,
  }
}

describe('checkPart2ScriptChoiceMatch（①）', () => {
  it('script応答部と正解選択肢テキストが一致すれば問題なし', () => {
    expect(validateContentLint([part2Question()], 'pack-p2-test')).toEqual([])
  })

  it('script応答部と正解選択肢テキストが不一致なら検出する', () => {
    const q = part2Question({
      script: 'When should I submit it? — By the end of this week.',
      choices: [
        { key: 'A', text: 'By Friday.' },
        { key: 'B', text: 'Yes, I did.' },
      ],
    })
    const problems = validateContentLint([q], 'pack-p2-test')
    expect(problems.some((p) => p.includes('script応答部'))).toBe(true)
  })

  it('末尾句読点・大文字小文字の差異は無視して一致判定する', () => {
    const q = part2Question({
      script: 'When should I submit it? — by friday',
      choices: [{ key: 'A', text: 'By Friday.' }],
      answer: 'A',
    })
    expect(validateContentLint([q], 'pack-p2-test')).toEqual([])
  })

  it('audio_qa以外の形式は対象外', () => {
    const q = part5Question({
      script: '一致しない応答 — テスト',
    } as Partial<Question>)
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })
})

describe('checkKeyVocabAppearance（②）', () => {
  it('keyVocab.wordが本文に出現すれば問題なし', () => {
    expect(validateContentLint([part5Question()], 'pack-p5-test')).toEqual([])
  })

  it('keyVocab.wordが本文のどこにも出現しなければ検出する', () => {
    const q = part5Question({ keyVocab: [{ word: 'negotiate', sense: '交渉する', freqRank: 'A' }] })
    const problems = validateContentLint([q], 'pack-p5-test')
    expect(problems.some((p) => p.includes('keyVocab「negotiate」'))).toBe(true)
  })

  it('text_passage（Part6/7）はpassages本文＋subQuestionsのquestion/choicesを検査対象にする（T-107）', () => {
    // keyVocab「invoice」はpassages本文にのみ出現し、トップレベルのquestion/scriptは
    // text_passageに存在しない。shared-schemaのvalidateKeyVocabと同じ検査範囲でないと
    // 全件誤検出になってしまうための回帰テスト
    expect(validateContentLint([textPassageQuestion()], 'pack-p7s-test')).toEqual([])
  })

  it('text_passageでkeyVocabがpassages/subQuestionsのどこにも出現しなければ検出する', () => {
    const q = textPassageQuestion({
      keyVocab: [{ word: 'negotiate', sense: '交渉する', freqRank: 'A' }],
    })
    const problems = validateContentLint([q], 'pack-p7s-test')
    expect(problems.some((p) => p.includes('keyVocab「negotiate」'))).toBe(true)
  })
})

describe('checkCasualContractions（③）', () => {
  it('標準的な表記なら問題なし', () => {
    expect(validateContentLint([part2Question()], 'pack-p2-test')).toEqual([])
  })

  it.each(['Wanna', 'Gonna', 'Didja', "D'you", 'Gotta', 'Lemme'])(
    'カジュアル縮約「%s」を検出する',
    (word) => {
      const q = part2Question({ script: `${word} help me with this? — Sure.` })
      const problems = validateContentLint([q], 'pack-p2-test')
      expect(problems.some((p) => p.includes('カジュアル縮約'))).toBe(true)
    },
  )

  it('大文字小文字を無視して検出する', () => {
    const q = part2Question({ script: 'wanna grab lunch? — Sure.' })
    const problems = validateContentLint([q], 'pack-p2-test')
    expect(problems.some((p) => p.includes('カジュアル縮約'))).toBe(true)
  })

  it('タイポグラフィ引用符（’）の縮約も検出する（実データにD’youの形で混在）', () => {
    const q = part2Question({ script: 'D’you know the schedule? — Yes.' })
    const problems = validateContentLint([q], 'pack-p2-test')
    expect(problems.some((p) => p.includes('カジュアル縮約'))).toBe(true)
  })
})

describe('checkTextBlankLength（④。警告のみ）', () => {
  it('difficulty3以上で本文12語以上なら問題なし', () => {
    const q = part5Question({
      difficulty: 4,
      question:
        'Please submit the quarterly report to the accounting department by Friday afternoon.',
    })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })

  it('difficulty3以上で本文12語未満なら警告する', () => {
    const q = part5Question({ difficulty: 4, question: 'Please submit the report.' })
    const problems = validateContentLint([q], 'pack-p5-test')
    expect(problems.some((p) => p.startsWith('[警告]') && p.includes('本文'))).toBe(true)
  })

  it('difficulty2以下は本文長チェックの対象外', () => {
    const q = part5Question({ difficulty: 2, question: 'Please submit it.' })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })
})

describe('checkOpeningPhraseDiversity（⑤。警告のみ）', () => {
  it('文頭の使い回しが5%以下なら問題なし', () => {
    const questions = Array.from({ length: 20 }, (_, i) =>
      part5Question({ id: `p5-${i}`, question: `Sentence number ${i} goes here today.` }),
    )
    expect(validateContentLint(questions, 'pack-p5-test')).toEqual([])
  })

  it('同一文頭3語が5%を超えて偏っていれば警告する', () => {
    const skewed = Array.from({ length: 18 }, (_, i) =>
      part5Question({ id: `p5-skewed-${i}`, question: `Please submit the report number ${i}.` }),
    )
    const rest = Array.from({ length: 2 }, (_, i) =>
      part5Question({ id: `p5-rest-${i}`, question: `Different opening phrase here ${i}.` }),
    )
    const problems = validateContentLint([...skewed, ...rest], 'pack-p5-test')
    expect(problems.some((p) => p.startsWith('[警告]') && p.includes('文頭'))).toBe(true)
  })
})

describe('checkAnswerKeyCycle（⑥。text_passageの正答キー決定的循環検出。T-107クロスレビューMF-1）', () => {
  /** 指定した正答キー列を持つtext_passageセットを組み立てる */
  function cycleSet(setId: string, answers: string[]): Question {
    return textPassageQuestion({
      id: setId,
      subQuestions: answers.map((answer, i) => ({
        id: `${setId}-q${i + 1}`,
        question: `Question ${i + 1} of ${setId}?`,
        choices: [
          { key: 'A', text: 'An invoice' },
          { key: 'B', text: 'A resume' },
          { key: 'C', text: 'A receipt' },
          { key: 'D', text: 'A catalog' },
        ],
        answer,
        explanation: '解説テキスト',
        translation: '和訳',
      })),
    })
  }

  it('全セットが同一差分の循環（rotateTextPassageChoicesの素の出力）なら警告する', () => {
    const questions = [
      cycleSet('p6-cyc-1', ['A', 'D', 'C', 'B']),
      cycleSet('p6-cyc-2', ['D', 'C', 'B', 'A']),
      cycleSet('p6-cyc-3', ['C', 'B', 'A', 'D']),
    ]
    const problems = validateContentLint(questions, 'pack-p6-test')
    expect(problems.some((p) => p.startsWith('[警告]') && p.includes('決定的循環'))).toBe(true)
  })

  it('シャッフル済み（循環が崩れている）なら警告しない', () => {
    const questions = [
      cycleSet('p6-mix-1', ['B', 'B', 'D', 'A']),
      cycleSet('p6-mix-2', ['C', 'A', 'A', 'D']),
      cycleSet('p6-mix-3', ['D', 'B', 'C', 'C']),
    ]
    const problems = validateContentLint(questions, 'pack-p6-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })

  it('対象セットが3セット未満なら判定しない（小規模フィクスチャの誤検出防止）', () => {
    const questions = [
      cycleSet('p6-few-1', ['A', 'D', 'C', 'B']),
      cycleSet('p6-few-2', ['D', 'C', 'B', 'A']),
    ]
    const problems = validateContentLint(questions, 'pack-p6-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })
})

describe('全パック一括検査（T-81完了条件: T-80ルール①③の検出ゼロ）', () => {
  it('J-43（S1選択肢書き換え）・カジュアル縮約6問修正（T-81）により①③の検出が0件になる', () => {
    const packs: Array<{ id: string; questions: Question[] }> = [
      { id: 'pack-vocab-s-001', questions: buildVocabCardQuestions() },
      { id: 'pack-vocab-a-001', questions: buildVocabCardQuestions(VOCAB_CARDS_A, 'A') },
      { id: 'pack-vocab-b-001', questions: buildVocabCardQuestions(VOCAB_CARDS_B, 'B') },
      { id: 'pack-p2-s-001', questions: buildPart2Questions() },
      { id: 'pack-p2-s-002', questions: buildPart2Questions(buildPart2EntriesS2()) },
      { id: 'pack-p5-s-001', questions: buildPart5Questions() },
      { id: 'pack-p5-s-002', questions: buildPart5Questions(buildPart5EntriesS2()) },
      { id: 'pack-key-vocab-similar-s-001', questions: buildKeyVocabSimilarQuestions() },
      {
        id: 'pack-key-vocab-similar-s-002',
        questions: buildKeyVocabSimilarQuestions(KEY_VOCAB_SIMILAR_ENTRIES_S2),
      },
      { id: 'pack-p34-s-001', questions: buildPart34Questions() },
      { id: 'pack-dict-s-001', questions: buildDictationQuestions() },
      { id: 'pack-shadow-s-001', questions: buildShadowingQuestions() },
    ]
    // KEY_VOCAB_SIMILAR_ENTRIESのimportが未使用にならないよう参照だけしておく
    // （buildKeyVocabSimilarQuestions()自体は内部でこの定数を既定値として使う）
    expect(KEY_VOCAB_SIMILAR_ENTRIES.length).toBeGreaterThan(0)

    const allProblems = packs.flatMap(({ id, questions }) => validateContentLint(questions, id))
    const scriptMismatches = allProblems.filter((p) => p.includes('script応答部'))
    const casualContractions = allProblems.filter((p) => p.includes('カジュアル縮約'))

    // T-81完了条件: T-80で検出した既知の①43問・③6問が、S1選択肢書き換え・S2縮約修正により0件になる
    expect(scriptMismatches.length).toBe(0)
    expect(casualContractions.length).toBe(0)
  })
})
