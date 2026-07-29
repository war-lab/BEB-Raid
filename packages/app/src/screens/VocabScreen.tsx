// S3 語彙SRS画面（T-19。docs/02 4節・07 6節/7節S3・04 2節・03 2節）。
// 復習モード（4択リコールテスト→自己評価3段階）と仕分けモード（新規語彙の
// スワイプ仕分け）の2フェーズ。1カード1操作（07 7節）。
//
// 【設計変更・docs未記載（ユーザー指摘 2026-07-13）】復習モードは元々「タップで意味を見る→
// 自己申告（もう一回/OK/余裕）」のみで、客観的な正誤判定が無かった（本人の申告任せで
// 「本当に問題になっているか」という指摘）。加えて、フレーズだけ渡されても何を問われて
// いるのか（英文和訳なのか単語の意味なのか）が不明瞭という指摘もあった。これを受け、
// 意味を見る前に4択（engine/vocabQuiz.ts）を挟み、「この単語の意味は？」という明示的な
// 問いと客観的な正誤判定を追加した。自己評価3段階（間隔調整用）はその後に残す
//
// 【提示順の変更 2026-07-29】上記の4択を導入した後も、対象語を含むフレーズ全文を解答前に
// 表示しフレーズ音声も自動再生していた。"The first item on the agenda is the budget review."
// を見せた状態で agenda の意味を問えば文脈から推測できるため、4択の正答率が実力を
// 過大評価していた。解答前は単語のみを提示し、フレーズと音声は解答後に開示する。
// 客観正誤（4択）と間隔調整（自己評価3段階）の分離はそのまま維持する
import { useEffect, useMemo, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord } from '../db/schema'
import { isServable } from '../engine/quickPack'
import { evaluateStreak, getStreak } from '../engine/streak'
import { addSrsCard, getSrsQueue, markVocabKnown, srsCardId } from '../engine/srs'
import type { SrsGrade } from '../engine/types'
import { buildVocabQuizChoices } from '../engine/vocabQuiz'
import type { AudioPlayer } from '../platform'
import { recordAnswerPipeline } from '../services/answerPipeline'
import { countAttemptsToday } from '../services/dailyStats'
import { HAPTICS_ENABLED_KEY, NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { CompletionCard } from '../components/CompletionCard'
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

/** 仕分けの区切り単位（T-119・J-58）。600語を前に「終わりが見えない」圧を緩和する */
const TRIAGE_BATCH_SIZE = 20

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
  // T-119: 20語仕分けるごとに立てる中断フラグ（「続けて仕分ける」タップでfalseに戻す）
  const [triagePaused, setTriagePaused] = useState(false)
  // 復習モード専用: 選んだ4択のkey（未選択はnull。選択後に自己評価3段階を出す）
  const [selectedChoiceKey, setSelectedChoiceKey] = useState<string | null>(null)
  // 「わからない」を選んだ状態（ドッグフィードバック 2026-07-22）。当てずっぽうの正解で
  // isCorrectが偽陽性になるのを防ぐため、正解は提示しつつ isCorrect=false・SRSはagain扱いにする
  const [dontKnow, setDontKnow] = useState(false)
  const [startedAt, setStartedAt] = useState(() => now())
  // T-78: ハプティクス設定（既定ON）
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  // 初回ロード失敗時のフラグ。trueならエラー表示＋ホーム導線を出す（永久 return null を防ぐ）
  const [loadError, setLoadError] = useState(false)

  // 初回ロード: 復習キュー（期限到来＋新規導入。4節）と仕分け候補（未SRS化の語彙）を用意する
  useEffect(() => {
    let cancelled = false
    async function load() {
      const queue = await getSrsQueue(db)
      // 復習対象は「refType==='vocab' かつ対応する vocab_card 問題が実在する」カードに限る
      // （quickPack.ts の isServable と同種の発見バグ対策）。processWrongAnswer が作る
      // refType==='question' カードや、パック撤去・別端末復元で語が引けないカードが
      // キュー先頭に居座ると、4択も自己評価ボタンも組めず操作不能のまま恒久的に詰むため。
      // 除外したカードは削除しない（パック再取得で対応問題が復活しうるため、次回ロードで再評価される）
      const reviewCards = [...queue.dueReviews, ...queue.newCards].filter(
        (card) => card.refType === 'vocab' && isServable(card, vocabQuestions),
      )
      const existingIds = new Set(await db.srsCards.toCollection().primaryKeys())
      const candidates = vocabQuestions.filter(
        (q) =>
          q.format === 'vocab_card' && q.front && !existingIds.has(srsCardId('vocab', q.front)),
      )
      const [noEarphoneSetting, hapticsSetting] = await Promise.all([
        db.settings.get(NO_EARPHONE_MODE_KEY),
        db.settings.get(HAPTICS_ENABLED_KEY),
      ])
      if (!cancelled) {
        setReviewQueue(reviewCards)
        setTriageQueue(candidates)
        setAutoPlay(noEarphoneSetting?.value !== true)
        setHapticsEnabled(hapticsSetting?.value !== false)
      }
    }
    // 失敗（DB切断・破損等）を握りつぶすと reviewQueue/triageQueue が null のまま
    // 永久に何も描画されなくなるため、エラー表示へ切り替える
    void load().catch((err: unknown) => {
      console.error('[VocabScreen] 語彙データの読み込みに失敗', err)
      if (!cancelled) setLoadError(true)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- db/vocabQuestions は起動時に固定される想定
  }, [])

  const reviewCard = reviewQueue?.[reviewIndex]
  const reviewQuestion = reviewCard ? vocabQuestionFor(reviewCard.refId, vocabQuestions) : undefined
  const triageQuestion = triageQueue?.[triageIndex]

  // 4択はカードが変わるたびに1回だけ組み立てる（依存はreviewQuestion.idのみにし、
  // 選択後の再レンダリングで選択肢が入れ替わらないようにする）
  const quizChoices = useMemo(
    () => (reviewQuestion ? buildVocabQuizChoices(reviewQuestion, vocabQuestions) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vocabQuestionsは起動時に固定される想定
    [reviewQuestion?.id],
  )

  // 解答済み（4択を選んだ or「わからない」）かどうか。フレーズと音声の開示条件に使う
  const answered = selectedChoiceKey !== null || dontKnow

  function playPhrase(phraseAudio: string, context: string) {
    void audioPlayer
      .unlock()
      .then(() => audioPlayer.play(phraseAudio))
      .catch((err: unknown) => {
        // 自動再生は失敗しても学習継続可能（4択・スワイプ操作は既に表示されている）なので通知はしない
        console.warn(`[VocabScreen] ${context}に失敗`, err)
      })
  }

  // 仕分けフェーズに入っているか（復習キューを消化しきった後）。音声の自動再生を
  // フェーズで分けるために必要: 復習中に仕分けキュー先頭の音声が鳴ると、復習カードの
  // 解答前に別の語のフレーズが流れる（復習と仕分けで1つのeffectを共有していた頃は
  // 復習を優先していたため起きなかった）
  const inTriagePhase = reviewQueue !== null && reviewIndex >= reviewQueue.length

  // 仕分けモードのフレーズ音声自動再生（イヤホンなしモードでなければカード表示のたびに1回）。
  // 仕分けには解答段階が無いので従来どおり即再生する
  useEffect(() => {
    if (!autoPlay || !inTriagePhase) return
    const phraseAudio = triageQuestion?.phraseAudio
    if (!phraseAudio) return
    playPhrase(phraseAudio, '仕分けカードのフレーズ音声の自動再生')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, inTriagePhase, triageQuestion?.phraseAudio])

  // 復習モードのフレーズ音声自動再生は【解答後】に限る（2026-07-29）。
  // 解答前にフレーズ音声を流すと、文脈から意味を推測できてリコールテストにならない
  // （表示側でフレーズを解答後まで隠すのと同じ理由。DrillScreen の questionEndMs による
  // 正答リーク対策と同じ系列の判断）。カードが変わると answered が false に戻るので
  // 同じカードで二重に再生されることはない
  useEffect(() => {
    if (!autoPlay || !answered) return
    const phraseAudio = reviewQuestion?.phraseAudio
    if (!phraseAudio) return
    playPhrase(phraseAudio, '復習カードのフレーズ音声の自動再生')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, answered, reviewQuestion?.phraseAudio])

  /**
   * 復習カードのフレーズを再生する（解答後のみ表示するボタン用）。
   * replay() ではなく play() を使う: イヤホンなしモードでは自動再生していないので
   * replay() の lastOptions が別カード・別画面の音声を指しうる
   */
  function handlePlayPhrase() {
    const phraseAudio = reviewQuestion?.phraseAudio
    if (!phraseAudio) return
    playPhrase(phraseAudio, 'フレーズの再生')
  }

  // T-78: 完了カード用の「今日の実施数・ストリーク」は完了到達時に1回だけ取得する
  const isDone =
    reviewQueue !== null &&
    triageQueue !== null &&
    reviewIndex >= reviewQueue.length &&
    triageIndex >= triageQueue.length
  const [completionStats, setCompletionStats] = useState<{
    count: number
    streakDays: number
  } | null>(null)
  useEffect(() => {
    if (!isDone) return
    let cancelled = false
    void Promise.all([countAttemptsToday(db), getStreak(db)]).then(([count, streak]) => {
      if (!cancelled) setCompletionStats({ count, streakDays: streak.currentDays })
    })
    return () => {
      cancelled = true
    }
  }, [isDone, db])

  if (loadError) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p className="drill-error" role="alert">
          語彙データを読み込めませんでした
        </p>
      </ScreenLayout>
    )
  }

  if (reviewQueue === null || triageQueue === null) return null

  function handleSelectChoice(key: string) {
    if (selectedChoiceKey !== null || dontKnow) return
    setSelectedChoiceKey(key)
    // T-78: 正解確定時の軽い振動フィードバック（設定でOFF・非対応環境では何もしない）
    if (hapticsEnabled && quizChoices.find((c) => c.key === key)?.isCorrect) {
      navigator.vibrate?.(15)
    }
  }

  // 「わからない」タップ: 選択肢は選ばず、正解の提示（answered=true）だけ行う。
  // 記録はこの後の「次へ」で handleGrade('again') を呼び、isCorrect=false（未選択のため）で確定する
  function handleDontKnow() {
    if (selectedChoiceKey !== null || dontKnow) return
    setDontKnow(true)
  }

  async function handleGrade(grade: SrsGrade) {
    if (!reviewCard) return
    const responseMs = now() - startedAt
    // isCorrectは自己申告ではなく4択の客観的な正誤（ユーザー指摘による設計変更）。
    // gradeは引き続きSRSの間隔調整（もう一回/OK/余裕）専用
    const isCorrect = quizChoices.find((c) => c.key === selectedChoiceKey)?.isCorrect ?? false
    const questionId = attemptQuestionId(reviewCard.refId, reviewQuestion)
    // このS3画面はDrillScreenのvocab_card分岐と異なりtagStats/レート更新を元々呼ばない
    // （tags=[]・part=0で実質no-opの処理をここでも通す意味が無いため=skip全指定）。
    // evaluateStreakはpipelineに含めず、セッション概念の無い画面としてここに残す
    await recordAnswerPipeline(db, {
      questionId,
      question: reviewQuestion ?? {
        id: questionId,
        part: 0,
        format: 'vocab_card',
        difficulty: 1,
        tags: [],
        keyVocab: [],
      },
      lookup: new Map(),
      isCorrect,
      responseMs,
      mode: 'srs',
      srsCardId: reviewCard.id,
      srsGrade: grade,
      skip: { wrongAnswer: true, tagStats: true, rating: true },
    })
    await evaluateStreak(db)
    setReviewIndex((i) => i + 1)
    setSelectedChoiceKey(null)
    setDontKnow(false)
    setStartedAt(now())
  }

  /** 仕分け1件の消化後、20語区切りに達していたら中断フラグを立てる（T-119） */
  function advanceTriage() {
    const next = triageIndex + 1
    setTriageIndex(next)
    if (triageQueue && next < triageQueue.length && next % TRIAGE_BATCH_SIZE === 0) {
      setTriagePaused(true)
    }
  }

  async function handleKnown() {
    if (!triageQuestion?.front) return
    // J-58: 卒業済みSRSカードとして永続化する。次回入店時にまた仕分けキューへ出ないようにする
    // （既知語が後で誤答されればaddSrsCardの既存仕様で自動的にSRS学習へ編入される=意図した相互作用）
    await markVocabKnown(db, triageQuestion.front)
    advanceTriage()
  }

  async function handleUnknown() {
    if (!triageQuestion?.front) return
    await addSrsCard(db, { refType: 'vocab', refId: triageQuestion.front })
    advanceTriage()
  }

  if (reviewIndex < reviewQueue.length && reviewCard) {
    const front = reviewQuestion?.front ?? reviewCard.refId
    const phrase = reviewQuestion?.phrase ?? front

    return (
      <ScreenLayout
        status={
          <>
            <p>
              復習 {reviewIndex + 1}/{reviewQueue.length}
            </p>
            {/* T-119(J-58): 復習が溜まった日でも仕分けに到達できるよう、消化せず仕分けへ直行する導線。
                DB上の復習キューは未消化のまま=次回入店時にまた復習から始まる */}
            {triageQueue.length > 0 && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => setReviewIndex(reviewQueue.length)}
              >
                仕分けへ
              </button>
            )}
            {/* 進行中の脱出導線（DrillScreenの中断ボタンと同じパターン。進捗はSRS上更新済みのため失われない） */}
            <button type="button" className="drill-abort" onClick={() => navigate('home')}>
              中断
            </button>
          </>
        }
        action={
          <>
            {quizChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (answered) {
                if (choice.isCorrect) state = 'correct'
                else if (choice.key === selectedChoiceKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={answered}
                  onClick={() => handleSelectChoice(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
            {/* フレーズ音声は解答後にのみ出す（解答前に流すと文脈から意味を推測できる） */}
            {answered && reviewQuestion?.phraseAudio && (
              <button type="button" className="drill-replay" onClick={handlePlayPhrase}>
                フレーズを再生
              </button>
            )}
            {!answered && (
              <button type="button" className="vocab-dontknow-button" onClick={handleDontKnow}>
                わからない
              </button>
            )}
            {/* 「わからない」で正解を提示した後は、自己評価3段階は出さず「次へ」だけにする
                （既に「わからない」と申告済みなので間隔はagain固定・タップ数も最小にする） */}
            {answered && dontKnow && (
              <button
                type="button"
                className="vocab-grade-button"
                onClick={() => void handleGrade('again')}
              >
                次へ
              </button>
            )}
            {answered && !dontKnow && (
              <>
                <button
                  type="button"
                  className="vocab-grade-button"
                  title="間隔を短くしてすぐに復習します"
                  onClick={() => void handleGrade('again')}
                >
                  もう一回
                </button>
                <button
                  type="button"
                  className="vocab-grade-button"
                  title="通常の間隔で復習します"
                  onClick={() => void handleGrade('good')}
                >
                  OK
                </button>
                <button
                  type="button"
                  className="vocab-grade-button"
                  title="間隔を大きく広げて復習します"
                  onClick={() => void handleGrade('easy')}
                >
                  余裕
                </button>
              </>
            )}
          </>
        }
      >
        {/* 解答前は単語のみ、解答後にフレーズを開示する（2026-07-29。docs/02 4節）。
            フレーズを先に見せると "The first item on the agenda is …" のような例文から
            意味を推測できてしまい、正答率が実力を過大評価する。未解答時はフレーズ文字列を
            DOMに出さない（visibility:hidden では退行をテストで検出できない） */}
        <div className="vocab-card vocab-card--recall">
          {reviewQuestion?.freqRank && (
            <span
              className="vocab-card__rank"
              data-rank={reviewQuestion.freqRank}
              title={FREQ_RANK_TITLE}
            >
              {reviewQuestion.freqRank}
            </span>
          )}
          <p className="vocab-card__word">{front}</p>
          {answered ? (
            <p className="vocab-card__phrase">
              <HighlightedPhrase phrase={phrase} word={front} />
            </p>
          ) : (
            <p className="vocab-card__prompt">この単語の意味は？</p>
          )}
        </div>
      </ScreenLayout>
    )
  }

  // T-119(J-58): 20語区切りの中間画面。600語を前に「終わりが見えない」圧を緩和する
  if (triagePaused && triageIndex < triageQueue.length) {
    return (
      <ScreenLayout
        action={
          <>
            <PrimaryButton onClick={() => setTriagePaused(false)}>
              続けて仕分ける（残り{triageQueue.length - triageIndex}語）
            </PrimaryButton>
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              ホームへ
            </button>
          </>
        }
      >
        <p>仕分けを{TRIAGE_BATCH_SIZE}語終えました</p>
      </ScreenLayout>
    )
  }

  if (triageIndex < triageQueue.length && triageQuestion) {
    return (
      <ScreenLayout
        status={
          <>
            <p>
              仕分け {triageIndex + 1}/{triageQueue.length}
            </p>
            {/* 進行中の脱出導線（復習モードと同様） */}
            <button type="button" className="drill-abort" onClick={() => navigate('home')}>
              中断
            </button>
          </>
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
            <button type="button" className="vocab-grade-button" onClick={() => void handleKnown()}>
              知ってる
            </button>
          </>
        }
      >
        <SwipeCard onSwipeRight={() => void handleKnown()} onSwipeLeft={() => void handleUnknown()}>
          <div className="vocab-card">
            {triageQuestion.freqRank && (
              <span
                className="vocab-card__rank"
                data-rank={triageQuestion.freqRank}
                title={FREQ_RANK_TITLE}
              >
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
      {completionStats && (
        <CompletionCard
          countLabel={`今日の実施数 ${completionStats.count}問`}
          streakDays={completionStats.streakDays}
          message="この調子で続けましょう"
        />
      )}
    </ScreenLayout>
  )
}
