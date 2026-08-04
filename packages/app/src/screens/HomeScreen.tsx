// S1 ホーム画面（T-21。docs/07 7節S1・02の2.1・01の非機能要件=起動3秒）。
// 上: ストリーク＋SRS期限数。中: ワードマーク＋ヒーローカード（進行中レイドのHPバー=M3・T-97、
// 未参加時はシーズン表示に縮退=docs/20 JV-2）。下: 「今日のクエスト」
// 主ボタン＋3/7/15分チップ→generateQuickPack→セッション開始。下方グリッドは
// 各モードへの導線（Part2瞬発・Part5・Part7読解・語彙SRS・ダッシュボード・設定）。
// Part7読解（T-143・J-80）は「じっくり読解」モードの入口で、通勤クエストの3/7/15分チップとは
// 分離した独立タイルにしている（着席・自宅想定。docs/24 3.3節）。
// docs/20 3.4節(V-3/V-4統合): ヒーローのボス紋章はBossSigil（S5レイド画面と同じseed=bossId）。
import { useEffect, useRef, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { RaidStateRecord } from '../db/schema'
import { RAID_STATE_ID } from '../db/schema'
import { totalAnswerSlots } from '../engine/answerSlots'
import { shuffle } from '../engine/shuffle'
import { supportsAudioOnlyPart2 } from '../engine/audioOnlyPart2'
import { SEASON_LABELS, evaluatePhaseCriteria } from '../engine/curriculum'
import { daysBetween, localMidnightAfterDays, startOfLocalDay, toDateString } from '../engine/date'
import { buildHeatmapCells } from '../engine/heatmapCells'
import { applyNoEarphoneFilter } from '../engine/noEarphoneFilter'
import { applyRatingDifficultyFilter, orderByRating } from '../engine/ratingDifficultyFilter'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { generateQuickPack } from '../engine/quickPack'
import { formatRelativeTime } from '../engine/relativeTime'
import { getSrsQueue } from '../engine/srs'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { PhaseState, QuickPackDuration, QuickPackItem } from '../engine/types'
import type { RaidApi } from '../platform'
import { buildCriterionContext, getOrInitPhaseState } from '../services/phase'
import {
  currentSubAnswers,
  startSession,
  type SessionItem,
  type SessionSnapshot,
} from '../services/session'
import {
  LAST_SEEN_STREAK_KEY,
  NO_EARPHONE_MODE_KEY,
  QUEST_DURATION_KEY,
  READING_SET_COUNT_KEY,
  SINGLE_MODE_COUNT_KEY,
} from '../services/settingsKeys'
import { InstallHint } from '../pwa/InstallHint'
import { useAppStore } from '../store/appStore'
import { useRaidSyncStore } from '../store/raidSyncStore'
import { useSessionStore } from '../store/sessionStore'
import { BossSigil } from '../components/BossSigil'
import { Heatmap } from '../components/charts/Heatmap'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { Wordmark } from '../components/Wordmark'

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

/**
 * 中断セッションの残り解答回数（T-175。docs/27 のS-26）。
 * item数で数えると audio_set（1itemで3サブ設問）を1回と数えてしまい、
 * ドリル画面の進捗表示（実解答回数）と食い違う。
 *
 * T-200（Q-10）: `snapshot.answeredCount` はitem単位でしか進まないため、
 * 現在item（読解・audio_set）内で答え終えたサブ設問（`snapshot.subAnswers`）は
 * まだ反映されていない。それを引かないと、Part7で3問中1問だけ解答して
 * 「次へ」を押す前に中断した場合、その1問分が残数に反映されず「残り7問」のまま
 * （実際は6問）になる。Part5等サブ設問を持たないitemは常にsubAnswersが空なので
 * この補正は効かず、従来どおりの挙動を保つ
 */
export function remainingAnswerSlots(
  snapshot: SessionSnapshot,
  questionPool: readonly Question[],
): number {
  const lookup = new Map(questionPool.map((q) => [q.id, q]))
  const total = totalAnswerSlots(snapshot.items.slice(snapshot.answeredCount), lookup)
  return Math.max(0, total - currentSubAnswers(snapshot).length)
}

const DURATIONS: QuickPackDuration[] = [3, 7, 15]
const DEFAULT_DURATION: QuickPackDuration = 7
/**
 * 読解（Part7）単独モードのパッセージ数の選択肢（T-143・J-80）。
 * 読解は1パッセージが2〜4設問を要求するので、他の単独モードの問数チップ（10/20/50）は使えない
 * （20を選ぶと60設問級になり通勤セッションに収まらない）。docs/24 3.3節の「1〜2セットを
 * 通しで」に合わせ、1〜3パッセージから選ばせる
 */
const READING_SET_COUNTS = [1, 2, 3] as const
type ReadingSetCount = (typeof READING_SET_COUNTS)[number]
const DEFAULT_READING_SET_COUNT: ReadingSetCount = 2

/**
 * セッション開始時のオプション。`partialAudioMode` / `audioOnlyPart2` は再生モードとして
 * セッションストアへ渡す。`toScreen`（T-143）は遷移先の指定だけなのでストアへは渡さない
 */
type StartOptions = {
  partialAudioMode?: boolean
  audioOnlyPart2?: boolean
  toScreen?: 'drill' | 'reading'
}

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

/** 読解（Part7）単独モードの設問数の見積り（下限・上限。理由は readingQuestionEstimate 参照） */
export interface ReadingEstimate {
  sets: number
  minQuestions: number
  maxQuestions: number
}

/**
 * 選ぶパッセージ数から設問数の**範囲**を求める（T-143・J-80）。
 *
 * 実際の出題はプールをシャッフルして先頭N件を取るため、どのパッセージが当たるかは
 * 開始するまで決まらない。1パッセージの設問数は2〜5問とばらつくので、
 * 「プール先頭N件の合計」を目安として出すと表示と実数がずれる（レビュー指摘、2026-08-03）。
 *
 * 選択を先に確定して共有する案もあるが、開始のたびに引き直す（＝プール後半にも到達する）
 * という現在の設計を崩すため採らない。代わりに、起こりうる最小・最大を出す
 */
export function readingQuestionEstimate(pool: readonly Question[], count: number): ReadingEstimate {
  const sets = Math.min(count, pool.length)
  const counts = pool.map((q) => q.subQuestions?.length ?? 1).sort((a, b) => a - b)
  const sum = (values: number[]) => values.reduce((total, n) => total + n, 0)
  return {
    sets,
    minQuestions: sum(counts.slice(0, sets)),
    maxQuestions: sum(counts.slice(counts.length - sets)),
  }
}

/** 見積りの表示文（幅が無ければ単一の数値で出す。読解の目安は1設問1分＝24の3.5節） */
export function formatReadingEstimate(estimate: ReadingEstimate): string {
  const { minQuestions, maxQuestions } = estimate
  if (minQuestions === maxQuestions) {
    return `約${minQuestions}設問（目安${minQuestions}分）`
  }
  return `約${minQuestions}〜${maxQuestions}設問（目安${minQuestions}〜${maxQuestions}分）`
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
  // T-143(J-80): 読解（Part7）単独モードのパッセージ数選択モーダル（Part5と同型）
  const [showReadingOptions, setShowReadingOptions] = useState(false)
  const [readingSetCount, setReadingSetCount] = useState<ReadingSetCount>(DEFAULT_READING_SET_COUNT)
  // T-118: 単独モード（Part2瞬発・Part5）共通の問数選択値（画面遷移・再起動を跨いで復元）
  const [singleModeCount, setSingleModeCount] = useState<SingleModeCount>(DEFAULT_SINGLE_MODE_COUNT)
  // T-121(J-60): 生成パックが0問だったときの案内（今日のクエスト・単独モード共通）。
  // セッション開始成功時・単独モード開始時にクリアする。自動では消さない
  const [emptyPackMessage, setEmptyPackMessage] = useState<string | null>(null)
  /**
   * T-162（docs/27 のS-38）: 進行中セッションがある状態で新規開始したときの確認。
   * 選択が決まるまで開始要求を保持しておく（window.confirm を置き換えたため、
   * 判断を待つ間の状態を画面側で持つ必要がある）
   */
  const [discardConfirm, setDiscardConfirm] = useState<{
    items: SessionItem[]
    options?: StartOptions
  } | null>(null)
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
        readingSetCountSetting,
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
        db.settings.get(READING_SET_COUNT_KEY),
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
      // T-143: 読解のパッセージ数選択も同じ扱いで復元する
      const savedReadingCount = readingSetCountSetting?.value as ReadingSetCount | undefined
      if (savedReadingCount !== undefined && READING_SET_COUNTS.includes(savedReadingCount)) {
        setReadingSetCount(savedReadingCount)
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
    const [noEarphoneSetting, lRating, rRating] = await Promise.all([
      db.settings.get(NO_EARPHONE_MODE_KEY),
      db.ratings.get('L'),
      db.ratings.get('R'),
    ])
    const ratings = {
      L: lRating?.rating ?? DEFAULT_INITIAL_RATING,
      R: rRating?.rating ?? DEFAULT_INITIAL_RATING,
    }
    const questionMap = new Map(questionPool.map((q) => [q.id, q]))
    // イヤホン差し替え（リスニング→リーディング）を先に、レート連動の難易度差し替え（過度に難しい
    // 問題→実力相応）を後に適用する。両者ともkind:'drill'のみ対象・SRS由来itemは不変
    let filteredPack =
      noEarphoneSetting?.value === true ? applyNoEarphoneFilter(pack, questionMap) : pack
    filteredPack = applyRatingDifficultyFilter(filteredPack, questionMap, ratings)
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

  /** T-143: 読解のパッセージ数チップの選択（保存＋画面遷移・再起動を跨いで復元） */
  function handleSelectReadingSetCount(count: ReadingSetCount) {
    setReadingSetCount(count)
    void db.settings.put({ key: READING_SET_COUNT_KEY, value: count })
  }

  /**
   * 読解（Part7）単独モードの出題プール（T-143・J-80）。
   * Part6は空所補充で設問の型が別物なのでこのモードには入れない。
   * 複数パッセージ（passages 2件以上）は T-165 でタブ表示に対応済みなので**含める**
   * ——「じっくり読解」モードは元々その受け皿として設計された（docs/24 3.3節）
   */
  function readingPool(): Question[] {
    return questionPool.filter((q) => q.format === 'text_passage' && q.part === 7)
  }

  /** 選択中のパッセージ数に含まれる設問数の目安（J-80の「時間目安を提示」用） */
  function readingEstimate(count: number): ReadingEstimate {
    return readingQuestionEstimate(readingPool(), count)
  }

  /**
   * 読解（Part7）単独モードの開始（T-143・J-80。docs/24 3.3節）。
   * 問数ではなくパッセージ数で選ぶ点だけが他の単独モードと違う（1パッセージが複数設問を
   * 要求するため）。出題は毎回シャッフルして先頭N件を取る（J-57と同じ理由＝プール順固定だと
   * 後半に永遠に到達しない）。
   * 難易度ゲート（orderByRating）は読解には適用しない——text_passage の difficulty は
   * パッセージ単位の目安で、Part2/5の1問単位の難易度とは意味が揃っておらず、
   * レート比較の前提が成り立たない
   */
  async function startReadingMode() {
    setEmptyPackMessage(null)
    const pool = readingPool()
    if (pool.length === 0) {
      setEmptyPackMessage(EMPTY_PACK_MESSAGE)
      return
    }
    const selected = shuffle(pool).slice(0, readingSetCount)
    const items: SessionItem[] = selected.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await startSessionAndNavigate(items, { toScreen: 'reading' })
  }

  /** T-118: 問数選択チップの選択（保存＋画面遷移・再起動を跨いで復元） */
  function handleSelectSingleModeCount(count: SingleModeCount) {
    setSingleModeCount(count)
    void db.settings.put({ key: SINGLE_MODE_COUNT_KEY, value: count })
  }

  async function startSingleMode(format: 'audio_qa' | 'text_blank', options?: StartOptions) {
    // T-121: 単独モード開始時は「今日のクエスト」の空パック案内が残っていればクリアする
    setEmptyPackMessage(null)
    // T-154: 音声のみモードは応答音声が生成済みの問題しか出題できない（ADR 0008）。
    // 未対応の問題を混ぜると記号だけ出て解答できないため、プールの段階で絞る
    // （それでも混入した場合はDrillScreen側が問題単位で従来UIへ落とす二段構え）
    const filtered = questionPool.filter(
      (q) => q.format === format && (!options?.audioOnlyPart2 || supportsAudioOnlyPart2(q)),
    )
    // J-57: 各層内をシャッフルして先頭N問を取る（プール順固定だと後半に永遠に到達しない問題への対処）。
    // プールがN問未満のときはある分だけで開始する。
    // レート連動(orderByRating): 実力相応/以下の問題を先に、過度に難しい問題を後ろに並べる。
    // 注: 過度に難しい層は末尾に固定されるため、プールがN問超なら低レートのユーザーは
    // レートが閾値を越えるまでその層に到達しない（J-57の「後半到達不能」を難易度ゲートとして
    // 意図的に再導入。同一層内のシャッフルで層内の偏りは残さない）。
    const [lRating, rRating] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    const ratings = {
      L: lRating?.rating ?? DEFAULT_INITIAL_RATING,
      R: rRating?.rating ?? DEFAULT_INITIAL_RATING,
    }
    const ordered = orderByRating(filtered, ratings)
    const selected = ordered.slice(0, singleModeCount)
    const items: SessionItem[] = selected.map((q) => ({ questionId: q.id, mode: 'solo' }))
    if (items.length === 0) {
      setEmptyPackMessage(
        options?.audioOnlyPart2
          ? `${EMPTY_PACK_MESSAGE}（音声のみモードに対応した問題がまだありません）`
          : EMPTY_PACK_MESSAGE,
      )
      return
    }
    await startSessionAndNavigate(items, options)
  }

  async function startSessionAndNavigate(items: SessionItem[], options?: StartOptions) {
    if (items.length === 0) return
    // T-162（docs/27 のS-38）: window.confirm のYes/Noでは「続きから再開する」を
    // その場で選べず、ホームへ戻って別のボタンを探させることになっていた。
    // 3択のアプリ内ダイアログへ置き換える（開始要求を保持して選択後に続行する）
    if (resumeSnapshot) {
      setDiscardConfirm({ items, options })
      return
    }
    await beginNewSession(items, options)
  }

  async function beginNewSession(items: SessionItem[], options?: StartOptions) {
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    // toScreen は遷移先の指定だけなのでセッションストアへは渡さない（再生モードの設定と別物）
    const { toScreen, ...sessionOptions } = options ?? {}
    beginSession(
      snapshot,
      questionPool,
      {
        L: l?.rating ?? DEFAULT_INITIAL_RATING,
        R: r?.rating ?? DEFAULT_INITIAL_RATING,
      },
      sessionOptions,
    )
    // T-143: 読解は最初のitemがtext_passageなのでreadingへ直行する。DrillScreen経由でも
    // 自動切替はされるが、1レンダーぶん空のドリル画面を挟むのを避ける
    navigate(toScreen ?? 'drill')
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
          {/* T-162（docs/27 のS-38）: 破棄の確認を3択にする。window.confirm のYes/Noでは
              「続きから再開する」をその場で選べず、ホームへ戻って別のボタンを探す必要があった。
              ダイアログは position:fixed なのでDOM上の位置は問わない */}
          {discardConfirm && resumeSnapshot && (
            <ConfirmDialog
              message={confirmDiscardMessage(remainingAnswerSlots(resumeSnapshot, questionPool))}
              onDismiss={() => setDiscardConfirm(null)}
              actions={[
                {
                  label: '続きから再開する',
                  primary: true,
                  onSelect: () => {
                    setDiscardConfirm(null)
                    void handleResume()
                  },
                },
                {
                  label: '破棄して新しく始める',
                  onSelect: () => {
                    const pending = discardConfirm
                    setDiscardConfirm(null)
                    void beginNewSession(pending.items, pending.options)
                  },
                },
                { label: 'やめる', onSelect: () => setDiscardConfirm(null) },
              ]}
            />
          )}
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
              続きから再開（残り{remainingAnswerSlots(resumeSnapshot, questionPool)}問）
            </button>
          )}
          {/* T-112: チップは「今日のクエスト」専用であることをUIで明示するため、
              ボタン・チップをひとつのグループにまとめラベルを付ける（Part2瞬発等には作用しない） */}
          <div className="home-quest-group">
            <PrimaryButton
              onClick={() => void handleStartQuest()}
              disabled={questionPool.length === 0}
            >
              {/* docs/20 3.4節: 金CTAにサブテキストでパック内訳を添える（V-3）。
                  新規カード数はここでは未確定のため、実データがあるSRS復習件数のみ示す */}
              <span className="home-cta-label">今日のクエスト</span>
              {/* 時間チップの表記「7分」等と完全一致すると同一文言で複数要素になり
                  テスト上も判別不能になるため、「〜のクエスト」で必ず区別できる文にする */}
              <small className="home-cta-sub">
                {duration}分のクエスト{dueCount > 0 ? ` ・ SRS復習${dueCount}件` : ''}
              </small>
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
                {/* T-154: 本試験形式（3応答すべてを音声で流す）。ADR 0008でトグル併存と決定。
                    再生方法を1つ選ぶモーダルなのでチェックボックスにはしない
                    （partialAudioModeと同時ONに意味がない） */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPart2Options(false)
                    void startSingleMode('audio_qa', { audioOnlyPart2: true })
                  }}
                >
                  音声のみで解答（本試験形式）
                </button>
                <p className="home-part2-options-hint">
                  選択肢も音声で読み上げられ、記号だけが表示されます（TOEIC本試験と同じ形式）
                </p>
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
          {showReadingOptions && (
            // T-143(J-80): 読解はパッセージ数で選ぶ（1パッセージが2〜4設問を要求するため、
            // 他の単独モードの問数チップは使えない）。あわせて設問数の目安を出す
            <div
              className="home-part2-modal"
              role="dialog"
              aria-modal="true"
              aria-label="読解のパッセージ数を選択"
            >
              <div className="home-part2-options">
                <p>読解（Part7）のパッセージ数を選んでください</p>
                <p className="home-duration-chips__label">パッセージ数</p>
                <div className="home-duration-chips">
                  {READING_SET_COUNTS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`home-chip${c === readingSetCount ? ' is-selected' : ''}`}
                      onClick={() => handleSelectReadingSetCount(c)}
                    >
                      {c}本
                    </button>
                  ))}
                </div>
                {/* J-80: 着席・自宅想定なので時間目安を示す。読解の目安は1設問1分（24の3.5節） */}
                <p className="home-reading-estimate">
                  {formatReadingEstimate(readingEstimate(readingSetCount))}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowReadingOptions(false)
                    void startReadingMode()
                  }}
                >
                  開始
                </button>
                <button type="button" onClick={() => setShowReadingOptions(false)}>
                  キャンセル
                </button>
              </div>
            </div>
          )}
          {/* docs/20 3.4節: モードタイル（インラインSVGアイコン＋一言補足の2列グリッド。V-3）。
              アイコン色はモード色に合わせる: Part2=--listen・Part5=--gold・語彙=--violet・シャドーイング=--listen */}
          <div className="home-mode-grid">
            <button
              type="button"
              className="home-mode-tile"
              onClick={() => setShowPart2Options(true)}
            >
              <svg
                className="home-mode-tile__icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path d="M4 8v4h3l4 4V4L7 8H4z" fill="var(--listen)" />
                <path
                  d="M14 7c1 .8 1 5.2 0 6"
                  stroke="var(--listen)"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <span className="home-mode-tile__text">
                <span className="home-mode-tile__label">Part2瞬発</span>
                <small className="home-mode-tile__hint">音声を聞いて即答する</small>
              </span>
            </button>
            <button
              type="button"
              className="home-mode-tile"
              onClick={() => setShowPart5Options(true)}
            >
              <svg
                className="home-mode-tile__icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="14" height="2.2" rx="1" fill="var(--gold)" />
                <rect x="3" y="9" width="9" height="2.2" rx="1" fill="var(--gold)" opacity=".55" />
                <rect x="3" y="14" width="12" height="2.2" rx="1" fill="var(--gold)" opacity=".3" />
              </svg>
              <span className="home-mode-tile__text">
                <span className="home-mode-tile__label">Part5</span>
                <small className="home-mode-tile__hint">文法・語彙の穴埋め</small>
              </span>
            </button>
            {/* T-143(J-80): 「じっくり読解」モードの独立入口。通勤クエスト（3/7/15分チップ）とは
                視覚的に分離し、着席・自宅想定である旨を補足に出す（docs/24 3.3節・J-80）。
                アイコンはPart5の行組みと区別できるよう文書＋虫眼鏡の形にし、色は読解の
                アクセントとして--goldを弱めて使う（07の色トークン経由） */}
            <button
              type="button"
              className="home-mode-tile"
              onClick={() => setShowReadingOptions(true)}
            >
              <svg
                className="home-mode-tile__icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="11"
                  height="14"
                  rx="1.5"
                  stroke="var(--gold)"
                  strokeWidth="1.4"
                  fill="none"
                  opacity=".7"
                />
                <rect x="5.5" y="6" width="6" height="1.4" rx=".7" fill="var(--gold)" />
                <rect
                  x="5.5"
                  y="9"
                  width="6"
                  height="1.4"
                  rx=".7"
                  fill="var(--gold)"
                  opacity=".6"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="3"
                  stroke="var(--gold)"
                  strokeWidth="1.4"
                  fill="var(--surface)"
                />
                <path
                  d="M16.2 16.2 18 18"
                  stroke="var(--gold)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <span className="home-mode-tile__text">
                <span className="home-mode-tile__label">Part7 読解</span>
                <small className="home-mode-tile__hint">着席してじっくり読む</small>
              </span>
            </button>
            <button type="button" className="home-mode-tile" onClick={() => navigate('vocab')}>
              <svg
                className="home-mode-tile__icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="3"
                  width="11"
                  height="14"
                  rx="2"
                  fill="none"
                  stroke="var(--violet)"
                  strokeWidth="1.5"
                />
                <rect
                  x="6"
                  y="1.5"
                  width="11"
                  height="14"
                  rx="2"
                  fill="var(--bg)"
                  stroke="var(--violet)"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="home-mode-tile__text">
                <span className="home-mode-tile__label">語彙SRS</span>
                <small className="home-mode-tile__hint">SRSで復習・記憶</small>
              </span>
            </button>
            <button type="button" className="home-mode-tile" onClick={() => navigate('shadowing')}>
              <svg
                className="home-mode-tile__icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  d="M3 10h2l2-5 3 10 2.5-7 1.5 2h3"
                  stroke="var(--listen)"
                  strokeWidth="1.5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="home-mode-tile__text">
                <span className="home-mode-tile__label">
                  シャドーイング{phase && ` L${phase.listeningStage}`}
                </span>
                <small className="home-mode-tile__hint">音声を真似て発音練習</small>
              </span>
            </button>
          </div>
          {/* ダッシュボード・設定・レイドはモード導線ではなくナビゲーションのため、
              モードタイルとは別枠に据え置く（docs/20 3.4節はPart2/Part5/語彙/シャドーイングの
              4タイルのみを規定。他はモックアップにも無い既存機能で構造は変えない） */}
          <div className="home-grid">
            {/* S9 間違えた問題一覧（発起人の要望、2026-08-03）。モードタイル（docs/20 3.4節が
                4タイルを規定）ではなくナビゲーション枠に置く——復習の入口であって
                出題モードではない */}
            <button type="button" onClick={() => navigate('wrongAnswers')}>
              間違えた問題
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
            {/* M4・T-125: イベントバトル参加の入口（isConfigured時のみ。共有API無効時は入口ごと非表示=22の2.3節）。
                V-13（docs/25 4.8節）: 5導線の中でイベントバトルの2つを識別できるよう--raidのアイコンを付ける。
                アイコンは装飾（aria-hidden）で、識別は文字ラベルでも成立する（07の原則4） */}
            {raidApi.isConfigured() && (
              <button type="button" onClick={() => navigate('battle')}>
                <svg
                  className="home-grid__icon"
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <circle
                    cx="7"
                    cy="6"
                    r="2.6"
                    fill="none"
                    stroke="var(--raid)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M2.6 16.5c0-2.7 2-4.4 4.4-4.4s4.4 1.7 4.4 4.4"
                    fill="none"
                    stroke="var(--raid)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M13.4 9h4.2M15.6 7l2 2-2 2"
                    fill="none"
                    stroke="var(--raid)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>イベントバトルに参加</span>
              </button>
            )}
            {/* M4・T-126: イベントバトル主催（ホスト）の入口（isConfigured時のみ。同上） */}
            {raidApi.isConfigured() && (
              <button type="button" onClick={() => navigate('battleHost')}>
                <svg
                  className="home-grid__icon"
                  width="18"
                  height="18"
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                >
                  <rect
                    x="2.5"
                    y="3.5"
                    width="15"
                    height="10"
                    rx="1.5"
                    fill="none"
                    stroke="var(--raid)"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M10 13.5v3M7 16.5h6"
                    fill="none"
                    stroke="var(--raid)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
                <span>イベントバトルを主催</span>
              </button>
            )}
          </div>
        </>
      }
    >
      <Wordmark />
      {/* docs/20 3.4節(S1): ヒーローカード。レイド参加中はBossSigil＋
          HPバー、未参加時はシーズン表示に縮退する（JV-2） */}
      {showRaidHp ? (
        <div className="home-hero">
          <div className="home-hero-top">
            {raidState && <BossSigil seed={raidState.bossId} size={56} />}
            {/* レビューF2(b): button内の<p>は内容モデル違反でSRに正しく伝わらないためspan化し、
               全体の意味はaria-labelで伝える（バー本体は装飾としてaria-hidden） */}
            <button
              type="button"
              className="home-raid-hp"
              data-testid="home-raid-hp"
              aria-label={`ボスHP ${hpPercent}%、残り${remainingDays}日。タップでレイド画面へ`}
              onClick={() => navigate('raid')}
            >
              <span className="home-raid-hp-line home-hero-eyebrow">WEEKLY BOSS</span>
              <span className="home-raid-hp-line home-raid-hp-boss">{bossName}</span>
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
          </div>
        </div>
      ) : (
        phase && (
          <div className="home-hero">
            <div className="home-season" data-testid="home-season">
              {/* docs/26 A-2: シーズン名と空の進捗バーだけで高さ190pxのカードが空いていた。
                  英字ラベル（WEEKLY BOSS 側と同じ .home-hero-eyebrow）と達成率の数値を足して
                  階層を作る。数値は既に progressbar の aria-valuenow が持っている情報の可視化で、
                  情報を増やしていない（07の原則4: バーだけに頼らない） */}
              <span className="home-hero-eyebrow">SEASON</span>
              <p className="home-season-name">{SEASON_LABELS[phase.season]}</p>
              {phaseProgress !== null && (
                <>
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
                  <p className="home-season-progress-value">
                    このシーズンの達成度 {Math.round(phaseProgress * 100)}%
                  </p>
                </>
              )}
            </div>
          </div>
        )
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
