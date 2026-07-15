// S2 リザルト画面（docs/07 7節S2・03の3.2）。
// 正誤一覧・獲得ポイント合計（基礎点合計を一括表示=J-4のダメージトースト代替）・
// レート変動（before/after）・「誤答N問を復習デッキに追加した」を表示し、
// 表示後（ホームへ復帰時）に completeSession でスナップショットを破棄する。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { SEASON_LABELS, type PhaseTransitionOutcome } from '../engine/curriculum'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { evaluateAndPersistPhaseTransition } from '../services/phase'
import { completeSession } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
}

export function ResultScreen({ db }: Props) {
  const results = useSessionStore((s) => s.results)
  const questions = useSessionStore((s) => s.questions)
  const ratingBefore = useSessionStore((s) => s.ratingBefore)
  const reset = useSessionStore((s) => s.reset)
  const navigate = useAppStore((s) => s.navigate)

  const [ratingAfter, setRatingAfter] = useState<{ L: number; R: number } | null>(null)
  // T-54: セッション完了時のフェーズ移行判定（成立時のみ演出を表示）
  const [phaseOutcome, setPhaseOutcome] = useState<PhaseTransitionOutcome | null>(null)

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

  const correctCount = results.filter((r) => r.isCorrect).length
  const wrongCount = results.length - correctCount
  const totalPoints = results.reduce((sum, r) => sum + r.basePoints, 0)

  function handleHome() {
    void completeSession(db).then(() => {
      reset()
      navigate('home')
    })
  }

  return (
    <ScreenLayout
      status={<p>リザルト</p>}
      action={<PrimaryButton onClick={handleHome}>ホームへ</PrimaryButton>}
    >
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
          +{totalPoints}
        </span>
      </p>
      <p>
        正解 {correctCount} / {results.length}
      </p>
      {ratingBefore && ratingAfter && (
        <ul>
          <li>
            L: {Math.round(ratingBefore.L)} → {Math.round(ratingAfter.L)}
          </li>
          <li>
            R: {Math.round(ratingBefore.R)} → {Math.round(ratingAfter.R)}
          </li>
        </ul>
      )}
      {wrongCount > 0 && <p>誤答{wrongCount}問を復習デッキに追加した</p>}
      <ul>
        {results.map((r, i) => (
          <li key={i}>
            {questions.get(r.questionId)?.question ?? r.questionId}:{' '}
            {r.isCorrect ? '正解' : '不正解'}
          </li>
        ))}
      </ul>
    </ScreenLayout>
  )
}
