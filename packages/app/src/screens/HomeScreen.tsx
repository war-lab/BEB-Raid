// S1 ホーム画面（T-21。docs/07 7節S1・02の2.1・01の非機能要件=起動3秒）。
// 上: ストリーク＋SRS期限数。中: 進行中レイドのHPバー（M3・T-97）。下: 「今日のクエスト」
// 主ボタン＋3/7/15分チップ→generateQuickPack→セッション開始。下方グリッドは
// 各モードへの導線（Part2瞬発・Part5・語彙SRS・ダッシュボード・設定）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { RaidStateRecord } from '../db/schema'
import { RAID_STATE_ID } from '../db/schema'
import { SEASON_LABELS, evaluatePhaseCriteria } from '../engine/curriculum'
import { daysBetween, localMidnightAfterDays, startOfLocalDay, toDateString } from '../engine/date'
import { buildHeatmapCells } from '../engine/heatmapCells'
import { applyNoEarphoneFilter } from '../engine/noEarphoneFilter'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { generateQuickPack } from '../engine/quickPack'
import { getSrsQueue } from '../engine/srs'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { PhaseState, QuickPackDuration, QuickPackItem } from '../engine/types'
import type { RaidApi } from '../platform'
import { buildCriterionContext, getOrInitPhaseState } from '../services/phase'
import { startSession, type SessionItem, type SessionSnapshot } from '../services/session'
import { LAST_SEEN_STREAK_KEY, NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { InstallHint } from '../pwa/InstallHint'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { Heatmap } from '../components/charts/Heatmap'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /** クイックパック生成・単独モード起動の出題候補プール（実パック読み込みはT-35） */
  questionPool: Question[]
  /** 進行中セッション（T-67。App起動時＋ホーム復帰時に取得。無ければnull） */
  resumeSnapshot: SessionSnapshot | null
  /** 共有API（レイド）クライアント（M3・T-97）。isConfigured()=falseならHPバー自体を出さない */
  raidApi: RaidApi
}

/** 進行中セッションを破棄して新規開始してよいかの確認（J-34） */
const CONFIRM_DISCARD_MESSAGE = '進行中のセッションを破棄して新しく始めますか？'

const DURATIONS: QuickPackDuration[] = [3, 7, 15]
const DEFAULT_DURATION: QuickPackDuration = 7
/** 途切れ判定の閾値（レビューフォローアップ3.8節: gap≥2） */
const BROKEN_GAP_DAYS = 2
/** ホームのミニヒートマップの表示週数（T-78。DashboardScreenの15週の縮小版） */
const MINI_HEATMAP_WEEKS = 4
const DAY_MS = 24 * 60 * 60 * 1000

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
// （SettingsScreen.tsxと同じ回避策）
function now(): number {
  return Date.now()
}

/** QuickPackItem → SessionItem（questionId が null の語彙カードは 3.4節の規約で補う） */
export function toSessionItems(items: QuickPackItem[]): SessionItem[] {
  return items.map((item) => {
    const refId = item.srsCardId?.split(':').slice(1).join(':')
    return {
      questionId: item.questionId ?? `vocab:${refId ?? 'unknown'}`,
      mode: item.mode,
      srsCardId: item.srsCardId ?? undefined,
      reason: item.reason,
    }
  })
}

export function HomeScreen({ db, questionPool, resumeSnapshot, raidApi }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)

  // ファーストペイントをブロックしないよう、既定値（0件・未読込）で即座に描画する
  const [streakDays, setStreakDays] = useState(0)
  const [brokenSinceDays, setBrokenSinceDays] = useState<number | null>(null)
  const [dueCount, setDueCount] = useState(0)
  const [duration, setDuration] = useState<QuickPackDuration>(DEFAULT_DURATION)
  // データ読み込み完了の合図（テストが「初期値のまま描画された」誤検知をしないための目印）
  const [loaded, setLoaded] = useState(false)
  // T-39: Part2単独モード起動時の再生バリエーション選択（永続化しない。セッション単位の選択=13の3.11節）
  const [showPart2Options, setShowPart2Options] = useState(false)
  // T-54: 現フェーズ（シーズン表示・クイックパックのフェーズ駆動化に使う）
  const [phase, setPhase] = useState<PhaseState | null>(null)
  // 現シーズンの次フェーズへの達成条件のうち、満たしている条件の割合（進捗バー表示用）
  const [phaseProgress, setPhaseProgress] = useState<number | null>(null)
  // T-78: 直近4週間のミニヒートマップ（既存Heatmapコンポーネントの縮小版=セル数を絞るだけ）
  const [miniHeatmapCells, setMiniHeatmapCells] = useState<ReturnType<
    typeof buildHeatmapCells
  > | null>(null)
  // T-78: 前回表示値より日数が増えたときだけストリーク表示を1回パルスさせる
  const [streakPulse, setStreakPulse] = useState(false)
  // M3・T-97: 進行中レイドの端末内キャッシュ（raidSync=T-96が更新する。無ければ非表示）
  const [raidState, setRaidState] = useState<RaidStateRecord | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const heatmapCutoff = localMidnightAfterDays(
        startOfLocalDay(Date.now()),
        -(MINI_HEATMAP_WEEKS * 7 - 1),
      )
      const [status, record, queue, phaseState, lastSeenSetting, recentAttempts, raidStateRecord] =
        await Promise.all([
          evaluateStreak(db),
          getStreak(db),
          getSrsQueue(db),
          getOrInitPhaseState(db),
          db.settings.get(LAST_SEEN_STREAK_KEY),
          db.attempts.where('answeredAt').aboveOrEqual(heatmapCutoff).toArray(),
          db.raidState.get(RAID_STATE_ID),
        ])
      if (cancelled) return
      setRaidState(raidStateRecord ?? null)
      const today = toDateString(Date.now())
      const gap = record.lastActiveDate ? daysBetween(record.lastActiveDate, today) : 0
      const isBroken =
        record.lastActiveDate !== null && gap >= BROKEN_GAP_DAYS && !status.todayCompleted
      setStreakDays(status.currentDays)
      setBrokenSinceDays(isBroken ? status.currentDays : null)
      setDueCount(queue.dueReviews.length)
      setPhase(phaseState)

      const lastSeen = (lastSeenSetting?.value as number | undefined) ?? 0
      setStreakPulse(status.currentDays > lastSeen)
      if (status.currentDays !== lastSeen) {
        void db.settings.put({ key: LAST_SEEN_STREAK_KEY, value: status.currentDays })
      }

      const countsByDate = new Map<string, number>()
      for (const a of recentAttempts) {
        const date = toDateString(a.answeredAt)
        countsByDate.set(date, (countsByDate.get(date) ?? 0) + 1)
      }
      setMiniHeatmapCells(buildHeatmapCells(countsByDate, Date.now(), MINI_HEATMAP_WEEKS))

      const questionLookup = new Map(questionPool.map((q) => [q.id, q]))
      const ctx = await buildCriterionContext(db, questionLookup)
      if (cancelled) return
      const result = evaluatePhaseCriteria(phaseState.criteria, ctx)
      const metCount = result.evaluations.filter((e) => e.met && !e.insufficientData).length
      setPhaseProgress(result.evaluations.length > 0 ? metCount / result.evaluations.length : null)
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db, questionPool])

  /** 続きから再開（T-67）。既存スナップショットをそのまま beginSession に渡す */
  async function handleResume() {
    if (!resumeSnapshot) return
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(resumeSnapshot, questionPool, {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
    navigate('drill')
  }

  async function handleStartQuest() {
    const pack = await generateQuickPack(db, {
      duration,
      questions: questionPool,
      phase: phase?.season,
      listeningStage: phase?.listeningStage,
    })
    const noEarphoneSetting = await db.settings.get(NO_EARPHONE_MODE_KEY)
    const filteredPack =
      noEarphoneSetting?.value === true
        ? applyNoEarphoneFilter(pack, new Map(questionPool.map((q) => [q.id, q])))
        : pack
    const items = toSessionItems(filteredPack.items)
    await startSessionAndNavigate(items)
  }

  async function startSingleMode(
    format: 'audio_qa' | 'text_blank',
    options?: { partialAudioMode?: boolean },
  ) {
    const filtered = questionPool.filter((q) => q.format === format)
    const items: SessionItem[] = filtered.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await startSessionAndNavigate(items, options)
  }

  async function startSessionAndNavigate(
    items: SessionItem[],
    options?: { partialAudioMode?: boolean },
  ) {
    if (items.length === 0) return
    if (resumeSnapshot && !window.confirm(CONFIRM_DISCARD_MESSAGE)) return
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(
      snapshot,
      questionPool,
      {
        L: l?.rating ?? DEFAULT_INITIAL_RATING,
        R: r?.rating ?? DEFAULT_INITIAL_RATING,
      },
      options,
    )
    navigate('drill')
  }

  // M3・T-97: raidApi.isConfigured() && raidState.joined のときのみHPバーを表示する（縮退設計）
  const showRaidHp = raidApi.isConfigured() && raidState?.joined === true
  const bossName = raidState ? (JSON.parse(raidState.profileJson) as { name: string }).name : ''
  const hpPercent =
    raidState && raidState.maxHp > 0 ? Math.round((raidState.hp / raidState.maxHp) * 100) : 0
  const remainingDays = raidState ? Math.max(0, Math.ceil((raidState.endAt - now()) / DAY_MS)) : 0

  return (
    <ScreenLayout
      status={
        <>
          {brokenSinceDays !== null ? (
            <p>途切れ（前回{brokenSinceDays}日）</p>
          ) : (
            streakDays > 0 && (
              <p
                key={streakDays}
                className={`streak-flame display-num${streakPulse ? ' is-pulse' : ''}`}
              >
                🔥{streakDays}
              </p>
            )
          )}
          {dueCount > 0 && <span className="home-due-badge">SRS期限 {dueCount}</span>}
        </>
      }
      action={
        <>
          {resumeSnapshot && (
            <button type="button" className="secondary-action" onClick={() => void handleResume()}>
              続きから再開（残り{resumeSnapshot.items.length - resumeSnapshot.answeredCount}問）
            </button>
          )}
          <PrimaryButton
            onClick={() => void handleStartQuest()}
            disabled={questionPool.length === 0}
          >
            今日のクエスト
          </PrimaryButton>
          {questionPool.length === 0 && (
            <p className="home-pool-empty-hint">
              問題データを取得できていません。オンラインで開き直してください
            </p>
          )}
          <div className="home-duration-chips">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={`home-chip${d === duration ? ' is-selected' : ''}`}
                onClick={() => setDuration(d)}
              >
                {d}分
              </button>
            ))}
          </div>
          {showPart2Options && (
            <div className="home-part2-options">
              <p>音声の再生方法を選んでください</p>
              <button
                type="button"
                onClick={() => {
                  setShowPart2Options(false)
                  void startSingleMode('audio_qa')
                }}
              >
                通常
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPart2Options(false)
                  void startSingleMode('audio_qa', { partialAudioMode: true })
                }}
              >
                冒頭だけ再生（特訓）
              </button>
              <p className="home-part2-options-hint">音声の冒頭だけで答える特訓モードです</p>
              <button type="button" onClick={() => setShowPart2Options(false)}>
                キャンセル
              </button>
            </div>
          )}
          <div className="home-grid">
            <button type="button" onClick={() => setShowPart2Options(true)}>
              Part2瞬発
            </button>
            <button type="button" onClick={() => void startSingleMode('text_blank')}>
              Part5
            </button>
            <button type="button" onClick={() => navigate('vocab')}>
              語彙SRS
            </button>
            <button type="button" onClick={() => navigate('shadowing')}>
              シャドーイング{phase && ` L${phase.listeningStage}`}
            </button>
            <button type="button" onClick={() => navigate('dashboard')}>
              ダッシュボード
            </button>
            <button type="button" onClick={() => navigate('settings')}>
              設定
            </button>
          </div>
        </>
      }
    >
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>BEB Raid</h1>
      {phase && (
        <div className="home-season" data-testid="home-season">
          <p>{SEASON_LABELS[phase.season]}</p>
          {phaseProgress !== null && (
            <div
              className="home-season-progress"
              role="progressbar"
              aria-valuenow={Math.round(phaseProgress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="home-season-progress-bar"
                style={{ width: `${Math.round(phaseProgress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {showRaidHp && (
        <div className="home-raid-hp" data-testid="home-raid-hp">
          <p>{bossName}</p>
          <div
            className="home-raid-hp-bar"
            role="progressbar"
            aria-valuenow={hpPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="home-raid-hp-bar-fill" style={{ width: `${hpPercent}%` }} />
          </div>
          <p>残り{remainingDays}日</p>
        </div>
      )}
      {miniHeatmapCells && (
        <div className="home-mini-heatmap" data-testid="home-mini-heatmap">
          <Heatmap cells={miniHeatmapCells} />
        </div>
      )}
      <InstallHint />
      {loaded && <span data-testid="home-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
