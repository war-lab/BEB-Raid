// S2 ドリル実行画面（共通。docs/07 7節S2・02の2.2・03の3.2・02の3.1・03の8節L2）。
// text_blank 等の共通フロー（音声なし）に加え、audio_qa（Part2瞬発。T-17）の
// 開始タップ（unlock兼用）→音声再生→3択表示→15秒タイマー のフローを持つ。
// vocab_card（T-21。クイックパックにkind:'srsVocab'が混在する場合の受け皿）は
// VocabScreen（S3）と同じ自己評価3段階フローをこの中で再現する（3.4節: 出題理由に
// 応じてUIが変わる。セッション進行の一本化のためDrillScreen側に統合する）。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { PhaseSeason } from '../db/schema'
import { computeSetResult } from '../engine/audioSet'
import { buildWordBank, judgeDictation } from '../engine/dictation'
import { formatQuickPackReason } from '../engine/reason'
import { shuffle } from '../engine/shuffle'
import { reviewSrsCard } from '../engine/srs'
import type { DictationAnswer, QuestionLookup, SrsGrade } from '../engine/types'
import { buildVocabQuizChoices } from '../engine/vocabQuiz'
import type { AiClient, AudioPlayer, RaidApi } from '../platform'
import { recordAnswerPipeline } from '../services/answerPipeline'
import { getOrInitPhaseState } from '../services/phase'
import { advanceSession, resumeSession } from '../services/session'
import { HAPTICS_ENABLED_KEY, NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
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
  /** BYOK AIクライアント（M2・T-56。未注入ならExplanationCardの「AIに聞く」は出ない） */
  aiClient?: AiClient
  /** 共有API（レイド）クライアント（M3・T-101。未注入ならExplanationCardの報告ボタンは出ない） */
  raidApi?: RaidApi
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

/**
 * 先読みトレーナー（M2・T-50。正本: docs/13 3.6節 J-24）の先読み秒数。
 * P2=15秒/P3=10秒。P1はL3未解禁のため通常出現しないが、単独起動時のフォールバックとして15秒
 */
const PRE_READING_SECONDS: Record<PhaseSeason, number> = { P1: 15, P2: 15, P3: 10 }

/**
 * DrillScreen が描画分岐を持つ format の一覧（進行不能防止の防御）。
 * ここに無い format（shadowing 等。専用画面の担当）の item が混入すると
 * 問題文もボタンも描画されず画面が空白のまま固まるため、questionId 未解決と
 * 同じ経路でスキップする（将来パックに未知 format が入っても詰まらないための防御）
 */
const RENDERABLE_FORMATS = new Set<string>([
  'text_blank',
  'text_passage',
  'audio_qa',
  'vocab_card',
  'dictation',
  'audio_set',
])

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
// （イベントハンドラ内の呼び出しも静的解析では判別されない）、別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

/** T-78（J-42の対象外＝ハプティクスは演出でなく操作フィードバック）: 正解確定時の軽い振動 */
function triggerCorrectHaptics(hapticsEnabled: boolean, isCorrect: boolean) {
  if (!hapticsEnabled || !isCorrect) return
  navigator.vibrate?.(15)
}

/**
 * audio_set: サブ設問のtagStats集計用に、subQuestion.id→（親のtags等を持つ疑似Question）を
 * 補った解決表を作る（SubQuestion型はtags/keyVocabを持たないため。3.6節）
 */
function withSubQuestionLookup(parent: Question, base: QuestionLookup): QuestionLookup {
  const map = new Map(base)
  for (const sq of parent.subQuestions ?? []) {
    map.set(sq.id, { ...parent, id: sq.id })
  }
  return map
}

/** dictation: script を空白区切りでトークン化し、穴の位置を埋めた語 or `___` に差し替えて表示する */
function renderBlankedScript(
  script: string,
  blanks: readonly { index: number }[],
  blankFillsByIndex: ReadonlyMap<number, number>,
  bankWords: readonly string[],
): string {
  const tokens = script.split(/\s+/)
  for (const b of blanks) {
    const bankIdx = blankFillsByIndex.get(b.index)
    tokens[b.index] = bankIdx !== undefined ? bankWords[bankIdx]! : '___'
  }
  return tokens.join(' ')
}

export function DrillScreen({ db, audioPlayer, aiClient, raidApi }: Props) {
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
  // 'idle'=開始タップ待ち / 'prereading'=先読み中(audio_set専用。M2・T-50) /
  // 'playing'=再生中 / 'played'=再生済み(解答受付可)
  const [playState, setPlayState] = useState<'idle' | 'prereading' | 'playing' | 'played'>('idle')
  const [remainingSec, setRemainingSec] = useState<number | null>(null)
  // T-110: セッション内で一度ユーザージェスチャー起点の再生に成功したら、以降の問題は
  // 自動再生する（毎問「タップして開始」を要求しない）。DrillScreenの再マウント＝新規セッション
  // でリセットされればよいためrefでよい（stateにすると再生成功のたびに無駄な再レンダーが増える）
  const hasPlayedOnceRef = useRef(false)
  // audio_set 専用（M2・T-50）: 先読みフェーズの残り秒数
  const [preReadingSecondsLeft, setPreReadingSecondsLeft] = useState<number | null>(null)
  // 先読み秒数の決定に使う現フェーズ（省略時=取得前はP2扱いの15秒でフォールバック）
  const [season, setSeason] = useState<PhaseSeason | null>(null)
  // セッション内の連続正解数（02の3.1: 中毒性を作る看板モード）
  const [streak, setStreak] = useState(0)
  // vocab_card 専用: 選んだ4択のkey（未選択はnull。選択後に自己評価3段階を出す。VocabScreenと同じ設計）
  const [selectedChoiceKey, setSelectedChoiceKey] = useState<string | null>(null)
  // vocab_card 専用: フレーズ音声自動再生の可否（イヤホンなしモードならOFF。VocabScreenと同じ規約）。
  // settingsLoadedがtrueになるまでは自動再生エフェクトを走らせない（非同期読み込み完了前の
  // 初期値falseで誤って再生してしまうレースを防ぐ）
  const [noEarphoneMode, setNoEarphoneMode] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  // dictation 専用（M2・T-47）: blank.index → ワードバンクの語インデックス
  const [blankFillsByIndex, setBlankFillsByIndex] = useState<Map<number, number>>(new Map())
  const [dictationRate, setDictationRate] = useState<0.85 | 1>(1)
  // audio_set 専用（M2・T-49）: セット内で今どの設問か・各設問の正誤（セット正解判定に使う）
  const [subQuestionIndex, setSubQuestionIndex] = useState(0)
  const [subQuestionResults, setSubQuestionResults] = useState<boolean[]>([])
  // T-70: 音声再生失敗時のリカバリ用エラーメッセージ（14の1.4）
  const [audioError, setAudioError] = useState<string | null>(null)
  // T-71/T-76: 解答保存（recordAnswerPipeline）失敗時のリカバリ用エラーメッセージ（J-35）
  const [saveError, setSaveError] = useState<string | null>(null)
  // セッション進行（advanceSessionによるスキップ）失敗時のエラー。null以外なら
  // 通常描画をやめてエラー画面＋ホーム導線を出す（永久 return null による白画面を防ぐ）
  const [sessionError, setSessionError] = useState<string | null>(null)
  // T-78: ハプティクス設定（既定ON）。正解確定時のnavigator.vibrateに使う
  const [hapticsEnabled, setHapticsEnabled] = useState(true)
  // T-108: 表示不能スキップの非モーダル通知（数秒で自動的に消える）
  const [skipNotice, setSkipNotice] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      db.settings.get(NO_EARPHONE_MODE_KEY),
      db.settings.get(HAPTICS_ENABLED_KEY),
    ]).then(([earphoneSetting, hapticsSetting]) => {
      if (cancelled) return
      setNoEarphoneMode(earphoneSetting?.value === true)
      setHapticsEnabled(hapticsSetting?.value !== false)
      setSettingsLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  // 先読み秒数の決定に使うフェーズを1回だけ取得する（M2・T-50）。
  // 失敗しても（DB切断等）先読み秒数が既定値にフォールバックするだけで画面は壊れない
  useEffect(() => {
    let cancelled = false
    void getOrInitPhaseState(db)
      .then((state) => {
        if (!cancelled) setSeason(state.season)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [db])

  const item = snapshot?.items[displayIndex]
  const question = item ? questions.get(item.questionId) : undefined
  const isAudioQa = question?.format === 'audio_qa'
  const isDictation = question?.format === 'dictation'
  const isAudioSet = question?.format === 'audio_set'
  // dictation・audio_set も audio_qa と同じ「音声を再生」ゲートを使う（音声前提のformat）。
  // 15秒タイマー（isCountingDown）はaudio_qa固有のため対象外
  const needsAudioGate = isAudioQa || isDictation || isAudioSet
  const isVocabCard = question?.format === 'vocab_card'
  const currentSubQuestion = isAudioSet
    ? (question?.subQuestions ?? [])[subQuestionIndex]
    : undefined
  const subQuestionLookup = useMemo(
    () => (isAudioSet && question ? withSubQuestionLookup(question, questions) : questions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAudioSet, question?.id],
  )

  // 4択はカードが変わるたびに1回だけ組み立てる（VocabScreenと同じ設計。questionsは
  // セッション対象に限らずロード済み全パックを持つため、十分な数のダミー候補が引ける）
  const quizChoices = useMemo(
    () => (isVocabCard && question ? buildVocabQuizChoices(question, [...questions.values()]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- questionsはセッション開始時に固定される想定
    [isVocabCard, question?.id],
  )

  // T-79（J-36）: 選択肢は問題が変わるたびに1回だけシャッフルする（丸暗記防止。
  // 正誤判定はchoice.key参照のため順序に依存しない。vocab_cardはbuildVocabQuizChoices側で
  // 既にシャッフル済みのため対象外）
  const shuffledChoices = useMemo(
    () => (question?.choices ? shuffle(question.choices) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id],
  )
  const shuffledSubQuestionChoices = useMemo(
    () => (currentSubQuestion?.choices ? shuffle(currentSubQuestion.choices) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id, subQuestionIndex],
  )

  // dictation: ワードバンク（3.4節の6語構成）はカードが変わるたびに1回だけ組み立てる
  const dictationBank = useMemo(
    () =>
      isDictation && question ? buildWordBank(question, [...questions.values()]) : { words: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDictation, question?.id],
  )
  const sortedBlanks = useMemo(
    () => [...(question?.blanks ?? [])].sort((a, b) => a.index - b.index),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDictation, question?.id],
  )
  const usedBankIndices = new Set(blankFillsByIndex.values())
  const allBlanksFilled =
    sortedBlanks.length > 0 && sortedBlanks.every((b) => blankFillsByIndex.has(b.index))

  // vocab_card: フレーズ音声を自動再生する（カードが変わるたびに1回。金フレ型体験=02の4節の
  // 「聞き流し周回」。DrillScreenは元々これを欠いておりVocabScreenとの機能差だった）
  useEffect(() => {
    if (!settingsLoaded || !isVocabCard || noEarphoneMode || !question?.phraseAudio) return
    void audioPlayer
      .unlock()
      .then(() => audioPlayer.play(question.phraseAudio!))
      .catch((err: unknown) => {
        // 自動再生は失敗しても学習継続可能（4択は既に表示されている）なので通知はしない
        console.warn('[DrillScreen] フレーズ音声の自動再生に失敗', err)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, isVocabCard, noEarphoneMode, question?.phraseAudio])
  // T-110: セッション内で一度ユーザージェスチャー起点の再生に成功したら（hasPlayedOnceRef）、
  // 以降の音声ゲート付き問題（audio_qa/dictation/audio_set）は自動再生する。
  // handlePlayStart は関数宣言（hoisted）のため、この時点で呼び出して問題ない。
  // 自動再生が拒否された場合はhandlePlayStart内のcatchが従来のタップ開始UIへ戻す
  useEffect(() => {
    if (!needsAudioGate || playState !== 'idle' || !hasPlayedOnceRef.current) return
    // eslint-disable-next-line react-hooks/immutability
    void handlePlayStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id])
  // 再生済み・未解答の間だけタイマーを走らせる（開始値の設定は handlePlayStart 側で行う。
  // ここでは「今ティックすべきか」だけを見る真偽値にし、setInterval の再生成を毎秒起こさない）。
  // 15秒タイマーは audio_qa 固有（dictation は未タイマー=03の8節）
  const isCountingDown = isAudioQa && playState === 'played' && !result

  // audio_qa: 15秒タイマーの秒針を進める（開始のsetStateはイベントハンドラ側=handlePlayStartで行う）
  useEffect(() => {
    if (!isCountingDown) return
    const interval = setInterval(() => {
      setRemainingSec((s) => (s === null ? null : Math.max(s - 1, 0)))
    }, 1000)
    return () => clearInterval(interval)
  }, [isCountingDown])

  // audio_set: 先読みフェーズの秒針を進める（M2・T-50）
  useEffect(() => {
    if (playState !== 'prereading') return
    const interval = setInterval(() => {
      setPreReadingSecondsLeft((s) => (s === null ? null : Math.max(s - 1, 0)))
    }, 1000)
    return () => clearInterval(interval)
  }, [playState])

  // 先読みが0になったら自動的に再生フェーズへ移る（早期開始タップでも同じ関数を呼ぶ）
  useEffect(() => {
    if (playState === 'prereading' && preReadingSecondsLeft === 0) {
      // startAudioSetPlayback は関数宣言（hoisted）のため、この時点で呼び出して問題ない
      // eslint-disable-next-line react-hooks/immutability
      void startAudioSetPlayback()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preReadingSecondsLeft])

  // タイマーが0に達したら自動的にタイムアウト（誤答）として確定する
  useEffect(() => {
    if (remainingSec === 0 && !result) {
      // finalizeAnswer は関数宣言（hoisted）のため、この時点で呼び出して問題ない
      // eslint-disable-next-line react-hooks/immutability
      void finalizeAnswer(null, false, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec])

  // item はあるが questionId が解決できない場合（未読込パック・データ不整合等で
  // 発生しうる。発見バグ: 以前はここで navigate('result') も advanceToNext も
  // 呼ばれず永久に null を返し続け、画面が固まっていた）と、描画分岐が存在しない
  // format の場合（shadowing 混入等。同様に空白で固まる）は、記録せずスキップして次へ進める
  useEffect(() => {
    if (!snapshot || !item || (question && RENDERABLE_FORMATS.has(question.format))) return
    let cancelled = false
    console.warn(
      question
        ? `[DrillScreen] 描画分岐の無いformatのためスキップ: ${item.questionId} (${question.format})`
        : `[DrillScreen] questionIdが解決できないためスキップ: ${item.questionId}`,
    )
    useSessionStore.getState().incrementSkipped()
    void advanceSession(db, snapshot)
      .then((nextSnapshot) => {
        if (cancelled) return
        useSessionStore.setState({ snapshot: nextSnapshot })
        setSkipNotice(true)
        if (displayIndex + 1 >= snapshot.items.length) {
          navigate('result')
        } else {
          setDisplayIndex((i) => i + 1)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // スキップ失敗を握りつぶすと「中断ボタンすら無い白画面」で固まる
        // （effect依存が変わらず再試行もされない）ため、エラー画面へ切り替える
        console.warn('[DrillScreen] セッションを進められませんでした', err)
        setSessionError('セッションを進められませんでした')
      })
    return () => {
      cancelled = true
    }
  }, [item, question, snapshot, displayIndex, db, navigate])

  // T-108: スキップ通知は数秒で自動的に消える（非モーダル。累計件数はResultScreen側で表示する）
  useEffect(() => {
    if (!skipNotice) return
    const timeout = setTimeout(() => setSkipNotice(false), 4000)
    return () => clearTimeout(timeout)
  }, [skipNotice])

  // セッション進行が失敗した場合は通常描画をやめ、脱出導線（ホームへ戻る）を必ず出す
  if (sessionError) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
      >
        <p className="drill-error" role="alert">
          {sessionError}
        </p>
      </ScreenLayout>
    )
  }

  if (!snapshot || !item || !question || !RENDERABLE_FORMATS.has(question.format)) {
    if (snapshot && !item) navigate('result')
    return null
  }

  const total = snapshot.items.length
  const current = displayIndex + 1

  /**
   * 解答保存（recordAnswerPipeline）失敗時の共通リカバリ（J-35・T-76）。
   * エラーバナー表示＋正誤表示の取り消し（再解答可能にする）に加え、snapshotベースの
   * 経路ではDBの実際の状態をresumeSessionで読み直してstateを再同期する
   * （途中まで書き込みが成立していた場合、answeredCountのずれを解消するため）
   */
  async function recoverFromSaveError(err: unknown, options?: { resyncSnapshot?: boolean }) {
    console.error('[DrillScreen] 解答の保存に失敗', err)
    setSaveError('解答を保存できませんでした。通信状態と空き容量を確認してください')
    setResult(null)
    if (options?.resyncSnapshot ?? true) {
      const resumed = await resumeSession(db)
      if (resumed) {
        useSessionStore.setState({ snapshot: resumed })
        setDisplayIndex(resumed.answeredCount)
      }
    }
  }

  async function finalizeAnswer(
    selectedKey: string | null,
    isCorrect: boolean,
    isTimeout: boolean,
  ) {
    if (result || !question || !item) return
    const responseMs = now() - startedAt
    setResult({ selectedKey, isCorrect, isTimeout })
    setStreak((s) => (isCorrect ? s + 1 : 0))
    triggerCorrectHaptics(hapticsEnabled, isCorrect)

    try {
      // S2は客観正誤のみのUIのため、SRS自己評価3段階への写像は正解→good/誤答→again に固定する
      // （srsGrade省略時のpipeline既定動作。item.srsCardIdが無ければreviewSrsCard自体を呼ばない）
      const { nextSnapshot, ratingUpdate } = await recordAnswerPipeline(db, {
        snapshot,
        questionId: question.id,
        question,
        lookup: questions,
        isCorrect,
        responseMs,
        isTimeout,
        mode: item.mode,
        srsCardId: item.srsCardId,
      })

      recordAnswer(nextSnapshot!, {
        questionId: question.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
    } catch (err) {
      await recoverFromSaveError(err)
    }
  }

  function handleSelect(choiceKey: string) {
    if (needsAudioGate && playState !== 'played') return
    void finalizeAnswer(choiceKey, choiceKey === question!.answer, false)
  }

  /**
   * audio_set: サブ設問1問の解答を確定する（3.6節）。attemptsは
   * subQuestion.id単位で記録し、tagStats・レート更新は通常どおり（選択式）。
   * SRSレビューはセット完了時に1回だけ行う（finalizeSetCompletion）
   */
  async function finalizeSubQuestionAnswer(choiceKey: string) {
    if (result || !question || !item || !currentSubQuestion) return
    const isCorrect = choiceKey === currentSubQuestion.answer
    const responseMs = now() - startedAt
    setResult({ selectedKey: choiceKey, isCorrect, isTimeout: false })
    setStreak((s) => (isCorrect ? s + 1 : 0))
    triggerCorrectHaptics(hapticsEnabled, isCorrect)

    try {
      // snapshotなしのrecordAttempt経路（サブ設問ごとにitemを進めない。SRSレビューは
      // セット完了時に1回だけ=advanceSubQuestionが行うためskip.srs）
      const { ratingUpdate } = await recordAnswerPipeline(db, {
        questionId: currentSubQuestion.id,
        question,
        lookup: subQuestionLookup,
        isCorrect,
        responseMs,
        mode: item.mode,
        skip: { srs: true },
      })
      setSubQuestionResults((prev) => [...prev, isCorrect])
      recordAnswer(snapshot, {
        questionId: currentSubQuestion.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
    } catch (err) {
      // サブ設問はsnapshotのanswerCurrentQuestionを経由しないため、resumeSessionでの
      // 再同期は対象外（subQuestionIndexはローカルstateのまま据え置き＝同じ設問を再試行できる）
      await recoverFromSaveError(err, { resyncSnapshot: false })
    }
  }

  function handleSelectSubQuestion(choiceKey: string) {
    if (playState !== 'played') return
    void finalizeSubQuestionAnswer(choiceKey)
  }

  /** audio_set: 次の設問へ、または（最終設問なら）セット完了→次のitemへ進める */
  async function advanceSubQuestion() {
    const subQuestions = question?.subQuestions ?? []
    if (subQuestionIndex + 1 < subQuestions.length) {
      setSubQuestionIndex((i) => i + 1)
      setResult(null)
      setStartedAt(now())
      return
    }
    // セット完了: セット正解判定→SRSレビュー（該当すれば1回のみ）→次itemへ
    if (item?.srsCardId) {
      const setResult = computeSetResult(question!.id, subQuestionResults)
      await reviewSrsCard(db, item.srsCardId, setResult.isSetCorrect ? 'good' : 'again')
    }
    const nextSnapshot = await advanceSession(db, snapshot!)
    // 各サブ設問は既に個別にrecordAnswer済みのため、ここではresultsを追加せず
    // snapshot参照だけを進める（recordAnswerを使うとresultsへ重複エントリが増える）
    useSessionStore.setState({ snapshot: nextSnapshot })
    advanceToNext()
  }

  /**
   * audio_set: 先読みフェーズを開始する（M2・T-50。「型の強制」=02の3.5）。
   * unlockはここで済ませ、実際の再生は先読み満了 or 早期開始タップで startAudioSetPlayback が行う
   */
  async function handleStartAudioSet() {
    setAudioError(null)
    try {
      await audioPlayer.unlock()
    } catch (err) {
      console.warn('[DrillScreen] 音声再生に失敗', err)
      setPlayState('idle')
      setAudioError('音声を再生できませんでした')
      return
    }
    const seconds = PRE_READING_SECONDS[season ?? 'P2']
    setPlayState('prereading')
    setPreReadingSecondsLeft(seconds)
  }

  /** audio_set: 先読み満了 or 早期開始タップ→実際の再生フェーズ（一時停止・巻き戻し不可） */
  async function startAudioSetPlayback() {
    setPlayState('playing')
    setPreReadingSecondsLeft(null)
    try {
      if (question!.audio) {
        await audioPlayer.play(question!.audio)
      }
    } catch (err) {
      console.warn('[DrillScreen] 音声再生に失敗', err)
      setPlayState('idle')
      setAudioError('音声を再生できませんでした')
      return
    }
    hasPlayedOnceRef.current = true
    setPlayState('played')
  }

  async function handlePlayStart() {
    if (isAudioSet) {
      await handleStartAudioSet()
      return
    }
    setPlayState('playing')
    setAudioError(null)
    try {
      await audioPlayer.unlock()
      const options: { durationMs?: number; rate?: number } = {}
      if (partialAudioMode) options.durationMs = PARTIAL_AUDIO_DURATION_MS
      if (isDictation && dictationRate !== 1) options.rate = dictationRate
      if (question!.audio) {
        await audioPlayer.play(
          question!.audio,
          Object.keys(options).length > 0 ? options : undefined,
        )
      }
    } catch (err) {
      console.warn('[DrillScreen] 音声再生に失敗', err)
      setPlayState('idle')
      setAudioError('音声を再生できませんでした')
      return
    }
    hasPlayedOnceRef.current = true
    setPlayState('played')
    if (isAudioQa) setRemainingSec(ANSWER_TIMER_SECONDS)
  }

  /** audio_qa: 音声再生に失敗した際、音声なしで解答へ進むフォールバック（タイマーは開始しない） */
  function handlePlayWithoutAudio() {
    setAudioError(null)
    setPlayState('played')
  }

  /**
   * dictation/audio_set: 音声が再生できない問題を解答なしでスキップする。
   * これらのformatは音声なしでは解答が成立しない（audio_qaの「音声なしで解答する」に相当する
   * 手段が無い）ため、音声404等が続くとセッション完了不能になる。attemptは記録せず
   * （スキップであり正誤が存在しないため）、questionId未解決スキップと同じ
   * advanceSession経路で次のitemへ進める
   */
  async function handleSkipUnplayable() {
    if (!snapshot) return
    try {
      const nextSnapshot = await advanceSession(db, snapshot)
      useSessionStore.setState({ snapshot: nextSnapshot })
      advanceToNext()
    } catch (err) {
      console.warn('[DrillScreen] セッションを進められませんでした', err)
      setSessionError('セッションを進められませんでした')
    }
  }

  async function handleReplay() {
    try {
      await audioPlayer.replay()
    } catch (err) {
      console.warn('[DrillScreen] 再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    }
  }

  /** dictation: ワードバンクの語を次の未回答の穴に順にタップで埋める（3.4節） */
  function handleBankWordTap(bankIndex: number) {
    if (usedBankIndices.has(bankIndex)) return
    const nextBlank = sortedBlanks.find((b) => !blankFillsByIndex.has(b.index))
    if (!nextBlank) return
    setBlankFillsByIndex((prev) => new Map(prev).set(nextBlank.index, bankIndex))
  }

  /** dictation: 全穴の記入をやり直す（取り消し可=3.4節） */
  function handleDictationReset() {
    setBlankFillsByIndex(new Map())
  }

  /** dictation: 確定→採点（全穴一致で正解・部分点なし=3.4節）。レート更新は対象外（J-29） */
  async function finalizeDictationAnswer() {
    if (result || !question || !item) return
    const answers: DictationAnswer[] = [...blankFillsByIndex.entries()].map(
      ([blankIndex, bankIdx]) => ({ blankIndex, word: dictationBank.words[bankIdx]! }),
    )
    const judgement = judgeDictation(question.blanks ?? [], answers)
    const responseMs = now() - startedAt
    setResult({ selectedKey: null, isCorrect: judgement.isCorrect, isTimeout: false })
    setStreak((s) => (judgement.isCorrect ? s + 1 : 0))
    triggerCorrectHaptics(hapticsEnabled, judgement.isCorrect)

    try {
      // J-29: ディクテーションはレート更新の対象外（03の5.3の得点式は選択式前提のため）
      const { nextSnapshot } = await recordAnswerPipeline(db, {
        snapshot,
        questionId: question.id,
        question,
        lookup: questions,
        isCorrect: judgement.isCorrect,
        responseMs,
        isTimeout: false,
        mode: item.mode,
        srsCardId: item.srsCardId,
        skip: { rating: true },
      })
      recordAnswer(nextSnapshot!, {
        questionId: question.id,
        isCorrect: judgement.isCorrect,
        basePoints: 0,
      })
    } catch (err) {
      await recoverFromSaveError(err)
    }
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
    setBlankFillsByIndex(new Map())
    setDictationRate(1)
    setSelectedChoiceKey(null)
    setSubQuestionIndex(0)
    setSubQuestionResults([])
    setPreReadingSecondsLeft(null)
    setAudioError(null)
    setSaveError(null)
    setStartedAt(now())
  }

  function handleNext() {
    advanceToNext()
  }

  function handleSelectVocabChoice(key: string) {
    if (selectedChoiceKey !== null) return
    setSelectedChoiceKey(key)
    triggerCorrectHaptics(
      hapticsEnabled,
      quizChoices.find((c) => c.key === key)?.isCorrect ?? false,
    )
  }

  /**
   * vocab_card の自己評価3段階（VocabScreenと同じ挙動）。
   * 正誤確認のポーズを挟まず、評価と同時に即座に次のカードへ進む。
   * isCorrectは自己申告ではなく4択の客観的な正誤（ユーザー指摘による設計変更。VocabScreen参照）
   */
  async function handleVocabGrade(grade: SrsGrade) {
    if (!question || !item) return
    const isCorrect = quizChoices.find((c) => c.key === selectedChoiceKey)?.isCorrect ?? false
    const responseMs = now() - startedAt

    try {
      // vocab_cardは誤答してもkey語彙の復習デッキに落とさない（自己評価が別途あるため=skip.wrongAnswer）。
      // tagStats（tags=[]）・レート（part=0）はpipeline内部でno-opになる
      const { nextSnapshot, ratingUpdate } = await recordAnswerPipeline(db, {
        snapshot,
        questionId: question.id,
        question,
        lookup: questions,
        isCorrect,
        responseMs,
        isTimeout: false,
        mode: item.mode,
        srsCardId: item.srsCardId,
        srsGrade: grade,
        skip: { wrongAnswer: true },
      })
      recordAnswer(nextSnapshot!, {
        questionId: question.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
      advanceToNext()
    } catch (err) {
      // vocab_cardはresultを使わないため、選択済みの4択表示はそのまま残し再試行できるようにする
      await recoverFromSaveError(err)
    }
  }

  const choicesInteractive = !needsAudioGate || playState === 'played'

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={current} total={total} />
          <button type="button" className="drill-abort" onClick={() => navigate('home')}>
            中断
          </button>
          {skipNotice && (
            <p className="drill-skip-notice" role="status" data-testid="drill-skip-notice">
              表示できない問題を1件スキップしました
            </p>
          )}
          {/* T-116(10): レイド挑戦セッション中もヘッダが「今日のドリル」のままでレイド感が
              無い問題への対処。item.mode='raid'なら出題理由の代わりに「レイド」を出す */}
          {item.mode === 'raid' ? (
            <p className="drill-reason" data-testid="drill-raid-header">
              レイド
            </p>
          ) : (
            item.reason && <p className="drill-reason">{formatQuickPackReason(item.reason)}</p>
          )}
          {streak > 0 && (
            <p key={streak} className="session-streak display-num" title="セッション内の連続正解数">
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
          {saveError && (
            <p className="drill-error" role="alert">
              {saveError}
            </p>
          )}
          {audioError && (
            <p className="drill-error" role="alert">
              {audioError}
            </p>
          )}
          {isVocabCard &&
            quizChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (selectedChoiceKey !== null) {
                if (choice.isCorrect) state = 'correct'
                else if (choice.key === selectedChoiceKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={selectedChoiceKey !== null}
                  onClick={() => handleSelectVocabChoice(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {isVocabCard && selectedChoiceKey === null && question.phraseAudio && (
            <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
              もう一度再生
            </button>
          )}
          {isVocabCard && selectedChoiceKey !== null && (
            <>
              <button
                type="button"
                className="vocab-grade-button"
                title="間隔を短くしてすぐに復習します"
                onClick={() => void handleVocabGrade('again')}
              >
                もう一回
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                title="通常の間隔で復習します"
                onClick={() => void handleVocabGrade('good')}
              >
                OK
              </button>
              <button
                type="button"
                className="vocab-grade-button"
                title="間隔を大きく広げて復習します"
                onClick={() => void handleVocabGrade('easy')}
              >
                余裕
              </button>
            </>
          )}
          {isDictation && playState !== 'played' && (
            <div className="dictation-rate-chips">
              <button
                type="button"
                className={dictationRate === 0.85 ? 'is-selected' : ''}
                onClick={() => setDictationRate(0.85)}
              >
                0.85x
              </button>
              <button
                type="button"
                className={dictationRate === 1 ? 'is-selected' : ''}
                onClick={() => setDictationRate(1)}
              >
                等倍
              </button>
            </div>
          )}
          {!isVocabCard && !isAudioSet && needsAudioGate && playState !== 'played' && (
            <>
              <PrimaryButton
                onClick={() => void handlePlayStart()}
                disabled={playState === 'playing'}
              >
                {playState === 'playing' ? '再生中…' : audioError ? 'もう一度試す' : '音声を再生'}
              </PrimaryButton>
              {audioError && isAudioQa && (
                <button type="button" className="secondary-action" onClick={handlePlayWithoutAudio}>
                  音声なしで解答する
                </button>
              )}
              {audioError && isDictation && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void handleSkipUnplayable()}
                >
                  この問題をスキップ
                </button>
              )}
            </>
          )}
          {isAudioSet && playState === 'idle' && (
            <>
              <PrimaryButton onClick={() => void handlePlayStart()}>
                {audioError ? 'もう一度試す' : '音声を再生'}
              </PrimaryButton>
              {audioError && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void handleSkipUnplayable()}
                >
                  この問題をスキップ
                </button>
              )}
            </>
          )}
          {isAudioSet && playState === 'prereading' && (
            <>
              <p className="drill-timer display-num">{preReadingSecondsLeft}</p>
              <button
                type="button"
                className="drill-replay"
                onClick={() => void startAudioSetPlayback()}
              >
                もう再生する
              </button>
            </>
          )}
          {isAudioSet && playState === 'playing' && <p>再生中…</p>}
          {!isVocabCard && needsAudioGate && playState === 'played' && !result && (
            <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
              もう一度再生
            </button>
          )}
          {isDictation && playState === 'played' && !result && (
            <>
              <div className="dictation-word-bank">
                {dictationBank.words.map((word, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={usedBankIndices.has(i)}
                    onClick={() => handleBankWordTap(i)}
                  >
                    {word}
                  </button>
                ))}
              </div>
              <button type="button" className="dictation-reset" onClick={handleDictationReset}>
                やり直す
              </button>
              {allBlanksFilled && (
                <PrimaryButton onClick={() => void finalizeDictationAnswer()}>確定</PrimaryButton>
              )}
            </>
          )}
          {!isVocabCard &&
            !isDictation &&
            !isAudioSet &&
            choicesInteractive &&
            shuffledChoices.map((choice) => {
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
          {isAudioSet &&
            (playState === 'prereading' || playState === 'played') &&
            currentSubQuestion &&
            shuffledSubQuestionChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (result) {
                if (choice.key === currentSubQuestion.answer) state = 'correct'
                else if (choice.key === result.selectedKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  // 先読み中（音声再生前）は「型の強制」のため選択不可（読むだけ。02の3.5）
                  disabled={result !== null || playState === 'prereading'}
                  onClick={() => handleSelectSubQuestion(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {isAudioSet && result && currentSubQuestion && (
            <>
              <ExplanationCard
                question={{
                  ...question,
                  question: currentSubQuestion.question,
                  choices: currentSubQuestion.choices,
                  answer: currentSubQuestion.answer,
                  explanation: currentSubQuestion.explanation,
                  translation: currentSubQuestion.translation,
                }}
                isCorrect={result.isCorrect}
                aiClient={aiClient}
                raidApi={raidApi}
                db={db}
              />
              <PrimaryButton onClick={() => void advanceSubQuestion()}>
                {subQuestionIndex + 1 < (question.subQuestions ?? []).length
                  ? '次の設問へ'
                  : '次へ'}
              </PrimaryButton>
            </>
          )}
          {!isVocabCard && !isAudioSet && result && (
            <>
              {result.isTimeout && <p>時間切れ</p>}
              <ExplanationCard
                question={question}
                isCorrect={result.isCorrect}
                aiClient={aiClient}
                raidApi={raidApi}
                db={db}
              />
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
          <p className="vocab-card__prompt">この単語の意味は？</p>
        </div>
      ) : isDictation ? (
        <p className="question-text dictation-script">
          {result
            ? (question.script ?? '')
            : playState === 'played'
              ? renderBlankedScript(
                  question.script ?? '',
                  sortedBlanks,
                  blankFillsByIndex,
                  dictationBank.words,
                )
              : playState === 'playing'
                ? '再生中…'
                : '音声を聞いて空欄を埋めてください'}
        </p>
      ) : isAudioSet ? (
        <p className="question-text">
          {playState === 'played' || playState === 'prereading'
            ? (currentSubQuestion?.question ?? '')
            : playState === 'playing'
              ? '再生中…'
              : '音声を聞いて解答してください'}
        </p>
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
      {settingsLoaded && <span data-testid="drill-settings-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
