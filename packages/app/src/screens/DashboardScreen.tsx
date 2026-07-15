// S6 ダッシュボード（T-22＋M2・T-53。docs/07 7節S6・8節・03 5.5節）。
// 伸びグラフ（総合レートの日次スナップショット＋予測帯）・弱点マップ・学習ヒートマップの
// 3チャートに加え、予測スコア帯（ヒーロー数値）・到達予測・実試験スコア登録を持つ（J-1解除）。
import { useEffect, useState, type FormEvent } from 'react'
import type { BebRaidDatabase } from '../db/database'
import type { ExamScoreRecord, ExamScoreSource } from '../db/schema'
import {
  localMidnightAfterDays,
  parseDateString,
  startOfLocalDay,
  toDateString,
} from '../engine/date'
import { computeForecast, type RatingHistoryPoint } from '../engine/forecast'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { getTagAccuracies, WEAK_MIN_SAMPLE } from '../engine/tagStats'
import type { ForecastResult, TagAccuracy } from '../engine/types'
import { Heatmap, type HeatmapCell } from '../components/charts/Heatmap'
import { LineChart, type LineChartPoint } from '../components/charts/LineChart'
import { WeakBars } from '../components/charts/WeakBars'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
}

const EXAM_SOURCES: ExamScoreSource[] = ['IP', '公開', 'その他']

/** 到達予測（ForecastResult）の表示文言。断定表現を避け「参考値」を必ず含める（01のR-2） */
function forecastMessage(forecast: ForecastResult): string {
  if (forecast.kind === 'measuring') return '計測中（データが14日分たまると表示されます）'
  if (forecast.kind === 'onTrack') {
    return `このペースなら${forecast.year}年${forecast.month}月頃到達（参考値）`
  }
  return `このペースでは到達しない見込み。週の学習日数をあと${forecast.addDaysPerWeek}日増やすことを目安に（参考値）`
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
  // M2・T-53: 予測スコア・到達予測・実試験スコア登録
  const [forecast, setForecast] = useState<ForecastResult | null>(null)
  const [examScores, setExamScores] = useState<ExamScoreRecord[]>([])
  const [examDate, setExamDate] = useState('')
  const [examListening, setExamListening] = useState('')
  const [examReading, setExamReading] = useState('')
  const [examSource, setExamSource] = useState<ExamScoreSource>('IP')

  async function reloadForecastAndExamScores() {
    const [totalRating, history, scores] = await Promise.all([
      db.ratings.get('total'),
      db.ratingHistory.where('section').equals('total').sortBy('date'),
      db.examScores.toArray(),
    ])
    const historyPoints: RatingHistoryPoint[] = history.map((h) => ({
      date: h.date,
      rating: h.rating,
    }))
    setForecast(
      computeForecast(historyPoints, totalRating?.rating ?? DEFAULT_INITIAL_RATING, Date.now()),
    )
    setExamScores(scores.sort((a, b) => (a.date < b.date ? 1 : -1)))
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      // 3チャート用データと予測・実試験スコアを並列取得する（逐次待ちで初期表示が
      // 遅延しないように=既存3チャートの読み込みレイテンシに揃える）
      const [[history, accuracies, attempts]] = await Promise.all([
        Promise.all([
          db.ratingHistory.where('section').equals('total').sortBy('date'),
          getTagAccuracies(db),
          db.attempts.toArray(),
        ]),
        reloadForecastAndExamScores(),
      ])

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db])

  async function handleRegisterExamScore(e: FormEvent) {
    e.preventDefault()
    const listening = Number(examListening)
    const reading = Number(examReading)
    if (!examDate || Number.isNaN(listening) || Number.isNaN(reading)) return
    await db.examScores.put({
      id: crypto.randomUUID(),
      date: examDate,
      listening,
      reading,
      total: listening + reading,
      source: examSource,
    })
    setExamDate('')
    setExamListening('')
    setExamReading('')
    await reloadForecastAndExamScores()
  }

  if (growthPoints === null || weakBars === null || heatmapCells === null || forecast === null) {
    return null
  }

  return (
    <ScreenLayout action={null}>
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>ダッシュボード</h1>

      <section className="dashboard-forecast-hero">
        <p className="display-num" style={{ fontSize: 'var(--fs-display)' }}>
          {Math.round(forecast.scoreBand.low)}–{Math.round(forecast.scoreBand.high)}
        </p>
        <p className="dashboard-forecast-note">予測スコア帯（参考値。社内問題での推定）</p>
        <p data-testid="forecast-message">{forecastMessage(forecast)}</p>
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>伸びグラフ</h2>
        <LineChart
          points={growthPoints}
          title="総合レート"
          forecastBand={{ low: forecast.scoreBand.low, high: forecast.scoreBand.high }}
        />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>弱点マップ</h2>
        <WeakBars bars={weakBars} />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>学習ヒートマップ</h2>
        <Heatmap cells={heatmapCells} />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>実試験・IPテストスコア登録</h2>
        <form onSubmit={(e) => void handleRegisterExamScore(e)}>
          <label>
            日付
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              required
            />
          </label>
          <label>
            L
            <input
              type="number"
              value={examListening}
              onChange={(e) => setExamListening(e.target.value)}
              required
            />
          </label>
          <label>
            R
            <input
              type="number"
              value={examReading}
              onChange={(e) => setExamReading(e.target.value)}
              required
            />
          </label>
          <label>
            種別
            <select
              value={examSource}
              onChange={(e) => setExamSource(e.target.value as ExamScoreSource)}
            >
              {EXAM_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">登録</button>
        </form>
        {examScores.length > 0 && (
          <ul data-testid="exam-score-list">
            {examScores.map((score) => (
              <li key={score.id}>
                {score.date} {score.source} 合計{score.total}
                （予測帯との差 {Math.round(score.total - forecast.scoreBand.center)}）
              </li>
            ))}
          </ul>
        )}
      </section>
    </ScreenLayout>
  )
}
