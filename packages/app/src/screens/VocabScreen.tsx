// S3 語彙SRS画面（T-19。docs/02 4節・07 6節/7節S3・04 2節・03 2節）。
// 復習モード（期限到来＋新規導入。自己評価3段階）と仕分けモード（新規語彙の
// スワイプ仕分け）の2フェーズ。1カード1操作（07 7節）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord } from '../db/schema'
import { evaluateStreak } from '../engine/streak'
import { addSrsCard, getSrsQueue, reviewSrsCard, srsCardId } from '../engine/srs'
import type { SrsGrade } from '../engine/types'
import type { AudioPlayer } from '../platform'
import { recordAttempt } from '../services/attempts'
import { NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { HighlightedPhrase } from '../components/HighlightedPhrase'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SwipeCard } from '../components/SwipeCard'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
  /** 語彙カード問題プール（front=単語 で SrsCardRecord.refId と対応付ける） */
  vocabQuestions: Question[]
}

/** 頻出度ランクの説明（bare文字だけでは何のSかわからないため。S3画面表示用） */
const FREQ_RANK_TITLE = '頻出度ランク（Sが最も頻出、C→B→A→Sの順に上がる）'

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
function now(): number {
  return Date.now()
}

function vocabQuestionFor(word: string, vocabQuestions: Question[]): Question | undefined {
  return vocabQuestions.find((q) => q.format === 'vocab_card' && q.front === word)
}

/** attempts記録用のquestionId（3.4節: 対応するvocab_card問題が無ければ vocab:<単語> 規約） */
function attemptQuestionId(word: string, question: Question | undefined): string {
  return question?.id ?? `vocab:${word}`
}

export function VocabScreen({ db, audioPlayer, vocabQuestions }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [reviewQueue, setReviewQueue] = useState<SrsCardRecord[] | null>(null)
  const [triageQueue, setTriageQueue] = useState<Question[] | null>(null)
  // フレーズ音声の自動再生可否。イヤホンなしモード時のみ止める（それ以外は既定でON。
  // 以前は専用トグル(vocabAutoPlayPhrase)を設定していたがSettingsScreenに導線が
  // 一度も無く常にOFF固定＝聞き流し周回が機能していなかったため、既存のイヤホンなし
  // モード設定に統合した）
  const [autoPlay, setAutoPlay] = useState(true)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [triageIndex, setTriageIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [startedAt, setStartedAt] = useState(() => now())

  // 初回ロード: 復習キュー（期限到来＋新規導入。4節）と仕分け候補（未SRS化の語彙）を用意する
  useEffect(() => {
    let cancelled = false
    async function load() {
      const queue = await getSrsQueue(db)
      const reviewCards = [...queue.dueReviews, ...queue.newCards]
      const existingIds = new Set(await db.srsCards.toCollection().primaryKeys())
      const candidates = vocabQuestions.filter(
        (q) =>
          q.format === 'vocab_card' && q.front && !existingIds.has(srsCardId('vocab', q.front)),
      )
      const noEarphoneSetting = await db.settings.get(NO_EARPHONE_MODE_KEY)
      if (!cancelled) {
        setReviewQueue(reviewCards)
        setTriageQueue(candidates)
        setAutoPlay(noEarphoneSetting?.value !== true)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- db/vocabQuestions は起動時に固定される想定
  }, [])

  const reviewCard = reviewQueue?.[reviewIndex]
  const reviewQuestion = reviewCard ? vocabQuestionFor(reviewCard.refId, vocabQuestions) : undefined
  const triageQuestion = triageQueue?.[triageIndex]

  // フレーズ音声自動再生（イヤホンなしモードでなければ、カード表示のたびに1回再生）
  useEffect(() => {
    if (!autoPlay) return
    const phraseAudio = reviewQuestion?.phraseAudio ?? triageQuestion?.phraseAudio
    if (!phraseAudio) return
    void audioPlayer.unlock().then(() => audioPlayer.play(phraseAudio))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, reviewQuestion?.phraseAudio, triageQuestion?.phraseAudio])

  function handleReplay() {
    void audioPlayer.replay()
  }

  if (reviewQueue === null || triageQueue === null) return null

  function handleFlip() {
    setFlipped(true)
  }

  async function handleGrade(grade: SrsGrade) {
    if (!reviewCard) return
    const responseMs = now() - startedAt
    await reviewSrsCard(db, reviewCard.id, grade)
    // 自己評価に客観正誤は無いが、ログ上は「もう一回」のみ不正解相当として記録する
    await recordAttempt(db, {
      questionId: attemptQuestionId(reviewCard.refId, reviewQuestion),
      mode: 'srs',
      isCorrect: grade !== 'again',
      responseMs,
    })
    await evaluateStreak(db)
    setReviewIndex((i) => i + 1)
    setFlipped(false)
    setStartedAt(now())
  }

  function handleKnown() {
    setTriageIndex((i) => i + 1)
  }

  async function handleUnknown() {
    if (!triageQuestion?.front) return
    await addSrsCard(db, { refType: 'vocab', refId: triageQuestion.front })
    setTriageIndex((i) => i + 1)
  }

  if (reviewIndex < reviewQueue.length && reviewCard) {
    const front = reviewQuestion?.front ?? reviewCard.refId
    const phrase = reviewQuestion?.phrase ?? front
    const back = reviewQuestion?.back ?? ''

    return (
      <ScreenLayout
        status={
          <p>
            復習 {reviewIndex + 1}/{reviewQueue.length}
          </p>
        }
        action={
          flipped ? (
            <>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleGrade('again')}
              >
                もう一回
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleGrade('good')}
              >
                OK
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleGrade('easy')}
              >
                余裕
              </button>
            </>
          ) : (
            <>
              <PrimaryButton onClick={handleFlip}>タップで意味を見る</PrimaryButton>
              {reviewQuestion?.phraseAudio && (
                <button type="button" className="drill-replay" onClick={handleReplay}>
                  もう一度再生
                </button>
              )}
            </>
          )
        }
      >
        <div className="vocab-card">
          {reviewQuestion?.freqRank && (
            <span className="vocab-card__rank" title={FREQ_RANK_TITLE}>
              {reviewQuestion.freqRank}
            </span>
          )}
          <p className="vocab-card__phrase">
            <HighlightedPhrase phrase={phrase} word={front} />
          </p>
          {flipped && <p className="vocab-card__back">{back}</p>}
        </div>
      </ScreenLayout>
    )
  }

  if (triageIndex < triageQueue.length && triageQuestion) {
    return (
      <ScreenLayout
        status={
          <p>
            仕分け {triageIndex + 1}/{triageQueue.length}
          </p>
        }
        action={
          <>
            <button
              type="button"
              className="vocab-grade-button"
              onClick={() => void handleUnknown()}
            >
              知らない
            </button>
            <button type="button" className="vocab-grade-button" onClick={handleKnown}>
              知ってる
            </button>
          </>
        }
      >
        <SwipeCard onSwipeRight={handleKnown} onSwipeLeft={() => void handleUnknown()}>
          <div className="vocab-card">
            {triageQuestion.freqRank && (
              <span className="vocab-card__rank" title={FREQ_RANK_TITLE}>
                {triageQuestion.freqRank}
              </span>
            )}
            <p className="vocab-card__phrase">
              <HighlightedPhrase
                phrase={triageQuestion.phrase ?? triageQuestion.front ?? ''}
                word={triageQuestion.front ?? ''}
              />
            </p>
          </div>
        </SwipeCard>
      </ScreenLayout>
    )
  }

  return (
    <ScreenLayout action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}>
      <p>語彙SRSが終了しました</p>
    </ScreenLayout>
  )
}
