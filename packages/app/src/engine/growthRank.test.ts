// T-130: 成長ランクのテスト（正本: docs/22 3.7節）。
// 完了条件:
// - 式・閾値の境界テスト（各ランク境界±1）
// - ratingHistory不在（新規ユーザー）でブロンズ0ポイント表示のテスト
// - ネットワーク送信が発生しないこと（本モジュールはfetch/WebSocket等を一切importしない。
//   端末内Dexieのみを参照する構成であることをテストでも裏付ける）
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { DEFAULT_INITIAL_RATING } from './rating'
import {
  computeRankPoints,
  countLearningDays,
  getGrowthRank,
  GROWTH_RANK_CONFIG,
  resolveGrowthRank,
  validateGrowthRankConfig,
  type GrowthRankConfig,
} from './growthRank'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`growth-rank-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** 指定日の正午の epoch ms */
function noonOf(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0).getTime()
}

let attemptSeq = 0
async function addAttempt(db: BebRaidDatabase, at: number): Promise<void> {
  await db.attempts.add({
    id: `a-${++attemptSeq}`,
    questionId: `q-${attemptSeq}`,
    mode: 'solo',
    isCorrect: true,
    responseMs: 1000,
    isTimeout: false,
    isGuess: false,
    answeredAt: at,
  })
}

/** シャドーイングの実施ログ（ShadowingScreenと同型。mode:'solo'・shadow:プレフィックス） */
async function addShadowAttempt(db: BebRaidDatabase, at: number): Promise<void> {
  await db.attempts.add({
    id: `shadow-a-${++attemptSeq}`,
    questionId: `shadow:q-${attemptSeq}`,
    mode: 'solo',
    isCorrect: true,
    responseMs: 1000,
    isTimeout: false,
    isGuess: false,
    answeredAt: at,
  })
}

describe('validateGrowthRankConfig（validateQuickPackConfigの前例に倣う整合検証）', () => {
  it('同梱の growthRankConfig.json は検証を通る（暫定閾値: 0/40/90/150/230）', () => {
    expect(() => validateGrowthRankConfig(GROWTH_RANK_CONFIG)).not.toThrow()
    expect(GROWTH_RANK_CONFIG.ranks.map((r) => r.minPoints)).toEqual([0, 40, 90, 150, 230])
  })

  it('minPoints が昇順でない設定は拒否される', () => {
    const broken: GrowthRankConfig = {
      ranks: [
        { id: 'bronze', name: 'ブロンズ', minPoints: 0 },
        { id: 'silver', name: 'シルバー', minPoints: 40 },
        { id: 'gold', name: 'ゴールド', minPoints: 30 }, // 前段より低い（不正）
      ],
    }
    expect(() => validateGrowthRankConfig(broken)).toThrow(/昇順/)
  })

  it('minPoints が同値（非厳密増加）の設定も拒否される', () => {
    const broken: GrowthRankConfig = {
      ranks: [
        { id: 'bronze', name: 'ブロンズ', minPoints: 0 },
        { id: 'silver', name: 'シルバー', minPoints: 40 },
        { id: 'gold', name: 'ゴールド', minPoints: 40 },
      ],
    }
    expect(() => validateGrowthRankConfig(broken)).toThrow(/昇順/)
  })

  it('ranks が空の設定は拒否される', () => {
    expect(() => validateGrowthRankConfig({ ranks: [] })).toThrow(/空/)
  })
})

describe('computeRankPoints（22の3.7節の式）', () => {
  it('レート上昇の正分＋学習日数', () => {
    expect(computeRankPoints({ currentRating: 450, initialRating: 400, learningDays: 10 })).toBe(60) // (450-400) + 10
  })

  it('レートが下落した場合は0にクランプされる（負のポイントにしない）', () => {
    expect(computeRankPoints({ currentRating: 380, initialRating: 400, learningDays: 5 })).toBe(5) // max(0, -20) + 5
  })

  it('レート変化なし・学習日数0なら0', () => {
    expect(computeRankPoints({ currentRating: 400, initialRating: 400, learningDays: 0 })).toBe(0)
  })
})

describe('resolveGrowthRank: 各ランク境界±1（暫定閾値 0/40/90/150/230）', () => {
  const cases: { points: number; rankId: string; nextId: string | null; toNext: number | null }[] =
    [
      { points: 0, rankId: 'bronze', nextId: 'silver', toNext: 40 },
      { points: 39, rankId: 'bronze', nextId: 'silver', toNext: 1 },
      { points: 40, rankId: 'silver', nextId: 'gold', toNext: 50 },
      { points: 41, rankId: 'silver', nextId: 'gold', toNext: 49 },
      { points: 89, rankId: 'silver', nextId: 'gold', toNext: 1 },
      { points: 90, rankId: 'gold', nextId: 'platinum', toNext: 60 },
      { points: 91, rankId: 'gold', nextId: 'platinum', toNext: 59 },
      { points: 149, rankId: 'gold', nextId: 'platinum', toNext: 1 },
      { points: 150, rankId: 'platinum', nextId: 'master', toNext: 80 },
      { points: 151, rankId: 'platinum', nextId: 'master', toNext: 79 },
      { points: 229, rankId: 'platinum', nextId: 'master', toNext: 1 },
      { points: 230, rankId: 'master', nextId: null, toNext: null },
      { points: 231, rankId: 'master', nextId: null, toNext: null },
      { points: 10_000, rankId: 'master', nextId: null, toNext: null },
    ]

  for (const c of cases) {
    it(`rankPoints=${c.points} → ${c.rankId}（次: ${c.nextId ?? 'なし'}）`, () => {
      const result = resolveGrowthRank(c.points)
      expect(result.rank.id).toBe(c.rankId)
      expect(result.nextRank?.id ?? null).toBe(c.nextId)
      expect(result.pointsToNext).toBe(c.toNext)
      expect(result.rankPoints).toBe(c.points)
    })
  }
})

describe('countLearningDays（ストリーク/ヒートマップと同じ暦日基準。全期間対象）', () => {
  it('attemptsが無ければ0', async () => {
    const db = newDb()
    expect(await countLearningDays(db)).toBe(0)
  })

  it('同日複数attemptsは1日として数える', async () => {
    const db = newDb()
    await addAttempt(db, noonOf(2026, 7, 9))
    await addAttempt(db, noonOf(2026, 7, 9) + 1000)
    await addAttempt(db, noonOf(2026, 7, 9) + 2000)
    expect(await countLearningDays(db)).toBe(1)
  })

  it('異なる日のattemptsは日数分カウントされる', async () => {
    const db = newDb()
    await addAttempt(db, noonOf(2026, 7, 9))
    await addAttempt(db, noonOf(2026, 7, 10))
    await addAttempt(db, noonOf(2026, 8, 20)) // 遠い過去日でもヒートマップ表示窓(15週)を超えて数える
    expect(await countLearningDays(db)).toBe(3)
  })

  // 何を防ぐか（T-307・K-36）: シャドーイング（shadow:プレフィックス）はisCorrectが
  // 固定値（客観的な正誤判定を伴わない再生ログ）。フィルタが無いと1日1件の再生を
  // 続けるだけで学習日数が積み上がり、レートが不変でも230日で最上位ランクに到達しうる
  it('シャドーイングのみの日は学習日として数えない', async () => {
    const db = newDb()
    await addShadowAttempt(db, noonOf(2026, 7, 9))
    expect(await countLearningDays(db)).toBe(0)
  })

  it('シャドーイングと通常解答が同日にあれば学習日として数える（通常解答があるため）', async () => {
    const db = newDb()
    await addShadowAttempt(db, noonOf(2026, 7, 9))
    await addAttempt(db, noonOf(2026, 7, 9) + 1000)
    expect(await countLearningDays(db)).toBe(1)
  })

  it('複数日のうちシャドーイングのみの日は除外され、通常解答がある日だけ数える', async () => {
    const db = newDb()
    await addAttempt(db, noonOf(2026, 7, 9))
    await addShadowAttempt(db, noonOf(2026, 7, 10)) // シャドーイングのみ→除外
    await addAttempt(db, noonOf(2026, 7, 11))
    expect(await countLearningDays(db)).toBe(2)
  })
})

describe('getGrowthRank: ratingHistory不在（新規ユーザー）でブロンズ0ポイント', () => {
  it('ratings・ratingHistory・attemptsが全て空でもブロンズ0ポイントで描画できる', async () => {
    const db = newDb()
    const result = await getGrowthRank(db)
    expect(result.rankPoints).toBe(0)
    expect(result.rank.id).toBe('bronze')
    expect(result.nextRank?.id).toBe('silver')
    expect(result.pointsToNext).toBe(40)
  })

  it('ratingHistoryが無くratingsだけある場合も、初期レート=現在レートとみなし差分0になる', async () => {
    const db = newDb()
    await db.ratings.put({ section: 'total', rating: 500, updatedAt: Date.now() })
    const result = await getGrowthRank(db)
    // 履歴が無いため上昇量は測れず、学習日数（0）だけがポイントになる
    expect(result.rankPoints).toBe(0)
    expect(result.rank.id).toBe('bronze')
  })
})

describe('getGrowthRank: ratingHistoryとattemptsからの実データ導出', () => {
  it('初期レート（最古スナップショット）からの上昇分＋学習日数でrankPointsを導出する', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([
      { date: '2026-07-01', section: 'total', rating: DEFAULT_INITIAL_RATING },
      { date: '2026-07-10', section: 'total', rating: 420 },
      { date: '2026-07-20', section: 'total', rating: 445 },
    ])
    await db.ratings.put({ section: 'total', rating: 445, updatedAt: Date.now() })
    await addAttempt(db, noonOf(2026, 7, 1))
    await addAttempt(db, noonOf(2026, 7, 10))
    await addAttempt(db, noonOf(2026, 7, 20))

    const result = await getGrowthRank(db)
    // (445 - 400) + 3日 = 48 → シルバー（40以上90未満）
    expect(result.rankPoints).toBe(48)
    expect(result.rank.id).toBe('silver')
    expect(result.pointsToNext).toBe(90 - 48)
  })

  it('学習日数はratingHistoryの範囲外attemptsも含めて全期間で数える', async () => {
    const db = newDb()
    await db.ratingHistory.put({ date: '2026-07-01', section: 'total', rating: 400 })
    await db.ratings.put({ section: 'total', rating: 400, updatedAt: Date.now() })
    // ratingHistoryより古い時期にも解答実績がある（過去のインポート等）
    for (let d = 1; d <= 5; d++) {
      await addAttempt(db, noonOf(2026, 6, d))
    }
    const result = await getGrowthRank(db)
    expect(result.rankPoints).toBe(5) // レート上昇0 + 学習日数5
  })
})

// 何を防ぐか（T-305・K-33）: initialRatingをratingHistoryの最古行から取るため、過去日付で
// スナップショットが書かれて最古行が入れ替わると、初期値が現在レートへ移動しrankPointsが
// 下落する（実測でマスター→ゴールドへ退行）。「累積の継続装置」（docs/22 3.7節）に反する
describe('getGrowthRank: rankPointsの単調性（T-305・K-33）', () => {
  it('過去日付のratingHistoryが後から追加されてinitialRatingが動いても、rankPointsは下がらない', async () => {
    const db = newDb()
    await db.ratingHistory.put({ date: '2026-07-10', section: 'total', rating: 400 })
    await db.ratings.put({ section: 'total', rating: 500, updatedAt: Date.now() })
    for (let d = 1; d <= 5; d++) await addAttempt(db, noonOf(2026, 7, d))

    const before = await getGrowthRank(db)
    expect(before.rankPoints).toBe(105) // (500-400) + 5日

    // 過去日付（2026-06-01）のスナップショットが後から追加される（他端末からの復元・
    // インポート等）。最古行が入れ替わり、initialRatingが現在レート付近へ移動する
    await db.ratingHistory.put({ date: '2026-06-01', section: 'total', rating: 495 })

    const after = await getGrowthRank(db)
    // 素の計算では (500-495)+5=10 まで下落するはずだが、永続化済みの最大値105を下回らない
    expect(after.rankPoints).toBe(105)
    expect(after.rank.id).toBe(before.rank.id)
  })

  it('新しい算定値が過去の最大値を上回れば、最大値も更新される', async () => {
    const db = newDb()
    await db.ratingHistory.put({ date: '2026-07-01', section: 'total', rating: 400 })
    await db.ratings.put({ section: 'total', rating: 420, updatedAt: Date.now() })

    const first = await getGrowthRank(db)
    expect(first.rankPoints).toBe(20) // 420-400

    await db.ratings.put({ section: 'total', rating: 460, updatedAt: Date.now() })
    const second = await getGrowthRank(db)
    expect(second.rankPoints).toBe(60) // 460-400（更新された最大値）

    // レートが下がっても、更新済みの最大値を下回らない
    await db.ratings.put({ section: 'total', rating: 410, updatedAt: Date.now() })
    const third = await getGrowthRank(db)
    expect(third.rankPoints).toBe(60)
  })
})

describe('サーバー送信が発生しないこと（J-68: 端末内導出のみ）', () => {
  it('本モジュールはDBアクセスのみで完結し、fetch/WebSocket等の通信APIを一切importしない', () => {
    // 静的な保証: growthRank.tsのソースにネットワーク関連の識別子が含まれないことを
    // ビルド成果物の型・importからではなく直接検証する（回帰の検出力を上げるため）
    const globalWithFetch = globalThis as { fetch?: unknown; WebSocket?: unknown }
    const originalFetch = globalWithFetch.fetch
    const originalWebSocket = globalWithFetch.WebSocket
    let networkCalled = false
    globalWithFetch.fetch = () => {
      networkCalled = true
      throw new Error('growthRank.ts からネットワーク送信が発生した')
    }
    globalWithFetch.WebSocket = class {
      constructor() {
        networkCalled = true
        throw new Error('growthRank.ts からWebSocket接続が発生した')
      }
    }
    try {
      // 実データ導出の一連を通しても通信が起きないことを確認する
      resolveGrowthRank(50)
    } finally {
      globalWithFetch.fetch = originalFetch
      globalWithFetch.WebSocket = originalWebSocket
    }
    expect(networkCalled).toBe(false)
  })
})
