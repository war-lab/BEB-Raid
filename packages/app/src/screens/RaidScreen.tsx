// S5 レイド専用画面（M3・T-98。正本: docs/17_M3実装計画.md 3.3節・3.7節、docs/02 5節）。
// 未登録（招待コード入力）→登録済み（現ボス表示・参加・挑戦・手動同期）→討伐演出の一連。
// 「レイドに挑む」は既存のstartSession系統にmode='raid'を渡すだけで、DrillScreen側は変更しない
// （answerPipelineがmodeを透過するため=3.3節）。
import { useEffect, useMemo, useState } from 'react'
import type { DailyGoal, Question, RaidBossState } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID, RAID_STATE_ID, type BadgeRecord, type RaidStateRecord } from '../db/schema'
import { toDateString } from '../engine/date'
import { generateQuickPack } from '../engine/quickPack'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { formatRelativeTime } from '../engine/relativeTime'
import { selectGhostBossQuestions } from '../engine/ghostBossSelection'
import { buildFullQuestionLookup, buildGhostWeaknessMap } from '../engine/ghostWeaknessMap'
import type { RaidApi } from '../platform'
import { RaidApiError } from '../platform'
import { withdrawGhostBossRecord } from '../services/ghostBoss'
import { getOrInitPhaseState } from '../services/phase'
import {
  buildRaidStateBossCache,
  RAID_FIRST_CLEAR_BADGE_ID,
  syncRaidDamage,
} from '../services/raidSync'
import { startSession, type SessionItem, type SessionSnapshot } from '../services/session'
import {
  GHOST_BOSS_SUBMITTED_AT_KEY,
  RAID_REGISTERED_AT_KEY,
  RAID_SYNC_ENABLED_KEY,
} from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useRaidSyncStore } from '../store/raidSyncStore'
import { useSessionStore } from '../store/sessionStore'
import { BossSigil } from '../components/BossSigil'
import { GhostWeaknessMap } from '../components/GhostWeaknessMap'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PrimaryButton } from '../components/PrimaryButton'
import { RaidContributionList } from '../components/RaidContributionList'
import { RaidEmptyNote } from '../components/RaidEmptyNote'
import { ScreenLayout } from '../components/ScreenLayout'
import { confirmDiscardMessage, remainingAnswerSlots, toSessionItems } from './HomeScreen'

interface Props {
  db: BebRaidDatabase
  raidApi: RaidApi
  questionPool: Question[]
  resumeSnapshot: SessionSnapshot | null
}

/** レイド挑戦セッションの長さ（3.3節: 7分プリセットをそのまま流用） */
const RAID_QUEST_DURATION = 7

/** 空パック時の案内文言（T-121・J-60。HomeScreenと同文言・補足文なし） */
const EMPTY_PACK_MESSAGE = '今は出題できる問題がありません'

const DAY_MS = 24 * 60 * 60 * 1000

const DAILY_GOAL_LABELS: Record<DailyGoal, string> = {
  light: '少なめ',
  normal: '普通',
  heavy: '多め',
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
// （HomeScreen.tsx・SettingsScreen.tsxと同じ回避策）
function now(): number {
  return Date.now()
}

/** レイド系バッジ判定（M3・T-102。3.9節のbadgeId規約） */
function isRaidBadge(badgeId: string): boolean {
  return badgeId === RAID_FIRST_CLEAR_BADGE_ID || badgeId.startsWith('raid-clear:')
}

/** 討伐履歴を兼ねる簡素な表示ラベル（3.9節: S5内の簡素な一覧でよい）。
 * bossId（`boss-<年>-W<週>`）は「2026年 第29週」に整形し、規約外のIDはそのまま表示する（レビューF1(h)） */
export function raidBadgeLabel(badgeId: string): string {
  if (badgeId === RAID_FIRST_CLEAR_BADGE_ID) return '初回討伐'
  const bossId = badgeId.slice('raid-clear:'.length)
  const matched = /^boss-(\d{4})-W(\d{1,2})$/.exec(bossId)
  if (matched) return `討伐: ${matched[1]}年 第${Number(matched[2])}週`
  return `討伐: ${bossId}`
}

/** 登録失敗時のエラーメッセージ出し分け（レビューF1(g)・T-115）。
 * RaidApiError.status（実際のHTTPステータス）で判定する。401以外の400系はkind='unknown'に
 * status=4xxが入る（T-115で文字列の正規表現判定から置き換えた。エラーメッセージの
 * 文言変更に引きずられない） */
function registerErrorMessage(e: unknown): string {
  if (e instanceof RaidApiError) {
    if (e.kind === 'unauthorized') return '招待コードが正しくありません'
    if (e.status !== undefined && e.status >= 400 && e.status < 500) {
      return '入力内容を確認してください'
    }
  }
  return '登録に失敗しました。通信を確認してください'
}

/** raidStateキャッシュのボス名（破損JSONでも画面を壊さない。HomeScreenのF2(a)と同じガード） */
function parseCachedBossName(raidState: RaidStateRecord | null): string | null {
  if (!raidState) return null
  try {
    return (JSON.parse(raidState.profileJson) as { name: string }).name
  } catch {
    return null
  }
}

async function loadRaidBadges(db: BebRaidDatabase): Promise<BadgeRecord[]> {
  const all = await db.badges.toArray()
  return all.filter((b) => isRaidBadge(b.badgeId)).sort((a, b) => b.earnedAt - a.earnedAt)
}

export function RaidScreen({ db, raidApi, questionPool, resumeSnapshot }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)
  // T-103: バックグラウンド同期の完了通知（syncCountが変わるたびに再読込）
  const raidSyncCount = useRaidSyncStore((s) => s.syncCount)
  const raidSyncFailed = useRaidSyncStore((s) => s.lastFailed)

  const [loaded, setLoaded] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [deviceToken, setDeviceToken] = useState('')
  // issue #43: 「読込成功かつプロフィール不在」を明示的に持つ。deviceTokenの空判定だけだと
  // DB読取失敗（プロフィール有無が不明）と区別できず、失敗時に誤って診断誘導へ倒してしまうため
  const [profileMissing, setProfileMissing] = useState(false)
  const [raidState, setRaidState] = useState<RaidStateRecord | null>(null)
  const [currentBoss, setCurrentBoss] = useState<RaidBossState | null>(null)
  const [raidBadges, setRaidBadges] = useState<BadgeRecord[]>([])

  const [inviteCode, setInviteCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [dailyGoal, setDailyGoal] = useState<DailyGoal>('normal')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [registering, setRegistering] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  // レビューF1(c): 401検出時に登録フォームを再表示するためのローカルstate（raidRegisteredAtは消さない）
  const [showRegisterForm, setShowRegisterForm] = useState(false)
  const [syncUnauthorized, setSyncUnauthorized] = useState(false)
  // レビューF1(b): 404（今週のボス未生成）と通信失敗を区別する。
  // fetchCurrentBoss()は404をnullで返し、通信失敗はthrowするため、catch側でこのフラグを立てる
  const [bossFetchFailed, setBossFetchFailed] = useState(false)
  // T-212(Q-44): 再試行導線が無く、通信状態が変わっても復帰手段が「開き直す」しかなかった
  const [bossFetchRetrying, setBossFetchRetrying] = useState(false)
  // T-105(b): 相対時刻・raidEnded判定のtick更新用の現在時刻state
  const [nowMs, setNowMs] = useState(now())
  // T-121(J-60): 生成パックが0問だったときの案内。自動では消さず、セッション開始成功でクリアする
  const [emptyPackMessage, setEmptyPackMessage] = useState<string | null>(null)
  // T-162（docs/27 のS-38）: 進行中セッションを破棄してレイドに挑むときの確認（3択）
  const [discardConfirm, setDiscardConfirm] = useState(false)

  // M4・T-128: ボス役セッション（docs/22 3.5節）
  const [showGhostBossConsent, setShowGhostBossConsent] = useState(false)
  const [ghostBossConsentChecked, setGhostBossConsentChecked] = useState(false)
  const [ghostBossError, setGhostBossError] = useState<string | null>(null)
  const [ghostBossStarting, setGhostBossStarting] = useState(false)
  // 送信済み記録があるか（撤回導線の表示要否。端末内キャッシュ=settingsKeys.ts参照）
  const [ghostBossSubmitted, setGhostBossSubmitted] = useState(false)
  const [ghostBossWithdrawing, setGhostBossWithdrawing] = useState(false)
  const [ghostBossWithdrawError, setGhostBossWithdrawError] = useState<string | null>(null)
  // T-202（docs/29 Q-33・J-105）: 撤回はサーバーから即時削除される不可逆操作なのに確認が
  // 無かった（立候補側は同意画面＋チェックボックスの二重防御なのに撤回は無防備だった）
  const [ghostBossWithdrawConfirm, setGhostBossWithdrawConfirm] = useState(false)

  // レイド機能が利用可能な間だけ60秒tickで現在時刻を進める（raidEnded・残り日数・最終同期表示に使う）
  useEffect(() => {
    if (!raidApi.isConfigured()) return
    const id = setInterval(() => setNowMs(now()), 60_000)
    return () => clearInterval(id)
  }, [raidApi])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profile, registeredSetting, raidStateRecord, badges, ghostBossSubmittedSetting] =
          await Promise.all([
            db.profile.get(PROFILE_ID),
            db.settings.get(RAID_REGISTERED_AT_KEY),
            db.raidState.get(RAID_STATE_ID),
            loadRaidBadges(db),
            db.settings.get(GHOST_BOSS_SUBMITTED_AT_KEY),
          ])
        if (cancelled) return
        if (profile) {
          setDeviceToken(profile.deviceToken)
          setDisplayName(profile.displayName)
        } else {
          // issue #43: 読込に成功した上でプロフィールが無い＝初期診断が未完了/未スキップ。
          // このときだけ登録フォームでなく診断誘導を出す（DB読取失敗時はここに来ない）
          setProfileMissing(true)
        }
        const isRegistered = registeredSetting?.value !== undefined
        setRegistered(isRegistered)
        setRaidState(raidStateRecord ?? null)
        setRaidBadges(badges)
        setGhostBossSubmitted(ghostBossSubmittedSetting?.value !== undefined)

        if (isRegistered && raidApi.isConfigured()) {
          try {
            const boss = await raidApi.fetchCurrentBoss() // 404はnull・通信失敗はthrow
            if (!cancelled) {
              setCurrentBoss(boss)
              setBossFetchFailed(false)
            }
          } catch (e) {
            if (!cancelled) setBossFetchFailed(true)
            console.warn('[RaidScreen] 現ボスの取得に失敗', e)
          }
        }
      } catch (e) {
        // DB読み取り失敗でも白画面（読み込み中のまま）にしない。原因追跡用にログのみ残す
        console.warn('[RaidScreen] 初期読み込みに失敗', e)
      } finally {
        // レビューF1(a): 失敗経路でもloadedを立てる（恒久「読み込み中」の防止）
        if (!cancelled) setLoaded(true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db, raidApi])

  // T-103: バックグラウンド同期完了時、DBキャッシュ（raidState・獲得バッジ）だけ再読込する。
  // fetchCurrentBossは呼ばない（T-104: 手動同期はsyncDamageのレスポンスbossで直接更新するため、
  // ここで再fetchすると二重更新・無駄な通信になる）
  useEffect(() => {
    let cancelled = false
    async function reload() {
      try {
        const [raidStateRecord, badges] = await Promise.all([
          db.raidState.get(RAID_STATE_ID),
          loadRaidBadges(db),
        ])
        if (cancelled) return
        setRaidState(raidStateRecord ?? null)
        setRaidBadges(badges)
      } catch (e) {
        console.warn('[RaidScreen] 同期完了後の再読込に失敗', e)
      }
    }
    void reload()
    return () => {
      cancelled = true
    }
  }, [db, raidSyncCount])

  // M4・T-129: ゴースト週の弱点マップ（docs/22 3.4節）。フックはearly returnより前に置く
  // 必要がある（React hooksのルール）ため、後段の条件分岐より前にここで計算する。
  // 個別questionIdはUIへ渡さず、Part・タグ単位の集計結果のみをJSXで使う
  const ghostWeaknessMap = useMemo(() => {
    if (!currentBoss?.defense) return []
    const lookup = buildFullQuestionLookup(questionPool)
    return buildGhostWeaknessMap(currentBoss.defense, lookup)
  }, [currentBoss, questionPool])

  /**
   * T-212(Q-44): ボス情報の取得失敗（通信断・サーバー障害）からの再試行導線。
   * 従来は「最新情報を取得できませんでした」を表示するのみで、復帰にはアプリの
   * 開き直し（起動時の初回読み込みのやり直し）しか手段が無かった
   */
  async function handleRetryBossFetch() {
    if (!raidApi.isConfigured()) return
    setBossFetchRetrying(true)
    try {
      const boss = await raidApi.fetchCurrentBoss() // 404はnull・通信失敗はthrow
      setCurrentBoss(boss)
      setBossFetchFailed(false)
    } catch (e) {
      setBossFetchFailed(true)
      console.warn('[RaidScreen] 現ボスの再取得に失敗', e)
    } finally {
      setBossFetchRetrying(false)
    }
  }

  async function handleRegister() {
    setRegisterError(null)
    // issue #43: プロフィール未作成（初期診断を完了/スキップしていない）だとdeviceTokenが空のまま。
    // 空トークンはAPI側の入力検証（deviceToken.length > 0）で400になるため、送信前に遮断する。
    // UI側でも登録フォームを出さず診断へ誘導するが、経路が増えても事故らないよう二重防御にする
    if (!deviceToken) {
      setRegisterError('初期診断を完了してからレイドに参加してください')
      return
    }
    // レビューF1(g): 送信前の空チェック（無駄な通信とサーバー側エラーの往復を避ける）
    if (inviteCode.trim() === '') {
      setRegisterError('招待コードを入力してください')
      return
    }
    if (displayName.trim() === '') {
      setRegisterError('表示名を入力してください')
      return
    }
    setRegistering(true)
    try {
      await raidApi.register({
        inviteCode: inviteCode.trim(),
        deviceToken,
        displayName: displayName.trim(),
        dailyGoal,
      })
      await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: Date.now() })
      setRegistered(true)
      setShowRegisterForm(false)
      setSyncUnauthorized(false)
      try {
        const boss = await raidApi.fetchCurrentBoss()
        setCurrentBoss(boss)
        setBossFetchFailed(false)
      } catch {
        setBossFetchFailed(true)
      }
    } catch (e) {
      setRegisterError(registerErrorMessage(e))
    } finally {
      setRegistering(false)
    }
  }

  async function handleJoin() {
    if (!currentBoss) return
    // 呼び出し側は `void handleJoin()` で投げっぱなしにするため、ここで必ず捕まえる。
    // 捕まえないと失敗が unhandled rejection になり、利用者には何も伝わらないまま
    // 参加できていない状態になる（画面遷移や離脱で書込中に閉じた場合も同様）
    try {
      await db.raidState.put({
        id: RAID_STATE_ID,
        bossId: currentBoss.bossId,
        profileJson: JSON.stringify({ name: currentBoss.name }),
        hp: currentBoss.hp,
        maxHp: currentBoss.maxHp,
        myDamage: currentBoss.myDamage,
        joined: true,
        startAt: currentBoss.startAt,
        endAt: currentBoss.endAt,
        lastSyncedAt: Date.now(),
        ...buildRaidStateBossCache(currentBoss),
      })
      await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
      setRaidState((await db.raidState.get(RAID_STATE_ID)) ?? null)
    } catch (e) {
      console.warn('[RaidScreen] レイドへの参加の記録に失敗', e)
      setSyncError('参加の記録に失敗しました。時間をおいて試してください')
    }
  }

  async function handleChallenge() {
    // T-162（docs/27 のS-38）: HomeScreenと同じ3択ダイアログにする。
    // 「続きから再開する」はホーム側の導線なので、ここでは案内だけを出して
    // ホームへ戻す（レイド画面から他モードのセッションを再開させない）
    if (resumeSnapshot) {
      setDiscardConfirm(true)
      return
    }
    await challengeAfterDiscard()
  }

  /**
   * レイドクエストの開始（T-162で handleChallenge から切り出した）。
   * 破棄の確認を経た場合はダイアログからここへ直接入る
   */
  async function challengeAfterDiscard() {
    setEmptyPackMessage(null)
    // handleJoinと同じ理由でここでも捕まえる（`void handleChallenge()` で呼ばれる）。
    // 失敗を放置するとボタンを押しても何も起きない状態になり、原因も伝わらない
    try {
      await startRaidQuest()
    } catch (e) {
      console.warn('[RaidScreen] レイドクエストの開始に失敗', e)
      setSyncError('クエストの開始に失敗しました。時間をおいて試してください')
    }
  }

  /** レイドクエストの生成〜セッション開始。失敗時の扱いは呼び出し側（handleChallenge）が持つ */
  async function startRaidQuest() {
    const phase = await getOrInitPhaseState(db)
    const pack = await generateQuickPack(db, {
      duration: RAID_QUEST_DURATION,
      questions: questionPool,
      phase: phase.season,
      listeningStage: phase.listeningStage,
    })
    // 通常出題（mode='solo'）だけをraidへ切り替える。SRS復習items（mode='srs'）は
    // レート・ダメージ対象外の既存挙動を維持する（damageConfig.jsonのsrs:0と整合）
    const items = toSessionItems(pack.items).map((item) =>
      item.mode === 'solo' ? { ...item, mode: 'raid' as const } : item,
    )
    // J-60: HomeScreenの「今日のクエスト」と同様、生成パックが0問なら黙って何も起きない
    // 従来挙動をやめ、案内を表示する
    if (items.length === 0) {
      setEmptyPackMessage(EMPTY_PACK_MESSAGE)
      return
    }

    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(snapshot, questionPool, {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
    navigate('drill')
  }

  /**
   * ボス役セッションの開始（M4・T-128。docs/22 3.5節）。
   * 同意チェックボックスが確定していない限りこの関数は呼ばれない（handleGhostBossConsentConfirm
   * からのみ呼ぶ。ボタン自体もconsentCheckedがfalseの間はdisabled=UI・呼び出し経路の両面で防ぐ）。
   * beginSession に isGhostBossSession: true を渡すのはこの経路のみ
   * （GhostBossResultScreenの送信ボタンが到達可能になる唯一の入口）
   */
  async function handleGhostBossConsentConfirm() {
    if (!ghostBossConsentChecked || ghostBossStarting) return
    setGhostBossError(null)
    setGhostBossStarting(true)
    try {
      const selection = selectGhostBossQuestions(questionPool)
      if (!selection) {
        setGhostBossError(
          '出題できる高難度問題の在庫が不足しています。運営に増産を相談してください',
        )
        return
      }
      const items: SessionItem[] = selection.questions.map((q) => ({
        questionId: q.id,
        mode: 'battle' as const,
      }))
      const snapshot = await startSession(db, { items })
      // ボス役セッションはレート対象外（3.5節・3.2節と同じ扱い）のため、ratingBeforeは
      // 使わない（GhostBossResultScreenがレート変動を表示しないため null で足りる）
      beginSession(snapshot, questionPool, null, { isGhostBossSession: true })
      setShowGhostBossConsent(false)
      setGhostBossConsentChecked(false)
      navigate('drill')
    } catch (e) {
      // startSession（既存の中断セッションが残っている等）で例外が出ても
      // 画面が無反応にならないようにする（catchが無いとvoid呼び出しのため握り潰される）
      console.error('[RaidScreen] ボス役セッションの開始に失敗', e)
      setGhostBossError('セッションを開始できませんでした。時間をおいて再度お試しください')
    } finally {
      setGhostBossStarting(false)
    }
  }

  /** 送信済みボス役記録の撤回（J-67の開示事項。DELETE /ghosts/ownは記録が無くても200・冪等） */
  async function handleWithdrawGhostBoss() {
    setGhostBossWithdrawError(null)
    setGhostBossWithdrawing(true)
    try {
      await withdrawGhostBossRecord(raidApi)
      await db.settings.delete(GHOST_BOSS_SUBMITTED_AT_KEY)
      setGhostBossSubmitted(false)
    } catch (e) {
      console.warn('[RaidScreen] ボス役記録の撤回に失敗', e)
      setGhostBossWithdrawError('撤回に失敗しました。通信を確認してください')
    } finally {
      setGhostBossWithdrawing(false)
    }
  }

  async function handleManualSync() {
    setSyncError(null)
    // `void handleManualSync()` で呼ばれるため、想定外の例外もここで捕まえる
    // （syncRaidDamage自体は結果オブジェクトを返すが、db操作は投げうる）
    try {
      await runManualSync()
    } catch (e) {
      console.warn('[RaidScreen] 手動同期に失敗', e)
      setSyncError('同期に失敗しました。通信を確認してください')
    }
  }

  /** 手動同期の本体。失敗時の扱いは呼び出し側（handleManualSync）が持つ */
  async function runManualSync() {
    const result = await syncRaidDamage(db, raidApi)
    if (!result.ok) {
      const unauthorized = useRaidSyncStore.getState().lastUnauthorized
      // レビューF1(c): 401なら「再登録する」ボタンを出す（syncUnauthorized経由）
      setSyncUnauthorized(unauthorized)
      setSyncError(
        unauthorized
          ? '登録が無効です。招待コードで再登録してください'
          : '同期に失敗しました。通信を確認してください',
      )
      return
    }
    setSyncUnauthorized(false)
    // T-104: レスポンスのbossで直接更新する（追加のfetchCurrentBossは不要。バッジ再取得のみ従来どおり）
    const [updatedRaidState, updatedBadges] = await Promise.all([
      db.raidState.get(RAID_STATE_ID),
      loadRaidBadges(db),
    ])
    setRaidState(updatedRaidState ?? null)
    if (result.boss) setCurrentBoss(result.boss)
    setRaidBadges(updatedBadges)
  }

  if (!raidApi.isConfigured()) {
    return (
      <ScreenLayout
        status={<p>レイド</p>}
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p>レイド機能は現在利用できません</p>
      </ScreenLayout>
    )
  }

  if (!loaded) {
    // レビューF1(a): データ読み込み中（最大15秒）の白画面を避けるプレースホルダ
    return (
      <ScreenLayout
        status={<p>レイド</p>}
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p>読み込み中…</p>
      </ScreenLayout>
    )
  }

  // issue #43: プロフィール未作成（deviceTokenが空）のユーザーは登録フォームを出さず初期診断へ誘導する。
  // 空トークンでの登録はAPIで400になり「入力内容を確認してください」としか出ず原因が伝わらないため。
  // 再登録フロー（showRegisterForm）は登録済み=プロフィール前提でdeviceTokenが埋まっているので該当しない。
  // profileMissing（読込成功かつ不在）でのみ誘導し、DB読取失敗時は従来どおり登録フォームへフォールバックする
  if ((!registered || showRegisterForm) && profileMissing) {
    return (
      <ScreenLayout
        status={<p>レイド登録</p>}
        action={
          <>
            <PrimaryButton onClick={() => navigate('diagnostic')}>初期診断へ</PrimaryButton>
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              ホームへ
            </button>
          </>
        }
      >
        <div className="settings-list" data-testid="raid-needs-profile">
          <p className="settings-note">
            レイドに参加するには初期診断が必要です。診断を完了するか、自己申告スコアでスキップすると参加できます。
          </p>
        </div>
      </ScreenLayout>
    )
  }

  if (!registered || showRegisterForm) {
    return (
      <ScreenLayout
        status={<p>レイド登録</p>}
        action={
          <>
            <PrimaryButton onClick={() => void handleRegister()} disabled={registering}>
              登録する
            </PrimaryButton>
            {registered && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowRegisterForm(false)}
              >
                キャンセル
              </button>
            )}
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              ホームへ
            </button>
          </>
        }
      >
        <div className="settings-list" data-testid="raid-register-form">
          {/* T-116(9): レイドが何をする機能か分からないという指摘への対処 */}
          <p className="settings-note">
            チームで週次ボスのHPを削る協力イベントです。招待コードは主催者から受け取ってください。
          </p>
          <section>
            <label>
              招待コード
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
              />
            </label>
          </section>
          <section>
            <label>
              表示名
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </label>
          </section>
          <section>
            <p>1日の目安</p>
            <p className="settings-note">
              1日に解く問題数の目安です。参加者全員の申告からボスのHPが決まります（少なめ=約5問・普通=約15問・多め=約30問）
            </p>
            {(['light', 'normal', 'heavy'] as const).map((goal) => (
              <label key={goal}>
                <input
                  type="radio"
                  name="dailyGoal"
                  checked={dailyGoal === goal}
                  onChange={() => setDailyGoal(goal)}
                />
                {DAILY_GOAL_LABELS[goal]}
              </label>
            ))}
          </section>
          {registerError && <p className="drill-error">{registerError}</p>}
        </div>
      </ScreenLayout>
    )
  }

  // M4・T-128: ボス役の同意画面（docs/22 3.5節。共有される内容を明示してから同意を取る）。
  // 「同意して開始」はconsentCheckedがtrueでない限りdisabled。ハンドラ側
  // （handleGhostBossConsentConfirm）も未チェックなら即returnする二重防御
  if (showGhostBossConsent) {
    return (
      <ScreenLayout
        status={<p>ボス役に立候補</p>}
        action={
          <>
            <PrimaryButton
              onClick={() => void handleGhostBossConsentConfirm()}
              disabled={!ghostBossConsentChecked || ghostBossStarting}
            >
              同意して開始
            </PrimaryButton>
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setShowGhostBossConsent(false)
                setGhostBossConsentChecked(false)
                setGhostBossError(null)
              }}
            >
              やめる
            </button>
          </>
        }
      >
        <div className="settings-list" data-testid="ghost-boss-consent">
          <p className="settings-note">
            ボス役は高難度の問題セットを解き、その正誤記録を今週のゴーストレイドのボスに変換します。
            開始前に次の内容を確認してください。
          </p>
          <ul className="result-list">
            <li>自分の問題別の正誤が、レイド参加者全員に「堅い/弱点」として見えます</li>
            <li>表示名（{displayName || '（未設定）'}）がボス名として全員に見えます</li>
            <li>いつでも撤回でき、撤回すると記録はサーバーから即時削除されます</li>
          </ul>
          <label>
            <input
              type="checkbox"
              checked={ghostBossConsentChecked}
              onChange={(e) => setGhostBossConsentChecked(e.target.checked)}
              data-testid="ghost-boss-consent-checkbox"
            />
            上記の内容に同意します
          </label>
          {ghostBossError && <p className="drill-error">{ghostBossError}</p>}
        </div>
      </ScreenLayout>
    )
  }

  const hpPercent =
    currentBoss && currentBoss.maxHp > 0
      ? Math.round((currentBoss.hp / currentBoss.maxHp) * 100)
      : 0
  const joined = raidState?.joined === true
  // M3・T-99: オフライン表示規約（3.7節）。参加前はlastSyncedAtが無意味なのでjoined時のみ表示。
  // T-105: nowMsは60秒tickで更新される
  const lastSyncedLabel =
    joined && raidState ? formatRelativeTime(nowMs - raidState.lastSyncedAt) : null
  const syncFailed = raidSyncFailed
  // レビューF1(d): 討伐済み・期限切れなら参加/挑戦を無効化する（成果ゼロの徒労防止）。
  // 通信失敗でボス最新が取れないときはraidStateキャッシュのendAtで判定する
  const raidEnded = currentBoss
    ? currentBoss.status !== 'active' || nowMs > currentBoss.endAt
    : raidState !== null && nowMs > raidState.endAt
  // レビューF1(f): 残り日数（HomeScreenのremainingDays計算と同じパターン）
  const remainingDays = currentBoss
    ? Math.max(0, Math.ceil((currentBoss.endAt - nowMs) / DAY_MS))
    : 0
  // レビューF1(b): 通信失敗時のキャッシュ表示用
  const cachedBossName = parseCachedBossName(raidState)
  const cachedHpPercent =
    raidState && raidState.maxHp > 0 ? Math.round((raidState.hp / raidState.maxHp) * 100) : 0

  return (
    <ScreenLayout
      status={
        <>
          <p>レイド</p>
          {/* T-162（docs/27 のS-38）: 3択にする。「続きから再開する」はホーム側の導線なので、
              ここではホームへ戻す選択肢として出す（レイド画面から他モードのセッションを
              再開させない）。ダイアログは position:fixed なのでDOM上の位置は問わない */}
          {discardConfirm && resumeSnapshot && (
            <ConfirmDialog
              message={confirmDiscardMessage(remainingAnswerSlots(resumeSnapshot, questionPool))}
              onDismiss={() => setDiscardConfirm(false)}
              actions={[
                {
                  label: '破棄してレイドに挑む',
                  primary: true,
                  onSelect: () => {
                    setDiscardConfirm(false)
                    void challengeAfterDiscard()
                  },
                },
                {
                  label: 'ホームへ戻って続きから再開する',
                  onSelect: () => {
                    setDiscardConfirm(false)
                    navigate('home')
                  },
                },
                { label: 'やめる', onSelect: () => setDiscardConfirm(false) },
              ]}
            />
          )}
        </>
      }
      action={
        <>
          {/* T-212(Q-44): 取得失敗からの再試行導線。オフライン中はraidApi呼び出し自体が
              失敗するだけなので無効化はしない（タップして初めて最新のnavigator.onLineを
              見られるほうが、オンライン復帰直後に有効化されないより実害が小さい） */}
          {!currentBoss && bossFetchFailed && (
            <button
              type="button"
              className="secondary-action"
              data-testid="raid-retry-boss-fetch"
              onClick={() => void handleRetryBossFetch()}
              disabled={bossFetchRetrying}
            >
              {bossFetchRetrying ? '再試行中…' : '再試行'}
            </button>
          )}
          {!joined && currentBoss && (
            <PrimaryButton onClick={() => void handleJoin()} disabled={raidEnded}>
              参加する
            </PrimaryButton>
          )}
          {joined && (
            <PrimaryButton onClick={() => void handleChallenge()} disabled={raidEnded}>
              レイドに挑む
            </PrimaryButton>
          )}
          {emptyPackMessage && <p className="home-pool-empty-hint">{emptyPackMessage}</p>}
          {joined && (
            <button
              type="button"
              className="secondary-action"
              onClick={() => void handleManualSync()}
            >
              今すぐ同期
            </button>
          )}
          {syncError && <p className="drill-error">{syncError}</p>}
          {syncUnauthorized && (
            <button
              type="button"
              className="secondary-action"
              data-testid="raid-reregister"
              onClick={() => setShowRegisterForm(true)}
            >
              再登録する
            </button>
          )}
          {/* M4・T-128: ボス役立候補（isConfigured かつ登録済みのときのみ=3.5節） */}
          {!ghostBossSubmitted && (
            <button
              type="button"
              className="secondary-action"
              data-testid="ghost-boss-candidate"
              onClick={() => setShowGhostBossConsent(true)}
            >
              ボス役に立候補
            </button>
          )}
          {ghostBossSubmitted && (
            <button
              type="button"
              className="secondary-action"
              data-testid="ghost-boss-withdraw"
              onClick={() => setGhostBossWithdrawConfirm(true)}
              disabled={ghostBossWithdrawing}
            >
              ボス役記録を撤回する
            </button>
          )}
          {/* T-202（Q-33）: 確認なしの1タップ即時削除だった。撤回後は取り消せないことを明示する */}
          {ghostBossWithdrawConfirm && (
            <ConfirmDialog
              message="ボス役記録を撤回しますか？（サーバーから即時削除され、元に戻せません）"
              onDismiss={() => setGhostBossWithdrawConfirm(false)}
              actions={[
                {
                  label: '撤回する',
                  primary: true,
                  onSelect: () => {
                    setGhostBossWithdrawConfirm(false)
                    void handleWithdrawGhostBoss()
                  },
                },
                { label: 'キャンセル', onSelect: () => setGhostBossWithdrawConfirm(false) },
              ]}
            />
          )}
          {ghostBossWithdrawError && <p className="drill-error">{ghostBossWithdrawError}</p>}
          <button type="button" className="secondary-action" onClick={() => navigate('home')}>
            ホームへ
          </button>
        </>
      }
    >
      {raidEnded && <p data-testid="raid-ended">今週のレイドは終了しました</p>}
      {!currentBoss && !bossFetchFailed && <p>今週のボスはまだ生成されていません</p>}
      {!currentBoss && bossFetchFailed && (
        <div data-testid="raid-fetch-failed">
          <p className="drill-error">最新情報を取得できませんでした</p>
          {/* T-212(Q-44): navigator.onLineでオフラインとサーバー障害を大まかに区別する
              （オフライン中はブラウザが確実にfalseを返す。true側は「サーバー障害」を断定
              できないため「の可能性」に留める） */}
          <p className="result-list__note">
            {navigator.onLine
              ? 'サーバー側に問題が発生している可能性があります'
              : '通信がオフラインになっています。電波状況をご確認ください'}
          </p>
          {cachedBossName !== null && raidState && (
            <div data-testid="raid-boss-cached">
              <div className="raid-boss-header">
                <BossSigil seed={raidState.bossId} size={56} />
                <p className="raid-boss-name">{cachedBossName}</p>
              </div>
              <div
                className="home-raid-hp-bar"
                role="progressbar"
                aria-valuenow={cachedHpPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="home-raid-hp-bar-fill" style={{ width: `${cachedHpPercent}%` }} />
              </div>
              <p>
                HP残り <span className="display-num">{cachedHpPercent}</span>%
              </p>
              {lastSyncedLabel !== null && (
                <p
                  className={syncFailed ? 'raid-sync-label is-stale' : 'raid-sync-label'}
                  data-testid="raid-last-synced"
                >
                  最終同期: {lastSyncedLabel}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {currentBoss && (
        <div data-testid="raid-boss">
          {currentBoss.status === 'defeated' && (
            <p className="result-phase-transition" data-testid="raid-defeated">
              討伐成功！
            </p>
          )}
          <div className="raid-boss-header">
            {/* 討伐済みなら紋章を割る（V-21。07の7節S5） */}
            <BossSigil
              seed={currentBoss.bossId}
              size={56}
              defeated={currentBoss.status === 'defeated'}
            />
            <p className="raid-boss-name">{currentBoss.name}</p>
          </div>
          <div
            className="home-raid-hp-bar"
            role="progressbar"
            aria-valuenow={hpPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="home-raid-hp-bar-fill" style={{ width: `${hpPercent}%` }} />
          </div>
          <p>
            HP残り <span className="display-num">{hpPercent}</span>%
          </p>
          {!raidEnded && <p data-testid="raid-remaining-days">残り{remainingDays}日</p>}
          {/* T-116(9): 参加ボタンを押しただけではカウントされない実態（貢献ダメージの
              送信者数）に合わせたラベルへ変更 */}
          <p>貢献者 {currentBoss.participantCount}人</p>
          {joined && (
            <p>
              自分の貢献ダメージ: <span className="display-num">{currentBoss.myDamage}</span>
            </p>
          )}
          {/* V-15（docs/25 4.6節）: 順位表（V-9）と同じ構造の貢献リスト。空状態は
              コンポーネント側が持つ（見出しだけが浮く状態を作らない） */}
          <RaidContributionList
            entries={currentBoss.contributions}
            selfDisplayName={displayName}
            sigilSeed={currentBoss.bossId}
          />
          {/* M4・T-129: ゴースト週の弱点可視化（docs/22 3.4節）。個別questionIdは出さず
              Part・タグ単位の集計のみ表示する（正答の狙い撃ち防止）。
              V-15: 0件でも見出しだけが浮かないよう、空状態はコンポーネント側で出す */}
          {/* シルエットは貢献リストの空状態にだけ置く（同一画面に紋章が並ぶと過剰なため
              弱点マップ・バッジの空状態は文だけにする） */}
          {currentBoss.bossType === 'ghost' && <GhostWeaknessMap entries={ghostWeaknessMap} />}
          {/* M4・T-129: 討伐された回数の名誉表示（02の5.3節。公開処刑にしない演出方針）。
              V-15: 数字を誇示せず --gold の小さなバッジ形に留める（4.6節。過度な強調は
              ボス役の心理的コストを上げる） */}
          {currentBoss.bossType === 'ghost' && currentBoss.ghost && (
            <p className="raid-honor" data-testid="ghost-defeated-count">
              討伐された回数:{' '}
              <span className="raid-honor__count display-num">
                {currentBoss.ghost.defeatedCount}
              </span>
              回
            </p>
          )}
          {lastSyncedLabel !== null && (
            <p
              className={syncFailed ? 'raid-sync-label is-stale' : 'raid-sync-label'}
              data-testid="raid-last-synced"
            >
              最終同期: {lastSyncedLabel}
            </p>
          )}
          <p>討伐の成立は同期時にサーバーで確定します（表示は最終同期時点のものです）</p>
        </div>
      )}
      {/* V-15（docs/25 4.6節）: 取得済みバッジは --gold 枠＋取得日の併記（07の6節）。
          未取得バッジのシルエット表示は全バッジ定義の列挙（T-150）が必要なため本タスクでは扱わない。
          0件でもセクションを出し、空状態の文で「どうすれば増えるか」を示す（4.6節の完了条件） */}
      <section className="raid-badges" data-testid="raid-badges">
        <p className="raid-badges__eyebrow">Badges</p>
        <h2 className="raid-badges__heading">獲得バッジ</h2>
        {raidBadges.length === 0 ? (
          <RaidEmptyNote testId="raid-badges-empty">
            まだバッジはありません。ボスを討伐すると、その週のバッジがここに並びます
          </RaidEmptyNote>
        ) : (
          <ul className="raid-badges__list">
            {raidBadges.map((b) => (
              <li key={b.badgeId} className="raid-badges__item">
                <span className="raid-badges__name">{raidBadgeLabel(b.badgeId)}</span>
                <span className="raid-badges__date display-num">{toDateString(b.earnedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </ScreenLayout>
  )
}
