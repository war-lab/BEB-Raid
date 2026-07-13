// S2 ドリル実行画面（共通。docs/07 7節S2・02の2.2・03の3.2・02の3.1・03の8節L2）。
// text_blank 等の共通フロー（音声なし）に加え、audio_qa（Part2瞬発。T-17）の
// 開始タップ（unlock兼用）→音声再生→3択表示→15秒タイマー のフローを持つ。
// vocab_card（T-21。クイックパックにkind:'srsVocab'が混在する場合の受け皿）は
// VocabScreen（S3）と同じ自己評価3段階フローをこの中で再現する（3.4節: 出題理由に
// 応じてUIが変わる。セッション進行の一本化のためDrillScreen側に統合する）。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { processWrongAnswer } from '../engine/keyVocab'
import { formatQuickPackReason } from '../engine/reason'
import { applyRatingUpdate } from '../engine/rating'
import { reviewSrsCard } from '../engine/srs'
import { updateTagStatsForAnswer } from '../engine/tagStats'
import type { QuestionLookup, SrsGrade } from '../engine/types'
import type { AudioPlayer } from '../platform'
import { answerCurrentQuestion } from '../services/session'
import { NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { ExplanationCard } from '../components/ExplanationCard'
import { HighlightedPhrase } from '../components/HighlightedPhrase'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'

/** 頻出度ランクの説明（bare文字だけでは何のSかわからないため） */
const FREQ_RANK_TITLE = '頻出度ランク（Sが最も頻出、C→B→A→Sの順に上がる）'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
}

interface AnswerResult {
  selectedKey: string | null
  isCorrect: boolean
  isTimeout: boolean
}

/** audio_qa の解答受付タイマー（02の3.1: 1問15秒完結） */
const ANSWER_TIMER_SECONDS = 15
/**
 * 冒頭だけ再生モード（J-5）の再生長。疑問詞＋数語を捉えられる長さの初期値
 * （docsに明記なし。ドッグフード実測で調整する前提のチューニング値）
 */
const PARTIAL_AUDIO_DURATION_MS = 2500

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
// （イベントハンドラ内の呼び出しも静的解析では判別されない）、別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function DrillScreen({ db, audioPlayer }: Props) {
  const snapshot = useSessionStore((s) => s.snapshot)
  const questions = useSessionStore((s) => s.questions)
  const recordAnswer = useSessionStore((s) => s.recordAnswer)
  const partialAudioMode = useSessionStore((s) => s.partialAudioMode)
  const navigate = useAppStore((s) => s.navigate)

  // 表示中の item インデックス（snapshot.answeredCount とは独立に持つ:
  // 解答直後は snapshot が既に次へ進んでいても、解説カードは「次へ」タップまで
  // 現在の問題を表示し続ける必要があるため=07 7節S2）
  const [displayIndex, setDisplayIndex] = useState(() => snapshot?.answeredCount ?? 0)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [startedAt, setStartedAt] = useState(() => now())
  // audio_qa 専用: 'idle'=開始タップ待ち / 'playing'=再生中 / 'played'=再生済み(解答受付可)
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'played'>('idle')
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  // セッション内の連続正解数（02の3.1: 中毒性を作る看板モード）
  const [streak, setStreak] = useState(0)
  // vocab_card 専用: カードが裏返って意味が見えているか
  const [flipped, setFlipped] = useState(false)
  // vocab_card 専用: フレーズ音声自動再生の可否（イヤホンなしモードならOFF。VocabScreenと同じ規約）。
  // settingsLoadedがtrueになるまでは自動再生エフェクトを走らせない（非同期読み込み完了前の
  // 初期値falseで誤って再生してしまうレースを防ぐ）
  const [noEarphoneMode, setNoEarphoneMode] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void db.settings.get(NO_EARPHONE_MODE_KEY).then((setting) => {
      if (cancelled) return
      setNoEarphoneMode(setting?.value === true)
      setSettingsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  const item = snapshot?.items[displayIndex]
  const question = item ? questions.get(item.questionId) : undefined
  const needsAudioGate = question?.format === 'audio_qa'
  const isVocabCard = question?.format === 'vocab_card'

  // vocab_card: フレーズ音声を自動再生する（カードが変わるたびに1回。金フレ型体験=02の4節の
  // 「聞き流し周回」。DrillScreenは元々これを欠いておりVocabScreenとの機能差だった）
  useEffect(() => {
    if (!settingsLoaded || !isVocabCard || noEarphoneMode || !question?.phraseAudio) return
    void audioPlayer.unlock().then(() => audioPlayer.play(question.phraseAudio!))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, isVocabCard, noEarphoneMode, question?.phraseAudio])
  // 再生済み・未解答の間だけタイマーを走らせる（開始値の設定は handlePlayStart 側で行う。
  // ここでは「今ティックすべきか」だけを見る真偽値にし、setInterval の再生成を毎秒起こさない）
  const isCountingDown = needsAudioGate && playState === 'played' && !result

  // audio_qa: 15秒タイマーの秒針を進める（開始のsetStateはイベントハンドラ側=handlePlayStartで行う）
  useEffect(() => {
    if (!isCountingDown) return
    const interval = setInterval(() => {
      setRemainingSec((s) => (s === null ? null : Math.max(s - 1, 0)))
    }, 1000)
    return () => clearInterval(interval)
  }, [isCountingDown])

  // タイマーが0に達したら自動的にタイムアウト（誤答）として確定する
  useEffect(() => {
    if (remainingSec === 0 && !result) {
      void finalizeAnswer(null, false, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec])

  if (!snapshot || !item || !question) {
    if (snapshot && !item) navigate('result')
    return null
  }

  const total = snapshot.items.length
  const current = displayIndex + 1

  async function finalizeAnswer(
    selectedKey: string | null,
    isCorrect: boolean,
    isTimeout: boolean,
  ) {
    if (result || !question || !item) return
    const responseMs = now() - startedAt
    setResult({ selectedKey, isCorrect, isTimeout })
    setStreak((s) => (isCorrect ? s + 1 : 0))

    const nextSnapshot = await answerCurrentQuestion(db, snapshot, {
      isCorrect,
      responseMs,
      isTimeout,
    })

    if (!isCorrect) {
      await processWrongAnswer(db, question)
    }
    const lookup: QuestionLookup = questions
    await updateTagStatsForAnswer(db, question.id, lookup)
    const ratingUpdate = await applyRatingUpdate(db, {
      part: question.part,
      difficulty: question.difficulty,
      isCorrect,
      mode: item.mode,
    })
    if (item.srsCardId) {
      // S2は客観正誤のみのUIのため、自己評価3段階への写像は正解→good/誤答→again に固定する
      await reviewSrsCard(db, item.srsCardId, isCorrect ? 'good' : 'again')
    }

    recordAnswer(nextSnapshot, {
      questionId: question.id,
      isCorrect,
      basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
    })
  }

  function handleSelect(choiceKey: string) {
    if (needsAudioGate && playState !== 'played') return
    void finalizeAnswer(choiceKey, choiceKey === question!.answer, false)
  }

  async function handlePlayStart() {
    setPlayState('playing')
    await audioPlayer.unlock()
    const options = partialAudioMode ? { durationMs: PARTIAL_AUDIO_DURATION_MS } : undefined
    if (question!.audio) {
      await audioPlayer.play(question!.audio, options)
    }
    setPlayState('played')
    setRemainingSec(ANSWER_TIMER_SECONDS)
  }

  async function handleReplay() {
    await audioPlayer.replay()
  }

  function advanceToNext() {
    if (displayIndex + 1 >= total) {
      navigate('result')
      return
    }
    setDisplayIndex((i) => i + 1)
    // 次の問題の解答受付状態をリセットする（イベントハンドラ内での直接更新。react-hooks/set-state-in-effect対応）
    setResult(null)
    setPlayState('idle')
    setRemainingSec(null)
    setFlipped(false)
    setStartedAt(now())
  }

  function handleNext() {
    advanceToNext()
  }

  /**
   * vocab_card の自己評価3段階（VocabScreenと同じ挙動）。
   * 正誤確認のポーズを挟まず、評価と同時に即座に次のカードへ進む
   */
  async function handleVocabGrade(grade: SrsGrade) {
    if (!question || !item) return
    const isCorrect = grade !== 'again'
    const responseMs = now() - startedAt

    const nextSnapshot = await answerCurrentQuestion(db, snapshot, {
      isCorrect,
      responseMs,
      isTimeout: false,
    })
    const lookup: QuestionLookup = questions
    await updateTagStatsForAnswer(db, question.id, lookup) // vocab_cardはtags=[]のため実質no-op
    const ratingUpdate = await applyRatingUpdate(db, {
      part: question.part, // part=0のためapplyRatingUpdate内部でno-op
      difficulty: question.difficulty,
      isCorrect,
      mode: item.mode,
    })
    if (item.srsCardId) {
      await reviewSrsCard(db, item.srsCardId, grade)
    }
    recordAnswer(nextSnapshot, {
      questionId: question.id,
      isCorrect,
      basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
    })
    advanceToNext()
  }

  const choicesInteractive = !needsAudioGate || playState === 'played'

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={current} total={total} />
          {item.reason && <p className="drill-reason">{formatQuickPackReason(item.reason)}</p>}
          {streak > 0 && (
            <p key={streak} className="session-streak display-num">
              🔥{streak}
            </p>
          )}
          {needsAudioGate && playState === 'played' && remainingSec !== null && (
            <p className="drill-timer display-num">{remainingSec}</p>
          )}
        </>
      }
      action={
        <>
          {isVocabCard && !flipped && (
            <>
              <PrimaryButton onClick={() => setFlipped(true)}>タップで意味を見る</PrimaryButton>
              {question.phraseAudio && (
                <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
                  もう一度再生
                </button>
              )}
            </>
          )}
          {isVocabCard && flipped && (
            <>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleVocabGrade('again')}
              >
                もう一回
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleVocabGrade('good')}
              >
                OK
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleVocabGrade('easy')}
              >
                余裕
              </button>
            </>
          )}
          {!isVocabCard && needsAudioGate && playState !== 'played' && (
            <PrimaryButton
              onClick={() => void handlePlayStart()}
              disabled={playState === 'playing'}
            >
              {playState === 'playing' ? '再生中…' : 'タップして開始'}
            </PrimaryButton>
          )}
          {!isVocabCard && needsAudioGate && playState === 'played' && !result && (
            <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
              もう一度再生
            </button>
          )}
          {!isVocabCard &&
            choicesInteractive &&
            (question.choices ?? []).map((choice) => {
              let state: ChoiceState = 'idle'
              if (result) {
                if (choice.key === question.answer) state = 'correct'
                else if (choice.key === result.selectedKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={result !== null}
                  onClick={() => handleSelect(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {!isVocabCard && result && (
            <>
              {result.isTimeout && <p>時間切れ</p>}
              <ExplanationCard question={question} isCorrect={result.isCorrect} />
              <PrimaryButton onClick={handleNext}>次へ</PrimaryButton>
            </>
          )}
        </>
      }
    >
      {isVocabCard ? (
        <div className="vocab-card">
          {question.freqRank && (
            <span className="vocab-card__rank" title={FREQ_RANK_TITLE}>
              {question.freqRank}
            </span>
          )}
          <p className="vocab-card__phrase">
            <HighlightedPhrase
              phrase={question.phrase ?? question.front ?? ''}
              word={question.front ?? ''}
            />
          </p>
          {flipped && <p className="vocab-card__back">{question.back ?? ''}</p>}
        </div>
      ) : question.format === 'audio_qa' ? (
        <p className="question-text">
          {result
            ? (question.script ?? '')
            : playState === 'playing'
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
