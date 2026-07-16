// S1 ホーム画面（T-21。docs/07 7節S1・02の2.1・01の非機能要件=起動3秒）。
// 上: ストリーク＋SRS期限数。中: なし（レイドHPバーはM3）。下: 「今日のクエスト」
// 主ボタン＋3/7/15分チップ→generateQuickPack→セッション開始。下方グリッドは
// 各モードへの導線（Part2瞬発・Part5・語彙SRS・ダッシュボード・設定）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { SEASON_LABELS, evaluatePhaseCriteria } from '../engine/curriculum'
import { daysBetween, toDateString } from '../engine/date'
import { applyNoEarphoneFilter } from '../engine/noEarphoneFilter'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { generateQuickPack } from '../engine/quickPack'
import { getSrsQueue } from '../engine/srs'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { PhaseState, QuickPackDuration, QuickPackItem } from '../engine/types'
import { buildCriterionContext, getOrInitPhaseState } from '../services/phase'
import { startSession, type SessionItem, type SessionSnapshot } from '../services/session'
import { NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { InstallHint } from '../pwa/InstallHint'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /** クイックパック生成・単独モード起動の出題候補プール（実パック読み込みはT-35） */
  questionPool: Question[]
  /** 進行中セッション（T-67。App起動時＋ホーム復帰時に取得。無ければnull） */
  resumeSnapshot: SessionSnapshot | null
}

/** 進行中セッションを破棄して新規開始してよいかの確認（J-34） */
const CONFIRM_DISCARD_MESSAGE = '進行中のセッションを破棄して新しく始めますか？'

const DURATIONS: QuickPackDuration[] = [3, 7, 15]
const DEFAULT_DURATION: QuickPackDuration = 7
/** 途切れ判定の閾値（レビューフォローアップ3.8節: gap≥2） */
const BROKEN_GAP_DAYS = 2

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

export function HomeScreen({ db, questionPool, resumeSnapshot }: Props) {
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

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [status, record, queue, phaseState] = await Promise.all([
        evaluateStreak(db),
        getStreak(db),
        getSrsQueue(db),
        getOrInitPhaseState(db),
      ])
      if (cancelled) return
      const today = toDateString(Date.now())
      const gap = record.lastActiveDate ? daysBetween(record.lastActiveDate, today) : 0
      const isBroken =
        record.lastActiveDate !== null && gap >= BROKEN_GAP_DAYS && !status.todayCompleted
      setStreakDays(status.currentDays)
      setBrokenSinceDays(isBroken ? status.currentDays : null)
      setDueCount(queue.dueReviews.length)
      setPhase(phaseState)

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

  return (
    <ScreenLayout
      status={
        <>
          {brokenSinceDays !== null ? (
            <p>途切れ（前回{brokenSinceDays}日）</p>
          ) : (
            streakDays > 0 && <p className="session-streak display-num">🔥{streakDays}</p>
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
      <InstallHint />
      {loaded && <span data-testid="home-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
