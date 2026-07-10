// T-13: クイックパック生成のテスト（03の1.3、02の2.1・2.3）。
// 完了条件: 3分=SRSのみ / 7分=SRS+弱点ドリル / 15分=増量。
// SRS期限16枚以上あるとき15枚で打ち切られ残りが次パックに回る。
// あわせて T-11 の「誤答→key語彙SRS→次回パックで類題が優先出題」の一連を通しで検証する
import 'fake-indexeddb/auto'
import type { KeyVocab, Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import { processWrongAnswer } from './keyVocab'
import {
  buildDrillCandidates,
  computeAllocationCounts,
  generateQuickPack,
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

/** 語彙・Part2・Part5 が十分にあるプール */
function bigPool(): Question[] {
  return [
    ...Array.from({ length: 30 }, (_, i) => vocabCard(`v-${i}`, `word-${i}`)),
    ...Array.from({ length: 15 }, (_, i) => part2Question(`p2-${i}`)),
    ...Array.from({ length: 15 }, (_, i) => part5Question(`p5-${i}`)),
  ]
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

describe('computeAllocationCounts: 固定配分（語彙50/Part2 25/Part5 25 = J-2）', () => {
  it('割り切れる枠はそのまま、端数は最大剰余法で配る（合計=枠数）', () => {
    expect(computeAllocationCounts(12)).toEqual({ vocab: 6, part2: 3, part5: 3 })
    expect(computeAllocationCounts(5)).toEqual({ vocab: 3, part2: 1, part5: 1 })
    const counts = computeAllocationCounts(7)
    expect(counts.vocab + counts.part2 + counts.part5).toBe(7)
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
      questions: bigPool(),
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
    const pool = bigPool()
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
      questions: bigPool(),
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
      allocation: { vocab: 0.5, part2: 0.2, part5: 0.2 }, // 合計0.9（不正）
    }
    expect(() => validateQuickPackConfig(broken)).toThrow(/allocation/)
  })

  it('1±0.01 の範囲内なら許容される', () => {
    const ok: QuickPackConfig = {
      ...QUICK_PACK_CONFIG,
      allocation: { vocab: 0.5, part2: 0.25, part5: 0.255 }, // 合計1.005
    }
    expect(() => validateQuickPackConfig(ok)).not.toThrow()
  })
})
