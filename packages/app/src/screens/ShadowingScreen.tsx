// S4 シャドーイング画面（T-48。正本: docs/13 3.5節、docs/02 3.3-3.4、docs/07 6節・7節S4）。
// セッション（SessionItem/attempts記録）の枠外で独立に動く画面（VocabScreenと同様、
// HomeScreenから直接遷移）。1素材の再生完了（最後まで到達 or 3周）で実施ログを記録し、
// レート・tagStats・SRSの対象外にする（J-13）。
import { useEffect, useRef, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { ListeningStage } from '../db/schema'
import type { ShadowingSentence } from '../engine/shadowing'
import { evaluateStreak, getStreak } from '../engine/streak'
import type { AudioPlayer } from '../platform'
import { recordAttempt } from '../services/attempts'
import { countAttemptsToday } from '../services/dailyStats'
import { getOrInitPhaseState } from '../services/phase'
import { useAppStore } from '../store/appStore'
import { CompletionCard } from '../components/CompletionCard'
import { KaraokeScript } from '../components/KaraokeScript'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
  /** シャドーイング素材一覧（実データ前はダミー。format==='shadowing'のみ渡される想定） */
  shadowingQuestions: Question[]
}

type ScriptDisplayMode = 'hidden' | 'en' | 'en_ja'

/** 速度チップ（3.5節）。1.15以上はlisteningStage=4のみ表示 */
const SPEED_CHIPS = [0.7, 0.85, 1, 1.15, 1.3] as const
const HIGH_SPEED_MIN_STAGE: ListeningStage = 4
/** 再生完了とみなす周回数（3.5節: 記録規約） */
const COMPLETION_LAPS = 3
/** 3秒戻し（02の3.4） */
const REWIND_MS = 3000
/** 実施ログの questionId プレフィックス（J-13） */
const SHADOW_ATTEMPT_PREFIX = 'shadow:'

export function ShadowingScreen({ db, audioPlayer, shadowingQuestions }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [index, setIndex] = useState(0)
  // T-120: 実施済み素材（attemptsの`shadow:`プレフィックス記録から判定）のID集合。
  // マウント時の開始位置決定と、「実施済み」注記の表示に使う
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [listeningStage, setListeningStage] = useState<ListeningStage>(1)
  const [rate, setRate] = useState<(typeof SPEED_CHIPS)[number]>(1)
  const [scriptMode, setScriptMode] = useState<ScriptDisplayMode>('en')
  const [positionMs, setPositionMs] = useState(0)
  const [laps, setLaps] = useState(0)
  const [completed, setCompleted] = useState(false)
  // 音声再生（メインの「再生」ボタン）失敗フラグ。音声404等ではlapsが増えず素材完了に
  // 到達できないため、trueならスキップ導線を出す（この画面から出られなくなるのを防ぐ）
  const [audioError, setAudioError] = useState(false)
  // 利用者が素材を移動したかどうか。マウント時の開始位置決定（下のuseEffect）は
  // attemptsの非同期読み込み完了後にsetIndexするため、読み込みが遅い端末では
  // 「利用者が次の素材へ移動した後に開始位置が確定してindexが巻き戻る」ことが起きる。
  // 巻き戻ると表示が飛ぶうえ、handlePrevのガードが古いindexを見て負値まで減算しうる。
  // 一度でも移動したら開始位置の自動決定は行わない
  const userMovedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void getOrInitPhaseState(db)
      .then((state) => {
        if (!cancelled) setListeningStage(state.listeningStage)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [db])

  // T-120(J-59): マウント時にattemptsから実施済み素材を判定し、未実施の先頭から開始する
  // （従来はindexが常に0始まりで、実施済みでも毎回同じ素材1が出ていた）。
  // 全素材実施済みなら素材1から（周回扱い）
  useEffect(() => {
    let cancelled = false
    void db.attempts
      .where('questionId')
      .startsWith(SHADOW_ATTEMPT_PREFIX)
      .toArray()
      .then((records) => {
        if (cancelled) return
        const ids = new Set(records.map((r) => r.questionId.slice(SHADOW_ATTEMPT_PREFIX.length)))
        setCompletedIds(ids)
        // 読み込み完了前に利用者が素材を移動していたら、その位置を尊重して上書きしない
        if (userMovedRef.current) return
        const firstUnfinished = shadowingQuestions.findIndex((q) => !ids.has(q.id))
        setIndex(firstUnfinished === -1 ? 0 : firstUnfinished)
      })
      .catch((err: unknown) => {
        // 失敗しても素材1から始まるだけで画面は壊れない
        console.warn('[ShadowingScreen] 実施済み素材の判定に失敗', err)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- db/shadowingQuestionsは起動時に固定される想定
  }, [])

  // T-78: 完了カード用の「今日の実施数・ストリーク」は全素材完了到達時に1回だけ取得する
  const [completionStats, setCompletionStats] = useState<{
    count: number
    streakDays: number
  } | null>(null)
  const allDone = index >= shadowingQuestions.length
  useEffect(() => {
    if (!allDone) return
    let cancelled = false
    void Promise.all([countAttemptsToday(db), getStreak(db)]).then(([count, streak]) => {
      if (!cancelled) setCompletionStats({ count, streakDays: streak.currentDays })
    })
    return () => {
      cancelled = true
    }
  }, [allDone, db])

  const question = shadowingQuestions[index]

  function playOptions(overrides?: { startMs?: number; durationMs?: number }) {
    return {
      ...overrides,
      rate: rate !== 1 ? rate : undefined,
      onPosition: setPositionMs,
    }
  }

  async function handlePlay() {
    if (!question?.audio) return
    setAudioError(false)
    try {
      await audioPlayer.unlock()
      setPositionMs(0)
      await audioPlayer.play(question.audio, playOptions())
    } catch (err) {
      // 失敗しても再生ボタンはそのまま残るため、タップし直せば再試行できる。
      // あわせてエラー表示＋スキップ導線を出す（恒久404等でこの画面に閉じ込められるのを防ぐ）
      console.warn('[ShadowingScreen] 音声再生に失敗', err)
      setAudioError(true)
      return
    }
    await handlePlaybackEnded()
  }

  async function handlePlaybackEnded() {
    if (!question) return
    const nextLaps = laps + 1
    setLaps(nextLaps)
    if (nextLaps >= COMPLETION_LAPS && !completed) {
      setCompleted(true)
      await recordAttempt(db, {
        questionId: `${SHADOW_ATTEMPT_PREFIX}${question.id}`,
        mode: 'solo',
        isCorrect: true,
        responseMs: 0,
      })
      setCompletedIds((prev) => new Set(prev).add(question.id))
      await evaluateStreak(db)
    }
  }

  function handleRewind() {
    if (!question?.audio) return
    const startMs = Math.max(0, positionMs - REWIND_MS)
    audioPlayer.play(question.audio, playOptions({ startMs })).catch((err: unknown) => {
      console.warn('[ShadowingScreen] 音声再生に失敗', err)
    })
  }

  function handleSentenceTap(sentence: ShadowingSentence) {
    if (!question?.audio) return
    audioPlayer
      .play(
        question.audio,
        playOptions({ startMs: sentence.startMs, durationMs: sentence.durationMs }),
      )
      .catch((err: unknown) => {
        console.warn('[ShadowingScreen] 音声再生に失敗', err)
      })
  }

  /** 次の素材へ（T-120・J-59: 3周完了前でも常時移動可。移動時は素材固有stateをリセットする） */
  function handleNext() {
    userMovedRef.current = true
    setIndex((i) => i + 1)
    setLaps(0)
    setCompleted(false)
    setPositionMs(0)
    setAudioError(false)
  }

  /**
   * 前の素材へ（T-120・J-59。index===0のときはボタン自体を出さない）。
   * 下限のガードは更新関数の中で最新のindexに対して行う——レンダー時にキャプチャした
   * indexで判定すると、開始位置の非同期確定などで表示中のindexが変わった直後に
   * 古い値で通過してしまい、負のindexになって画面が壊れる
   */
  function handlePrev() {
    userMovedRef.current = true
    setIndex((i) => (i > 0 ? i - 1 : i))
    setLaps(0)
    setCompleted(false)
    setPositionMs(0)
    setAudioError(false)
  }

  if (!question) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        {shadowingQuestions.length === 0 ? (
          <p>シャドーイング素材がありません</p>
        ) : (
          <>
            <p>シャドーイングが完了しました</p>
            {completionStats && (
              <CompletionCard
                countLabel={`今日の実施数 ${completionStats.count}問`}
                streakDays={completionStats.streakDays}
                message="この調子で続けましょう"
              />
            )}
          </>
        )}
      </ScreenLayout>
    )
  }

  const availableSpeeds = SPEED_CHIPS.filter(
    (s) => s < 1.15 || listeningStage >= HIGH_SPEED_MIN_STAGE,
  )

  return (
    <ScreenLayout
      status={
        <p className="shadowing-status">
          素材 {index + 1}/{shadowingQuestions.length}（{laps}/{COMPLETION_LAPS}周）
          {/* T-120: 実施済み素材を表示中であることの注記（3周未満で「前へ」戻った場合等） */}
          {completedIds.has(question.id) && (
            <span className="shadowing-status-done"> 実施済み</span>
          )}
        </p>
      }
      action={
        <>
          {audioError && (
            <>
              <p className="drill-error" role="alert">
                音声を再生できませんでした
              </p>
              {/* 音声が恒久的に取得できない素材はlapsが増えず完了に到達しないため、
                  実施ログを記録せずに次の素材へ進める脱出導線を出す */}
              <button type="button" className="secondary-action" onClick={handleNext}>
                この素材をスキップ
              </button>
            </>
          )}
          {completed ? (
            <PrimaryButton onClick={handleNext}>次へ</PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => void handlePlay()}>再生</PrimaryButton>
          )}
          <button type="button" className="secondary-action" onClick={handleRewind}>
            3秒戻し
          </button>
          {/* T-120(J-59): 3周完了前でも常時素材を移動できる導線（従来は3周完了後の「次へ」か
              音声エラー時のスキップでしか移動できず、実質素材1専用画面になっていた） */}
          {index > 0 && (
            <button type="button" className="secondary-action" onClick={handlePrev}>
              前の素材へ
            </button>
          )}
          <button type="button" className="secondary-action" onClick={handleNext}>
            次の素材へ
          </button>
          {/* 進行中の脱出導線（DrillScreenの中断と同じ思想。従来は素材完了までこの画面から出られなかった） */}
          <button type="button" className="secondary-action" onClick={() => navigate('home')}>
            中断してホームへ
          </button>
          <div className="shadowing-speed-chips">
            {availableSpeeds.map((s) => (
              <button
                key={s}
                type="button"
                className={s === rate ? 'is-selected' : ''}
                onClick={() => setRate(s)}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="shadowing-script-toggle">
            <button
              type="button"
              className={scriptMode === 'hidden' ? 'is-selected' : ''}
              onClick={() => setScriptMode('hidden')}
            >
              非表示
            </button>
            <button
              type="button"
              className={scriptMode === 'en' ? 'is-selected' : ''}
              onClick={() => setScriptMode('en')}
            >
              英文
            </button>
            <button
              type="button"
              className={scriptMode === 'en_ja' ? 'is-selected' : ''}
              onClick={() => setScriptMode('en_ja')}
            >
              英文+和訳
            </button>
          </div>
        </>
      }
    >
      <div className="shadowing-accent-line" />
      {scriptMode !== 'hidden' && question.script && (
        <>
          <KaraokeScript
            script={question.script}
            timing={question.timing ?? null}
            positionMs={positionMs}
            durationMs={question.audioMeta?.durationMs ?? 0}
            onSentenceTap={handleSentenceTap}
          />
          {scriptMode === 'en_ja' && question.translation && (
            <p className="shadowing-translation">{question.translation}</p>
          )}
        </>
      )}
    </ScreenLayout>
  )
}
