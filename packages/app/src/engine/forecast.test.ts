// T-53 完了条件のテスト（予測スコア・到達予測。正本: docs/13 3.3節）:
// - 回帰の傾き計算・3状態（measuring/onTrack/behind）の判別・境界（14日ちょうど・傾き0）
// - 断定表現が無いこと（判別unionのkindのみで文言はUI側=ここではデータ構造の検証）
// - データ0件・1件でも壊れない
import { describe, expect, it } from 'vitest'

import {
  computeForecast,
  computeScoreBand,
  TARGET_RATING,
  type RatingHistoryPoint,
} from './forecast'

const NOW = new Date(2026, 6, 14, 8, 0).getTime() // 2026-07-14

function point(daysAgo: number, rating: number): RatingHistoryPoint {
  const d = new Date(NOW)
  d.setDate(d.getDate() - daysAgo)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { date, rating }
}

describe('computeScoreBand', () => {
  it('予測TOEIC=総合レート×0.99を中心に±50の帯を返す', () => {
    const band = computeScoreBand(600)
    expect(band.center).toBeCloseTo(594)
    expect(band.low).toBeCloseTo(544)
    expect(band.high).toBeCloseTo(644)
  })
})

describe('computeForecast: データ不足（計測中）', () => {
  it('履歴が0件ならmeasuring', () => {
    const result = computeForecast([], 500, NOW)
    expect(result.kind).toBe('measuring')
  })

  it('履歴が1件ならmeasuring', () => {
    const result = computeForecast([point(0, 500)], 500, NOW)
    expect(result.kind).toBe('measuring')
  })

  it('14日分未満（13日分）ならmeasuring', () => {
    const history = Array.from({ length: 13 }, (_, i) => point(12 - i, 500 + i))
    const result = computeForecast(history, 512, NOW)
    expect(result.kind).toBe('measuring')
  })

  it('境界: ちょうど14日分あればmeasuringを脱する', () => {
    const history = Array.from({ length: 14 }, (_, i) => point(13 - i, 500 + i * 2))
    const result = computeForecast(history, 526, NOW)
    expect(result.kind).not.toBe('measuring')
  })
})

describe('computeForecast: onTrack（上昇傾向）', () => {
  it('傾きが正なら到達予測（年月）を返す', () => {
    // 28日で400→500（傾き約3.6/日）。目標768まで届くには相当日数かかる
    const history = Array.from({ length: 28 }, (_, i) => point(27 - i, 400 + i * (100 / 27)))
    const result = computeForecast(history, 500, NOW)
    expect(result.kind).toBe('onTrack')
    if (result.kind === 'onTrack') {
      expect(result.year).toBeGreaterThanOrEqual(2026)
      expect(result.month).toBeGreaterThanOrEqual(1)
      expect(result.month).toBeLessThanOrEqual(12)
    }
  })

  it('既に目標到達済みなら今月をonTrackで返す（daysToTarget<=0）', () => {
    const history = Array.from({ length: 28 }, (_, i) => point(27 - i, 700 + i * 3))
    const result = computeForecast(history, 800, NOW)
    expect(result.kind).toBe('onTrack')
  })
})

describe('computeForecast: behind（現ペースでは到達しない）', () => {
  it('傾きが0（横ばい）ならbehindを返し、不足量が1-7の範囲', () => {
    const history = Array.from({ length: 28 }, (_, i) => point(27 - i, 500))
    const result = computeForecast(history, 500, NOW)
    expect(result.kind).toBe('behind')
    if (result.kind === 'behind') {
      expect(result.addDaysPerWeek).toBeGreaterThanOrEqual(1)
      expect(result.addDaysPerWeek).toBeLessThanOrEqual(7)
    }
  })

  it('傾きが負（下降）ならbehind', () => {
    const history = Array.from({ length: 28 }, (_, i) => point(27 - i, 550 - i * 2))
    const result = computeForecast(history, 496, NOW)
    expect(result.kind).toBe('behind')
  })

  it('境界: 傾きがちょうど0はbehind扱い（onTrackの条件はs>0のみ）', () => {
    // 最低限のデータ日数（14日）を満たしつつ、傾きは厳密に0
    const history = Array.from({ length: 14 }, (_, i) => point(13 - i, 500))
    const result = computeForecast(history, 500, NOW)
    expect(result.kind).toBe('behind')
  })

  it('学習日ですら伸びていない特殊ケースでも例外を投げず最大値7を提案する', () => {
    // 増加日が1件もない（横ばいのみ）→ averageGainPerActiveDay=0のフォールバック
    const history = Array.from({ length: 28 }, (_, i) => point(27 - i, 500))
    const result = computeForecast(history, 500, NOW)
    expect(result.kind).toBe('behind')
    if (result.kind === 'behind') {
      expect(result.addDaysPerWeek).toBe(7)
    }
  })
})

describe('computeForecast: 断定しない表現（データ構造のみ検証。文言はUI側）', () => {
  it('scoreBandは全ケースで返る（measuring/onTrack/behind共通）', () => {
    const measuring = computeForecast([], 500, NOW)
    const behind = computeForecast(
      Array.from({ length: 28 }, (_, i) => point(27 - i, 500)),
      500,
      NOW,
    )
    expect(measuring.scoreBand).toBeDefined()
    expect(behind.scoreBand).toBeDefined()
  })
})

describe('computeForecast: 未来日付のスナップショットを窓から除外する（T-191・Q-110の回帰）', () => {
  it('時計巻き戻し等で生成された未来日付の高レート点に引っ張られてonTrackにならない', () => {
    // 直近28日は横ばい（500固定・14日分あれば判定に入る）→ 本来は behind
    const history = Array.from({ length: 14 }, (_, i) => point(13 - i, 500))
    const future = new Date(NOW)
    future.setDate(future.getDate() + 10)
    const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
    // 未来日付・高レートの1件が窓に混入すると回帰の傾きが正転し、誤ってonTrackになる
    const withFuturePoint = [...history, { date: futureDate, rating: 2000 }]

    const result = computeForecast(withFuturePoint, 500, NOW)

    expect(result.kind).toBe('behind')
  })
})

describe('TARGET_RATING', () => {
  it('760×1000/990 ≈ 767.68', () => {
    expect(TARGET_RATING).toBeCloseTo(767.68, 1)
  })
})
