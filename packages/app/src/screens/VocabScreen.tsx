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
import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  AUTO_PLAY_ENABLED_KEY,
  HAPTICS_ENABLED_KEY,
  MISTAP_UNDO_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
} from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { CompletionCard } from '../components/CompletionCard'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { HighlightedPhrase } from '../components/HighlightedPhrase'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { usePendingCommit } from '../hooks/usePendingCommit'
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

/**
 * 復習の区切り単位（T-171・J-96）。仕分け側（TRIAGE_BATCH_SIZE）と**同じ値にするのが意図**で、
 * 「仕分けは20語で区切るのに復習は区切らない」という非対称を解消するためのもの。
 * キュー自体は期限到来分の全件を保持し続ける（上限は設けない＝SRSの「期限が来たものは
 * 全部やる」思想を維持する。19の6節）
 */
const REVIEW_BATCH_SIZE = 20

/** 猶予中の未確定な仕分け（T-161）。確定に必要な値をタップ時点で確定させて保持する */
interface TriagePendingCommit {
  word: string
  /** true=知ってる（卒業済みカード化）／false=知らない（SRS学習カード化） */
  known: boolean
}

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
  /**
   * 自動再生の設定値そのもの（T-166・J-93）。**派生値と分けて持つ**——
   * イヤホンなしモードのトグルで自動再生の可否を計算し直すとき、元設定が分からないと
   * 「設定でOFFにしたのにトグル操作でONに戻る」（レビュー指摘）が起きる
   */
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  // T-166（docs/27 のS-16）: イヤホンなしモードを画面内で切り替えられるようにする。
  // 従来は設定画面へ移動しないと切り替えられず、公共の場でカードごとに音が鳴る状態から
  // その場で逃げられなかった。新キーは作らず既存の NO_EARPHONE_MODE_KEY を読み書きする
  const [noEarphoneMode, setNoEarphoneMode] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [triageIndex, setTriageIndex] = useState(0)
  // T-119: 20語仕分けるごとに立てる中断フラグ（「続けて仕分ける」タップでfalseに戻す）
  const [triagePaused, setTriagePaused] = useState(false)
  // T-171: 20件復習するごとに立てる中断フラグ（仕分け側と対称。「続ける」タップでfalseに戻す）
  const [reviewPaused, setReviewPaused] = useState(false)
  /**
   * T-172（J-98）: 同一セッション内に再投入したカードの位置。
   * 「もう一回」を選んだカードをキュー末尾へ1周だけ戻す（DB上の dueAt=翌日0時は変えない）。
   * 再投入位置を持つのは (a) 表示に「もう一度」の注記を出す (b) 再投入されたカードで
   * 再度「もう一回」を選んでも二重に戻さない、の2つの判定に使うため
   */
  const [retryIndices, setRetryIndices] = useState<Set<number>>(new Set())
  // 復習モード専用: 選んだ4択のkey（未選択はnull。選択後に自己評価3段階を出す）
  const [selectedChoiceKey, setSelectedChoiceKey] = useState<string | null>(null)
  // T-159: 記録処理中フラグ。refは連打の同期的な遮断用、stateはボタンの無効化用
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  // T-159: 記録の保存失敗の表示（DrillScreenのsaveErrorと同じ様式）
  const [saveError, setSaveError] = useState<string | null>(null)
  // T-161: 誤タップの取り消し猶予の有効/無効（既定ON。ADR 0009 + 2026-07-31 Amendment）
  const [mistapUndoEnabled, setMistapUndoEnabled] = useState(true)
  // T-162（docs/27 のS-7）: 中断の確認。復習・仕分けの両フェーズで共用する
  const [abortConfirm, setAbortConfirm] = useState(false)
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
      const [noEarphoneSetting, hapticsSetting, mistapUndoSetting, autoPlaySetting] =
        await Promise.all([
          db.settings.get(NO_EARPHONE_MODE_KEY),
          db.settings.get(HAPTICS_ENABLED_KEY),
          db.settings.get(MISTAP_UNDO_ENABLED_KEY),
          db.settings.get(AUTO_PLAY_ENABLED_KEY),
        ])
      if (!cancelled) {
        setReviewQueue(reviewCards)
        setTriageQueue(candidates)
        // T-166（J-93）: イヤホンなしモードに加えて、自動再生のopt-out設定でも止める
        setNoEarphoneMode(noEarphoneSetting?.value === true)
        setAutoPlayEnabled(autoPlaySetting?.value !== false)
        setHapticsEnabled(hapticsSetting?.value !== false)
        setMistapUndoEnabled(mistapUndoSetting?.value !== false)
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

  /**
   * 仕分けの猶予付き確定（T-161）。復習の評価とは別インスタンスで持つ
   * （仕分けフェーズと復習フェーズは同時に表示されないため競合しない）。
   * **早期returnより前に置くこと**——後ろに置くとレンダーごとにフック数が変わる
   */
  const {
    pending: triagePending,
    schedule: scheduleTriageCommit,
    cancel: cancelTriageCommit,
    clearTimer: clearTriageTimer,
    clearPending: clearTriagePending,
  } = usePendingCommit<TriagePendingCommit>((payload) => commitTriage(payload))

  function playPhrase(phraseAudio: string, context: string) {
    void audioPlayer
      .unlock()
      .then(() => audioPlayer.play(phraseAudio))
      .catch((err: unknown) => {
        // 自動再生は失敗しても学習継続可能（4択・スワイプ操作は既に表示されている）なので通知はしない
        console.warn(`[VocabScreen] ${context}に失敗`, err)
      })
  }

  /**
   * イヤホンなしモードの画面内トグル（T-166。docs/27 のS-16）。
   * 設定画面と同じキーに書くので、切り替えは設定画面にもそのまま反映される
   */
  async function handleToggleNoEarphone() {
    const next = !noEarphoneMode
    setNoEarphoneMode(next)
    if (next) audioPlayer.stop() // 鳴っている音を即座に止める（公共の場での事故を止める用途）
    try {
      await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: next })
    } catch (err) {
      // 画面内トグルの永続化失敗で未処理rejectionにしない（表示は既に切り替わっている）
      console.warn('[VocabScreen] イヤホンなしモードの保存に失敗', err)
    }
  }

  /** 再生中のフレーズ音声を止める（T-166。docs/27 のS-16） */
  function handleStopPhrase() {
    audioPlayer.stop()
  }

  /**
   * 実際に自動再生してよいか（T-166。レビュー指摘の修正）。
   * 設定（autoPlayEnabled）とイヤホンなしモードの**両方**を満たす場合のみ鳴らす。
   * 派生値にしておけば、どちらを切り替えても他方の意思が消えない
   */
  const autoPlay = autoPlayEnabled && !noEarphoneMode

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
    void Promise.all([countAttemptsToday(db), getStreak(db)])
      .then(([count, streak]) => {
        if (!cancelled) setCompletionStats({ count, streakDays: streak.currentDays })
      })
      // 完了カードの数値取得は失敗しても学習動線に影響しないので握る。
      // catchが無いと、画面離脱・DBクローズ直後に解決したときに未処理rejectionになる
      // （T-161で仕分けの書き込みが400ms遅れるようになり、完了画面のマウントが
      // テストのteardown直後にずれてCIが落ちた。挙動ではなく未処理例外が原因）
      .catch((err: unknown) => {
        console.warn('[VocabScreen] 完了カードの数値取得に失敗', err)
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

  /**
   * 記録を伴う操作の共通ラッパ（T-159。docs/27 のS-3・S-28）。
   *
   * 連打防止: 従来はどのハンドラも多重発火を防いでおらず、反応が遅い端末で連打すると
   * `setReviewIndex` が2回走って**未評価のカードが1枚無言でスキップ**された
   * （SRS間隔も更新されないまま残る）。refで見るのは、同一バッチ内の2クリックに対して
   * stateの更新が間に合わないため。
   *
   * 保存失敗の表示: 従来はtry/catchが無く、ストレージ枯渇時に「押しても何も起きない」
   * 画面になり原因も次の行動も分からなかった（DrillScreenにはsaveErrorバナーがある）。
   * 失敗時はインデックスを進めない（進めると解答が記録されないまま次へ流れる）
   */
  async function runRecording(action: () => Promise<void>) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await action()
      setSaveError(null)
    } catch (err) {
      console.error('[VocabScreen] 記録に失敗', err)
      setSaveError('記録を保存できませんでした。通信状態と空き容量を確認してください')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  async function handleGrade(grade: SrsGrade) {
    if (!reviewCard) return
    await runRecording(() => gradeCard(grade))
  }

  async function gradeCard(grade: SrsGrade) {
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
    advanceReview(grade)
    setSelectedChoiceKey(null)
    setDontKnow(false)
    setStartedAt(now())
  }

  /**
   * 復習1件の消化後の進行（T-171・T-172）。
   *
   * T-172（J-98）: 「もう一回」を選んだカードは同一セッション内のキュー末尾へ再投入する。
   * 従来は最短でも翌日（`applyGrade` の again = stage0 → 翌日0時）まで再確認できず、
   * その場で数分後に確かめる導線が無かった。**DB上の dueAt は変えない**（間隔テーブルと
   * applyGrade には触らない＝28の1.3節の不変条件）。再投入は1周のみで、再投入された
   * カードで再度「もう一回」を選んでも戻さない（無限ループを避ける）。
   *
   * T-171（J-96）: 20件ごとに中間画面を挟む。キューの件数自体は変えない
   */
  function advanceReview(grade: SrsGrade) {
    const current = reviewIndex
    const isRetryCard = retryIndices.has(current)
    const shouldRequeue = grade === 'again' && !isRetryCard && reviewCard !== undefined
    if (shouldRequeue) {
      setReviewQueue((queue) => {
        if (!queue) return queue
        setRetryIndices((prev) => new Set(prev).add(queue.length))
        return [...queue, reviewCard]
      })
    }
    const next = current + 1
    setReviewIndex(next)
    // 再投入した分は「残り」に含まれるので、区切り判定は再投入後の総数で見る
    const total = (reviewQueue?.length ?? 0) + (shouldRequeue ? 1 : 0)
    if (next < total && next % REVIEW_BATCH_SIZE === 0) {
      setReviewPaused(true)
    }
  }

  /** 仕分け1件の消化後、20語区切りに達していたら中断フラグを立てる（T-119） */
  function advanceTriage() {
    const next = triageIndex + 1
    setTriageIndex(next)
    if (triageQueue && next < triageQueue.length && next % TRIAGE_BATCH_SIZE === 0) {
      setTriagePaused(true)
    }
  }

  /**
   * 中断の確認ダイアログ（T-162）。復習・仕分けの両フェーズで同じものを出す。
   * 進捗はカードごとにSRSへ反映済みなので「失われない」ことを明示する
   */
  const abortDialog = abortConfirm ? (
    <ConfirmDialog
      message="語彙学習を中断してホームへ戻りますか？（ここまでの記録は保存されます）"
      onDismiss={() => setAbortConfirm(false)}
      actions={[
        {
          label: '中断してホームへ',
          primary: true,
          onSelect: () => {
            setAbortConfirm(false)
            navigate('home')
          },
        },
        { label: '学習を続ける', onSelect: () => setAbortConfirm(false) },
      ]}
    />
  ) : null

  /**
   * 仕分け1件を永続化する（T-161で猶予の対象になった実処理）。
   * J-58: 「知ってる」は卒業済みSRSカードとして永続化する。次回入店時にまた仕分けキューへ
   * 出ないようにするためで、既知語が後で誤答されればaddSrsCardの既存仕様で自動的にSRS学習へ
   * 編入される（意図した相互作用）
   */
  async function writeTriage(payload: TriagePendingCommit) {
    if (payload.known) await markVocabKnown(db, payload.word)
    else await addSrsCard(db, { refType: 'vocab', refId: payload.word })
  }

  /**
   * 仕分けの確定（T-161）。猶予タイマーとアンマウント時のflushの両方から呼ばれる。
   * 書き込みが成功してから次のカードへ進める（失敗時に進めると記録なしで流れてしまう）
   */
  async function commitTriage(payload: TriagePendingCommit) {
    clearTriageTimer()
    clearTriagePending()
    await runRecording(async () => {
      await writeTriage(payload)
      advanceTriage()
    })
  }

  /**
   * 仕分けの確定を予約する（T-161。docs/27 のS-4）。
   *
   * 「知ってる」は `markVocabKnown` で卒業済みカードを作り、その語を仕分け候補からも
   * 復習キューからも恒久的に外す。**ドリルの選択肢タップより不可逆**なのに、従来は
   * スワイプ1回で即確定し取り消せなかった。
   *
   * 猶予中はカードを保持する（楽観的に次のカードへ進めない）。進めてしまうと、
   * 猶予内に次をスワイプしたときに前の予約が破棄されて1件書き込まれないまま消えるうえ、
   * 取り消し時のインデックス巻き戻しが20語区切りの中間画面と干渉する。
   * 解答経路（ADR 0009）・語彙カード評価（T-160）と挙動も揃う
   */
  async function handleTriage(known: boolean) {
    const word = triageQuestion?.front
    if (!word) return
    // 予約済みなら二重に受け付けない（スワイプとボタンの同時発火・連打の防止）
    if (busyRef.current || triagePending !== null) return
    const payload: TriagePendingCommit = { word, known }
    if (mistapUndoEnabled) {
      scheduleTriageCommit(payload)
      return
    }
    await commitTriage(payload)
  }

  /**
   * 仕分けの取り消し（T-161）。まだ何も書いていないので予約を捨てるだけでよく、
   * カードは表示されたまま残るので選び直せる（解答経路と違い、正解を見せていないため
   * 同じカードへの再操作を許して問題ない）
   */
  function handleTriageUndo() {
    cancelTriageCommit()
  }

  async function handleKnown() {
    await handleTriage(true)
  }

  async function handleUnknown() {
    await handleTriage(false)
  }

  // T-171(J-96): 20件区切りの中間画面。仕分け側（T-119）と対称にし、「終わりが見えない」
  // 圧だけを外す。キューの件数自体は変えない（期限到来分は全部やる思想を維持する）
  if (reviewPaused && reviewIndex < reviewQueue.length) {
    return (
      <ScreenLayout
        action={
          <>
            <PrimaryButton onClick={() => setReviewPaused(false)}>
              続ける（残り{reviewQueue.length - reviewIndex}件）
            </PrimaryButton>
            {triageQueue.length > 0 && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => {
                  setReviewPaused(false)
                  setReviewIndex(reviewQueue.length)
                }}
              >
                仕分けへ
              </button>
            )}
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              ホームへ
            </button>
          </>
        }
      >
        <p>復習を{REVIEW_BATCH_SIZE}件終えました</p>
      </ScreenLayout>
    )
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
              {/* T-172(J-98): 同一セッション内に戻ってきたカードであることを示す
                  （同じ語が2回出る理由が分からないと不信になる） */}
              {retryIndices.has(reviewIndex) && <span className="vocab-retry-note"> もう一度</span>}
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
            {/* 進行中の脱出導線（DrillScreenの中断ボタンと同じパターン。進捗はSRS上更新済みのため失われない）。
                T-162: 誤タップ対策で確認を挟む */}
            {abortDialog}
            <button type="button" className="drill-abort" onClick={() => setAbortConfirm(true)}>
              中断
            </button>
          </>
        }
        action={
          <>
            {/* T-159: 記録の保存失敗を明示する（従来は押しても何も起きない画面になっていた） */}
            {saveError && (
              <p className="drill-error" role="alert">
                {saveError}
              </p>
            )}
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
                disabled={busy}
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
                  disabled={busy}
                  onClick={() => void handleGrade('again')}
                >
                  もう一回
                </button>
                <button
                  type="button"
                  className="vocab-grade-button"
                  title="通常の間隔で復習します"
                  disabled={busy}
                  onClick={() => void handleGrade('good')}
                >
                  OK
                </button>
                <button
                  type="button"
                  className="vocab-grade-button"
                  title="間隔を大きく広げて復習します"
                  disabled={busy}
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
        // docs/26 A-1: 仕分けは操作ゾーンの中身が固定（知らない/知ってるの2つ）で、カードを
        // 上寄せにすると帯の下半分が空く。復習モード（選択肢＋正誤フィードバック）には付けない
        align="center"
        status={
          <>
            <p>
              仕分け {triageIndex + 1}/{triageQueue.length}
            </p>
            {/* 進行中の脱出導線（復習モードと同様。T-162で確認を挟む） */}
            {abortDialog}
            <button type="button" className="drill-abort" onClick={() => setAbortConfirm(true)}>
              中断
            </button>
          </>
        }
        action={
          <>
            {/* T-159: 仕分けの記録失敗も明示する（スワイプが無反応になる状態を避ける） */}
            {saveError && (
              <p className="drill-error" role="alert">
                {saveError}
              </p>
            )}
            {/* T-161: 猶予中は仕分けボタンを引っ込めて「取り消し」だけを出す。
                「知ってる」は語を恒久的に候補から外すため、ドリルの選択肢タップより不可逆である */}
            {/* T-166（docs/27 のS-16）: 仕分けはカード表示のたびに自動再生するため、
                この場で止める手段とイヤホンなしモードの切り替えを置く（従来は設定画面へ
                移動しないと切り替えられず、公共の場で音が鳴り続ける状態から逃げられなかった） */}
            <div className="vocab-audio-controls">
              {!noEarphoneMode && (
                <button type="button" className="secondary-action" onClick={handleStopPhrase}>
                  音声を止める
                </button>
              )}
              <label className="vocab-earphone-toggle">
                <input
                  type="checkbox"
                  checked={noEarphoneMode}
                  onChange={() => void handleToggleNoEarphone()}
                />
                イヤホンなしモード（音声を鳴らさない）
              </label>
            </div>
            {triagePending !== null ? (
              <button type="button" className="drill-undo" onClick={handleTriageUndo}>
                取り消し（{triagePending.known ? '知ってる' : '知らない'}）
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="vocab-grade-button"
                  disabled={busy}
                  onClick={() => void handleUnknown()}
                >
                  知らない
                </button>
                <button
                  type="button"
                  className="vocab-grade-button"
                  disabled={busy}
                  onClick={() => void handleKnown()}
                >
                  知ってる
                </button>
              </>
            )}
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
