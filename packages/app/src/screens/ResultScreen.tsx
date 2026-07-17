// S2 リザルト画面（docs/07 7節S2・03の3.2）。
// 正誤一覧・獲得ポイント合計（基礎点合計を一括表示=J-4のダメージトースト代替）・
// レート変動（before/after）・「誤答N問を復習デッキに追加した」を表示し、
// 表示後（ホームへ復帰時）に completeSession でスナップショットを破棄する。
// T-77: 報酬演出（J-42）。CSSアニメーション＋rAFのみ、総時間600〜900ms、
// prefers-reduced-motionでは静止表示、タップで即スキップ可能にする。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { SEASON_LABELS, type PhaseTransitionOutcome } from '../engine/curriculum'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import type { RaidApi } from '../platform'
import { evaluateAndPersistPhaseTransition } from '../services/phase'
import { syncRaidDamage } from '../services/raidSync'
import { completeSession } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  raidApi: RaidApi
}

const POINTS_COUNTUP_MS = 700

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** ポイント合計のrAFカウントアップ。instant=trueの間は演出をスキップして最終値をそのまま返す */
function usePointsCountUp(target: number, instant: boolean): number {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (instant) return
    let raf = 0
    const start = Date.now()
    function tick() {
      const progress = Math.min(1, (Date.now() - start) / POINTS_COUNTUP_MS)
      setAnimated(Math.round(target * progress))
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, instant])

  return instant ? target : animated
}

export function ResultScreen({ db, raidApi }: Props) {
  const results = useSessionStore((s) => s.results)
  const questions = useSessionStore((s) => s.questions)
  const ratingBefore = useSessionStore((s) => s.ratingBefore)
  const reset = useSessionStore((s) => s.reset)
  const navigate = useAppStore((s) => s.navigate)

  const [ratingAfter, setRatingAfter] = useState<{ L: number; R: number } | null>(null)
  // T-54: セッション完了時のフェーズ移行判定（成立時のみ演出を表示）
  const [phaseOutcome, setPhaseOutcome] = useState<PhaseTransitionOutcome | null>(null)
  // T-77: reduced-motion環境では最初から静止表示。タップで途中スキップも可能にする
  const [skipAnimation, setSkipAnimation] = useState(prefersReducedMotion)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [l, r, outcome] = await Promise.all([
        db.ratings.get('L'),
        db.ratings.get('R'),
        // フェーズ評価が失敗しても（DB切断等）リザルト表示自体は壊さない。
        // 演出を出さないだけの安全側フォールバックにする
        evaluateAndPersistPhaseTransition(db, questions).catch(() => null),
      ])
      if (!cancelled) {
        setRatingAfter({
          L: l?.rating ?? DEFAULT_INITIAL_RATING,
          R: r?.rating ?? DEFAULT_INITIAL_RATING,
        })
        setPhaseOutcome(outcome)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db, questions])

  // セッション完了時のレイドダメージ送信（M3・T-96）。非同期・失敗無視
  useEffect(() => {
    void syncRaidDamage(db, raidApi).catch(() => {})
  }, [db, raidApi])

  const correctCount = results.filter((r) => r.isCorrect).length
  const wrongCount = results.length - correctCount
  const totalPoints = results.reduce((sum, r) => sum + r.basePoints, 0)
  const displayedPoints = usePointsCountUp(totalPoints, skipAnimation)

  function handleHome() {
    void completeSession(db).then(() => {
      reset()
      navigate('home')
    })
  }

  function handleSkip() {
    setSkipAnimation(true)
  }

  return (
    <ScreenLayout
      status={<p>リザルト</p>}
      action={<PrimaryButton onClick={handleHome}>ホームへ</PrimaryButton>}
    >
      <div className="result-content" data-testid="result-content" onClick={handleSkip}>
        {phaseOutcome?.seasonTransitioned && (
          <p className="result-phase-transition" data-testid="phase-transition">
            {SEASON_LABELS[phaseOutcome.season]}に突入しました
          </p>
        )}
        {phaseOutcome?.seasonCleared && (
          <p className="result-phase-transition" data-testid="season-cleared">
            シーズンクリア！
          </p>
        )}
        {phaseOutcome?.listeningTransitioned && (
          <p className="result-phase-transition" data-testid="listening-transition">
            リスニング段階L{phaseOutcome.listeningStage}に進みました
          </p>
        )}
        <p>
          <span className="display-num" style={{ fontSize: 'var(--fs-display)' }}>
            +{displayedPoints}
          </span>
        </p>
        <ul className="result-stats">
          <li className="result-stat" style={{ animationDelay: '0ms' }}>
            正解 {correctCount} / {results.length}
          </li>
          {ratingBefore && ratingAfter && (
            <li className="result-stat" style={{ animationDelay: '150ms' }}>
              L: {Math.round(ratingBefore.L)} → {Math.round(ratingAfter.L)}
              <br />
              R: {Math.round(ratingBefore.R)} → {Math.round(ratingAfter.R)}
            </li>
          )}
          {wrongCount > 0 && (
            <li className="result-stat" style={{ animationDelay: '300ms' }}>
              誤答{wrongCount}問を復習デッキに追加した
            </li>
          )}
        </ul>
        <ul className="result-list">
          {results.map((r, i) => (
            <li key={i} className="result-list__item" data-correct={r.isCorrect}>
              <span aria-hidden="true" className="result-list__icon" />
              <span className="result-list__question">
                {questions.get(r.questionId)?.question ?? r.questionId}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ScreenLayout>
  )
}
