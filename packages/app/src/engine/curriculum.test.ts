// T-51 完了条件のテスト（フェーズエンジン。正本: docs/13 3.1・3.2節）:
// - 4条件タイプ（srsRetention/accuracy/setAccuracy/examScore）の成立/不成立/分母不足
// - P1→P2・P2→P3・L1→L2 の移行判定
// - 初期割当（3レート帯）
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import type { SrsCardRecord } from '../db/schema'
import {
  CURRICULUM_TEMPLATES,
  evaluateAccuracy,
  evaluateExamScore,
  evaluatePhaseCriteria,
  evaluatePhaseTransition,
  evaluateSetAccuracy,
  evaluateSrsRetention,
  initialSeasonForRating,
  templateForSeason,
  validateCurriculumTemplate,
  type CriterionContext,
} from './curriculum'

function vocabCard(word: string, freqRank: 'S' | 'A' | 'B' | 'C'): Question {
  return {
    id: `vocab-${word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: word,
    phrase: `Please ${word} it.`,
    phraseAudio: `audio/${word}.mp3`,
    back: `${word}の意味`,
    freqRank,
    levelBand: 600,
  }
}

function part2Question(id: string, tags: string[] = []): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags,
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'When did you submit it? — Yesterday.',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'By email.' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

function part5Question(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word: 'attend', sense: '出席する', freqRank: 'A' }],
    question: 'Please ___ the meeting.',
    choices: [
      { key: 'A', text: 'attend' },
      { key: 'B', text: 'attends' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

function srsCard(
  refId: string,
  stage: number,
  introduced = true,
  graduated = false,
): SrsCardRecord {
  return {
    id: `vocab:${refId}`,
    refType: 'vocab',
    refId,
    stage,
    dueAt: 0,
    lapses: 0,
    introducedDate: introduced ? '2026-07-01' : null,
    graduatedAt: graduated ? 1000 : null,
    sourceQuestionId: null,
  }
}

function emptyContext(overrides: Partial<CriterionContext> = {}): CriterionContext {
  return {
    attempts: [],
    srsCards: [],
    examScores: [],
    questionLookup: new Map(),
    ...overrides,
  }
}

describe('evaluateSrsRetention', () => {
  it('導入済みが最低サンプル数未満なら分母不足で未達', () => {
    const questionLookup = new Map([['vocab-a', vocabCard('a', 'S')]])
    const ctx = emptyContext({
      srsCards: [srsCard('a', 5)],
      questionLookup,
    })
    const result = evaluateSrsRetention({ type: 'srsRetention', minRank: 'S', min: 0.85 }, ctx)
    expect(result.insufficientData).toBe(true)
    expect(result.met).toBe(false)
  })

  it('定着率が閾値以上なら成立', () => {
    const questionLookup = new Map(
      Array.from({ length: 20 }, (_, i) => [`vocab-w${i}`, vocabCard(`w${i}`, 'S')] as const),
    )
    // 20枚中18枚が定着済み（stage>=2）
    const srsCards = Array.from({ length: 20 }, (_, i) => srsCard(`w${i}`, i < 18 ? 2 : 0))
    const ctx = emptyContext({ srsCards, questionLookup })
    const result = evaluateSrsRetention({ type: 'srsRetention', minRank: 'S', min: 0.85 }, ctx)
    expect(result.insufficientData).toBe(false)
    expect(result.met).toBe(true)
  })

  it('定着率が閾値未満なら不成立', () => {
    const questionLookup = new Map(
      Array.from({ length: 20 }, (_, i) => [`vocab-w${i}`, vocabCard(`w${i}`, 'S')] as const),
    )
    const srsCards = Array.from({ length: 20 }, (_, i) => srsCard(`w${i}`, i < 5 ? 2 : 0))
    const ctx = emptyContext({ srsCards, questionLookup })
    const result = evaluateSrsRetention({ type: 'srsRetention', minRank: 'S', min: 0.85 }, ctx)
    expect(result.met).toBe(false)
  })

  it('対象外ランクのカードは分母に含めない', () => {
    const questionLookup = new Map([
      ['vocab-a', vocabCard('a', 'A')], // Aランク（対象外）
    ])
    const ctx = emptyContext({
      srsCards: Array.from({ length: 25 }, () => srsCard('a', 2)),
      questionLookup,
    })
    const result = evaluateSrsRetention({ type: 'srsRetention', minRank: 'S', min: 0.85 }, ctx)
    expect(result.insufficientData).toBe(true) // Sランク対象が0枚のため分母不足
  })
})

describe('evaluateAccuracy', () => {
  it('window の半分未満のattemptsなら分母不足', () => {
    const questionLookup = new Map([['p2-1', part2Question('p2-1')]])
    const ctx = emptyContext({
      attempts: Array.from({ length: 10 }, (_, i) => ({
        questionId: 'p2-1',
        isCorrect: true,
        answeredAt: i,
      })),
      questionLookup,
    })
    const result = evaluateAccuracy(
      { type: 'accuracy', scope: { part: 2 }, min: 0.7, window: 100 },
      ctx,
    )
    expect(result.insufficientData).toBe(true)
  })

  it('直近window問の正答率が閾値以上なら成立', () => {
    const questionLookup = new Map([['p2-1', part2Question('p2-1')]])
    const ctx = emptyContext({
      attempts: Array.from({ length: 60 }, (_, i) => ({
        questionId: 'p2-1',
        isCorrect: i < 45, // 45/60 = 75%
        answeredAt: i,
      })),
      questionLookup,
    })
    const result = evaluateAccuracy(
      { type: 'accuracy', scope: { part: 2 }, min: 0.7, window: 60 },
      ctx,
    )
    expect(result.insufficientData).toBe(false)
    expect(result.met).toBe(true)
  })

  it('vocab:/shadow:プレフィックスのattemptsは集計から除外される', () => {
    const questionLookup = new Map([['p2-1', part2Question('p2-1')]])
    const ctx = emptyContext({
      attempts: [
        ...Array.from({ length: 40 }, (_, i) => ({
          questionId: 'p2-1',
          isCorrect: true,
          answeredAt: i,
        })),
        ...Array.from({ length: 40 }, (_, i) => ({
          questionId: 'vocab:submit',
          isCorrect: false,
          answeredAt: 100 + i,
        })),
      ],
      questionLookup,
    })
    const result = evaluateAccuracy(
      { type: 'accuracy', scope: { part: 2 }, min: 0.7, window: 40 },
      ctx,
    )
    expect(result.insufficientData).toBe(false)
    expect(result.met).toBe(true) // vocab:分が混ざると不成立になるはずが除外されるので成立
  })

  it('タグscopeでの絞り込みができる（L1判定に使う）', () => {
    const questionLookup = new Map([['dict-1', part2Question('dict-1', ['弱形・連結'])]])
    const ctx = emptyContext({
      attempts: Array.from({ length: 40 }, (_, i) => ({
        questionId: 'dict-1',
        isCorrect: i < 32, // 80%
        answeredAt: i,
      })),
      questionLookup,
    })
    const result = evaluateAccuracy(
      { type: 'accuracy', scope: { tag: '弱形・連結' }, min: 0.75, window: 40 },
      ctx,
    )
    expect(result.met).toBe(true)
  })
})

describe('evaluateSetAccuracy', () => {
  function setAttempts(setId: string, correct: number, total: number, at: number) {
    return Array.from({ length: total }, (_, i) => ({
      questionId: `${setId}-q${i}`,
      isCorrect: i < correct,
      answeredAt: at,
    }))
  }

  /** audio_set（Part3/4）の親問題フィクスチャ。setAttemptsのsetIdと対にして使う */
  function audioSetQuestion(id: string, subCount = 3): Question {
    return {
      id,
      part: 3,
      format: 'audio_set',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      subQuestions: Array.from({ length: subCount }, (_, i) => ({
        id: `${id}-q${i}`,
        question: `設問${i}`,
        choices: [
          { key: 'A', text: '正解' },
          { key: 'B', text: '誤答' },
        ],
        answer: 'A',
      })),
    }
  }

  /** text_passage（Part6/7・読解）の親問題フィクスチャ。setAccuracyの分母に混ざってはいけない側 */
  function textPassageQuestion(id: string, subCount = 3): Question {
    return {
      id,
      part: 7,
      format: 'text_passage',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      passages: [{ id: `${id}-p1`, kind: 'article', text: '本文' }],
      subQuestions: Array.from({ length: subCount }, (_, i) => ({
        id: `${id}-q${i}`,
        question: `設問${i}`,
        choices: [
          { key: 'A', text: '正解' },
          { key: 'B', text: '誤答' },
        ],
        answer: 'A',
      })),
    }
  }

  it('windowSetsの半分未満のセット数なら分母不足', () => {
    const questionLookup = new Map<string, Question>([['set-1', audioSetQuestion('set-1')]])
    const ctx = emptyContext({ attempts: setAttempts('set-1', 3, 3, 0), questionLookup })
    const result = evaluateSetAccuracy({ type: 'setAccuracy', min: 0.6, windowSets: 20 }, ctx)
    expect(result.insufficientData).toBe(true)
  })

  // 何を防ぐか（T-308・K-37）: 3問中2問で中断したセットはtotal=2・correct=2に見え、
  // correct/total>=2/3の比率判定では「完全正解セット」と誤認される。親のsubQuestions数と
  // totalが一致するセット（全設問に解答済み）のみを移行判定に採用する
  it('途中放棄したセット（3問中2問で中断）のみの場合、分母不足になる（「完全正解」への誤認を防ぐ）', () => {
    const questionLookup = new Map<string, Question>([['set-1', audioSetQuestion('set-1', 3)]])
    // 3問中2問で放棄。除外されなければ correct/total = 2/2 = 100% で「完全正解」に誤認される
    const ctx = emptyContext({ attempts: setAttempts('set-1', 2, 2, 0), questionLookup })
    const result = evaluateSetAccuracy({ type: 'setAccuracy', min: 0.6, windowSets: 1 }, ctx)
    // 放棄セットが除外されれば有効なセットが0件になり、分母不足でmet=falseに強制される
    expect(result.insufficientData).toBe(true)
    expect(result.met).toBe(false)
  })

  it('直近windowSetsセットの正解率が閾値以上なら成立', () => {
    const setIds = Array.from({ length: 20 }, (_, i) => `set-${i}`)
    const attempts = setIds.map((id, i) => setAttempts(id, i < 15 ? 3 : 1, 3, i)).flat()
    const questionLookup = new Map<string, Question>(setIds.map((id) => [id, audioSetQuestion(id)]))
    const ctx = emptyContext({ attempts, questionLookup })
    const result = evaluateSetAccuracy({ type: 'setAccuracy', min: 0.6, windowSets: 20 }, ctx)
    expect(result.insufficientData).toBe(false)
    expect(result.met).toBe(true) // 15/20 = 75%
  })

  // T-185（Q-3）: aggregateSetsが親のformatを確認していなかったため、text_passage
  // （読解）の解答がaudio_setのセット正解率判定（P2→P3・L3→L4）に混入していた。
  it('親がtext_passage（読解）のサブ設問はセット集計から除外される', () => {
    // audio_setの実データは3セットのみ（本来は分母不足=windowSets20の半分=10未満）。
    // 読解17セット（全問正解）を混ぜれば20セットに達して分母不足を回避してしまうのが旧実装のバグ
    const audioSetIds = ['as-0', 'as-1', 'as-2']
    const audioAttempts = audioSetIds.map((id, i) => setAttempts(id, 3, 3, i)).flat()

    const readingIds = Array.from({ length: 17 }, (_, i) => `read-${i}`)
    const readingAttempts = readingIds.map((id, i) => setAttempts(id, 3, 3, 100 + i)).flat()

    const questionLookup = new Map<string, Question>([
      ...audioSetIds.map((id) => [id, audioSetQuestion(id)] as const),
      ...readingIds.map((id) => [id, textPassageQuestion(id)] as const),
    ])

    const ctx = emptyContext({
      attempts: [...audioAttempts, ...readingAttempts],
      questionLookup,
    })
    const result = evaluateSetAccuracy({ type: 'setAccuracy', min: 0.6, windowSets: 20 }, ctx)
    // 読解を除外した実データはaudio_set 3セットのみなので分母不足のまま（met=falseに強制される）
    expect(result.insufficientData).toBe(true)
    expect(result.met).toBe(false)
  })

  // T-185: evaluateAccuracyにあるisCountableAttempt（vocab:/shadow:除外）をevaluateSetAccuracyにも適用する
  it('vocab:/shadow:プレフィックスの解答は、-q番号形式に見えてもセット集計に混入しない', () => {
    const questionLookup = new Map<string, Question>([
      ['set-1', audioSetQuestion('set-1')],
      // 万一lookupに存在しても、prefixチェックで先に除外されるべき
      ['vocab:set-1', audioSetQuestion('vocab:set-1')],
    ])
    const attempts = [
      ...setAttempts('set-1', 3, 3, 0),
      ...setAttempts('vocab:set-1', 3, 3, 1), // プレフィックス付きの別セットもどき
    ]
    const ctx = emptyContext({ attempts, questionLookup })
    // 実セットは'set-1'の1件のみ。混入すれば2件と誤認してwindowSets=4の半分(2)を満たしてしまう
    const result = evaluateSetAccuracy({ type: 'setAccuracy', min: 0.6, windowSets: 4 }, ctx)
    expect(result.insufficientData).toBe(true)
  })
})

describe('evaluateExamScore', () => {
  it('minTotal以上の登録があれば成立', () => {
    const ctx = emptyContext({ examScores: [{ total: 780 }] })
    const result = evaluateExamScore({ type: 'examScore', minTotal: 760 }, ctx)
    expect(result.met).toBe(true)
    expect(result.insufficientData).toBe(false)
  })

  it('登録が無ければ不成立（分母不足ではない）', () => {
    const ctx = emptyContext()
    const result = evaluateExamScore({ type: 'examScore', minTotal: 760 }, ctx)
    expect(result.met).toBe(false)
    expect(result.insufficientData).toBe(false)
  })
})

describe('evaluatePhaseCriteria: 全条件AND', () => {
  it('1つでも未達なら不成立', () => {
    const ctx = emptyContext({ examScores: [{ total: 500 }] })
    const result = evaluatePhaseCriteria({ all: [{ type: 'examScore', minTotal: 760 }] }, ctx)
    expect(result.transitioned).toBe(false)
  })
})

describe('evaluatePhaseTransition: P1→P2・P2→P3・L1→L2', () => {
  function buildAchievingContext(part: 2 | 5, tag?: string): CriterionContext {
    const rankWords = Array.from({ length: 20 }, (_, i) => `w${i}`)
    const questionLookup = new Map<string, Question>(
      rankWords.map((w) => [`vocab-${w}`, vocabCard(w, 'S')]),
    )
    questionLookup.set('vocab-a2', vocabCard('a2', 'A'))
    const target =
      part === 2 ? part2Question('drill-1', tag ? [tag] : []) : part5Question('drill-1')
    questionLookup.set('drill-1', target)

    const srsCards = rankWords.map((w) => srsCard(w, 3))
    const attempts = Array.from({ length: 100 }, (_, i) => ({
      questionId: 'drill-1',
      isCorrect: i < 80,
      answeredAt: i,
    }))
    return { attempts, srsCards, examScores: [], questionLookup }
  }

  it('P1→P2: srsRetention(S)≥0.85 かつ accuracy(part2)≥0.70 で移行する', () => {
    const ctx = buildAchievingContext(2)
    const outcome = evaluatePhaseTransition('P1', 1, ctx)
    expect(outcome.season).toBe('P2')
    expect(outcome.seasonTransitioned).toBe(true)
  })

  it('P1で条件未達なら移行しない', () => {
    const ctx = emptyContext()
    const outcome = evaluatePhaseTransition('P1', 1, ctx)
    expect(outcome.season).toBe('P1')
    expect(outcome.seasonTransitioned).toBe(false)
  })

  it('P2→P3: srsRetention(A)・setAccuracy・accuracy(part5)を満たすと移行する', () => {
    const questionLookup = new Map<string, Question>()
    const aWords = Array.from({ length: 20 }, (_, i) => `a${i}`)
    for (const w of aWords) questionLookup.set(`vocab-${w}`, vocabCard(w, 'A'))
    questionLookup.set('p5-1', part5Question('p5-1'))
    // setAccuracy判定はaudio_setの親を引いてformatを確認する（T-185）ため、
    // ここでも各セットの親問題をlookupへ登録する
    for (let i = 0; i < 20; i++) {
      questionLookup.set(`set-${i}`, {
        id: `set-${i}`,
        part: 3,
        format: 'audio_set',
        difficulty: 2,
        tags: [],
        keyVocab: [],
        subQuestions: Array.from({ length: 3 }, (_, q) => ({
          id: `set-${i}-q${q}`,
          question: `設問${q}`,
          choices: [
            { key: 'A', text: '正解' },
            { key: 'B', text: '誤答' },
          ],
          answer: 'A',
        })),
      })
    }

    const srsCards = aWords.map((w) => srsCard(w, 3))
    const setAttempts = Array.from({ length: 20 }, (_, i) =>
      Array.from({ length: 3 }, (_, q) => ({
        questionId: `set-${i}-q${q}`,
        isCorrect: q < 3,
        answeredAt: i,
      })),
    ).flat()
    const p5Attempts = Array.from({ length: 100 }, (_, i) => ({
      questionId: 'p5-1',
      isCorrect: i < 80,
      answeredAt: i,
    }))
    const ctx: CriterionContext = {
      attempts: [...setAttempts, ...p5Attempts],
      srsCards,
      examScores: [],
      questionLookup,
    }
    const outcome = evaluatePhaseTransition('P2', 1, ctx)
    expect(outcome.season).toBe('P3')
    expect(outcome.seasonTransitioned).toBe(true)
  })

  it('P1→P3への飛び級はしない（1段階ずつ）', () => {
    // P1の条件を満たしていてもP2止まり（次回セッションでP2→P3を再評価する）
    const ctx = buildAchievingContext(2)
    const outcome = evaluatePhaseTransition('P1', 1, ctx)
    expect(outcome.season).toBe('P2')
  })

  it('L1→L2: 弱形・連結タグの正答率≥0.75で移行する', () => {
    const ctx = buildAchievingContext(2, '弱形・連結')
    const outcome = evaluatePhaseTransition('P3', 1, ctx)
    expect(outcome.listeningStage).toBe(2)
    expect(outcome.listeningTransitioned).toBe(true)
  })

  it('L4は終端で移行しない', () => {
    const ctx = emptyContext()
    const outcome = evaluatePhaseTransition('P3', 4, ctx)
    expect(outcome.listeningStage).toBe(4)
    expect(outcome.listeningTransitioned).toBe(false)
  })

  it('P3でexamScore登録によりseasonClearedがtrueになる', () => {
    const ctx = emptyContext({ examScores: [{ total: 800 }] })
    const outcome = evaluatePhaseTransition('P3', 4, ctx)
    expect(outcome.seasonCleared).toBe(true)
    expect(outcome.season).toBe('P3') // シーズン自体はP3のまま
  })
})

describe('initialSeasonForRating', () => {
  it('R<550はP1', () => {
    expect(initialSeasonForRating(400)).toBe('P1')
    expect(initialSeasonForRating(549)).toBe('P1')
  })

  it('550<=R<650はP2', () => {
    expect(initialSeasonForRating(550)).toBe('P2')
    expect(initialSeasonForRating(649)).toBe('P2')
  })

  it('R>=650はP3', () => {
    expect(initialSeasonForRating(650)).toBe('P3')
    expect(initialSeasonForRating(900)).toBe('P3')
  })
})

describe('curriculumConfig.json: 整合性検証', () => {
  it('全テンプレのallocation合計が1±0.01', () => {
    for (const t of CURRICULUM_TEMPLATES) {
      expect(() => validateCurriculumTemplate(t)).not.toThrow()
    }
  })

  it('不正なallocation合計は例外を投げる', () => {
    expect(() =>
      validateCurriculumTemplate({
        season: 'P1',
        allocation: { vocab: 0.9 },
        listeningBreakdown: { 1: {}, 2: {}, 3: {}, 4: {} },
      }),
    ).toThrow()
  })

  it('P1/P2/P3のテンプレが全て取得できる', () => {
    expect(templateForSeason('P1').season).toBe('P1')
    expect(templateForSeason('P2').season).toBe('P2')
    expect(templateForSeason('P3').season).toBe('P3')
  })

  // T-105（docs/24 3.3節）: 読解（Part6・Part7単一）配分の回帰ロック。
  // 数値自体は暫定値（ドッグフード実測で調整）だが、「P1に少量」「P2はP1より厚い」
  // 「P3は通常パックのreadingバケットを持たない（Part7複数はじっくり読解モード専用）」
  // という3.3節の構造は固定する
  it('P1はreadingバケットを少量持つ', () => {
    const reading = templateForSeason('P1').allocation.reading
    expect(reading).toBeGreaterThan(0)
  })

  it('P2のreading配分はP1より厚い（Part7単一の本格投入=3.3節）', () => {
    const p1Reading = templateForSeason('P1').allocation.reading ?? 0
    const p2Reading = templateForSeason('P2').allocation.reading ?? 0
    expect(p2Reading).toBeGreaterThan(p1Reading)
  })

  it('P3はreadingバケットを持たない（Part7複数は「じっくり読解」モード専用=T-108/T-109）', () => {
    expect(templateForSeason('P3').allocation.reading).toBeUndefined()
  })
})
