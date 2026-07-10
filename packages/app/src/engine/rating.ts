// レーティングエンジン（T-10。正本: docs/03 5節）。
//
// Elo式のハンディキャップ換算と成長可視化の数値基盤。
// - 期待正答率 p = 1 / (1 + 10^((d − R) / 300))
// - 基礎点 = round(100 × (1.4 − p))、クランプ [40, 130]
// - レート更新 R' = R + K × (result − p)。K=16（最初の50問は K=32）
// - 難易度写像 d = 150 + 170 × D（D=1→320, D=5→1000）
// - SRS復習（mode='srs'）はレート更新から除外（既知カードの反復でレートが不当に上がる）
// - L/R 別レート＋総合平均。日次スナップショットを ratingHistory へ upsert

import type { BebRaidDatabase } from '../db/database'
import type { RatingRecord, RatingSection } from '../db/schema'
import { toDateString } from './date'
import type { RatingUpdate, RatingUpdateInput } from './types'

export const RATING_K = 16
/** 最初の50問は変動を大きくする（03の5.4） */
export const RATING_K_EARLY = 32
export const EARLY_ANSWER_COUNT = 50

export const BASE_POINTS_MIN = 40
export const BASE_POINTS_MAX = 130

/**
 * レート初期値（P0診断・自己申告が無い場合のフォールバック）。
 * 正式な初期値は P0 診断（T-20）が決める。01のペルソナ=380点 ≒ レート384 を丸めた値
 */
export const DEFAULT_INITIAL_RATING = 400

/** 難易度 D（1–5）→ レート空間 d（03の5.2） */
export function difficultyToRatingSpace(difficulty: number): number {
  return 150 + 170 * difficulty
}

/** Elo式期待正答率（03の5.3） */
export function expectedAccuracy(rating: number, d: number): number {
  return 1 / (1 + 10 ** ((d - rating) / 300))
}

/** 基礎点（03の5.3。クランプ[40,130]）。誤答は0点だが、それは呼び出し側の扱い */
export function basePoints(rating: number, d: number): number {
  const raw = Math.round(100 * (1.4 - expectedAccuracy(rating, d)))
  return Math.min(BASE_POINTS_MAX, Math.max(BASE_POINTS_MIN, raw))
}

/**
 * part → レートセクション。1–4=リスニング、5–7=リーディング。
 * part 0（語彙カード）は自己評価ベースで正誤の客観判定が無いためレート対象外
 */
export function sectionForPart(part: number): 'L' | 'R' | null {
  if (part >= 1 && part <= 4) return 'L'
  if (part >= 5 && part <= 7) return 'R'
  return null
}

/** L/R レートの初期化（P0診断=T-20 の出口。総合行と日次スナップショットも作る） */
export async function initializeRatings(
  db: BebRaidDatabase,
  input: { listening: number; reading: number; now?: number },
): Promise<void> {
  const now = input.now ?? Date.now()
  await db.transaction('rw', db.ratings, db.ratingHistory, async () => {
    await db.ratings.bulkPut([
      { section: 'L', rating: input.listening, updatedAt: now, answerCount: 0 },
      { section: 'R', rating: input.reading, updatedAt: now, answerCount: 0 },
      { section: 'total', rating: (input.listening + input.reading) / 2, updatedAt: now },
    ])
    await snapshotRatings(db, now)
  })
}

/**
 * 1解答分のレート更新（03の5.4）。
 * SRS復習（mode='srs'）と語彙カード（part 0）は対象外で null を返し、レートは動かない。
 * L/R の更新と同時に総合（平均）を再計算し、当日の日次スナップショットを upsert する
 */
export async function applyRatingUpdate(
  db: BebRaidDatabase,
  input: RatingUpdateInput,
): Promise<RatingUpdate | null> {
  if (input.mode === 'srs') return null
  const section = sectionForPart(input.part)
  if (section === null) return null
  const now = input.now ?? Date.now()

  return db.transaction('rw', db.ratings, db.ratingHistory, async () => {
    const record: RatingRecord = (await db.ratings.get(section)) ?? {
      section,
      rating: DEFAULT_INITIAL_RATING,
      updatedAt: now,
      answerCount: 0,
    }
    const answerCount = record.answerCount ?? 0
    const k = answerCount < EARLY_ANSWER_COUNT ? RATING_K_EARLY : RATING_K
    const d = difficultyToRatingSpace(input.difficulty)
    const p = expectedAccuracy(record.rating, d)
    const before = record.rating
    const after = before + k * ((input.isCorrect ? 1 : 0) - p)

    await db.ratings.put({ section, rating: after, updatedAt: now, answerCount: answerCount + 1 })

    // 総合 = L/R の平均（未初期化側はフォールバック初期値で平均する）
    const listening =
      section === 'L' ? after : ((await db.ratings.get('L'))?.rating ?? DEFAULT_INITIAL_RATING)
    const reading =
      section === 'R' ? after : ((await db.ratings.get('R'))?.rating ?? DEFAULT_INITIAL_RATING)
    await db.ratings.put({ section: 'total', rating: (listening + reading) / 2, updatedAt: now })

    await snapshotRatings(db, now)

    return { section, before, after, basePoints: basePoints(before, d) }
  })
}

/**
 * 現在レートを当日の日次スナップショットとして upsert する（03の5.5、J-1）。
 * 同日内の更新は上書きされ、「その日の最終値」が残る
 */
export async function snapshotRatings(
  db: BebRaidDatabase,
  now: number = Date.now(),
): Promise<void> {
  const date = toDateString(now)
  const sections: RatingSection[] = ['L', 'R', 'total']
  for (const section of sections) {
    const record = await db.ratings.get(section)
    if (record) {
      await db.ratingHistory.put({ date, section, rating: record.rating })
    }
  }
}
