// 予測スコア・到達予測（M2・T-53。正本: docs/03 5.5節、docs/13 3.3節）。
//
// 予測TOEIC = 総合レート×0.99 ±50の帯（03の5.5節既定）。
// 到達予測は ratingHistory（section='total'）の直近28日を最小二乗の線形回帰し、
// 目標レート768（760×1000/990）への到達時期を月粒度で示す（断定表示はしない）。
// 全て純粋関数（DBアクセスはservices/forecast.ts等の呼び出し側が担う想定だが、
// M2時点ではDashboardScreenが直接db.ratingHistory等を読んで渡す構成にする）。

import { daysBetween, parseDateString } from './date'
import type { ForecastBehind, ForecastBehindDaily, ForecastResult, ScoreBand } from './types'

export interface RatingHistoryPoint {
  date: string
  rating: number
}

/** 予測スコア帯の算出係数（03の5.5節既定。暫定・実測未検証） */
const FORECAST_COEFFICIENT = 0.99
const FORECAST_BAND_WIDTH = 50

/** 目標レート（760点×1000/990。03の5.5節・13の3.3節） */
export const TARGET_RATING = (760 * 1000) / 990

/** 回帰に使う直近日数（13の3.3節） */
const REGRESSION_WINDOW_DAYS = 28
/** これ未満のデータ日数では回帰しない（計測中扱い） */
const MIN_HISTORY_DAYS = 14
/** 「このペースでは到達しない」場合の目安到達日数（不足量算出の基準窓） */
const REFERENCE_DAYS = 90
/** 週の学習日数の増分提案の上限（1–7に切り上げ） */
const MAX_ADD_DAYS_PER_WEEK = 7
/**
 * daysToTargetの上限（約3年）。T-310（K-39）: 傾きがわずかに正だと
 * daysToTargetが極端に大きくなり「2127年」等の非現実的な表示になりうる。
 * この上限を超える場合はonTrackとして扱わず、到達しない側（behind）へ倒す
 */
const MAX_DAYS_TO_TARGET = 1095

export function computeScoreBand(totalRating: number): ScoreBand {
  const center = totalRating * FORECAST_COEFFICIENT
  return { center, low: center - FORECAST_BAND_WIDTH, high: center + FORECAST_BAND_WIDTH }
}

/**
 * 直近windowDays分の履歴だけを取り出す（now基準）。日付でソート済み前提。
 * 時計巻き戻し等でnowより未来の日付を持つスナップショットが生成されうるため、
 * diff（now基準の経過日数）が負（=未来日付）のものは除外する（T-191・Q-110）
 */
function windowedHistory(
  history: readonly RatingHistoryPoint[],
  now: number,
  windowDays: number,
): RatingHistoryPoint[] {
  const nowDate = new Date(now)
  const nowDateStr = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`
  return history.filter((h) => {
    const diff = daysBetween(h.date, nowDateStr)
    return diff >= 0 && diff <= windowDays
  })
}

/** 最小二乗法で傾き（レート/日）を求める。x軸は先頭日からの経過日数 */
function linearRegressionSlope(points: readonly RatingHistoryPoint[]): number {
  const base = points[0]!.date
  const xs = points.map((p) => daysBetween(base, p.date))
  const ys = points.map((p) => p.rating)
  const n = points.length
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const meanX = sumX / n
  const meanY = sumY / n
  let numerator = 0
  let denominator = 0
  for (let i = 0; i < n; i++) {
    numerator += (xs[i]! - meanX) * (ys[i]! - meanY)
    denominator += (xs[i]! - meanX) ** 2
  }
  return denominator === 0 ? 0 : numerator / denominator
}

/**
 * 「1学習日あたり平均上昇」（不足量換算に使う。docs未記載の解釈=13の3.3節の実装確定）。
 * レートが前日から増加した日だけを対象に、その増加幅の平均を取る
 * （横ばい・下落日を平均に混ぜると「学習した日の伸び」が薄まるため）
 */
function averageGainPerActiveDay(points: readonly RatingHistoryPoint[]): number {
  const gains: number[] = []
  for (let i = 1; i < points.length; i++) {
    const diff = points[i]!.rating - points[i - 1]!.rating
    if (diff > 0) gains.push(diff)
  }
  if (gains.length === 0) return 0
  return gains.reduce((a, b) => a + b, 0) / gains.length
}

/** 窓内で学習日（前日から値が変化した日）とみなせる日数 */
function activeDayCount(points: readonly RatingHistoryPoint[]): number {
  let count = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.rating !== points[i - 1]!.rating) count++
  }
  return count
}

function monthsFromNow(now: number, days: number): { year: number; month: number } {
  const target = new Date(now)
  target.setDate(target.getDate() + Math.ceil(days))
  return { year: target.getFullYear(), month: target.getMonth() + 1 }
}

/**
 * 到達予測を算出する。history は section='total' の日次スナップショット（日付昇順）。
 * currentRating は最新の総合レート（db.ratings.get('total')。historyの最終点と
 * 必ずしも一致しない=同日内の解答で更新されている場合があるため引数で受ける）
 */
/**
 * 「このペースでは到達しない」場合の判定（T-310・K-39・K-40）。
 * - 週7日（毎日）学習済みなら「あとN日増やす」提案が成立しないため、日数以外の
 *   助言（behindDaily。表示側の固定文言）に分岐させる
 * - それ以外は従来どおり不足日数を算出する
 */
function computeBehind(
  windowed: readonly RatingHistoryPoint[],
  currentRating: number,
  scoreBand: ScoreBand,
): ForecastBehind | ForecastBehindDaily {
  const requiredSlope = (TARGET_RATING - currentRating) / REFERENCE_DAYS
  const totalDays = daysBetween(windowed[0]!.date, windowed[windowed.length - 1]!.date) || 1
  const currentDaysPerWeek = (activeDayCount(windowed) / totalDays) * 7

  if (currentDaysPerWeek >= MAX_ADD_DAYS_PER_WEEK) {
    return { kind: 'behindDaily', scoreBand }
  }

  const avgGain = averageGainPerActiveDay(windowed)
  let addDaysPerWeek: number
  if (avgGain > 0) {
    const neededDaysPerWeek = (requiredSlope * 7) / avgGain
    addDaysPerWeek = Math.ceil(Math.max(0, neededDaysPerWeek - currentDaysPerWeek))
  } else {
    // 学習した日ですら伸びていない特殊ケース。安全側で最大値を提案する
    addDaysPerWeek = MAX_ADD_DAYS_PER_WEEK
  }
  addDaysPerWeek = Math.min(Math.max(addDaysPerWeek, 1), MAX_ADD_DAYS_PER_WEEK)

  return { kind: 'behind', scoreBand, addDaysPerWeek }
}

export function computeForecast(
  history: readonly RatingHistoryPoint[],
  currentRating: number,
  now: number = Date.now(),
): ForecastResult {
  const scoreBand = computeScoreBand(currentRating)
  const sorted = [...history].sort((a, b) => parseDateString(a.date) - parseDateString(b.date))
  const windowed = windowedHistory(sorted, now, REGRESSION_WINDOW_DAYS)

  if (windowed.length < MIN_HISTORY_DAYS) {
    return { kind: 'measuring', scoreBand }
  }

  const slope = linearRegressionSlope(windowed)

  if (slope > 0) {
    const daysToTarget = (TARGET_RATING - currentRating) / slope
    if (daysToTarget <= 0) {
      // 既に目標到達済み（近い将来ではなく現在。onTrackとして今月を返す）
      const { year, month } = monthsFromNow(now, 0)
      return { kind: 'onTrack', scoreBand, year, month }
    }
    // T-310（K-39）: 傾きがわずかに正だとdaysToTargetが極端に大きくなり
    // 「2127年」等の非現実的な表示になりうる。上限を超える・有限値でない場合は
    // onTrackとして扱わず、到達しない側（behind）へ倒す
    if (Number.isFinite(daysToTarget) && daysToTarget <= MAX_DAYS_TO_TARGET) {
      const { year, month } = monthsFromNow(now, daysToTarget)
      return { kind: 'onTrack', scoreBand, year, month }
    }
  }

  return computeBehind(windowed, currentRating, scoreBand)
}
