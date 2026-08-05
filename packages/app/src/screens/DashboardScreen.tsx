// S6 ダッシュボード（T-22＋M2・T-53。docs/07 7節S6・8節・03 5.5節）。
// 伸びグラフ（総合レートの日次スナップショット＋予測帯）・弱点マップ・学習ヒートマップの
// 3チャートに加え、予測スコア帯（ヒーロー数値）・到達予測・実試験スコア登録を持つ（J-1解除）。
import { useEffect, useState, type FormEvent } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { ExamScoreRecord, ExamScoreSource } from '../db/schema'
import { localMidnightAfterDays, startOfLocalDay, toDateString } from '../engine/date'
import { computeForecast, type RatingHistoryPoint } from '../engine/forecast'
import { getGrowthRank, GROWTH_RANK_CONFIG, type GrowthRankResult } from '../engine/growthRank'
import { buildHeatmapCells } from '../engine/heatmapCells'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import {
  computeReadingPace,
  formatPaceDuration,
  RC_TARGET_MS_PER_QUESTION,
  type ReadingPace,
} from '../engine/readingPace'
import { getTagAccuracies, WEAK_MIN_SAMPLE } from '../engine/tagStats'
import type { ForecastResult, TagAccuracy } from '../engine/types'
import { useAppStore } from '../store/appStore'
import { Heatmap, type HeatmapCell } from '../components/charts/Heatmap'
import { LineChart, type LineChartPoint } from '../components/charts/LineChart'
import { WeakBars } from '../components/charts/WeakBars'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /**
   * T-145: 読解ペース指標の集計に使う。読解の attempt は questionId が**サブ設問ID**で
   * 記録されるため、親を引いて text_passage か判定するのに問題lookupが要る
   * （`-q<n>` のパターンだけでは audio_set のサブ設問と区別できない）
   */
  questionPool: Question[]
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

/**
 * ランク段数（1始まり）。台座の線の本数に使う（docs/25 4.5節の二重符号化）。
 * growthRankConfig.json の定義順がそのまま段位の低→高なので、その添字を段数とする。
 * 未知IDは最下段扱い（1本）にして描画を落とさない。
 */
function growthRankTier(rankId: string): number {
  const index = GROWTH_RANK_CONFIG.ranks.findIndex((r) => r.id === rankId)
  return index < 0 ? 1 : index + 1
}

/**
 * 次ランクまでの進捗率（0〜1）。最上位ランク到達時は null（バーを出さない）。
 * 表示済みの rankPoints / pointsToNext を割り算するだけで、新しい情報は持ち込まない。
 */
function growthRankProgress(result: GrowthRankResult): number | null {
  if (result.nextRank === null || result.pointsToNext === null) return null
  const span = result.nextRank.minPoints - result.rank.minPoints
  if (span <= 0) return null
  const done = span - result.pointsToNext
  return Math.min(1, Math.max(0, done / span))
}

/** 学習ヒートマップの表示週数（07 8節: 直近15週程度） */
const HEATMAP_WEEKS = 15

/**
 * 実試験スコアのL/R各セクションの妥当な範囲（TOEIC公式の配点は各5〜495点。T-205・Q-53）。
 * 範囲検証が無いと桁誤り（例: 650を6500と入力）がそのまま登録され、「予測帯との差」表示に
 * 残り続ける（登録後の修正・削除手段も無かったため一度入ると気づいても直せなかった）
 */
const EXAM_SECTION_SCORE_MIN = 5
const EXAM_SECTION_SCORE_MAX = 495

export function DashboardScreen({ db, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const [growthPoints, setGrowthPoints] = useState<LineChartPoint[] | null>(null)
  const [weakBars, setWeakBars] = useState<TagAccuracy[] | null>(null)
  const [heatmapCells, setHeatmapCells] = useState<HeatmapCell[] | null>(null)
  // M4・T-130: 成長ランク（端末内導出のみ。サーバー送信なし=J-68）
  const [growthRank, setGrowthRank] = useState<GrowthRankResult | null>(null)
  // M2・T-53: 予測スコア・到達予測・実試験スコア登録
  const [forecast, setForecast] = useState<ForecastResult | null>(null)
  // T-145: 読解（RC）の速読ペース指標。サンプル不足のときは null のまま出さない
  const [readingPace, setReadingPace] = useState<ReadingPace | null>(null)
  const [examScores, setExamScores] = useState<ExamScoreRecord[]>([])
  const [examDate, setExamDate] = useState('')
  const [examListening, setExamListening] = useState('')
  const [examReading, setExamReading] = useState('')
  const [examSource, setExamSource] = useState<ExamScoreSource>('IP')
  // T-205（Q-53）: 登録済みスコアの修正手段。nullなら新規登録、idがあれば編集モード
  // （フォームは新規登録と共用し、送信時の分岐だけで賄う。専用モーダルは作らない）
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null)
  // T-205（Q-53）: 削除は不可逆操作のため確認を挟む（T-202と同じ方針）
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

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
      // T-74（14の1.7）: ヒートマップは直近HEATMAP_WEEKS週分しか表示しないため、
      // 全件読みではなくその期間分だけをindex（answeredAt）で絞り込んで読む
      const heatmapCutoff = localMidnightAfterDays(
        startOfLocalDay(Date.now()),
        -(HEATMAP_WEEKS * 7 - 1),
      )
      const [[history, accuracies, attempts, rank]] = await Promise.all([
        Promise.all([
          db.ratingHistory.where('section').equals('total').sortBy('date'),
          getTagAccuracies(db),
          db.attempts.where('answeredAt').aboveOrEqual(heatmapCutoff).toArray(),
          getGrowthRank(db),
        ]),
        reloadForecastAndExamScores(),
      ])

      const countsByDate = new Map<string, number>()
      for (const a of attempts) {
        const date = toDateString(a.answeredAt)
        countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1)
      }

      // T-145: ヒートマップ用に読んだ期間（直近HEATMAP_WEEKS週）の attempts を再利用する。
      // 「最近のペース」を出したいので全期間の平均より妥当で、追加のDB読み込みも要らない
      const lookup = new Map(questionPool.map((q) => [q.id, q]))

      if (!cancelled) {
        setGrowthPoints(history.map((h) => ({ date: h.date, value: h.rating })))
        setWeakBars(accuracies.filter((t) => t.windowTotal >= WEAK_MIN_SAMPLE))
        setHeatmapCells(buildHeatmapCells(countsByDate, Date.now(), HEATMAP_WEEKS))
        setGrowthRank(rank)
        setReadingPace(computeReadingPace(attempts, lookup))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- questionPoolは起動時に固定される想定
  }, [db])

  /** L/Rそれぞれが妥当な範囲内の数値か（T-205・Q-53） */
  function isValidSectionScore(input: string): boolean {
    if (input.trim() === '') return false
    const n = Number(input)
    return !Number.isNaN(n) && n >= EXAM_SECTION_SCORE_MIN && n <= EXAM_SECTION_SCORE_MAX
  }

  const examListeningValid = isValidSectionScore(examListening)
  const examReadingValid = isValidSectionScore(examReading)
  const examFormValid = examDate !== '' && examListeningValid && examReadingValid

  function resetExamForm() {
    setEditingScoreId(null)
    setExamDate('')
    setExamListening('')
    setExamReading('')
    setExamSource('IP')
  }

  /**
   * 新規登録・編集の両方をこの関数で扱う（T-205）。ボタンのdisabledに加えて、
   * ここでも範囲外なら早期returnする（フォームのEnter暗黙送信がdisabledを迂回する
   * 経路を多層防御する。DiagnosticScreenのTOEICスコア検証=T-187と同じ方針）
   */
  async function handleRegisterExamScore(e: FormEvent) {
    e.preventDefault()
    if (!examFormValid) return
    const listening = Number(examListening)
    const reading = Number(examReading)
    await db.examScores.put({
      id: editingScoreId ?? crypto.randomUUID(),
      date: examDate,
      listening,
      reading,
      total: listening + reading,
      source: examSource,
    })
    resetExamForm()
    await reloadForecastAndExamScores()
  }

  /** 登録済みスコアの修正（T-205）。フォームへ値を流し込み、送信時にeditingScoreIdで上書きする */
  function handleEditExamScore(score: ExamScoreRecord) {
    setEditingScoreId(score.id)
    setExamDate(score.date)
    setExamListening(String(score.listening))
    setExamReading(String(score.reading))
    setExamSource(score.source)
  }

  /** 登録済みスコアの削除（T-205。確認後に実行する不可逆操作） */
  async function handleConfirmDeleteExamScore() {
    if (!deleteConfirmId) return
    await db.examScores.delete(deleteConfirmId)
    setDeleteConfirmId(null)
    if (editingScoreId === deleteConfirmId) resetExamForm()
    await reloadForecastAndExamScores()
  }

  if (
    growthPoints === null ||
    weakBars === null ||
    heatmapCells === null ||
    forecast === null ||
    growthRank === null
  ) {
    // T-211(Q-59): return nullのままだと読み込み中に白画面になる。RaidScreenの
    // 読み込み中表示と揃える
    return (
      <ScreenLayout
        action={
          <button type="button" className="secondary-action" onClick={() => navigate('home')}>
            ホームへ
          </button>
        }
      >
        <p>読み込み中…</p>
      </ScreenLayout>
    )
  }

  const rankProgress = growthRankProgress(growthRank)

  return (
    <ScreenLayout
      action={
        <button type="button" className="secondary-action" onClick={() => navigate('home')}>
          ホームへ
        </button>
      }
    >
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>ダッシュボード</h1>

      <section className="dashboard-forecast-hero">
        {/* T-199（Q-9）: measuring（データ14日未満）はまだ帯の数値が意味を持たないため、
            数値と「計測中」文言を同時に出さない（排他）。数値は計測完了後にのみ表示する */}
        {forecast.kind === 'measuring' ? (
          <p data-testid="forecast-message">{forecastMessage(forecast)}</p>
        ) : (
          <>
            <p className="display-num" style={{ fontSize: 'var(--fs-display)' }}>
              {Math.round(forecast.scoreBand.low)}–{Math.round(forecast.scoreBand.high)}
            </p>
            <p className="dashboard-forecast-note">予測スコア帯（参考値。社内問題での推定）</p>
            <p data-testid="forecast-message">{forecastMessage(forecast)}</p>
          </>
        )}
      </section>

      {/* docs/25 4.5節（V-14）: 色（data-rank）＋台座の線の本数でランク段数を二重符号化する。
          グレースケールでも線の本数からランクが判別できる。光暈・アニメーションは足さない */}
      <section
        className="dashboard-growth-rank"
        data-testid="growth-rank"
        data-rank={growthRank.rank.id}
      >
        <p className="dashboard-growth-rank__eyebrow">Growth Rank</p>
        <h2 className="dashboard-growth-rank__heading">成長ランク</h2>
        <p className="display-num dashboard-growth-rank__name">{growthRank.rank.name}</p>
        {/* 台座（装飾）。段数はランク名のテキストで既に読めるため aria-hidden にする */}
        <div className="dashboard-growth-rank__pedestal" aria-hidden="true">
          {Array.from({ length: growthRankTier(growthRank.rank.id) }, (_, i) => (
            <span key={i} className="dashboard-growth-rank__tier-bar" />
          ))}
        </div>
        {/* T-197（Q-6）: rankPointsはレート差分＋学習日数の合算で小数になりうる。表示は丸める */}
        <p className="dashboard-forecast-note">現在 {Math.round(growthRank.rankPoints)}pt</p>
        {growthRank.nextRank !== null && growthRank.pointsToNext !== null ? (
          <p data-testid="growth-rank-next">
            次のランク（{growthRank.nextRank.name}）まで残り {Math.round(growthRank.pointsToNext)}pt
          </p>
        ) : (
          <p data-testid="growth-rank-next">最上位ランクに到達</p>
        )}
        {/* 次ランクまでの進捗バー。既存の pointsToNext を視覚化するだけで情報は増やさない
            （数値は上の行に既出のため装飾扱い） */}
        {rankProgress !== null && (
          <div className="dashboard-growth-rank__progress" aria-hidden="true">
            <span
              className="dashboard-growth-rank__progress-fill"
              style={{ width: `${rankProgress * 100}%` }}
            />
          </div>
        )}
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

      {/* T-145（docs/24 3.5節）: 読解の速読ペース。目的は「時間切れで解き切れない層の
          底上げ」であって速答を煽ることではないので、合否の色分けはせず数値と差だけを出す。
          サンプル不足（RC_PACE_MIN_SAMPLE未満）のときは節ごと出さない——1問の当たり外れで
          揺れる平均を見せると判断を誤らせる */}
      {readingPace && (
        <section>
          <h2 style={{ fontSize: 'var(--fs-sub)' }}>読解のペース</h2>
          <p className="reading-pace-metric" data-testid="reading-pace">
            1問あたり{formatPaceDuration(readingPace.averageMs)}
            <small className="reading-pace-metric__sub">
              （直近{HEATMAP_WEEKS}週・{readingPace.count}問）
            </small>
          </p>
          <p className="reading-pace-metric__diff">
            {readingPace.diffMs === 0
              ? `目標ペース（約${formatPaceDuration(RC_TARGET_MS_PER_QUESTION)}/問）どおりです`
              : readingPace.diffMs > 0
                ? `目標ペース（約${formatPaceDuration(RC_TARGET_MS_PER_QUESTION)}/問）より${formatPaceDuration(readingPace.diffMs)}遅いペースです`
                : `目標ペース（約${formatPaceDuration(RC_TARGET_MS_PER_QUESTION)}/問）より${formatPaceDuration(-readingPace.diffMs)}速いペースです`}
          </p>
          <p className="reading-pace-metric__note">
            本試験のRCは約1分/問が目安です。正確さとのトレードオフなので、速さだけを追う必要は
            ありません。
          </p>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>学習ヒートマップ</h2>
        <Heatmap cells={heatmapCells} />
      </section>

      <section>
        <h2 style={{ fontSize: 'var(--fs-sub)' }}>実試験・IPテストスコア登録</h2>
        <form className="settings-list" onSubmit={(e) => void handleRegisterExamScore(e)}>
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
              min={EXAM_SECTION_SCORE_MIN}
              max={EXAM_SECTION_SCORE_MAX}
              value={examListening}
              onChange={(e) => setExamListening(e.target.value)}
              required
            />
          </label>
          <label>
            R
            <input
              type="number"
              min={EXAM_SECTION_SCORE_MIN}
              max={EXAM_SECTION_SCORE_MAX}
              value={examReading}
              onChange={(e) => setExamReading(e.target.value)}
              required
            />
          </label>
          {/* T-205（Q-53）: 範囲外入力で登録ボタンが無効になる理由を示す（無言で押せない
              だけだと桁誤りに気づけない。DiagnosticScreenのTOEICスコア検証=T-187と同じ様式） */}
          {examListening.trim() !== '' && !examListeningValid && (
            <p style={{ color: 'var(--ng)', fontSize: 'var(--fs-note)' }} role="alert">
              Lは{EXAM_SECTION_SCORE_MIN}〜{EXAM_SECTION_SCORE_MAX}の範囲で入力してください
            </p>
          )}
          {examReading.trim() !== '' && !examReadingValid && (
            <p style={{ color: 'var(--ng)', fontSize: 'var(--fs-note)' }} role="alert">
              Rは{EXAM_SECTION_SCORE_MIN}〜{EXAM_SECTION_SCORE_MAX}の範囲で入力してください
            </p>
          )}
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
          <button type="submit" disabled={!examFormValid}>
            {editingScoreId ? '更新' : '登録'}
          </button>
          {/* T-205: 編集モードから抜ける（新規登録に戻す） */}
          {editingScoreId && (
            <button type="button" className="secondary-action" onClick={resetExamForm}>
              編集をやめる
            </button>
          )}
        </form>
        {examScores.length > 0 && (
          <ul data-testid="exam-score-list">
            {examScores.map((score) => (
              <li key={score.id}>
                {score.date} {score.source} 合計{score.total}
                （予測帯との差 {Math.round(score.total - forecast.scoreBand.center)}）
                {/* T-205（Q-53）: 誤登録の修正・削除手段が無く、「予測帯との差」表示に残り
                    続けていた */}
                <button type="button" onClick={() => handleEditExamScore(score)}>
                  編集
                </button>
                <button type="button" onClick={() => setDeleteConfirmId(score.id)}>
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
        {deleteConfirmId && (
          <ConfirmDialog
            message="この実試験スコアを削除しますか？（元に戻せません）"
            onDismiss={() => setDeleteConfirmId(null)}
            actions={[
              {
                label: '削除する',
                primary: true,
                onSelect: () => void handleConfirmDeleteExamScore(),
              },
              { label: 'キャンセル', onSelect: () => setDeleteConfirmId(null) },
            ]}
          />
        )}
      </section>
    </ScreenLayout>
  )
}
