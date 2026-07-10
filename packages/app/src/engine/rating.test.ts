// T-10: レーティングエンジンのテスト（03の5節）。
// 完了条件: 5.3の計算例（レート400が d=650 正解→127点等）と一致。
// SRS復習の解答でレートが動かないことを確認
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  applyRatingUpdate,
  basePoints,
  difficultyToRatingSpace,
  expectedAccuracy,
  initializeRatings,
  RATING_K,
  RATING_K_EARLY,
  sectionForPart,
  snapshotRatings,
} from './rating'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`rating-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('03の5.3の計算例', () => {
  it('レート400が d=650 に正解 → p≈0.13 → 基礎点127', () => {
    expect(expectedAccuracy(400, 650)).toBeCloseTo(0.128, 2)
    expect(basePoints(400, 650)).toBe(127)
  })

  it('レート900が d=650 に正解 → p≈0.87 → 基礎点53', () => {
    expect(expectedAccuracy(900, 650)).toBeCloseTo(0.872, 2)
    expect(basePoints(900, 650)).toBe(53)
  })

  it('基礎点はクランプ [40, 130]', () => {
    expect(basePoints(2000, 320)).toBe(40) // 高レート×易問: p≈1 → 100×0.4=40（下限）
    expect(basePoints(0, 1000)).toBe(130) // 低レート×難問: p≈0 → 140 → 上限130
    expect(basePoints(1000, 320)).toBe(41) // クランプ境界のすぐ外は素の値のまま
  })
})

describe('難易度写像 d = 150 + 170×D（03の5.2）', () => {
  it('D=1→320, D=5→1000', () => {
    expect(difficultyToRatingSpace(1)).toBe(320)
    expect(difficultyToRatingSpace(5)).toBe(1000)
  })
})

describe('sectionForPart', () => {
  it('Part1–4=L / Part5–7=R / 語彙カード(part0)=対象外', () => {
    expect(sectionForPart(2)).toBe('L')
    expect(sectionForPart(4)).toBe('L')
    expect(sectionForPart(5)).toBe('R')
    expect(sectionForPart(7)).toBe('R')
    expect(sectionForPart(0)).toBeNull()
  })
})

describe("applyRatingUpdate: R' = R + K(result − p)", () => {
  it('最初の50問は K=32、以降は K=16', async () => {
    const db = newDb()
    await initializeRatings(db, { listening: 400, reading: 400, now: 1000 })

    // 1問目（answerCount=0 < 50 → K=32）
    const d = difficultyToRatingSpace(3)
    const p1 = expectedAccuracy(400, d)
    const first = await applyRatingUpdate(db, {
      part: 2,
      difficulty: 3,
      isCorrect: true,
      mode: 'solo',
      now: 2000,
    })
    expect(first?.after).toBeCloseTo(400 + RATING_K_EARLY * (1 - p1), 10)

    // 50問済みにして51問目（K=16）
    await db.ratings.update('L', { answerCount: 50 })
    const before = (await db.ratings.get('L'))!.rating
    const p2 = expectedAccuracy(before, d)
    const later = await applyRatingUpdate(db, {
      part: 2,
      difficulty: 3,
      isCorrect: false,
      mode: 'solo',
      now: 3000,
    })
    expect(later?.after).toBeCloseTo(before + RATING_K * (0 - p2), 10)
  })

  it('SRS復習（mode=srs）ではレートが動かない', async () => {
    const db = newDb()
    await initializeRatings(db, { listening: 400, reading: 400, now: 1000 })
    const result = await applyRatingUpdate(db, {
      part: 2,
      difficulty: 3,
      isCorrect: true,
      mode: 'srs',
      now: 2000,
    })
    expect(result).toBeNull()
    expect((await db.ratings.get('L'))?.rating).toBe(400)
    expect((await db.ratings.get('L'))?.answerCount).toBe(0)
  })

  it('語彙カード（part 0）はレート対象外', async () => {
    const db = newDb()
    await initializeRatings(db, { listening: 400, reading: 400, now: 1000 })
    expect(
      await applyRatingUpdate(db, { part: 0, difficulty: 2, isCorrect: true, mode: 'solo' }),
    ).toBeNull()
  })

  it('L/R は独立に更新され、総合は常に平均', async () => {
    const db = newDb()
    await initializeRatings(db, { listening: 400, reading: 500, now: 1000 })
    await applyRatingUpdate(db, {
      part: 2,
      difficulty: 3,
      isCorrect: true,
      mode: 'solo',
      now: 2000,
    })

    const listening = (await db.ratings.get('L'))!.rating
    const reading = (await db.ratings.get('R'))!.rating
    expect(listening).toBeGreaterThan(400)
    expect(reading).toBe(500) // Part2 の解答で R は動かない
    expect((await db.ratings.get('total'))?.rating).toBeCloseTo((listening + reading) / 2, 10)
  })

  it('基礎点は更新前レートで計算して返す（J-4 のリザルト表示用）', async () => {
    const db = newDb()
    await initializeRatings(db, { listening: 400, reading: 400, now: 1000 })
    // d=650 は D≒2.94 に相当。写像を経由せず直接 d を作れないため D から逆算した値で確認
    const update = await applyRatingUpdate(db, {
      part: 2,
      difficulty: (650 - 150) / 170,
      isCorrect: true,
      mode: 'solo',
      now: 2000,
    })
    expect(update?.basePoints).toBe(127)
  })
})

describe('ratingHistory: 日次スナップショット（03の5.5、J-1）', () => {
  it('同日の更新は上書きされ「その日の最終値」が残る。日付が変わると行が増える', async () => {
    const db = newDb()
    const day1 = new Date(2026, 6, 9, 8, 0).getTime()
    const day1evening = new Date(2026, 6, 9, 21, 0).getTime()
    const day2 = new Date(2026, 6, 10, 8, 0).getTime()

    await initializeRatings(db, { listening: 400, reading: 400, now: day1 })
    await applyRatingUpdate(db, {
      part: 2,
      difficulty: 3,
      isCorrect: true,
      mode: 'solo',
      now: day1evening,
    })
    expect(await db.ratingHistory.where('date').equals('2026-07-09').count()).toBe(3) // L/R/total

    const snapshotL = await db.ratingHistory.get(['2026-07-09', 'L'])
    expect(snapshotL?.rating).toBe((await db.ratings.get('L'))?.rating)

    await applyRatingUpdate(db, {
      part: 5,
      difficulty: 2,
      isCorrect: false,
      mode: 'solo',
      now: day2,
    })
    expect(await db.ratingHistory.where('date').equals('2026-07-10').count()).toBe(3)
    expect(await db.ratingHistory.count()).toBe(6)
  })

  it('snapshotRatings 単体でも upsert できる（セッション終了時などの明示呼び出し用）', async () => {
    const db = newDb()
    await initializeRatings(db, {
      listening: 420,
      reading: 480,
      now: new Date(2026, 6, 9).getTime(),
    })
    await snapshotRatings(db, new Date(2026, 6, 10).getTime())
    expect((await db.ratingHistory.get(['2026-07-10', 'total']))?.rating).toBe(450)
  })
})
