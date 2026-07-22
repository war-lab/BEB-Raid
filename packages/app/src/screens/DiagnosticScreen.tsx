// P0診断（初回チュートリアル。T-20。正本: docs/03 1.2節・5.1、docs/10 T-20行）。
// 表示名＋自己申告TOEIC（任意）入力→アダプティブ30問（L15/R15交互）→
// 完了画面（L/R初期レート＋「ここから伸ばす」。予測スコア帯は出さない=J-1）。
// 診断は独立したレートキャリブレーションのフローのため、通常ドリルの
// tagStats・SRS・processWrongAnswer 等の副作用は起こさない。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import {
  DIAGNOSTIC_TOTAL_ITEMS,
  initialRatingFromToeic,
  sectionForTurn,
  selectNextQuestion,
  updateDiagnosticRating,
} from '../engine/diagnostic'
import { DEFAULT_INITIAL_RATING, initializeRatings, sectionForPart } from '../engine/rating'
import { getStreak } from '../engine/streak'
import type { AudioPlayer } from '../platform'
import { recordAttempt } from '../services/attempts'
import { countAttemptsToday } from '../services/dailyStats'
import { createProfile } from '../services/profile'
import { DIAGNOSTIC_PROGRESS_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { ChoiceButton } from '../components/ChoiceButton'
import { CompletionCard } from '../components/CompletionCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
  /** 診断の出題候補プール（実パック読み込みはT-35）。part1-4=L、part5-7=Rとして振り分ける */
  questionPool: Question[]
}

type Step = 'intro' | 'quiz' | 'complete'

/** 診断の途中経過（T-113）。settingsのDIAGNOSTIC_PROGRESS_KEYに保存する一時データ */
interface DiagnosticProgress {
  displayName: string
  toeicInput: string
  turn: number
  ratingL: number
  ratingR: number
  askedL: string[]
  askedR: string[]
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function DiagnosticScreen({ db, audioPlayer, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [step, setStep] = useState<Step>('intro')
  const [displayName, setDisplayName] = useState('')
  const [toeicInput, setToeicInput] = useState('')

  const [turn, setTurn] = useState(0)
  const [ratingL, setRatingL] = useState(DEFAULT_INITIAL_RATING)
  const [ratingR, setRatingR] = useState(DEFAULT_INITIAL_RATING)
  const [askedL, setAskedL] = useState<ReadonlySet<string>>(new Set())
  const [askedR, setAskedR] = useState<ReadonlySet<string>>(new Set())
  const [startedAt, setStartedAt] = useState(() => now())
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'played'>('idle')

  const [resultL, setResultL] = useState(DEFAULT_INITIAL_RATING)
  const [resultR, setResultR] = useState(DEFAULT_INITIAL_RATING)
  // T-70: 音声再生失敗時のリカバリ用エラーメッセージ（14の1.4。DrillScreenと同じパターン）
  const [audioError, setAudioError] = useState<string | null>(null)
  // T-78: 完了カード用の「今日の実施数・ストリーク」は診断完了到達時に1回だけ取得する
  const [completionStats, setCompletionStats] = useState<{
    count: number
    streakDays: number
  } | null>(null)
  // T-113: 診断途中経過の永続化。マウント時に残っていれば再開/やり直しを提示する
  const [progressChecked, setProgressChecked] = useState(false)
  const [savedProgress, setSavedProgress] = useState<DiagnosticProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    void db.settings.get(DIAGNOSTIC_PROGRESS_KEY).then((setting) => {
      if (cancelled) return
      setSavedProgress((setting?.value as DiagnosticProgress | undefined) ?? null)
      setProgressChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  useEffect(() => {
    if (step !== 'complete') return
    let cancelled = false
    void Promise.all([countAttemptsToday(db), getStreak(db)]).then(([count, streak]) => {
      if (!cancelled) setCompletionStats({ count, streakDays: streak.currentDays })
    })
    return () => {
      cancelled = true
    }
  }, [step, db])

  const lPool = questionPool.filter((q) => sectionForPart(q.part) === 'L')
  const rPool = questionPool.filter((q) => sectionForPart(q.part) === 'R')

  function handleStart() {
    const trimmed = displayName.trim()
    if (trimmed === '') return
    const toeic = toeicInput.trim() === '' ? null : Number(toeicInput)
    const fallback = DEFAULT_INITIAL_RATING
    const initialL = initialRatingFromToeic(toeic, fallback)
    const initialR = initialRatingFromToeic(toeic, fallback)
    setRatingL(initialL)
    setRatingR(initialR)
    setAskedL(new Set())
    setAskedR(new Set())
    setTurn(0)
    setStartedAt(now())
    setPlayState('idle')
    setStep('quiz')
    void db.settings.put({
      key: DIAGNOSTIC_PROGRESS_KEY,
      value: {
        displayName: trimmed,
        toeicInput,
        turn: 0,
        ratingL: initialL,
        ratingR: initialR,
        askedL: [],
        askedR: [],
      } satisfies DiagnosticProgress,
    })
  }

  /** T-113: 途中経過から再開する（保存済みstateを復元してquizへ進む） */
  function handleResumeProgress() {
    if (!savedProgress) return
    setDisplayName(savedProgress.displayName)
    setToeicInput(savedProgress.toeicInput)
    setRatingL(savedProgress.ratingL)
    setRatingR(savedProgress.ratingR)
    setAskedL(new Set(savedProgress.askedL))
    setAskedR(new Set(savedProgress.askedR))
    setTurn(savedProgress.turn)
    setStartedAt(now())
    setPlayState('idle')
    setSavedProgress(null)
    setStep('quiz')
  }

  /** T-113: 途中経過を破棄して最初からやり直す */
  function handleRestartProgress() {
    void db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
    setSavedProgress(null)
  }

  /**
   * 自己申告スコアがあれば30問診断をスキップする（ユーザー指示による設計変更。
   * docs/03 5.1節の「事前値として混ぜる」に加え、スキップ導線を追加した）。
   * `R = TOEIC×1000/990` をそのままL/R初期レートとして確定させる
   */
  async function handleSkip() {
    const trimmed = displayName.trim()
    if (trimmed === '') return
    const toeic = toeicInput.trim() === '' ? null : Number(toeicInput)
    if (toeic === null) return
    const rating = initialRatingFromToeic(toeic, DEFAULT_INITIAL_RATING)
    await initializeRatings(db, { listening: rating, reading: rating })
    await createProfile(db, { displayName: trimmed, initialToeic: toeic })
    // T-113: スキップ時も途中経過を消す（残っていた別セッションの途中経過を含む）
    await db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
    setResultL(rating)
    setResultR(rating)
    setStep('complete')
  }

  if (step === 'intro') {
    // T-113: 途中経過の有無を確認するまでは何も出さない（settingsの1回読み込みのみで即完了する）
    if (!progressChecked) return null

    // docs/20 V-6: 診断ウェルカムの第一印象改善。ワードマークは画面地（テーマ追従の--bg）上に
    // 置くため通常どおりvar(--wordmark-grad)で両テーマ追従させる（components.css参照）
    const wordmark = (
      <p className="diagnostic-wordmark">
        <span className="diagnostic-wordmark__mark">BEB RAID</span>
        <span className="diagnostic-wordmark__sub">ビーブレイド</span>
      </p>
    )

    if (savedProgress) {
      return (
        <ScreenLayout
          action={
            <>
              <PrimaryButton onClick={handleResumeProgress}>
                続きから再開（{savedProgress.turn + 1}問目から）
              </PrimaryButton>
              <button type="button" className="secondary-action" onClick={handleRestartProgress}>
                最初からやり直す
              </button>
            </>
          }
        >
          {wordmark}
          <div className="diagnostic-hero">
            <h1 style={{ fontSize: 'var(--fs-heading)' }}>診断を再開しますか？</h1>
            <p>前回の診断が途中で終わっています。続きから再開できます。</p>
          </div>
        </ScreenLayout>
      )
    }

    const toeicValid = toeicInput.trim() === '' || !Number.isNaN(Number(toeicInput))
    const canSkip = toeicInput.trim() !== '' && toeicValid && displayName.trim() !== ''
    return (
      <ScreenLayout
        action={
          <>
            <PrimaryButton
              onClick={handleStart}
              disabled={displayName.trim() === '' || !toeicValid}
            >
              診断を始める
            </PrimaryButton>
            {toeicInput.trim() !== '' && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => void handleSkip()}
                disabled={!canSkip}
              >
                自己申告スコアで診断をスキップ
              </button>
            )}
          </>
        }
      >
        {wordmark}
        <div className="diagnostic-hero">
          <h1 style={{ fontSize: 'var(--fs-heading)' }}>ようこそ</h1>
          <p>
            30問（リスニング15問・リーディング15問）に答えると、あなたの今のレートを推定します。
          </p>
          <p>自己申告TOEICスコアを入力すると、診断をスキップしてすぐ始めることもできます。</p>
        </div>
        {/* T-116(1): 375px幅でラベルと入力欄が同一行に詰まり折返しが乱れる問題への対処。
            settings-listの既存スタイル（label display:block）をブロック配置に流用する。
            docs/20 V-6: フォームを--surface-gradのカード面（diagnostic-form-card）に収める */}
        <div className="settings-list diagnostic-form-card">
          <label>
            表示名
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名"
            />
          </label>
          <label>
            自己申告TOEICスコア（任意）
            <input
              value={toeicInput}
              onChange={(e) => setToeicInput(e.target.value)}
              inputMode="numeric"
              placeholder="例: 650"
            />
          </label>
        </div>
      </ScreenLayout>
    )
  }

  if (step === 'complete') {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <h1 style={{ fontSize: 'var(--fs-heading)' }}>診断完了</h1>
        <p className="display-num">L: {Math.round(resultL)}</p>
        <p className="display-num">R: {Math.round(resultR)}</p>
        <p>ここから伸ばしていきましょう。</p>
        {completionStats && (
          <CompletionCard
            countLabel={`今日の実施数 ${completionStats.count}問`}
            streakDays={completionStats.streakDays}
            message="ここから伸ばしていきましょう"
          />
        )}
      </ScreenLayout>
    )
  }

  // step === 'quiz'
  const section = sectionForTurn(turn)
  const pool = section === 'L' ? lPool : rPool
  const asked = section === 'L' ? askedL : askedR
  const rating = section === 'L' ? ratingL : ratingR
  const question = selectNextQuestion(pool, asked, rating)

  if (!question) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p>診断に使える問題がありません。</p>
      </ScreenLayout>
    )
  }

  const needsAudioGate = question.format === 'audio_qa'
  const choicesInteractive = !needsAudioGate || playState === 'played'

  async function handlePlayStart() {
    setPlayState('playing')
    setAudioError(null)
    try {
      await audioPlayer.unlock()
      if (question!.audio) {
        await audioPlayer.play(question!.audio)
      }
    } catch (err) {
      console.warn('[DiagnosticScreen] 音声再生に失敗', err)
      setPlayState('idle')
      setAudioError('音声を再生できませんでした')
      return
    }
    setPlayState('played')
  }

  /** 音声再生に失敗した際、音声なしで解答へ進むフォールバック */
  function handlePlayWithoutAudio() {
    setAudioError(null)
    setPlayState('played')
  }

  async function handleReplay() {
    try {
      await audioPlayer.replay()
    } catch (err) {
      console.warn('[DiagnosticScreen] 再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    }
  }

  async function handleSelect(choiceKey: string) {
    const isCorrect = choiceKey === question!.answer
    const responseMs = now() - startedAt

    await recordAttempt(db, {
      questionId: question!.id,
      mode: 'solo',
      isCorrect,
      responseMs,
    })

    const newRating = updateDiagnosticRating(rating, question!.difficulty, isCorrect)
    const nextAsked = new Set(asked)
    nextAsked.add(question!.id)
    if (section === 'L') {
      setRatingL(newRating)
      setAskedL(nextAsked)
    } else {
      setRatingR(newRating)
      setAskedR(nextAsked)
    }

    const nextTurn = turn + 1
    const finalListening = section === 'L' ? newRating : ratingL
    const finalReading = section === 'R' ? newRating : ratingR
    if (nextTurn >= DIAGNOSTIC_TOTAL_ITEMS) {
      await initializeRatings(db, { listening: finalListening, reading: finalReading })
      await createProfile(db, {
        displayName: displayName.trim(),
        initialToeic: toeicInput.trim() === '' ? null : Number(toeicInput),
      })
      // T-113: 完了時に途中経過を消す
      await db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
      setResultL(finalListening)
      setResultR(finalReading)
      setStep('complete')
      return
    }
    setTurn(nextTurn)
    setStartedAt(now())
    setPlayState('idle')
    setAudioError(null)
    // T-113: 1問ごとに途中経過を保存する（中断→再開で1問目からやり直しにならないように）
    void db.settings.put({
      key: DIAGNOSTIC_PROGRESS_KEY,
      value: {
        displayName: displayName.trim(),
        toeicInput,
        turn: nextTurn,
        ratingL: finalListening,
        ratingR: finalReading,
        askedL: [...(section === 'L' ? nextAsked : askedL)],
        askedR: [...(section === 'R' ? nextAsked : askedR)],
      } satisfies DiagnosticProgress,
    })
  }

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={turn + 1} total={DIAGNOSTIC_TOTAL_ITEMS} />
          <button type="button" className="drill-abort" onClick={() => navigate('home')}>
            中断
          </button>
          <p>{section === 'L' ? 'リスニング' : 'リーディング'}</p>
        </>
      }
      action={
        <>
          {audioError && (
            <p className="drill-error" role="alert">
              {audioError}
            </p>
          )}
          {needsAudioGate && playState !== 'played' && (
            <>
              <PrimaryButton
                onClick={() => void handlePlayStart()}
                disabled={playState === 'playing'}
              >
                {playState === 'playing'
                  ? '再生中…'
                  : audioError
                    ? 'もう一度試す'
                    : 'タップして開始'}
              </PrimaryButton>
              {audioError && (
                <button type="button" className="secondary-action" onClick={handlePlayWithoutAudio}>
                  音声なしで解答する
                </button>
              )}
            </>
          )}
          {needsAudioGate && playState === 'played' && (
            <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
              もう一度再生
            </button>
          )}
          {choicesInteractive &&
            (question.choices ?? []).map((choice) => (
              <ChoiceButton
                key={choice.key}
                marker={choice.key}
                onClick={() => void handleSelect(choice.key)}
              >
                {choice.text}
              </ChoiceButton>
            ))}
        </>
      }
    >
      {question.format === 'audio_qa' ? (
        <p className="question-text">
          {playState === 'playing'
            ? '再生中…'
            : playState === 'played'
              ? '音声再生済み'
              : '音声を聞いて解答してください'}
        </p>
      ) : (
        <p className="question-text">{question.question}</p>
      )}
    </ScreenLayout>
  )
}
