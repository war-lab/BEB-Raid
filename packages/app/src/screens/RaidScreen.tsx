// S5 レイド専用画面（M3・T-98。正本: docs/17_M3実装計画.md 3.3節・3.7節、docs/02 5節）。
// 未登録（招待コード入力）→登録済み（現ボス表示・参加・挑戦・手動同期）→討伐演出の一連。
// 「レイドに挑む」は既存のstartSession系統にmode='raid'を渡すだけで、DrillScreen側は変更しない
// （answerPipelineがmodeを透過するため=3.3節）。
import { useEffect, useState } from 'react'
import type { DailyGoal, Question, RaidBossState } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID, RAID_STATE_ID, type BadgeRecord, type RaidStateRecord } from '../db/schema'
import { generateQuickPack } from '../engine/quickPack'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { formatRelativeTime } from '../engine/relativeTime'
import type { RaidApi } from '../platform'
import { RaidApiError } from '../platform'
import { getOrInitPhaseState } from '../services/phase'
import { RAID_FIRST_CLEAR_BADGE_ID, syncRaidDamage } from '../services/raidSync'
import { startSession, type SessionSnapshot } from '../services/session'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useRaidSyncStore } from '../store/raidSyncStore'
import { useSessionStore } from '../store/sessionStore'
import { BossSigil } from '../components/BossSigil'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { confirmDiscardMessage, toSessionItems } from './HomeScreen'

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
  // T-105(b): 相対時刻・raidEnded判定のtick更新用の現在時刻state
  const [nowMs, setNowMs] = useState(now())
  // T-121(J-60): 生成パックが0問だったときの案内。自動では消さず、セッション開始成功でクリアする
  const [emptyPackMessage, setEmptyPackMessage] = useState<string | null>(null)

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
        const [profile, registeredSetting, raidStateRecord, badges] = await Promise.all([
          db.profile.get(PROFILE_ID),
          db.settings.get(RAID_REGISTERED_AT_KEY),
          db.raidState.get(RAID_STATE_ID),
          loadRaidBadges(db),
        ])
        if (cancelled) return
        if (profile) {
          setDeviceToken(profile.deviceToken)
          setDisplayName(profile.displayName)
        }
        const isRegistered = registeredSetting?.value !== undefined
        setRegistered(isRegistered)
        setRaidState(raidStateRecord ?? null)
        setRaidBadges(badges)

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

  async function handleRegister() {
    setRegisterError(null)
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
    })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    setRaidState((await db.raidState.get(RAID_STATE_ID)) ?? null)
  }

  async function handleChallenge() {
    if (
      resumeSnapshot &&
      !window.confirm(
        confirmDiscardMessage(resumeSnapshot.items.length - resumeSnapshot.answeredCount),
      )
    )
      return
    setEmptyPackMessage(null)
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

  async function handleManualSync() {
    setSyncError(null)
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
      status={<p>レイド</p>}
      action={
        <>
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
            <BossSigil seed={currentBoss.bossId} size={56} />
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
          <p>貢献ダメージ</p>
          <ul className="raid-list">
            {currentBoss.contributions.map((c, i) => (
              <li key={i}>
                {c.displayName}: <span className="display-num">{c.damage}</span>
              </li>
            ))}
          </ul>
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
      {raidBadges.length > 0 && (
        <div data-testid="raid-badges">
          <p>獲得バッジ</p>
          <ul className="raid-list">
            {raidBadges.map((b) => (
              <li key={b.badgeId}>{raidBadgeLabel(b.badgeId)}</li>
            ))}
          </ul>
        </div>
      )}
    </ScreenLayout>
  )
}
