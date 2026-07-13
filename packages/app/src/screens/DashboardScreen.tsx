// S6 ダッシュボード（T-22。docs/07 7節S6・8節・03 5.5のJ-1範囲外を除いた部分）。
// 伸びグラフ（総合レートの日次スナップショット）・弱点マップ・学習ヒートマップの3チャート。
// 予測スコア帯・到達予測はJ-1（M1対象外）のため実装しない。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import {
  localMidnightAfterDays,
  parseDateString,
  startOfLocalDay,
  toDateString,
} from '../engine/date'
import { getTagAccuracies, WEAK_MIN_SAMPLE } from '../engine/tagStats'
import type { TagAccuracy } from '../engine/types'
import { Heatmap, type HeatmapCell } from '../components/charts/Heatmap'
import { LineChart, type LineChartPoint } from '../components/charts/LineChart'
import { WeakBars } from '../components/charts/WeakBars'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
}

/** 学習ヒートマップの表示週数（07 8節: 直近15週程度） */
const HEATMAP_WEEKS = 15

/**
 * 直近 weeks 週間・日曜始まりの日別セル配列を作る（GitHub草式のグリッド整列用）。
 * 範囲外（今日より後 or 表示開始前の曜日合わせ分）は count: -1 の余白セルにする
 */
export function buildHeatmapCells(
  countsByDate: ReadonlyMap<string, number>,
  now: number,
  weeks: number = HEATMAP_WEEKS,
): HeatmapCell[] {
  const totalDays = weeks * 7
  const todayMidnight = startOfLocalDay(now)
  const days: HeatmapCell[] = []
  for (let i = totalDays - 1; i >= 0; i--) {
    const day = localMidnightAfterDays(todayMidnight, -i)
    const date = toDateString(day)
    days.push({ date, count: countsByDate.get(date) ?? 0 })
  }
  const firstDow = new Date(parseDateString(days[0]!.date)).getDay() // 0=日曜
  const padding: HeatmapCell[] = Array.from({ length: firstDow }, (_, i) => ({
    date: `pad-${i}`,
    count: -1,
  }))
  return [...padding, ...days]
}

export function DashboardScreen({ db }: Props) {
  const [growthPoints, setGrowthPoints] = useState<LineChartPoint[] | null>(null)
  const [weakBars, setWeakBars] = useState<TagAccuracy[] | null>(null)
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const history = await db.ratingHistory.where('section').equals('total').sortBy('date')
      const accuracies = await getTagAccuracies(db)
      const attempts = await db.attempts.toArray()

      const countsByDate = new Map<string, number>()
      for (const a of attempts) {
        const date = toDateString(a.answeredAt)
        countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1)
      }

      if (!cancelled) {
        setGrowthPoints(history.map((h) => ({ date: h.date, value: h.rating })))
        setWeakBars(accuracies.filter((t) => t.windowTotal >= WEAK_MIN_SAMPLE))
        setHeatmapCells(buildHeatmapCells(countsByDate, Date.now()))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db])

  if (growthPoints === null || weakBars === null || heatmapCells === null) return null

  return (
    <ScreenLayout action={null}>
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>ダッシュボード</h1>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>伸びグラフ</h2>
        <LineChart points={growthPoints} title="総合レート" />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>弱点マップ</h2>
        <WeakBars bars={weakBars} />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>学習ヒートマップ</h2>
        <Heatmap cells={heatmapCells} />
      </section>
    </ScreenLayout>
  )
}
