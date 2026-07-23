// 成長ランク（M4・T-130。正本: docs/22 3.7節、docs/21 T-130行、docs/02 7節）。
//
// 継続装置の一つ。絶対スコアではなく「レート上昇量＋学習量」で段位を決める
// （300点でも900点でも同じ土俵=02の7節）。**端末内導出のみでサーバー送信はしない**
// （J-68。プライバシー境界に新しい送信を作らない）。
//
// rankPoints = max(0, 現在の総合レート − 初期レート) + 学習日数
//   初期レート = ratingHistory（section='total'）の最古スナップショット値
//              （履歴が無い新規ユーザーは currentRating を初期値とみなし差分0とする）
//   学習日数   = attempts が1件以上存在する日の数（ストリーク/ヒートマップと同じ
//              暦日基準=engine/date.ts の toDateString）。ヒートマップの表示窓
//              （直近15週）とは異なり、ここでは全期間の attempts を対象にする
//              （累積の継続装置であり表示ウィンドウを切る対象ではないため）。

import type { BebRaidDatabase } from '../db/database'
import { toDateString } from './date'
import rawConfig from './growthRankConfig.json'
import { DEFAULT_INITIAL_RATING } from './rating'

/** 成長ランク1段の定義（growthRankConfig.json の1エントリ） */
export interface GrowthRankDef {
  id: string
  name: string
  /** このランクに達するために必要な rankPoints（下限。昇順必須） */
  minPoints: number
}

export interface GrowthRankConfig {
  ranks: GrowthRankDef[]
}

/**
 * growthRankConfig.json の整合性検証（レビューフォローアップ3.8節の
 * validateQuickPackConfig の前例に倣う）。
 * minPoints が昇順でないと「上位ランクなのに閾値が低い」等の矛盾した設定が
 * 読み込み時に検出されず、静かに誤った判定をし続けるため即座に検出する。
 */
export function validateGrowthRankConfig(config: GrowthRankConfig): void {
  if (config.ranks.length === 0) {
    throw new Error('growthRankConfig の ranks が空')
  }
  for (let i = 1; i < config.ranks.length; i++) {
    const prev = config.ranks[i - 1]!
    const cur = config.ranks[i]!
    if (cur.minPoints <= prev.minPoints) {
      throw new Error(
        `growthRankConfig の ranks は minPoints 昇順である必要がある（不正: ${prev.id}(${prev.minPoints}) → ${cur.id}(${cur.minPoints})）`,
      )
    }
  }
}

export const GROWTH_RANK_CONFIG: GrowthRankConfig = rawConfig
validateGrowthRankConfig(GROWTH_RANK_CONFIG)

/** 成長ランクの判定結果 */
export interface GrowthRankResult {
  rankPoints: number
  rank: GrowthRankDef
  /** 次ランク（最上位ランクに達している場合は null） */
  nextRank: GrowthRankDef | null
  /** 次ランクまでの残りポイント（nextRank が null のときは null） */
  pointsToNext: number | null
}

/** rankPoints の算定式（22の3.7節が正文） */
export function computeRankPoints(params: {
  currentRating: number
  initialRating: number
  learningDays: number
}): number {
  return Math.max(0, params.currentRating - params.initialRating) + params.learningDays
}

/** rankPoints からランク・次ランクまでの残りを判定する（純粋関数） */
export function resolveGrowthRank(
  rankPoints: number,
  config: GrowthRankConfig = GROWTH_RANK_CONFIG,
): GrowthRankResult {
  const ranks = config.ranks
  let current = ranks[0]!
  let next: GrowthRankDef | null = ranks[1] ?? null
  for (let i = 0; i < ranks.length; i++) {
    if (rankPoints >= ranks[i]!.minPoints) {
      current = ranks[i]!
      next = ranks[i + 1] ?? null
    } else {
      break
    }
  }
  return {
    rankPoints,
    rank: current,
    nextRank: next,
    pointsToNext: next ? next.minPoints - rankPoints : null,
  }
}

/**
 * 学習日数: attempts が1件以上存在する暦日の数（全期間。ストリーク/ヒートマップと
 * 同じ日付基準=toDateStringで暦日キー化してから distinct を取る）
 */
export async function countLearningDays(db: BebRaidDatabase): Promise<number> {
  const dates = new Set<string>()
  await db.attempts.each((a) => {
    dates.add(toDateString(a.answeredAt))
  })
  return dates.size
}

/**
 * 成長ランクをDBから導出する（端末内のみ。サーバー送信は一切行わない=J-68）。
 * ratingHistory が無い新規ユーザーは currentRating を初期レートとみなし
 * 差分0（学習日数のみ加点。学習前なら0）として扱う
 */
export async function getGrowthRank(
  db: BebRaidDatabase,
  config: GrowthRankConfig = GROWTH_RANK_CONFIG,
): Promise<GrowthRankResult> {
  const [totalRating, history, learningDays] = await Promise.all([
    db.ratings.get('total'),
    db.ratingHistory.where('section').equals('total').sortBy('date'),
    countLearningDays(db),
  ])
  const currentRating = totalRating?.rating ?? DEFAULT_INITIAL_RATING
  const initialRating = history.length > 0 ? history[0]!.rating : currentRating
  const rankPoints = computeRankPoints({ currentRating, initialRating, learningDays })
  return resolveGrowthRank(rankPoints, config)
}
