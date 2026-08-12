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
    audioMeta: {
      accent: 'US',
      tts: true,
      voice: 'piper:en_US-lessac-medium',
      durationMs: 3000,
      // T-152: 音声のみモード対応済み（未設定だとルール⑦の警告が出る。既定を
      // 「対応済み」にしておき、非対応の検証は専用テストでoverrideする）
      responseOffsetsMs: [1000, 2000],
    },
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

// T-152: 音声のみモード（本試験形式。ADR 0008）で出題できない問題を列挙する。
// 部分移行中でもビルドを止めないため警告に留める
describe('checkAudioOnlyReadiness（⑦）', () => {
  it('responseOffsetsMs が無い audio_qa を警告する', () => {
    const problems = validateContentLint(
      [
        part2Question({
          audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 3000 },
        }),
      ],
      'pack-p2-test',
    )
    expect(problems).toContain('[警告] part2-test: 音声のみモード非対応（応答音声が未生成）')
  })

  it('responseOffsetsMs があれば警告しない', () => {
    const problems = validateContentLint([part2Question()], 'pack-p2-test')
    expect(problems.some((p) => p.includes('音声のみモード非対応'))).toBe(false)
  })

  it('audio_qa 以外は対象外', () => {
    const problems = validateContentLint([part5Question()], 'pack-p5-test')
    expect(problems.some((p) => p.includes('音声のみモード非対応'))).toBe(false)
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

  // T-237（docs/29 Q-79）: audio_set（Part3/4）もrotateSubQuestionChoicesが同じ
  // index%4ローテーションを使うため、text_passageと同じ決定的循環が起きる。対象formatを拡大した
  function audioSetCycleSet(setId: string, answers: string[]): Question {
    return {
      id: setId,
      part: 3,
      format: 'audio_set',
      difficulty: 2,
      tags: ['会話'],
      keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'S' }],
      audio: `audio/part34/${setId}.mp3`,
      audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 20000 },
      script: 'W: ... M: ...',
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
    }
  }

  it('audio_set（Part3/4）も同一差分の循環なら警告する（T-237でtext_passageから対象拡大）', () => {
    const questions = [
      audioSetCycleSet('p34-cyc-1', ['A', 'D', 'C', 'B']),
      audioSetCycleSet('p34-cyc-2', ['D', 'C', 'B', 'A']),
      audioSetCycleSet('p34-cyc-3', ['C', 'B', 'A', 'D']),
    ]
    const problems = validateContentLint(questions, 'pack-p34-test')
    expect(
      problems.some(
        (p) => p.startsWith('[警告]') && p.includes('決定的循環') && p.includes('audio_set'),
      ),
    ).toBe(true)
  })

  it('audio_setがシャッフル済みなら警告しない', () => {
    const questions = [
      audioSetCycleSet('p34-mix-1', ['B', 'B', 'D', 'A']),
      audioSetCycleSet('p34-mix-2', ['C', 'A', 'A', 'D']),
      audioSetCycleSet('p34-mix-3', ['D', 'B', 'C', 'C']),
    ]
    const problems = validateContentLint(questions, 'pack-p34-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })
})

describe('checkFlatAnswerKeyCycle（⑨。text_blank/audio_qaのパック全体を1設問列とした決定的循環検出。T-237）', () => {
  /** rotatePart5Choices相当（index%4）の決定的ローテーションをそのまま再現する（4択A〜D） */
  function cyclicPart5Questions(count: number): Question[] {
    const pattern = ['A', 'D', 'C', 'B']
    return Array.from({ length: count }, (_, i) =>
      part5Question({
        id: `p5-cyc-${i}`,
        choices: [
          { key: 'A', text: 'submit' },
          { key: 'B', text: 'submits' },
          { key: 'C', text: 'submitting' },
          { key: 'D', text: 'submitted' },
        ],
        answer: pattern[i % 4]!,
      }),
    )
  }

  /** rotatePart2Choices相当（index%3）の決定的ローテーションをそのまま再現する（3択） */
  function cyclicPart2Questions(count: number): Question[] {
    const pattern = ['A', 'C', 'B']
    return Array.from({ length: count }, (_, i) =>
      part2Question({
        id: `p2-cyc-${i}`,
        choices: [
          { key: 'A', text: 'By Friday.' },
          { key: 'B', text: 'Yes, I did.' },
          { key: 'C', text: 'In the meeting room.' },
        ],
        answer: pattern[i % 3]!,
      }),
    )
  }

  it('text_blank全パックが一定差分の循環（pack-p5-s-002等の再現）なら警告する', () => {
    const problems = validateContentLint(cyclicPart5Questions(20), 'pack-p5-test')
    expect(
      problems.some(
        (p) => p.startsWith('[警告]') && p.includes('決定的循環') && p.includes('text_blank'),
      ),
    ).toBe(true)
  })

  it('audio_qa全パックが一定差分の循環（pack-p2-s-001等の再現。3択ABC）なら警告する', () => {
    const problems = validateContentLint(cyclicPart2Questions(12), 'pack-p2-test')
    expect(
      problems.some(
        (p) => p.startsWith('[警告]') && p.includes('決定的循環') && p.includes('audio_qa'),
      ),
    ).toBe(true)
  })

  it('シャッフル済み（循環が崩れている）なら警告しない', () => {
    const pattern = ['A', 'B', 'A', 'D', 'C', 'C', 'B', 'D', 'A', 'B', 'C', 'D', 'A', 'D', 'B', 'C']
    const questions = pattern.map((answer, i) =>
      part5Question({
        id: `p5-mix-${i}`,
        choices: [
          { key: 'A', text: 'submit' },
          { key: 'B', text: 'submits' },
          { key: 'C', text: 'submitting' },
          { key: 'D', text: 'submitted' },
        ],
        answer,
      }),
    )
    const problems = validateContentLint(questions, 'pack-p5-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })

  it('8問未満なら判定しない（小規模フィクスチャの誤検出防止）', () => {
    const problems = validateContentLint(cyclicPart5Questions(6), 'pack-p5-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })

  it('正答キーが常に同じ（delta=0）は⑨の対象外（別種の問題であり誤検出防止のため対象を分ける）', () => {
    const questions = Array.from({ length: 20 }, (_, i) =>
      part5Question({ id: `p5-same-${i}`, answer: 'A' }),
    )
    const problems = validateContentLint(questions, 'pack-p5-test')
    expect(problems.some((p) => p.includes('決定的循環'))).toBe(false)
  })

  it('完全な循環でなくても大半（84%）が同一差分なら統計的に警告する（pack-p5-s-001の再現。T-339・K-75）', () => {
    const choices = [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
      { key: 'C', text: 'submitting' },
      { key: 'D', text: 'submitted' },
    ]
    // 20問連続A→D→C→Bの後、循環を崩す4問を挟む（docs/31 K-75の実測値=的中率83.7%相当）
    const cyclicPart = Array.from({ length: 20 }, (_, i) =>
      part5Question({ id: `p5-cyc-${i}`, choices, answer: ['A', 'D', 'C', 'B'][i % 4]! }),
    )
    const brokenPart = ['A', 'A', 'B', 'B'].map((answer, i) =>
      part5Question({ id: `p5-brk-${i}`, choices, answer }),
    )
    const questions = [...cyclicPart, ...brokenPart]
    const problems = validateContentLint(questions, 'pack-p5-test')
    expect(
      problems.some(
        (p) => p.startsWith('[警告]') && p.includes('text_blank') && p.includes('循環'),
      ),
    ).toBe(true)
  })

  it('シャッフル済み（最頻差分が5割程度）は統計判定でも警告しない（誤検出防止の下限確認）', () => {
    const pattern = ['A', 'B', 'A', 'D', 'C', 'C', 'B', 'D', 'A', 'B', 'C', 'D', 'A', 'D', 'B', 'C']
    const questions = pattern.map((answer, i) => part5Question({ id: `p5-mix2-${i}`, answer }))
    const problems = validateContentLint(questions, 'pack-p5-test')
    expect(problems.some((p) => p.includes('循環'))).toBe(false)
  })
})

describe('checkPart34SpeakerGenderConsistency（⑩。Part3話者ラベルと性別指示の整合検出。T-338・K-73）', () => {
  function part34SetQuestion(overrides: Partial<Question> = {}): Question {
    return {
      id: 'p3-gender-test',
      part: 3,
      format: 'audio_set',
      difficulty: 4,
      tags: ['意図推定'],
      keyVocab: [{ word: 'lease', sense: '賃貸借', freqRank: 'S' }],
      audio: 'audio/part34/p3-gender-test.mp3',
      audioMeta: { accent: 'US', tts: true, voice: 'v', durationMs: 20000 },
      script: "A: I saw the numbers already. B: Let's bring that to the meeting.",
      subQuestions: [
        {
          id: 'p3-gender-test-q1',
          question: 'What will the man do next?',
          choices: [
            { key: 'A', text: 'Bring it to the meeting' },
            { key: 'B', text: 'Cancel the meeting' },
          ],
          answer: 'A',
          explanation: '男性は"Let\'s bring that to the meeting"と述べている。',
          translation: '男性は次に何をしますか。',
        },
      ],
      ...overrides,
    }
  }

  it('引用文の話者（script上のA/B）と解説の性別ラベルが一致していれば警告しない', () => {
    const problems = validateContentLint([part34SetQuestion()], 'pack-p34-test')
    expect(problems.some((p) => p.includes('K-73') || p.includes('誤帰属'))).toBe(false)
  })

  it('B（男性）の発言を解説が「女性は」と誤帰属していたら警告する（K-73の再現）', () => {
    const question = part34SetQuestion({
      subQuestions: [
        {
          id: 'p3-gender-test-q1',
          question: 'What will the woman do next?',
          choices: [
            { key: 'A', text: 'Bring it to the meeting' },
            { key: 'B', text: 'Cancel the meeting' },
          ],
          answer: 'A',
          explanation: '女性は"Let\'s bring that to the meeting"と述べている。',
          translation: '女性は次に何をしますか。',
        },
      ],
    })
    const problems = validateContentLint([question], 'pack-p34-test')
    expect(problems.some((p) => p.startsWith('[警告]') && p.includes('誤帰属'))).toBe(true)
  })

  it('Part4（単一話者）は対象外で警告しない', () => {
    const question = part34SetQuestion({
      part: 4,
      script: 'Attention all staff: the meeting has been moved.',
      subQuestions: [
        {
          id: 'p4-gender-test-q1',
          question: 'What is the announcement about?',
          choices: [
            { key: 'A', text: 'A meeting change' },
            { key: 'B', text: 'A holiday schedule' },
          ],
          answer: 'A',
          explanation: '女性は"the meeting has been moved"と述べている。',
          translation: '発表は何についてですか。',
        },
      ],
    })
    const problems = validateContentLint([question], 'pack-p34-test')
    expect(problems.some((p) => p.includes('誤帰属'))).toBe(false)
  })
})

describe('checkChoiceTagConsistency（⑧。解説内の記号と品詞ラベルの不一致検出。T-236）', () => {
  it('記号と品詞ラベルが選択肢の実際の内容と一致していれば問題なし', () => {
    const q = part5Question({
      keyVocab: [{ word: 'client', sense: '顧客・依頼人', freqRank: 'S' }],
      question: 'The client we met yesterday wants to revise the contract.',
      choices: [
        { key: 'A', text: 'whose' },
        { key: 'B', text: 'which' },
        { key: 'C', text: 'where' },
        { key: 'D', text: 'whom' },
      ],
      answer: 'D',
      explanation:
        '目的格の関係代名詞whomが正しい。A所有格、B物を指す関係代名詞、C関係副詞は文脈に合わない。',
    })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })

  it('原形ラベルが実際と異なる記号に付いていれば検出する（pack-p5-s-001 part5-notifyの再現。修正前の実データと同一内容）', () => {
    const q = part5Question({
      keyVocab: [{ word: 'notify', sense: '通知する', freqRank: 'S' }],
      question: 'Employees will be ___ of the schedule change by email.',
      choices: [
        { key: 'A', text: 'notification' },
        { key: 'B', text: 'notified' },
        { key: 'C', text: 'notifying' },
        { key: 'D', text: 'notify' },
      ],
      answer: 'B',
      explanation:
        'will be の後で受動態を作る過去分詞notifiedが正しい（「知らされる」）。A原形、notifying現在分詞は能動的な形、notificationは名詞で受動態の形には合わない。',
    })
    const problems = validateContentLint([q], 'pack-p5-test')
    expect(problems.some((p) => p.includes('矛盾') && p.includes('A'))).toBe(true)
  })

  it('関係代名詞/関係副詞ラベルが入れ替わっていれば2件検出する（pack-p5-s-001 part5-clientの再現。修正前の実データと同一内容）', () => {
    const q = part5Question({
      keyVocab: [{ word: 'client', sense: '顧客・依頼人', freqRank: 'S' }],
      question: 'The client we met yesterday wants to revise the contract.',
      choices: [
        { key: 'A', text: 'whose' },
        { key: 'B', text: 'which' },
        { key: 'C', text: 'where' },
        { key: 'D', text: 'whom' },
      ],
      answer: 'D',
      explanation:
        '先行詞client（人）を受ける目的格の関係代名詞whomが正しい（口語ではwhoも可）。whose所有格、C物を指す関係代名詞、D関係副詞は文脈に合わない。',
    })
    const problems = validateContentLint([q], 'pack-p5-test')
    expect(problems.filter((p) => p.includes('矛盾')).length).toBe(2)
  })

  it('修正後（B物を指す関係代名詞・C関係副詞）は問題なし', () => {
    const q = part5Question({
      keyVocab: [{ word: 'client', sense: '顧客・依頼人', freqRank: 'S' }],
      question: 'The client we met yesterday wants to revise the contract.',
      choices: [
        { key: 'A', text: 'whose' },
        { key: 'B', text: 'which' },
        { key: 'C', text: 'where' },
        { key: 'D', text: 'whom' },
      ],
      answer: 'D',
      explanation:
        '先行詞client（人）を受ける目的格の関係代名詞whomが正しい（口語ではwhoも可）。whose所有格、B物を指す関係代名詞、C関係副詞は文脈に合わない。',
    })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })

  it('英単語"All"のように大文字始まりの英単語をA-D記号と誤認しない（false positive防止。pack-p5-s-001 part5-correspondenceの実データ）', () => {
    const q = part5Question({
      keyVocab: [{ word: 'correspondence', sense: '文書のやり取り', freqRank: 'S' }],
      question: 'All ___ with the client should be kept on file.',
      choices: [
        { key: 'A', text: 'corresponded' },
        { key: 'B', text: 'corresponding' },
        { key: 'C', text: 'correspondence' },
        { key: 'D', text: 'correspond' },
      ],
      answer: 'C',
      explanation:
        '数量形容詞Allの後には名詞correspondence（やり取り）が続く。correspond動詞原形、corresponded過去形/過去分詞、corresponding動名詞/現在分詞は名詞の位置には合わない。',
    })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })

  it('判定不能なラベル（正規表現の対象外の品詞語）は誤検出しない', () => {
    const q = part5Question({ explanation: 'Aは名詞で受動態の形には合わない。' })
    expect(validateContentLint([q], 'pack-p5-test')).toEqual([])
  })

  it('text_passageはsubQuestions単位で検証する', () => {
    const q = textPassageQuestion({
      subQuestions: [
        {
          id: 'p7s-test-q1',
          question: 'Which word fits?',
          choices: [
            { key: 'A', text: 'who' },
            { key: 'B', text: 'submit' },
          ],
          answer: 'A',
          explanation: 'B現在分詞が正しい。',
          translation: '和訳',
        },
      ],
    })
    const problems = validateContentLint([q], 'pack-p7s-test')
    expect(problems.some((p) => p.includes('矛盾') && p.includes('p7s-test-q1'))).toBe(true)
  })
})

describe('全パック一括検査（T-236完了条件: 実データの記号とラベルの矛盾がゼロ件になる）', () => {
  it('part5QuestionsS.ts修正後は矛盾検出が0件になる', () => {
    const problems = validateContentLint(buildPart5Questions(), 'pack-p5-s-001')
    expect(problems.filter((p) => p.includes('矛盾'))).toEqual([])
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
