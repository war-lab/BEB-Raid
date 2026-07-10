// S1 ホーム画面（T-21。docs/07 7節S1・02の2.1・01の非機能要件=起動3秒）。
// 上: ストリーク＋SRS期限数。中: なし（レイドHPバーはM3）。下: 「今日のクエスト」
// 主ボタン＋3/7/15分チップ→generateQuickPack→セッション開始。下方グリッドは
// 各モードへの導線（Part2瞬発・Part5・語彙SRS・ダッシュボード・設定）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { daysBetween, toDateString } from '../engine/date'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { generateQuickPack } from '../engine/quickPack'
import { getSrsQueue } from '../engine/srs'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { QuickPackDuration, QuickPackItem } from '../engine/types'
import { startSession, type SessionItem } from '../services/session'
import { InstallHint } from '../pwa/InstallHint'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /** クイックパック生成・単独モード起動の出題候補プール（実パック読み込みはT-35） */
  questionPool: Question[]
}

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

export function HomeScreen({ db, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)

  // ファーストペイントをブロックしないよう、既定値（0件・未読込）で即座に描画する
  const [streakDays, setStreakDays] = useState(0)
  const [brokenSinceDays, setBrokenSinceDays] = useState<number | null>(null)
  const [dueCount, setDueCount] = useState(0)
  const [duration, setDuration] = useState<QuickPackDuration>(DEFAULT_DURATION)
  // データ読み込み完了の合図（テストが「初期値のまま描画された」誤検知をしないための目印）
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [status, record, queue] = await Promise.all([
        evaluateStreak(db),
        getStreak(db),
        getSrsQueue(db),
      ])
      if (cancelled) return
      const today = toDateString(Date.now())
      const gap = record.lastActiveDate ? daysBetween(record.lastActiveDate, today) : 0
      const isBroken =
        record.lastActiveDate !== null && gap >= BROKEN_GAP_DAYS && !status.todayCompleted
      setStreakDays(status.currentDays)
      setBrokenSinceDays(isBroken ? status.currentDays : null)
      setDueCount(queue.dueReviews.length)
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db])

  async function handleStartQuest() {
    const pack = await generateQuickPack(db, { duration, questions: questionPool })
    const items = toSessionItems(pack.items)
    await startSessionAndNavigate(items)
  }

  async function startSingleMode(format: 'audio_qa' | 'text_blank') {
    const filtered = questionPool.filter((q) => q.format === format)
    const items: SessionItem[] = filtered.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await startSessionAndNavigate(items)
  }

  async function startSessionAndNavigate(items: SessionItem[]) {
    if (items.length === 0) return
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(snapshot, questionPool, {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
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
          <PrimaryButton onClick={() => void handleStartQuest()}>今日のクエスト</PrimaryButton>
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
          <div className="home-grid">
            <button type="button" onClick={() => void startSingleMode('audio_qa')}>
              Part2瞬発
            </button>
            <button type="button" onClick={() => void startSingleMode('text_blank')}>
              Part5
            </button>
            <button type="button" onClick={() => navigate('vocab')}>
              語彙SRS
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
      <InstallHint />
      {loaded && <span data-testid="home-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
