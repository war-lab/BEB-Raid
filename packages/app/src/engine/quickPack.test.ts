// T-13: クイックパック生成のテスト（03の1.3、02の2.1・2.3）。
// 完了条件: 3分=SRSのみ / 7分=SRS+弱点ドリル / 15分=増量。
// SRS期限16枚以上あるとき15枚で打ち切られ残りが次パックに回る。
// あわせて T-11 の「誤答→key語彙SRS→次回パックで類題が優先出題」の一連を通しで検証する
import 'fake-indexeddb/auto'
import type { KeyVocab, Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import { templateForSeason } from './curriculum'
import { processWrongAnswer } from './keyVocab'
import {
  buildDrillCandidates,
  computeAllocationCounts,
  drillCategoryOf,
  generateQuickPack,
  getRecentlyCorrectQuestionIds,
  isReadingAllocatable,
  QUICK_PACK_CONFIG,
  validateQuickPackConfig,
  weightedSample,
  type QuickPackConfig,
} from './quickPack'
import { addSrsCard } from './srs'
import { recomputeTagStats } from './tagStats'
import type { QuestionLookup } from './types'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`quickpack-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const NOW = new Date(2026, 6, 9, 8, 0).getTime()
const YESTERDAY = new Date(2026, 6, 8, 8, 0).getTime()
/** 先頭から順に選ぶ決定的な乱数 */
const firstPick = () => 0

function kv(word: string): KeyVocab {
  return { word, sense: `${word} の意味`, freqRank: 'S' }
}

function vocabCard(id: string, word: string): Question {
  return { id, part: 0, format: 'vocab_card', difficulty: 2, tags: [], keyVocab: [], front: word }
}

function part2Question(id: string, tags: string[] = [], words: string[] = []): Question {
  return { id, part: 2, format: 'audio_qa', difficulty: 3, tags, keyVocab: words.map(kv) }
}

function part5Question(id: string, tags: string[] = [], words: string[] = []): Question {
  return { id, part: 5, format: 'text_blank', difficulty: 3, tags, keyVocab: words.map(kv) }
}

/** Part6/Part7単一（text_passage・passages 1件）。T-105（docs/24 3.3節）の読解配分テスト用 */
function readingSingleQuestion(id: string, part: 6 | 7 = 7, tags: string[] = []): Question {
  return {
    id,
    part,
    format: 'text_passage',
    difficulty: 3,
    tags,
    keyVocab: [kv(`${id}-word`)],
    passages: [{ id: `${id}-p1`, kind: 'email', text: `${id}の本文` }],
    subQuestions: [
      { id: `${id}-q0`, question: '設問0', choices: [{ key: 'A', text: 'a' }], answer: 'A' },
    ],
  }
}

/** Part7複数パッセージ（text_passage・passages 2〜3件）。通常パックに絶対に入らないことのテスト用 */
function readingMultiQuestion(id: string, passageCount: 2 | 3 = 2): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 4,
    tags: ['cross-reference'],
    keyVocab: [kv(`${id}-word`)],
    passages: Array.from({ length: passageCount }, (_, i) => ({
      id: `${id}-p${i}`,
      kind: 'email',
      text: `${id}の本文${i}`,
    })),
    subQuestions: [
      { id: `${id}-q0`, question: '設問0', choices: [{ key: 'A', text: 'a' }], answer: 'A' },
    ],
  }
}

/** 語彙・Part2・Part5 が十分にあるプール */
function bigPool(): Question[] {
  return [
    ...Array.from({ length: 30 }, (_, i) => vocabCard(`v-${i}`, `word-${i}`)),
    ...Array.from({ length: 15 }, (_, i) => part2Question(`p2-${i}`)),
    ...Array.from({ length: 15 }, (_, i) => part5Question(`p5-${i}`)),
  ]
}

/**
 * bigPool に加え、指定した単語（SRSカードのrefId）に対応するvocab_card問題を足したプール。
 * isServable（実在するQuestionを要求するフィルタ）を通すため、テストのSRSカードには
 * 対応する語彙カード問題が必要（v-*系の既存drill候補より後ろに足し、drillの抽選結果には影響させない）
 */
function poolWithVocabFor(words: string[]): Question[] {
  return [...bigPool(), ...words.map((w, i) => vocabCard(`due-vc-${i}`, w))]
}

/** 期限到来済みの導入済み語彙カードを n 枚仕込む */
async function seedDueCards(db: BebRaidDatabase, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await db.srsCards.put({
      id: `vocab:due-${i}`,
      refType: 'vocab',
      refId: `due-${i}`,
      stage: 0,
      dueAt: YESTERDAY + i, // 昇順が安定するようずらす
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
  }
}

describe('computeAllocationCounts: 固定配分（語彙40/Part2 25/Part5 25/読解10 = J-2・T-105）', () => {
  it('割り切れる枠はそのまま、端数は最大剰余法で配る（合計=枠数）', () => {
    expect(computeAllocationCounts(12)).toEqual({ vocab: 5, part2: 3, part5: 3, reading: 1 })
    expect(computeAllocationCounts(5)).toEqual({ vocab: 2, part2: 1, part5: 1, reading: 1 })
    const counts = computeAllocationCounts(7)
    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(7)
  })
})

describe('weightedSample', () => {
  it('非復元で count 件選ぶ。在庫が足りなければ全件', () => {
    const items = ['a', 'b', 'c']
    expect(weightedSample(items, () => 1, 2, firstPick)).toEqual(['a', 'b'])
    expect(weightedSample(items, () => 1, 10, firstPick)).toEqual(['a', 'b', 'c'])
  })
})

describe('generateQuickPack: 時間帯別の構成（02の2.1）', () => {
  it('3分パックは SRSのみ（期限超過→新規の順。ドリルは入らない）', async () => {
    const db = newDb()
    await seedDueCards(db, 3)
    for (let i = 0; i < 12; i++) {
      await addSrsCard(db, { refType: 'vocab', refId: `new-${i}`, now: YESTERDAY + i })
    }
    const pack = await generateQuickPack(db, {
      duration: 3,
      questions: poolWithVocabFor([
        'due-0',
        'due-1',
        'due-2',
        ...Array.from({ length: 12 }, (_, i) => `new-${i}`),
      ]),
      now: NOW,
      rng: firstPick,
    })

    expect(pack.items).toHaveLength(10) // totalItems(3分)=10
    expect(pack.items.slice(0, 3).every((i) => i.reason.type === 'srsDue')).toBe(true)
    expect(pack.items.slice(3).every((i) => i.reason.type === 'srsNew')).toBe(true)
    expect(pack.items.every((i) => i.mode === 'srs')).toBe(true) // ドリルなし
  })

  it('7分パックは SRS＋弱点ドリル。15分はさらに増量', async () => {
    const db = newDb()
    await seedDueCards(db, 2)
    const pool = poolWithVocabFor(['due-0', 'due-1'])
    const pack7 = await generateQuickPack(db, {
      duration: 7,
      questions: pool,
      now: NOW,
      rng: firstPick,
    })
    const pack15 = await generateQuickPack(db, {
      duration: 15,
      questions: pool,
      now: NOW,
      rng: firstPick,
    })

    expect(pack7.items).toHaveLength(20)
    expect(pack7.items.filter((i) => i.kind === 'drill')).toHaveLength(18)
    expect(pack15.items).toHaveLength(40)
    expect(pack15.items.length).toBeGreaterThan(pack7.items.length)

    // ドリルは固定配分どおり（18枠 → 語彙9/Part2 4or5/Part5 4or5）
    const drills7 = pack7.items.filter((i) => i.kind === 'drill')
    const vocabDrills = drills7.filter((i) => i.questionId?.startsWith('v-'))
    expect(vocabDrills).toHaveLength(9)
  })

  it('SRS期限16枚以上のとき15枚で打ち切られ、残りは srsOverflow として次パックに回る', async () => {
    const db = newDb()
    await seedDueCards(db, 16)
    await addSrsCard(db, { refType: 'vocab', refId: 'fresh', now: NOW - 1000 })
    const pack = await generateQuickPack(db, {
      duration: 7,
      questions: poolWithVocabFor([...Array.from({ length: 16 }, (_, i) => `due-${i}`), 'fresh']),
      now: NOW,
      rng: firstPick,
    })

    const srsDue = pack.items.filter((i) => i.reason.type === 'srsDue')
    expect(srsDue).toHaveLength(QUICK_PACK_CONFIG.srsCapPerPack) // 15
    expect(pack.srsOverflow).toBe(1)
    // 復習滞留（16枚）なので新規は自動停止（T-09 と接続）
    expect(pack.items.filter((i) => i.reason.type === 'srsNew')).toHaveLength(0)
    // 残り枠はドリルで埋まる
    expect(pack.items.filter((i) => i.kind === 'drill')).toHaveLength(5)
  })
})

describe('T-11 との通し: 誤答→key語彙SRS→類題の優先出題', () => {
  it('誤答した問題のkey単語を持つ類題が重み1.5・理由付きでドリルに入る', async () => {
    const db = newDb()
    const source = part5Question('q-src', ['品詞'], ['submit'])
    const similar = part5Question('q-sim', [], ['submit'])
    const pool = [source, similar, ...bigPool()]

    // 誤答 → vocab:submit（発生元 q-src）と question:q-src が SRS に入る
    await processWrongAnswer(db, source, YESTERDAY)

    // 候補の重み: 類題 q-sim は1.5倍・keyVocabReview。発生元 q-src は類題があるのでブーストされない
    const candidates = await buildDrillCandidates(db, pool, new Set())
    const sim = candidates.find((c) => c.question.id === 'q-sim')
    expect(sim?.weight).toBe(QUICK_PACK_CONFIG.priorityWeight)
    expect(sim?.reason).toEqual({ type: 'keyVocabReview', word: 'submit', isSameQuestion: false })
    const src = candidates.find((c) => c.question.id === 'q-src')
    expect(src?.reason.type).not.toBe('keyVocabReview')

    // 次回パック: 類題がドリルとして出題され、出題理由が付く
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions: pool,
      now: NOW,
      rng: firstPick,
    })
    const simItem = pack.items.find((i) => i.questionId === 'q-sim')
    expect(simItem?.kind).toBe('drill')
    expect(simItem?.reason).toEqual({
      type: 'keyVocabReview',
      word: 'submit',
      isSameQuestion: false,
    })
  })

  it('類題在庫ゼロの場合のみ同一問題（発生元）がフォールバックとして候補になる', async () => {
    const db = newDb()
    const source = part5Question('q-src', [], ['rare-word'])
    const pool = [source, ...bigPool()] // rare-word を持つ類題は無い

    await processWrongAnswer(db, source, YESTERDAY)
    const candidates = await buildDrillCandidates(db, pool, new Set())
    const src = candidates.find((c) => c.question.id === 'q-src')
    expect(src?.reason).toEqual({ type: 'keyVocabReview', word: 'rare-word', isSameQuestion: true })
    expect(src?.weight).toBe(QUICK_PACK_CONFIG.priorityWeight)
  })
})

describe('T-168: 直近に正解した問題の再出題抑制（J-94。docs/27 のS-18）', () => {
  /** 指定の問題に「正解した」attemptを1件仕込む */
  async function seedCorrectAttempt(
    db: BebRaidDatabase,
    questionId: string,
    answeredAt: number,
  ): Promise<void> {
    await db.attempts.add({
      id: `a-${questionId}-${answeredAt}`,
      questionId,
      mode: 'solo',
      isCorrect: true,
      responseMs: 5000,
      isTimeout: false,
      isGuess: false,
      answeredAt,
    })
  }

  it('直近24時間に正解した問題を集める（誤答・24時間より前は含めない）', async () => {
    const db = newDb()
    await seedCorrectAttempt(db, 'q-recent', NOW - 60 * 60 * 1000) // 1時間前
    await seedCorrectAttempt(db, 'q-old', NOW - 30 * 60 * 60 * 1000) // 30時間前
    await db.attempts.add({
      id: 'a-wrong',
      questionId: 'q-wrong',
      mode: 'solo',
      isCorrect: false,
      responseMs: 5000,
      isTimeout: false,
      isGuess: false,
      answeredAt: NOW - 60 * 60 * 1000,
    })

    const ids = await getRecentlyCorrectQuestionIds(db, NOW)

    expect([...ids]).toEqual(['q-recent'])
  })

  // 何を防ぐか: 前のセッションで正解した問題が次のセッションでまた出ること。
  // 除外にしないのは、小さいプール（Part2は150問）で候補が枯れるため（J-94）
  it('直近に正解した問題は重みが下がる（候補からは外れない）', async () => {
    const db = newDb()
    const target = part5Question('q-target')
    const pool = [target, ...bigPool()]
    await seedCorrectAttempt(db, 'q-target', NOW - 60 * 60 * 1000)

    const recentlyCorrect = await getRecentlyCorrectQuestionIds(db, NOW)
    const candidates = await buildDrillCandidates(db, pool, new Set(), undefined, recentlyCorrect)

    const targetCandidate = candidates.find((c) => c.question.id === 'q-target')
    // 候補には残る（除外ではない）
    expect(targetCandidate).toBeDefined()
    expect(targetCandidate!.weight).toBeCloseTo(QUICK_PACK_CONFIG.recentlyCorrectWeight)
    // 直近に解いていない問題は重み1のまま
    const other = candidates.find((c) => c.question.id !== 'q-target' && c.category === 'part5')
    expect(other!.weight).toBe(1)
  })

  it('誤答した問題は抑制しない（SRS・類題の経路で意図的に再出題するため）', async () => {
    const db = newDb()
    const target = part5Question('q-wrong-target')
    const pool = [target, ...bigPool()]
    await db.attempts.add({
      id: 'a-wrong-1',
      questionId: 'q-wrong-target',
      mode: 'solo',
      isCorrect: false,
      responseMs: 5000,
      isTimeout: false,
      isGuess: false,
      answeredAt: NOW - 60 * 60 * 1000,
    })

    const recentlyCorrect = await getRecentlyCorrectQuestionIds(db, NOW)
    const candidates = await buildDrillCandidates(db, pool, new Set(), undefined, recentlyCorrect)

    expect(candidates.find((c) => c.question.id === 'q-wrong-target')!.weight).toBe(1)
  })

  it('直近正解が空なら重みは従来どおり（回帰）', async () => {
    const db = newDb()
    const pool = bigPool()
    const candidates = await buildDrillCandidates(db, pool, new Set(), undefined, new Set())

    expect(candidates.every((c) => c.weight === 1)).toBe(true)
  })

  it('候補が要求問数に足りないときは直近に正解した問題も出る', async () => {
    const db = newDb()
    // part5が1問しかないプール。その1問を直近に正解している
    const only = part5Question('q-only')
    await seedCorrectAttempt(db, 'q-only', NOW - 60 * 60 * 1000)

    const pack = await generateQuickPack(db, {
      duration: 7,
      questions: [only],
      now: NOW,
      rng: firstPick,
    })

    // 重みが下がっていても、他に候補が無ければ出題される（除外していないことの担保）
    expect(pack.items.some((i) => i.questionId === 'q-only')).toBe(true)
  })

  it('recentlyCorrectWeight が0以下の設定は読み込み時に弾く（事実上の除外を防ぐ）', () => {
    expect(() =>
      validateQuickPackConfig({ ...QUICK_PACK_CONFIG, recentlyCorrectWeight: 0 }),
    ).toThrow(/recentlyCorrectWeight/)
  })
})

describe('T-12 との接続: 弱点タグの重み付け', () => {
  it('弱点タグを持つ問題は重み1.5・理由 weakTag でドリルに入る', async () => {
    const db = newDb()
    const weakQuestion = part5Question('q-weak', ['品詞'])
    const pool = [weakQuestion, ...bigPool()]
    const lookup: QuestionLookup = new Map(pool.map((q) => [q.id, q]))

    // 品詞タグを弱点にする（正答率 2/6 ≒ 33%）
    let n = 0
    const attempt = (isCorrect: boolean): AttemptRecord => ({
      id: `a-${++n}`,
      questionId: 'q-weak',
      mode: 'solo',
      isCorrect,
      responseMs: 5000,
      isTimeout: false,
      isGuess: false,
      answeredAt: YESTERDAY + n,
    })
    await db.attempts.bulkAdd([true, true, false, false, false, false].map(attempt))
    await recomputeTagStats(db, lookup)

    const candidates = await buildDrillCandidates(db, pool, new Set())
    const weak = candidates.find((c) => c.question.id === 'q-weak')
    expect(weak?.weight).toBe(QUICK_PACK_CONFIG.priorityWeight)
    expect(weak?.reason).toEqual({ type: 'weakTag', tag: '品詞' })

    const pack = await generateQuickPack(db, {
      duration: 7,
      questions: pool,
      now: NOW,
      rng: firstPick,
    })
    expect(pack.items.some((i) => i.reason.type === 'weakTag')).toBe(true)
  })
})

describe('出題候補に無い問題SRSカードの扱い', () => {
  it('問題がプールに無いカードはスキップされ、カード自体は残る', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'question:not-cached',
      refType: 'question',
      refId: 'not-cached',
      stage: 0,
      dueAt: YESTERDAY,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const pack = await generateQuickPack(db, {
      duration: 3,
      questions: bigPool(),
      now: NOW,
      rng: firstPick,
    })
    expect(pack.items.filter((i) => i.kind === 'srsQuestion')).toHaveLength(0)
    expect(pack.srsOverflow).toBe(0)
    expect(await db.srsCards.get('question:not-cached')).toBeDefined()
  })
})

describe('validateQuickPackConfig（レビューフォローアップ3.8節: allocation合計の検証）', () => {
  it('同梱の quickPackConfig.json は検証を通る', () => {
    expect(() => validateQuickPackConfig(QUICK_PACK_CONFIG)).not.toThrow()
  })

  it('allocation の合計が1から大きくずれる設定は拒否される', () => {
    const broken: QuickPackConfig = {
      ...QUICK_PACK_CONFIG,
      allocation: { vocab: 0.5, part2: 0.2, part5: 0.2, reading: 0 }, // 合計0.9（不正）
    }
    expect(() => validateQuickPackConfig(broken)).toThrow(/allocation/)
  })

  it('1±0.01 の範囲内なら許容される', () => {
    const ok: QuickPackConfig = {
      ...QUICK_PACK_CONFIG,
      allocation: { vocab: 0.5, part2: 0.25, part5: 0.255, reading: 0 }, // 合計1.005
    }
    expect(() => validateQuickPackConfig(ok)).not.toThrow()
  })

  // 何を防ぐか（T-311・K-41）: 以下は従来検証が無く、不正値がJSON差し替え時に
  // 静かに素通りしていた
  it('priorityWeightが0以下は拒否される', () => {
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, priorityWeight: 0 })).toThrow(
      /priorityWeight/,
    )
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, priorityWeight: -1 })).toThrow(
      /priorityWeight/,
    )
  })

  it('newCardShareが0未満・1超は拒否される', () => {
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, newCardShare: -0.1 })).toThrow(
      /newCardShare/,
    )
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, newCardShare: 1.1 })).toThrow(
      /newCardShare/,
    )
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, newCardShare: 0 })).not.toThrow()
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, newCardShare: 1 })).not.toThrow()
  })

  it('srsCapPerPackが負は拒否される', () => {
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, srsCapPerPack: -1 })).toThrow(
      /srsCapPerPack/,
    )
    expect(() => validateQuickPackConfig({ ...QUICK_PACK_CONFIG, srsCapPerPack: 0 })).not.toThrow()
  })

  it('durations.*.totalItemsが0以下は拒否される', () => {
    const broken: QuickPackConfig = {
      ...QUICK_PACK_CONFIG,
      durations: {
        ...QUICK_PACK_CONFIG.durations,
        '3': { ...QUICK_PACK_CONFIG.durations['3'], totalItems: 0 },
      },
    }
    expect(() => validateQuickPackConfig(broken)).toThrow(/totalItems/)
  })
})

// ---------------------------------------------------------------------------
// M2（T-52）: フェーズ配分・リスニング内訳
// ---------------------------------------------------------------------------

function dictationQuestion(id: string, tags: string[] = []): Question {
  return { id, part: 2, format: 'dictation', difficulty: 2, tags, keyVocab: [] }
}

function shadowingQuestion(id: string, tags: string[] = []): Question {
  return { id, part: 3, format: 'shadowing', difficulty: 2, tags, keyVocab: [] }
}

function audioSetQuestion(id: string, tags: string[] = []): Question {
  return { id, part: 3, format: 'audio_set', difficulty: 2, tags, keyVocab: [] }
}

/** M2用の大きなプール（各カテゴリ十分な在庫。format→count確認用にlookupも返す） */
function m2Pool(): { questions: Question[]; lookup: QuestionLookup } {
  const questions = [
    ...Array.from({ length: 30 }, (_, i) => vocabCard(`v-${i}`, `word-${i}`)),
    ...Array.from({ length: 30 }, (_, i) => part5Question(`p5-${i}`)),
    ...Array.from({ length: 30 }, (_, i) => part2Question(`p2-${i}`)),
    ...Array.from({ length: 30 }, (_, i) => dictationQuestion(`dict-${i}`)),
    ...Array.from({ length: 30 }, (_, i) => shadowingQuestion(`shadow-${i}`)),
    ...Array.from({ length: 30 }, (_, i) => audioSetQuestion(`set-${i}`)),
  ]
  return { questions, lookup: new Map(questions.map((q) => [q.id, q])) }
}

function countByFormat(
  pack: Awaited<ReturnType<typeof generateQuickPack>>,
  lookup: QuestionLookup,
  format: string,
): number {
  return pack.items.filter(
    (i) => i.questionId !== null && lookup.get(i.questionId)?.format === format,
  ).length
}

describe('generateQuickPack: M2フェーズ配分（P1/P2/P3で配分が変わる）', () => {
  it('P1: 語彙50/リスニング25/part5 25、L1内訳（dictation40/shadowing30/part2 30）で配分される', async () => {
    const db = newDb()
    const { questions, lookup } = m2Pool()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    expect(pack.items).toHaveLength(40)
    expect(countByFormat(pack, lookup, 'vocab_card')).toBe(20) // 40*0.5
    expect(countByFormat(pack, lookup, 'text_blank')).toBe(10) // 40*0.25
    // リスニング枠10（40*0.25）をL1内訳（dict40/shadow30/part2 30）で分割。
    // shadowingはドリル割当対象外（専用画面ShadowingScreenの担当）のため、
    // その枠3は在庫不足補填としてリスニング枠内の他形式（firstPickでは残余先頭のdictation）へ流れる
    expect(countByFormat(pack, lookup, 'dictation')).toBe(7)
    expect(countByFormat(pack, lookup, 'shadowing')).toBe(0)
    expect(countByFormat(pack, lookup, 'audio_qa')).toBe(3)
  })

  it('P2: 語彙25/リスニング40/part5 35 で配分が変わる（P1と異なる）', async () => {
    const db = newDb()
    const { questions } = m2Pool()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions,
      phase: 'P2',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const p1Pack = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    expect(pack.items.length).toBe(p1Pack.items.length)
    // 配分自体が異なることの確認（同一構成にはならない）
    const p2Vocab = pack.items.filter((i) => i.questionId?.startsWith('v-')).length
    const p1Vocab = p1Pack.items.filter((i) => i.questionId?.startsWith('v-')).length
    expect(p2Vocab).not.toBe(p1Vocab)
  })

  it('L3: リスニング内訳がaudioSet70/part2 30に切り替わり、audio_setが出題される', async () => {
    const db = newDb()
    const { questions, lookup } = m2Pool()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 3,
      now: NOW,
      rng: firstPick,
    })
    expect(countByFormat(pack, lookup, 'audio_set')).toBeGreaterThan(0)
    expect(countByFormat(pack, lookup, 'dictation')).toBe(0) // L3内訳にdictationは無い
  })

  it('L1ではdictationが出題され（shadowingは割当対象外）、L3ではaudio_setが出題される（対比）', async () => {
    const { questions, lookup } = m2Pool()
    const l1Pack = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const l3Pack = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 3,
      now: NOW,
      rng: firstPick,
    })
    expect(countByFormat(l1Pack, lookup, 'dictation')).toBeGreaterThan(0)
    // shadowingはDrillScreenに描画分岐が無く進行不能になるため割り当てない（専用画面の担当）
    expect(countByFormat(l1Pack, lookup, 'shadowing')).toBe(0)
    expect(countByFormat(l3Pack, lookup, 'audio_set')).toBeGreaterThan(0)
  })

  it('phase不在時はM1挙動と一致する（回帰）', async () => {
    const db = newDb()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions: bigPool(),
      now: NOW,
      rng: firstPick,
    })
    // M1の固定配分（語彙50/Part2 25/Part5 25）どおりの件数になる
    expect(pack.items).toHaveLength(40)
  })

  // 何を防ぐか: shadowing形式がドリルセッションに混入すると、DrillScreenに描画分岐が無く
  // 「問題文もボタンも出ない空白＋中断→再開しても同位置で詰む」進行不能バグになる（実機再現済み）
  it('shadowing形式はドリルに割り当てられず、リスニング枠は目減りせず他形式へ再配分される', async () => {
    const db = newDb()
    const { questions, lookup } = m2Pool()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1, // L1内訳はshadowing 30%を含む定義（13の3.2節）だが割当されない
      now: NOW,
      rng: firstPick,
    })
    expect(countByFormat(pack, lookup, 'shadowing')).toBe(0)
    // リスニング枠10（40*0.25）は目減りせず、枠内の他形式で埋まる（配分は目標値・在庫優先の方針）
    const listeningTotal =
      countByFormat(pack, lookup, 'dictation') +
      countByFormat(pack, lookup, 'audio_qa') +
      countByFormat(pack, lookup, 'audio_set')
    expect(listeningTotal).toBe(10)
    expect(pack.items).toHaveLength(40) // パック全体も目減りしない
  })

  it('P3で弱点タグを持つshadowingもweaknessバケットに入らない（除外はweakness判定より優先）', async () => {
    const db = newDb()
    const { questions } = m2Pool()
    const tagged = questions.map((q) =>
      q.format === 'shadowing' ? { ...q, tags: ['weak-tag'] } : q,
    )
    await db.tagStats.put({ tag: 'weak-tag', windowCorrect: 1, windowTotal: 10 }) // 正答率10%<閾値
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions: tagged,
      phase: 'P3',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const taggedLookup = new Map(tagged.map((q) => [q.id, q]))
    expect(countByFormat(pack, taggedLookup, 'shadowing')).toBe(0)
  })

  it('P3: 弱点タグを持つ問題がweaknessバケットとして優先的に出題される', async () => {
    const db = newDb()
    const { questions } = m2Pool()
    // 一部のpart5問題に弱点タグを付与し、tagStatsで弱点判定させる
    const weakQuestions = questions.map((q, i) =>
      q.format === 'text_blank' && i % 3 === 0 ? { ...q, tags: ['weak-tag'] } : q,
    )
    await db.tagStats.put({ tag: 'weak-tag', windowCorrect: 1, windowTotal: 10 }) // 正答率10%<60%閾値
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions: weakQuestions,
      phase: 'P3',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const weakLookup = new Map(weakQuestions.map((q) => [q.id, q]))
    const weakTagCount = pack.items.filter(
      (i) => i.questionId !== null && weakLookup.get(i.questionId)?.tags.includes('weak-tag'),
    ).length
    expect(weakTagCount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// T-105（docs/24 3.3節・ADR 0006 判断2）: 読解（Part6・Part7単一）の配分組込。
// Part7複数パッセージは通常パックの対象外を必ず担保する
// ---------------------------------------------------------------------------

/** m2Poolに読解（単一10件・複数5件）を足したプール。lookupも読解込みで返す */
function m2PoolWithReading(): { questions: Question[]; lookup: QuestionLookup } {
  const { questions: base } = m2Pool()
  const questions = [
    ...base,
    ...Array.from({ length: 10 }, (_, i) => readingSingleQuestion(`read-single-${i}`)),
    ...Array.from({ length: 5 }, (_, i) => readingMultiQuestion(`read-multi-${i}`)),
  ]
  return { questions, lookup: new Map(questions.map((q) => [q.id, q])) }
}

function countReadingItems(
  pack: Awaited<ReturnType<typeof generateQuickPack>>,
  lookup: QuestionLookup,
): { single: number; multi: number } {
  let single = 0
  let multi = 0
  for (const item of pack.items) {
    if (item.questionId === null) continue
    const q = lookup.get(item.questionId)
    if (q?.format !== 'text_passage') continue
    if (isReadingAllocatable(q)) single += 1
    else multi += 1
  }
  return { single, multi }
}

describe('drillCategoryOf / isReadingAllocatable: text_passageの分類（T-105）', () => {
  it('単一パッセージ（passages 1件）はreadingカテゴリ', () => {
    const q = readingSingleQuestion('r-1')
    expect(isReadingAllocatable(q)).toBe(true)
    expect(drillCategoryOf(q)).toBe('reading')
  })

  it('複数パッセージ（passages 2件以上）はreading対象外（drillCategoryOfはnull）', () => {
    const q2 = readingMultiQuestion('r-2', 2)
    const q3 = readingMultiQuestion('r-3', 3)
    expect(isReadingAllocatable(q2)).toBe(false)
    expect(isReadingAllocatable(q3)).toBe(false)
    expect(drillCategoryOf(q2)).toBeNull()
    expect(drillCategoryOf(q3)).toBeNull()
  })
})

describe('generateQuickPack: 読解の配分組込（M1固定配分。フェーズ未指定=quickPackConfig.json）', () => {
  it('7分・15分パックにPart6/Part7単一が「なぜ出たか」ラベル付きで混ざる', async () => {
    const db = newDb()
    const { questions, lookup } = m2PoolWithReading()
    const pack7 = await generateQuickPack(db, { duration: 7, questions, now: NOW, rng: firstPick })
    const pack15 = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      now: NOW,
      rng: firstPick,
    })

    const r7 = countReadingItems(pack7, lookup)
    const r15 = countReadingItems(pack15, lookup)
    expect(r7.single).toBeGreaterThan(0)
    expect(r15.single).toBeGreaterThan(0)
    // 15分は7分より総枠が大きい分、読解も絶対数で増える（「厚めに」=3.3節。
    // 配分%は同一でdurationのtotalItemsスケールにより絶対数が増える設計）
    expect(r15.single).toBeGreaterThan(r7.single)

    const readingItem = pack7.items.find(
      (i) => lookup.get(i.questionId ?? '')?.format === 'text_passage',
    )
    expect(readingItem?.reason).toBeDefined() // allocation/weakTag/keyVocabReviewのいずれか
  })

  it('3分パックには読解を含まない（SRSのみ・現状維持=3.3節）', async () => {
    const db = newDb()
    const { questions, lookup } = m2PoolWithReading()
    const pack = await generateQuickPack(db, { duration: 3, questions, now: NOW, rng: firstPick })
    expect(countReadingItems(pack, lookup).single).toBe(0)
  })

  it('Part7複数パッセージ（passages 2件以上）は絶対に通常パックに入らない', async () => {
    const { questions, lookup } = m2PoolWithReading()
    for (const duration of [3, 7, 15] as const) {
      const pack = await generateQuickPack(newDb(), {
        duration,
        questions,
        now: NOW,
        rng: firstPick,
      })
      expect(countReadingItems(pack, lookup).multi).toBe(0)
    }
  })
})

describe('generateQuickPack: 読解の配分組込（M2フェーズ配分。curriculumConfig.json）', () => {
  it('P1: Part6/Part7単一が少量導入される', async () => {
    const db = newDb()
    const { questions, lookup } = m2PoolWithReading()
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    expect(countReadingItems(pack, lookup).single).toBeGreaterThan(0)
    expect(countReadingItems(pack, lookup).multi).toBe(0)
  })

  it('P2はP1よりPart7単一の配分率が厚い（本格投入=3.3節）', async () => {
    const { questions } = m2PoolWithReading()
    const p1Pack = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      phase: 'P1',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const p2Pack = await generateQuickPack(newDb(), {
      duration: 15,
      questions,
      phase: 'P2',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    expect(templateForSeason('P1').allocation.reading).toBeLessThan(
      templateForSeason('P2').allocation.reading ?? 0,
    )
    const lookup = new Map(questions.map((q) => [q.id, q]))
    const p1Reading = countReadingItems(p1Pack, lookup).single
    const p2Reading = countReadingItems(p2Pack, lookup).single
    expect(p2Reading).toBeGreaterThanOrEqual(p1Reading)
  })

  it('P3テンプレはreadingバケットを持たない（Part7複数はじっくり読解モード専用=T-108/T-109。3.3節）', () => {
    expect(templateForSeason('P3').allocation.reading).toBeUndefined()
  })

  it('P3でもPart7複数パッセージは出題されない（弱点タグ付きでもweaknessバケットへ流れない）', async () => {
    const db = newDb()
    const { questions } = m2PoolWithReading()
    const tagged = questions.map((q) =>
      isReadingAllocatable(q) || q.format !== 'text_passage'
        ? q
        : { ...q, tags: ['cross-reference'] },
    )
    await db.tagStats.put({ tag: 'cross-reference', windowCorrect: 1, windowTotal: 10 })
    const pack = await generateQuickPack(db, {
      duration: 15,
      questions: tagged,
      phase: 'P3',
      listeningStage: 1,
      now: NOW,
      rng: firstPick,
    })
    const taggedLookup = new Map(tagged.map((q) => [q.id, q]))
    expect(countReadingItems(pack, taggedLookup).multi).toBe(0)
  })
})
