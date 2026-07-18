// S1 ホーム画面（T-21。docs/07 7節S1・02の2.1・01の非機能要件=起動3秒）。
// 上: ストリーク＋SRS期限数。中: 進行中レイドのHPバー（M3・T-97）。下: 「今日のクエスト」
// 主ボタン＋3/7/15分チップ→generateQuickPack→セッション開始。下方グリッドは
// 各モードへの導線（Part2瞬発・Part5・語彙SRS・ダッシュボード・設定）。
import { useEffect, useRef, useState } from 'react'
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
import { formatRelativeTime } from '../engine/relativeTime'
import { shuffle } from '../engine/shuffle'
import { getSrsQueue } from '../engine/srs'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { PhaseState, QuickPackDuration, QuickPackItem } from '../engine/types'
import type { RaidApi } from '../platform'
import { buildCriterionContext, getOrInitPhaseState } from '../services/phase'
import { startSession, type SessionItem, type SessionSnapshot } from '../services/session'
import {
  LAST_SEEN_STREAK_KEY,
  NO_EARPHONE_MODE_KEY,
  QUEST_DURATION_KEY,
  SINGLE_MODE_COUNT_KEY,
} from '../services/settingsKeys'
import { InstallHint } from '../pwa/InstallHint'
import { useAppStore } from '../store/appStore'
import { useRaidSyncStore } from '../store/raidSyncStore'
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

/**
 * 進行中セッションを破棄して新規開始してよいかの確認（J-34）。
 * T-122(J-61): 何を破棄するのか分からない不安を減らすため、残り問数を含める
 */
export function confirmDiscardMessage(remaining: number): string {
  return `進行中のセッション（残り${remaining}問）を破棄して新しく始めますか？`
}

const DURATIONS: QuickPackDuration[] = [3, 7, 15]
const DEFAULT_DURATION: QuickPackDuration = 7
/** 単独モード（Part2瞬発・Part5）の問数選択肢（J-57）。「全問」は完走不能セッションの再発防止で置かない */
const SINGLE_MODE_COUNTS = [10, 20, 50] as const
type SingleModeCount = (typeof SINGLE_MODE_COUNTS)[number]
const DEFAULT_SINGLE_MODE_COUNT: SingleModeCount = 20
/** 空パック時の案内文言（J-60） */
const EMPTY_PACK_MESSAGE = '今は出題できる問題がありません'
/** 3分クエスト選択時のみ続ける補足文（J-60。3分=SRS復習中心の構成のため空になりやすい） */
const EMPTY_PACK_QUEST_3MIN_HINT =
  '3分クエストはSRS復習が中心です。復習カードが無いときは7分・15分をお試しください'
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
  // T-103: バックグラウンド同期の完了通知（syncCountが変わるたびにraidState再読込）
  const raidSyncCount = useRaidSyncStore((s) => s.syncCount)
  const raidSyncFailed = useRaidSyncStore((s) => s.lastFailed)

  // ファーストペイントをブロックしないよう、既定値（0件・未読込）で即座に描画する
  const [streakDays, setStreakDays] = useState(0)
  const [brokenSinceDays, setBrokenSinceDays] = useState<number | null>(null)
  const [dueCount, setDueCount] = useState(0)
  const [duration, setDuration] = useState<QuickPackDuration>(DEFAULT_DURATION)
  // データ読み込み完了の合図（テストが「初期値のまま描画された」誤検知をしないための目印）
  const [loaded, setLoaded] = useState(false)
  // T-39: Part2単独モード起動時の再生バリエーション選択（永続化しない。セッション単位の選択=13の3.11節）
  const [showPart2Options, setShowPart2Options] = useState(false)
  // T-118: Part5単独モード起動時の問数選択モーダル（Part2と同型。新設）
  const [showPart5Options, setShowPart5Options] = useState(false)
  // T-118: 単独モード（Part2瞬発・Part5）共通の問数選択値（画面遷移・再起動を跨いで復元）
  const [singleModeCount, setSingleModeCount] = useState<SingleModeCount>(DEFAULT_SINGLE_MODE_COUNT)
  // T-121(J-60): 生成パックが0問だったときの案内（今日のクエスト・単独モード共通）。
  // セッション開始成功時・単独モード開始時にクリアする。自動では消さない
  const [emptyPackMessage, setEmptyPackMessage] = useState<string | null>(null)
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
  // T-105: 60秒tickで相対時刻・raidEnded判定を更新するための現在時刻state
  const [nowMs, setNowMs] = useState(now())
  // T-105: 日付跨ぎ検出用。読込完了時点の日付を覚えておき、visibilitychange時に比較する
  const loadedDateRef = useRef(toDateString(now()))
  // T-105: visibilitychangeで日付跨ぎを検出したときに再読込をトリガーするカウンタ
  const [dateReloadToken, setDateReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const heatmapCutoff = localMidnightAfterDays(
        startOfLocalDay(Date.now()),
        -(MINI_HEATMAP_WEEKS * 7 - 1),
      )
      const [
        status,
        record,
        queue,
        phaseState,
        lastSeenSetting,
        recentAttempts,
        raidStateRecord,
        questDurationSetting,
        singleModeCountSetting,
      ] = await Promise.all([
        evaluateStreak(db),
        getStreak(db),
        getSrsQueue(db),
        getOrInitPhaseState(db),
        db.settings.get(LAST_SEEN_STREAK_KEY),
        db.attempts.where('answeredAt').aboveOrEqual(heatmapCutoff).toArray(),
        db.raidState.get(RAID_STATE_ID),
        db.settings.get(QUEST_DURATION_KEY),
        db.settings.get(SINGLE_MODE_COUNT_KEY),
      ])
      if (cancelled) return
      setRaidState(raidStateRecord ?? null)
      // T-112: 「今日のクエスト」の時間チップ選択を画面遷移・再起動を跨いで復元する
      const savedDuration = questDurationSetting?.value as QuickPackDuration | undefined
      if (savedDuration !== undefined && DURATIONS.includes(savedDuration)) {
        setDuration(savedDuration)
      }
      // T-118: 単独モードの問数選択を画面遷移・再起動を跨いで復元する（不正値は既定へフォールバック）
      const savedSingleModeCount = singleModeCountSetting?.value as SingleModeCount | undefined
      if (savedSingleModeCount !== undefined && SINGLE_MODE_COUNTS.includes(savedSingleModeCount)) {
        setSingleModeCount(savedSingleModeCount)
      }
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
      loadedDateRef.current = toDateString(Date.now())
      setLoaded(true)
    }
    void load().catch((e: unknown) => {
      // 同期完了トリガー（raidSyncCount）での再読込中にDBが閉じた場合等の想定外失敗。
      // 起動時読込と違い致命的ではないため、ログのみでUIは既存表示を維持する
      if (!cancelled) console.warn('[HomeScreen] データ再読込に失敗', e)
    })
    return () => {
      cancelled = true
    }
  }, [db, questionPool, raidSyncCount, dateReloadToken])

  // T-105(a): 相対時刻・レイド終了判定のtick更新。レイド表示要素があるときのみ起動する
  useEffect(() => {
    if (!raidState) return
    const id = setInterval(() => setNowMs(now()), 60_000)
    return () => clearInterval(id)
  }, [raidState])

  // T-105(c): PWAをバックグラウンドから復帰した際、読込時と日付が変わっていたら再読込する
  // （ストリーク・SRS期限バッジ・ヒートマップが前日値のまま固まる問題への対応）
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      if (toDateString(Date.now()) !== loadedDateRef.current) {
        setDateReloadToken((n) => n + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

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
    setEmptyPackMessage(null)
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
    // J-60: 3分クエストはSRS復習中心の構成のため、SRS期限・新規カードが無い状態
    // （新規ユーザーの典型）で高確率で空パックになる。従来は黙って何も起きなかった
    if (items.length === 0) {
      setEmptyPackMessage(
        duration === 3
          ? `${EMPTY_PACK_MESSAGE}。${EMPTY_PACK_QUEST_3MIN_HINT}`
          : EMPTY_PACK_MESSAGE,
      )
      return
    }
    await startSessionAndNavigate(items)
  }

  /** T-118: 問数選択チップの選択（保存＋画面遷移・再起動を跨いで復元） */
  function handleSelectSingleModeCount(count: SingleModeCount) {
    setSingleModeCount(count)
    void db.settings.put({ key: SINGLE_MODE_COUNT_KEY, value: count })
  }

  async function startSingleMode(
    format: 'audio_qa' | 'text_blank',
    options?: { partialAudioMode?: boolean },
  ) {
    // T-121: 単独モード開始時は「今日のクエスト」の空パック案内が残っていればクリアする
    setEmptyPackMessage(null)
    const filtered = questionPool.filter((q) => q.format === format)
    // J-57: 毎回シャッフルして先頭N問を取る（プール順固定だと後半に永遠に到達しない問題への対処）。
    // プールがN問未満のときはある分だけで開始する
    const selected = shuffle(filtered).slice(0, singleModeCount)
    const items: SessionItem[] = selected.map((q) => ({ questionId: q.id, mode: 'solo' }))
    if (items.length === 0) {
      setEmptyPackMessage(EMPTY_PACK_MESSAGE)
      return
    }
    await startSessionAndNavigate(items, options)
  }

  async function startSessionAndNavigate(
    items: SessionItem[],
    options?: { partialAudioMode?: boolean },
  ) {
    if (items.length === 0) return
    if (
      resumeSnapshot &&
      !window.confirm(
        confirmDiscardMessage(resumeSnapshot.items.length - resumeSnapshot.answeredCount),
      )
    )
      return
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

  // M3・T-97: raidApi.isConfigured() && raidState.joined のときのみHPバーを表示する（縮退設計）。
  // レビューF2(a): profileJsonが破損しているとJSON.parseの例外でホーム全体が白画面になるため、
  // 表示するときだけtry/catch付きでparseし、失敗時はHPバー自体を出さない（学習動線は無傷）
  let bossName: string | null = null
  if (raidApi.isConfigured() && raidState?.joined === true) {
    try {
      bossName = (JSON.parse(raidState.profileJson) as { name: string }).name
    } catch {
      // 破損キャッシュはraidSync成功時に上書きされるため、ここでは黙って非表示にするだけでよい
      bossName = null
    }
  }
  const showRaidHp = bossName !== null
  const hpPercent =
    raidState && raidState.maxHp > 0 ? Math.round((raidState.hp / raidState.maxHp) * 100) : 0
  const remainingDays = raidState ? Math.max(0, Math.ceil((raidState.endAt - nowMs) / DAY_MS)) : 0
  // M3・T-99: オフライン表示規約（3.7節）。T-105: nowMsは60秒tickで更新される
  const lastSyncedLabel = raidState ? formatRelativeTime(nowMs - raidState.lastSyncedAt) : ''
  const syncFailed = raidSyncFailed

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
                title="学習ストリーク: 連続で学習した日数"
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
          {/* T-112: チップは「今日のクエスト」専用であることをUIで明示するため、
              ボタン・チップをひとつのグループにまとめラベルを付ける（Part2瞬発等には作用しない） */}
          <div className="home-quest-group">
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
            {emptyPackMessage && <p className="home-pool-empty-hint">{emptyPackMessage}</p>}
            <p className="home-duration-chips__label">クエストの長さ</p>
            <div className="home-duration-chips">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`home-chip${d === duration ? ' is-selected' : ''}`}
                  onClick={() => {
                    setDuration(d)
                    void db.settings.put({ key: QUEST_DURATION_KEY, value: d })
                  }}
                >
                  {d}分
                </button>
              ))}
            </div>
          </div>
          {showPart2Options && (
            // T-116(8): ホーム下部へのインライン挿入だとスクロールしないと見えなかったため、
            // 画面中央固定のオーバーレイに変更する（スクロール位置に依存せず必ず見える）
            <div
              className="home-part2-modal"
              role="dialog"
              aria-modal="true"
              aria-label="音声の再生方法を選択"
            >
              <div className="home-part2-options">
                <p>音声の再生方法を選んでください</p>
                {/* T-118: 問数チップ（J-57。既定20問。プールが問数未満ならある分だけで開始する） */}
                <p className="home-duration-chips__label">問題数</p>
                <div className="home-duration-chips">
                  {SINGLE_MODE_COUNTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`home-chip${c === singleModeCount ? ' is-selected' : ''}`}
                      onClick={() => handleSelectSingleModeCount(c)}
                    >
                      {c}問
                    </button>
                  ))}
                </div>
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
            </div>
          )}
          {showPart5Options && (
            // T-118: Part5は従来即時開始だったが、問数選択を挟む同型モーダルを新設する
            <div
              className="home-part2-modal"
              role="dialog"
              aria-modal="true"
              aria-label="Part5の問題数を選択"
            >
              <div className="home-part2-options">
                <p>Part5の問題数を選んでください</p>
                <p className="home-duration-chips__label">問題数</p>
                <div className="home-duration-chips">
                  {SINGLE_MODE_COUNTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`home-chip${c === singleModeCount ? ' is-selected' : ''}`}
                      onClick={() => handleSelectSingleModeCount(c)}
                    >
                      {c}問
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPart5Options(false)
                    void startSingleMode('text_blank')
                  }}
                >
                  開始
                </button>
                <button type="button" onClick={() => setShowPart5Options(false)}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
          <div className="home-grid">
            <button type="button" onClick={() => setShowPart2Options(true)}>
              Part2瞬発
            </button>
            <button type="button" onClick={() => setShowPart5Options(true)}>
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
            {raidApi.isConfigured() && (
              <button type="button" onClick={() => navigate('raid')}>
                レイド
              </button>
            )}
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
        /* レビューF2(b): button内の<p>は内容モデル違反でSRに正しく伝わらないためspan化し、
           全体の意味はaria-labelで伝える（バー本体は装飾としてaria-hidden） */
        <button
          type="button"
          className="home-raid-hp"
          data-testid="home-raid-hp"
          aria-label={`ボスHP ${hpPercent}%、残り${remainingDays}日。タップでレイド画面へ`}
          onClick={() => navigate('raid')}
        >
          <span className="home-raid-hp-line">{bossName}</span>
          <span className="home-raid-hp-bar" aria-hidden="true">
            <span className="home-raid-hp-bar-fill" style={{ width: `${hpPercent}%` }} />
          </span>
          <span className="home-raid-hp-line">残り{remainingDays}日</span>
          <span
            className={
              syncFailed
                ? 'home-raid-hp-line home-raid-hp-sync is-stale'
                : 'home-raid-hp-line home-raid-hp-sync'
            }
            data-testid="home-raid-last-synced"
          >
            最終同期: {lastSyncedLabel}
          </span>
          <span className="home-raid-hp-line home-raid-hp-note">
            討伐の成立は同期時にサーバーで確定します
          </span>
        </button>
      )}
      {miniHeatmapCells && (
        <div className="home-mini-heatmap" data-testid="home-mini-heatmap">
          {/* T-116(3): ホームのミニヒートマップにタイトルが無く、何の表かわからない指摘への対処 */}
          <p className="home-mini-heatmap-title">直近4週間の学習ヒートマップ</p>
          <Heatmap cells={miniHeatmapCells} />
        </div>
      )}
      <InstallHint />
      {loaded && <span data-testid="home-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
