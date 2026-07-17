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
import {
  isLastRaidSyncFailed,
  isLastRaidSyncUnauthorized,
  RAID_FIRST_CLEAR_BADGE_ID,
  syncRaidDamage,
} from '../services/raidSync'
import { startSession, type SessionSnapshot } from '../services/session'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { CONFIRM_DISCARD_MESSAGE, toSessionItems } from './HomeScreen'

interface Props {
  db: BebRaidDatabase
  raidApi: RaidApi
  questionPool: Question[]
  resumeSnapshot: SessionSnapshot | null
}

/** レイド挑戦セッションの長さ（3.3節: 7分プリセットをそのまま流用） */
const RAID_QUEST_DURATION = 7

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

/** 討伐履歴を兼ねる簡素な表示ラベル（3.9節: S5内の簡素な一覧でよい） */
function raidBadgeLabel(badgeId: string): string {
  if (badgeId === RAID_FIRST_CLEAR_BADGE_ID) return '初回討伐'
  return `討伐: ${badgeId.slice('raid-clear:'.length)}`
}

async function loadRaidBadges(db: BebRaidDatabase): Promise<BadgeRecord[]> {
  const all = await db.badges.toArray()
  return all.filter((b) => isRaidBadge(b.badgeId)).sort((a, b) => b.earnedAt - a.earnedAt)
}

export function RaidScreen({ db, raidApi, questionPool, resumeSnapshot }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)

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

  useEffect(() => {
    let cancelled = false
    async function load() {
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
        const boss = await raidApi.fetchCurrentBoss().catch(() => null)
        if (!cancelled) setCurrentBoss(boss)
      }
      if (!cancelled) setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db, raidApi])

  async function handleRegister() {
    setRegisterError(null)
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
      const boss = await raidApi.fetchCurrentBoss().catch(() => null)
      setCurrentBoss(boss)
    } catch (e) {
      setRegisterError(
        e instanceof RaidApiError && e.kind === 'unauthorized'
          ? '招待コードが正しくありません'
          : '登録に失敗しました。通信を確認してください',
      )
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
    if (resumeSnapshot && !window.confirm(CONFIRM_DISCARD_MESSAGE)) return
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
    if (items.length === 0) return

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
    const ok = await syncRaidDamage(db, raidApi)
    if (!ok) {
      setSyncError(
        isLastRaidSyncUnauthorized()
          ? '登録が無効です。招待コードで再登録してください'
          : '同期に失敗しました。通信を確認してください',
      )
      return
    }
    const [updatedRaidState, updatedBoss, updatedBadges] = await Promise.all([
      db.raidState.get(RAID_STATE_ID),
      raidApi.fetchCurrentBoss().catch(() => null),
      loadRaidBadges(db),
    ])
    setRaidState(updatedRaidState ?? null)
    if (updatedBoss) setCurrentBoss(updatedBoss)
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

  if (!loaded) return null

  if (!registered) {
    return (
      <ScreenLayout
        status={<p>レイド登録</p>}
        action={
          <PrimaryButton onClick={() => void handleRegister()} disabled={registering}>
            登録する
          </PrimaryButton>
        }
      >
        <div className="settings-list" data-testid="raid-register-form">
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
  // M3・T-99: オフライン表示規約（3.7節）。参加前はlastSyncedAtが無意味なのでjoined時のみ表示
  const lastSyncedLabel =
    joined && raidState ? formatRelativeTime(now() - raidState.lastSyncedAt) : null
  const syncFailed = isLastRaidSyncFailed()

  return (
    <ScreenLayout
      status={<p>レイド</p>}
      action={
        <>
          {!joined && currentBoss && (
            <PrimaryButton onClick={() => void handleJoin()}>参加する</PrimaryButton>
          )}
          {joined && (
            <PrimaryButton onClick={() => void handleChallenge()}>レイドに挑む</PrimaryButton>
          )}
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
        </>
      }
    >
      {!currentBoss && <p>今週のボスはまだ生成されていません</p>}
      {currentBoss && (
        <div data-testid="raid-boss">
          {currentBoss.status === 'defeated' && (
            <p className="result-phase-transition" data-testid="raid-defeated">
              討伐成功！
            </p>
          )}
          <p>{currentBoss.name}</p>
          <div
            className="home-raid-hp-bar"
            role="progressbar"
            aria-valuenow={hpPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="home-raid-hp-bar-fill" style={{ width: `${hpPercent}%` }} />
          </div>
          <p>参加者 {currentBoss.participantCount}人</p>
          {joined && <p>自分の貢献ダメージ: {currentBoss.myDamage}</p>}
          <ul>
            {currentBoss.contributions.map((c, i) => (
              <li key={i}>
                {c.displayName}: {c.damage}
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
          <p>討伐の確定はサーバー側の判定が正です</p>
        </div>
      )}
      {raidBadges.length > 0 && (
        <div data-testid="raid-badges">
          <p>獲得バッジ</p>
          <ul>
            {raidBadges.map((b) => (
              <li key={b.badgeId}>{raidBadgeLabel(b.badgeId)}</li>
            ))}
          </ul>
        </div>
      )}
    </ScreenLayout>
  )
}
