// S2 リザルト画面（docs/07 7節S2・03の3.2）。
// 正誤一覧・獲得ポイント合計（基礎点合計を一括表示=J-4のダメージトースト代替）・
// レート変動（before/after）・「誤答N問を復習デッキに追加した」を表示し、
// 表示後（ホームへ復帰時）に completeSession でスナップショットを破棄する。
// T-77: 報酬演出（J-42）。CSSアニメーション＋rAFのみ、総時間600〜900ms、
// prefers-reduced-motionでは静止表示、タップで即スキップ可能にする。
import { useEffect, useState } from 'react'
import type { Question, RaidBossState } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import { SEASON_LABELS, type PhaseTransitionOutcome } from '../engine/curriculum'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import type { RaidApi } from '../platform'
import { evaluateAndPersistPhaseTransition } from '../services/phase'
import { sendQuestionStats } from '../services/questionStats'
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
/** T-111: 音声系（audio_qa/dictation/audio_set）の問題リスト表記を短縮する長さ */
const RESULT_QUESTION_TRUNCATE_LENGTH = 20

/**
 * リザルト画面の問題リスト表記（T-111。docs/18 T-111シート）。内部ID（`dictation-discount`等）の
 * ままではどの問題だったか分からないため、形式別の短い表記に変換する。
 * - vocab_card: 対象語（front）
 * - audio_qa/dictation/audio_set: 英文冒頭を約20字+「…」に短縮（scriptが無ければIDへ）
 * - それ以外（text_blank/text_passage等）: 設問文（question）
 * 問題が引けない場合（questionPool未読込・audio_setのsub-question ID等）はquestionIdへ
 * フォールバックする（`.result-list__question`の既存ellipsis表示を活かす）
 */
export function resultQuestionLabel(questionId: string, question: Question | undefined): string {
  if (!question) return questionId
  if (question.format === 'vocab_card') return question.front ?? questionId
  if (
    question.format === 'audio_qa' ||
    question.format === 'dictation' ||
    question.format === 'audio_set'
  ) {
    const text = question.script
    if (!text) return questionId
    return text.length > RESULT_QUESTION_TRUNCATE_LENGTH
      ? `${text.slice(0, RESULT_QUESTION_TRUNCATE_LENGTH)}…`
      : text
  }
  return question.question ?? questionId
}

/**
 * 3.4節「最大ストリーク」タイルの入力。回答順（answeredAt昇順）に並んだ正誤配列から
 * 最長連続正解数を求める（セッション途中の中断・再開を跨いでも sessionAttempts は
 * 通しでソート済みのため、跨いだままの連続正解も数える=正解数集計と同じ考え方）
 */
export function computeMaxStreak(attempts: readonly { isCorrect: boolean }[]): number {
  let max = 0
  let current = 0
  for (const a of attempts) {
    current = a.isCorrect ? current + 1 : 0
    if (current > max) max = current
  }
  return max
}

/**
 * 3.4節「学習時間」タイルの表示（m:ss）。各attemptのresponseMs合計を丸めて使う
 * （画面を開いていた壁時計時間ではなく、実際に解答に要した時間の合計という近似値）
 */
export function formatStudyDuration(totalResponseMs: number): string {
  const totalSeconds = Math.round(totalResponseMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

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
  const skippedCount = useSessionStore((s) => s.skippedCount)
  const snapshot = useSessionStore((s) => s.snapshot)
  const reset = useSessionStore((s) => s.reset)
  const navigate = useAppStore((s) => s.navigate)

  const [ratingAfter, setRatingAfter] = useState<{ L: number; R: number } | null>(null)
  // T-54: セッション完了時のフェーズ移行判定（成立時のみ演出を表示）
  const [phaseOutcome, setPhaseOutcome] = useState<PhaseTransitionOutcome | null>(null)
  // T-77: reduced-motion環境では最初から静止表示。タップで途中スキップも可能にする
  const [skipAnimation, setSkipAnimation] = useState(prefersReducedMotion)
  // T-109: 中断・再開を跨いだセッション全体の正解数・問題リスト集計（3.2節J-52）。
  // snapshot.attemptIdsはstartSessionから完了まで累積するため、resultsストア
  // （このマウント後に解答した分のみ）よりも正確な全体集計の入力に使える
  const [sessionAttempts, setSessionAttempts] = useState<AttemptRecord[] | null>(null)
  // docs/20 3.4節リザルト行「ボスHPバー削れ」: レイド同期が成功し参加中の場合のみセットされる
  // （syncRaidDamageの戻り値=RaidSyncResultをそのまま使う。追加のfetchは行わない）
  const [raidBoss, setRaidBoss] = useState<RaidBossState | null>(null)

  useEffect(() => {
    let cancelled = false
    void db.attempts.bulkGet(snapshot?.attemptIds ?? []).then((rows) => {
      if (cancelled) return
      setSessionAttempts(
        rows
          .filter((r): r is AttemptRecord => r !== undefined)
          .sort((a, b) => a.answeredAt - b.answeredAt),
      )
    })
    return () => {
      cancelled = true
    }
  }, [db, snapshot])

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

  // セッション完了時のレイドダメージ送信（M3・T-96）。非同期・失敗してもリザルト表示は壊さないが、
  // 原因追跡のためログは残す（レビューF5）
  useEffect(() => {
    void syncRaidDamage(db, raidApi)
      .then((result) => {
        // ok:falseの経路（未設定/OFF/未参加等）ではbossは無いため、既定のnull（非表示）のまま
        if (result.ok && result.boss) setRaidBoss(result.boss)
      })
      .catch((e: unknown) => {
        console.warn('[raidSync] セッション完了時同期に失敗', e)
      })
  }, [db, raidApi])

  // セッション完了時のquestionStats送信（M3・T-100）。raidSyncと同じトリガーに相乗り。失敗はログのみ
  useEffect(() => {
    void sendQuestionStats(db, raidApi).catch((e: unknown) => {
      console.warn('[questionStats] セッション完了時送信に失敗', e)
    })
  }, [db, raidApi])

  // T-109: 正解数・問題リストはセッション全体（sessionAttempts）で表示する。
  // レート変動・獲得ポイントはattemptsにbasePointsを保持していないため、現行どおり
  // results（このマウント後＝今回セッション分）を使う（J-52の対象外）
  const tallyEntries = sessionAttempts ?? []
  const correctCount = tallyEntries.filter((a) => a.isCorrect).length
  const wrongCount = tallyEntries.length - correctCount
  const totalPoints = results.reduce((sum, r) => sum + r.basePoints, 0)
  const displayedPoints = usePointsCountUp(totalPoints, skipAnimation)
  // docs/20 3.4節リザルト行の統計3タイル用（正解数タイルは既存のcorrectCountを流用）
  const maxStreak = computeMaxStreak(tallyEntries)
  const totalResponseMs = tallyEntries.reduce((sum, a) => sum + a.responseMs, 0)
  const bossHpPercent =
    raidBoss && raidBoss.maxHp > 0
      ? Math.min(100, Math.max(0, (raidBoss.hp / raidBoss.maxHp) * 100))
      : 0

  function handleHome() {
    // レビューF5: スナップショット削除の失敗で「ホームへ」が無反応にならないようにする。
    // 削除に失敗して残ったスナップショットは次回startSessionで上書きされるため、
    // ログだけ残してホーム遷移は必ず実行する
    void completeSession(db)
      .catch((e: unknown) => {
        console.warn('[ResultScreen] セッション完了処理に失敗', e)
      })
      .then(() => {
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
        {/* docs/20 3.4節リザルト行「TOTAL DAMAGE」英字ラベル。レビューF5(c)で追加した
            「何の数値か分かる」日本語ラベル（獲得ポイント）は削らずそのまま残す */}
        <p className="result-eyebrow">Total Damage</p>
        {/* レビューF5(c): 何の数値か分かるようラベルを付ける。表示実体はbasePointsの合計
            （冒頭コメントの「獲得ポイント合計」）のため、レビュー指示の「レート変動」ではなく
            実体に合わせて「獲得ポイント」と表記する（レート変動は下のL/R行に既出） */}
        <p className="result-points-label">獲得ポイント</p>
        <p>
          <span className="display-num result-points-value">+{displayedPoints}</span>
        </p>
        {/* docs/20 3.4節リザルト行「ボスHPバー削れ」。未参加・同期未成功時（raidBoss===null）は
            非表示（ホームのレイドHPバーと同じ「参加中のみ出す」縮退設計に揃える） */}
        {raidBoss && (
          <div className="result-boss-hp" data-testid="result-boss-hp">
            <div className="result-boss-hp-labels">
              <span>BOSS HP</span>
              <span className="display-num">
                {raidBoss.hp.toLocaleString()} / {raidBoss.maxHp.toLocaleString()}
              </span>
            </div>
            <div className="result-boss-hp-bar">
              <div className="result-boss-hp-fill" style={{ width: `${bossHpPercent}%` }} />
            </div>
            <p className="result-boss-hp-name">{raidBoss.name} に与えたダメージ</p>
          </div>
        )}
        {/* docs/20 3.4節リザルト行「統計3枚タイル」。「正解 X / Y」の文言は既存のまま
            （既存テスト・レビューF5(c)相当の文言を変えない）タイル化のみ行う */}
        <ul className="result-highlight-tiles">
          <li
            className="result-highlight-tile result-highlight-tile--ok"
            style={{ animationDelay: '0ms' }}
          >
            正解 {correctCount} / {tallyEntries.length}
          </li>
          <li
            className="result-highlight-tile result-highlight-tile--gold"
            style={{ animationDelay: '100ms' }}
            data-testid="result-max-streak"
          >
            最大ストリーク {maxStreak}
          </li>
          <li
            className="result-highlight-tile result-highlight-tile--listen"
            style={{ animationDelay: '200ms' }}
            data-testid="result-study-duration"
          >
            学習時間 {formatStudyDuration(totalResponseMs)}
          </li>
        </ul>
        <ul className="result-stats">
          {ratingBefore && ratingAfter && (
            <li className="result-stat" style={{ animationDelay: '300ms' }}>
              L: {Math.round(ratingBefore.L)} → {Math.round(ratingAfter.L)}
              <br />
              R: {Math.round(ratingBefore.R)} → {Math.round(ratingAfter.R)}
            </li>
          )}
          {wrongCount > 0 && (
            <li className="result-stat" style={{ animationDelay: '400ms' }}>
              誤答{wrongCount}問を復習デッキに追加した
            </li>
          )}
          {skippedCount > 0 && (
            <li
              className="result-stat"
              style={{ animationDelay: '500ms' }}
              data-testid="result-skipped-count"
            >
              表示できなかった問題: {skippedCount}件（パックの再取得で直ることがあります）
            </li>
          )}
        </ul>
        <ul className="result-list">
          {tallyEntries.map((a, i) => (
            <li key={i} className="result-list__item" data-correct={a.isCorrect}>
              <span aria-hidden="true" className="result-list__icon" />
              <span className="result-list__question">
                {resultQuestionLabel(a.questionId, questions.get(a.questionId))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ScreenLayout>
  )
}
