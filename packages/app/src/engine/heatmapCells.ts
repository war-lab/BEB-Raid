// 学習ヒートマップ用セル配列の構築（元々DashboardScreen.tsx内にあったが、T-78で
// HomeScreenのミニヒートマップ（直近4週間）とも共用するためengine層へ切り出した）。
import { localMidnightAfterDays, parseDateString, startOfLocalDay, toDateString } from './date'
import type { HeatmapCell } from '../components/charts/Heatmap'

/**
 * 直近 weeks 週間・日曜始まりの日別セル配列を作る（GitHub草式のグリッド整列用）。
 * 範囲外（今日より後 or 表示開始前の曜日合わせ分）は count: -1 の余白セルにする
 */
export function buildHeatmapCells(
  countsByDate: ReadonlyMap<string, number>,
  now: number,
  weeks: number,
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
