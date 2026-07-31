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
import {
  audioOnlyChoiceOrder,
  responseSegment,
  supportsAudioOnlyPart2,
} from '../engine/audioOnlyPart2'
import { answerSlotsBefore, totalAnswerSlots } from '../engine/answerSlots'
import { computeSetResult } from '../engine/audioSet'
import { buildWordBank, judgeDictation } from '../engine/dictation'
import { formatQuickPackReason } from '../engine/reason'
import { shuffle } from '../engine/shuffle'
import { reviewSrsCard } from '../engine/srs'
import { withSubQuestionLookup } from '../engine/subQuestionLookup'
import type { DictationAnswer, SrsGrade } from '../engine/types'
import { buildVocabQuizChoices } from '../engine/vocabQuiz'
import { usePendingCommit } from '../hooks/usePendingCommit'
import type { AiClient, AudioPlayer, PlaybackOutcome, RaidApi } from '../platform'
import { recordAnswerPipeline, type RaidDamageResult } from '../services/answerPipeline'
import { getOrInitPhaseState } from '../services/phase'
import {
  advanceSession,
  resumeSession,
  StaleSnapshotError,
  type SessionItem,
  type SessionSnapshot,
} from '../services/session'
import {
  HAPTICS_ENABLED_KEY,
  AUTO_PLAY_ENABLED_KEY,
  MISTAP_UNDO_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
} from '../services/settingsKeys'
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

/**
 * パート番号→英字タグ表示（docs/20 3.4節S2「パート名・モード名を英字タグで表示」）。
 * part=0は語彙カード（TOEICのパート番号ではないためVOCAB表記にする）。
 * 表層追加のみで既存の出題理由表示（drill-reason等）の内容・挙動は変更しない。
 */
function partTagLabel(part: number): string {
  return part === 0 ? 'VOCAB' : `PART ${part}`
}

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
  /** M4・T-129: レイドダメージがエンキューされた場合のみ設定（ExplanationCardの
   * 「堅い/弱点」バッジ・実ダメージ表示に使う。recordAnswerPipeline完了後に追記されるため、
   * 解答直後の1レンダーは未設定のまま=バッジ無し表示で、直後に反映される） */
  raidDamage?: RaidDamageResult
}

/** audio_qa の解答受付タイマー（02の3.1: 1問15秒完結） */
const ANSWER_TIMER_SECONDS = 15

/**
 * 音声のみモード（T-154。ADR 0008）の解答受付秒数。**再生終了後**から数える。
 * 再生自体が「設問＋3応答」で約11秒あるため、通常の「表示から15秒」では再生中に
 * 時間切れになってしまう。本試験の応答後の間隔（約5秒）＋片手操作の余裕1秒。
 * 推定値でドッグフード実測での調整前提（PARTIAL_AUDIO_DURATION_MS と同じ扱い）
 */
const AUDIO_ONLY_ANSWER_SECONDS = 6

/**
 * 取り消し猶予の対象format。
 * text_blank: 制限時間が無く片手タップの誤タップが最も多い。
 * audio_qa: 誤タップの主戦場（ただし時間切れ経路は猶予なし。タイマー切れの抜け道になる）。
 * audio_set のサブ設問は subQuestionResults と computeSetResult の巻き戻しが2系統になり
 * 効果より複雑さが勝つため対象外。dictation は「確定」が既に二段確認。
 * vocab_card は T-160 で追加した（4択タップではなく**自己評価タップ**が猶予の対象。
 * 評価3段階＋フレーズ再生＋わからないが縦積みで誤タップの被害が大きく、
 * 従来は評価と同時に即座に次のカードへ進んで戻れなかった=docs/27 のS-5）
 */
const UNDO_TARGET_FORMATS = new Set<string>(['text_blank', 'audio_qa', 'vocab_card'])

/** 猶予中の未確定解答。attemptsへの書き込みに必要な値をタップ時点で確定させて保持する */
interface PendingCommit {
  selectedKey: string | null
  isCorrect: boolean
  isTimeout: boolean
  /**
   * タップ時点で確定させた応答時間。commit時刻で計算すると猶予分（+400ms）が乗り、
   * GUESS_THRESHOLD_MS=2000 の当て勘判定を跨いで結果が変わる
   */
  responseMs: number
  /** 取り消し時に戻すストリーク（表示は即時に進めているため） */
  streakBefore: number
  /** 取り違え防止の検証用（この解答がどのitemに対するものか） */
  itemIndex: number
  /**
   * 解答対象そのもの（question / item / snapshot）もペイロードに持たせる。
   * アンマウント時のflushはクリーンアップ関数から commitAnswer を呼ぶが、その関数は
   * **effectを登録したレンダー（=初回）のクロージャ**なので、クロージャ側の
   * question / item / snapshot は「1問目」のまま固定されている。5問目の猶予中に
   * 離脱すると1問目のIDで記録しようとして snapshot のずれで保存が失敗し、
   * 解答そのものが失われる。可変な入力は全てこのペイロードから読む
   */
  question: Question
  item: SessionItem
  /** recordAnswerPipeline / advanceSession へ渡すスナップショット（未取得なら undefined） */
  snapshot: SessionSnapshot | undefined
}

/**
 * 猶予中の未確定な語彙カード評価（T-160）。解答経路（PendingCommit）とは
 * 記録の形が違う（自己評価grade付き・resultを使わない）ため別の型にする
 */
interface VocabPendingCommit {
  grade: SrsGrade
  isCorrect: boolean
  responseMs: number
  question: Question
  item: SessionItem
  snapshot: SessionSnapshot | undefined
}

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
 * DrillScreen が「知っている」format の一覧（進行不能防止の防御）。
 * ここに無い format（shadowing 等。専用画面の担当）の item が混入すると
 * 問題文もボタンも描画されず画面が空白のまま固まるため、questionId 未解決と
 * 同じ経路でスキップする（将来パックに未知 format が入っても詰まらないための防御）。
 * text_passage はここでは「知っている」扱い（スキップしない）だが、実際の描画分岐は
 * 持たず専用画面（ReadingScreen）へ切り替える（T-105。上のtext_passage専用effect参照）
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
  const audioOnlyPart2 = useSessionStore((s) => s.audioOnlyPart2)
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
  // T-158（J-91）: 「もう一度再生」の再生中はタイマーを止める。リプレイ回数の上限は設けない
  const [isReplaying, setIsReplaying] = useState(false)
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
  // vocab_card 専用:「わからない」を選んだ状態（ドッグフィードバック 2026-07-22。VocabScreenと同規約）。
  // 正解は提示しつつ isCorrect=false・SRSはagain扱いにし、当てずっぽうの偽陽性を防ぐ
  const [dontKnowVocab, setDontKnowVocab] = useState(false)
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
  /**
   * T-177（docs/27 のS-30）: 表示不能スキップの通知。従来は真偽値で4秒後に消していたため、
   * 選んだ問数より少ない問題数で終わっても、その場では理由に気づけなかった
   * （累計はResultScreenまで見えない）。セッション中は累計件数を出し続ける
   */
  const [skipCount, setSkipCount] = useState(0)
  // 誤タップの取り消し猶予（2026-07-29・ADR 0009）。設定は既定ON
  const [mistapUndoEnabled, setMistapUndoEnabled] = useState(true)
  // 猶予付き確定（T-156でフックへ抽出）。猶予中の未確定解答の保持・タイマー・
  // アンマウント時のflushはフック側の責務で、対象formatの判定はこの画面に残る
  const {
    pending,
    pendingRef,
    mountedRef,
    schedule: schedulePendingCommit,
    cancel: cancelPendingCommit,
    clearTimer: clearUndoTimer,
    clearPending,
  } = usePendingCommit<PendingCommit>((payload) => commitAnswer(payload))
  /**
   * vocab_card の自己評価にも猶予を付ける（T-160。docs/27 のS-5）。
   * 従来は評価タップで即座に次のカードへ進み、フレーズや正解を読む前に押すと戻れなかった
   * （操作ゾーンに評価3段階＋フレーズ再生＋わからないが縦積みで誤タップの被害が大きい）。
   * 解答経路とペイロードの形が違うためフックを別インスタンスで持つ。
   * 同一問題が vocab_card と他formatを兼ねることはないので、2つの猶予が同時に立つことはない
   */
  const {
    pending: vocabPending,
    schedule: scheduleVocabCommit,
    cancel: cancelVocabCommit,
    clearTimer: clearVocabUndoTimer,
    clearPending: clearVocabPending,
  } = usePendingCommit<VocabPendingCommit>((payload) => commitVocabGrade(payload))
  // 取り消し実行の非モーダル通知（skipNoticeと同型。4秒で消える）
  const [undoNotice, setUndoNotice] = useState(false)
  // T-166（J-93）: 2問目以降の音声自動再生の有効/無効。既定ON（T-110の意図は変えない）
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(true)
  /**
   * T-176（docs/27 のS-27）: 保存に失敗した確定をやり直すための保持。
   * 関数をstateに直接入れると更新関数として解釈されるためオブジェクトで包む
   */
  const [retrySave, setRetrySave] = useState<{ run: () => Promise<void> } | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      db.settings.get(NO_EARPHONE_MODE_KEY),
      db.settings.get(HAPTICS_ENABLED_KEY),
      db.settings.get(MISTAP_UNDO_ENABLED_KEY),
      db.settings.get(AUTO_PLAY_ENABLED_KEY),
    ]).then(([earphoneSetting, hapticsSetting, undoSetting, autoPlaySetting]) => {
      if (cancelled) return
      setNoEarphoneMode(earphoneSetting?.value === true)
      setHapticsEnabled(hapticsSetting?.value !== false)
      setMistapUndoEnabled(undoSetting?.value !== false)
      setAutoPlayEnabled(autoPlaySetting?.value !== false)
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
  // vocab_card の解答済み判定（4択を選んだ or「わからない」）。フレーズと音声の開示条件に使う
  const answeredVocab = selectedChoiceKey !== null || dontKnowVocab
  // T-154: 音声のみモード（本試験形式）。セッションフラグがONでも、当該問題が
  // 未対応（応答音声が未生成）なら従来のテキスト選択肢UIへ落とす二段構えにする
  // （HomeScreen側でプールを絞っているが、混入しても進行不能にしないための自衛）
  const isAudioOnlyMode =
    audioOnlyPart2 && isAudioQa && question !== undefined && supportsAudioOnlyPart2(question)
  // T-154: 音声のみモードでは**再生中も解答できる**。記号ボタンには情報が無いので
  // リークはゼロで、聞き取れた時点で答えられるのが本試験に忠実（本試験も応答の途中で
  // マークできる）。従来形式（テキスト選択肢）は再生完了までゲートしたまま
  const choicesInteractive =
    !needsAudioGate || playState === 'played' || (isAudioOnlyMode && playState === 'playing')
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
  // 既にシャッフル済みのため対象外）。
  // T-154: 音声のみモードではシャッフルしない（key昇順）。読み上げ順が key 昇順で音声に
  // 焼き込まれているため、表示順を混ぜると記号と音声が食い違う。丸暗記対策はコンテンツ側の
  // 決定的ローテーション（rotatePart2Choices）が担っているのでこの制約による後退はない
  const shuffledChoices = useMemo(
    () =>
      isAudioOnlyMode
        ? (audioOnlyChoiceOrder(question!) ?? [])
        : question?.choices
          ? shuffle(question.choices)
          : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id, isAudioOnlyMode],
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
  // 「聞き流し周回」。DrillScreenは元々これを欠いておりVocabScreenとの機能差だった）。
  // 【2026-07-29】再生は解答後に限る。解答前にフレーズ音声を流すと文脈から意味を推測でき
  // リコールテストにならない（VocabScreen と同一仕様。docs/02 4節）
  useEffect(() => {
    if (!settingsLoaded || !isVocabCard || noEarphoneMode || !question?.phraseAudio) return
    // T-166（J-93）: 自動再生のopt-outはフレーズ音声にも効かせる
    if (!autoPlayEnabled) return
    if (!answeredVocab) return
    void audioPlayer
      .unlock()
      .then(() => audioPlayer.play(question.phraseAudio!))
      .catch((err: unknown) => {
        // 自動再生は失敗しても学習継続可能（4択は既に表示されている）なので通知はしない
        console.warn('[DrillScreen] フレーズ音声の自動再生に失敗', err)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settingsLoaded,
    isVocabCard,
    noEarphoneMode,
    answeredVocab,
    question?.phraseAudio,
    autoPlayEnabled,
  ])
  // T-110: セッション内で一度ユーザージェスチャー起点の再生に成功したら（hasPlayedOnceRef）、
  // 以降の音声ゲート付き問題（audio_qa/dictation/audio_set）は自動再生する。
  // handlePlayStart は関数宣言（hoisted）のため、この時点で呼び出して問題ない。
  // 自動再生が拒否された場合はhandlePlayStart内のcatchが従来のタップ開始UIへ戻す
  // T-166（J-93。docs/27 のS-14）: 設定でopt-outできる。既定ONのままなので
  // T-110の意図（一度タップに成功したら以降は自動）は保たれる。OFFなら従来のタップ開始UIに戻る
  useEffect(() => {
    if (!settingsLoaded || !autoPlayEnabled) return
    if (!needsAudioGate || playState !== 'idle' || !hasPlayedOnceRef.current) return

    void handlePlayStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, settingsLoaded, autoPlayEnabled])
  // 再生済み・未解答の間だけタイマーを走らせる（開始値の設定は handlePlayStart 側で行う。
  // ここでは「今ティックすべきか」だけを見る真偽値にし、setInterval の再生成を毎秒起こさない）。
  // 15秒タイマーは audio_qa 固有（dictation は未タイマー=03の8節）。
  // T-158（J-91）: 「もう一度再生」の再生中は止める。従来はリプレイが playState を
  // 変えないためカウントが進み続け、聞き取れずに聞き直すと解答時間が削られた
  // （＝聞き直しがペナルティになっていた。docs/27 のS-9）。
  // remainingSec は据え置くので、再生終了後は残り時間から再開する
  const isCountingDown = isAudioQa && playState === 'played' && !result && !isReplaying

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

      void startAudioSetPlayback()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preReadingSecondsLeft])

  // タイマーが0に達したら自動的にタイムアウト（誤答）として確定する。
  // pendingRef も見るのは多層防御（猶予中は result が既にあるので通常は到達しない）
  useEffect(() => {
    if (remainingSec === 0 && !result && !pendingRef.current) {
      // finalizeAnswer は関数宣言（hoisted）のため、この時点で呼び出して問題ない

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
        setSkipCount((n) => n + 1)
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

  // T-105（24の3.3節・3.5節): text_passage（Part6/7単一）はDrillScreenの4択UIでは描画できない
  // （本文＋設問の2ペインが必要＝専用のReadingScreenの担当。3.5節）。7分/15分パックに
  // 読解が混在するようになったため、現在itemがtext_passageならセッション状態
  // （useSessionStoreは画面間で共有）を保ったままreading画面へ切り替える。
  // advanceSessionは呼ばない（このitem自体は解答が必要でスキップ対象ではない）
  useEffect(() => {
    if (!snapshot || !item || question?.format !== 'text_passage') return
    navigate('reading')
  }, [item, question, snapshot, navigate])

  // 取り消し通知も同型（非モーダル・4秒）
  useEffect(() => {
    if (!undoNotice) return
    const timeout = setTimeout(() => setUndoNotice(false), 4000)
    return () => clearTimeout(timeout)
  }, [undoNotice])

  // アンマウント時（中断・途中終了・reading画面への切替・タブ閉じ）の猶予中解答のflushは
  // usePendingCommit が担う。answerCurrentQuestion が attempt と snapshot を同一
  // トランザクションで進めるため、途中離脱でも「解答済みなのに再出題」「未解答なのに
  // スキップ」のどちらも起きない。

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
  // text_passageはこのコンポーネントに描画分岐が無い（上のeffectがreading画面へ切り替える）。
  // 切り替え完了までの1レンダーは何も描画しない（choices空の中途半端な描画を避ける）
  if (question.format === 'text_passage') return null

  // T-175（docs/27 のS-26）: 進捗の分母を item 数から実際の解答回数へ変える。
  // audio_set は1itemで3サブ設問あるため、item数だと「20問」と出して実際は数十回になり、
  // 1item内で答えても進捗バーが動かなかった。セッションのitem構成自体は変えていない
  const total = totalAnswerSlots(snapshot.items, questions)
  const current =
    answerSlotsBefore(snapshot.items, questions, displayIndex) +
    // audio_set は answeredSubCount 分だけ進む。他formatは1item=1回
    (isAudioSet ? subQuestionResults.length : 0) +
    1

  /**
   * 解答保存（recordAnswerPipeline）失敗時の共通リカバリ（J-35・T-76）。
   * エラーバナー表示＋正誤表示の取り消し（再解答可能にする）に加え、snapshotベースの
   * 経路ではDBの実際の状態をresumeSessionで読み直してstateを再同期する
   * （途中まで書き込みが成立していた場合、answeredCountのずれを解消するため）
   */
  async function recoverFromSaveError(
    err: unknown,
    options?: { resyncSnapshot?: boolean; retry?: () => Promise<void> },
  ) {
    console.error('[DrillScreen] 解答の保存に失敗', err)
    setSaveError('解答を保存できませんでした。通信状態と空き容量を確認してください')
    // T-176（docs/27 のS-27）: 正誤フィードバックは保持したまま再試行させる。
    // 従来は setResult(null) で正誤表示を取り消して再解答を求めていたが、正解が既に
    // 見えている状態で選び直させることになり、操作の意味がなかった。
    // ただしスナップショット不整合（二重解答・複数タブ・終了済みセッション）は
    // やり直しても同じ検知で弾かれるため、従来どおり再同期へ回す
    if (options?.retry && !(err instanceof StaleSnapshotError)) {
      setRetrySave({ run: options.retry })
      return
    }
    setResult(null)
    if (options?.resyncSnapshot ?? true) {
      // リカバリ自体の失敗（DBクローズ済み等）はここで握る。呼び出し元は
      // void で投げっぱなしのため、ここから例外が漏れると未処理rejectionになる
      // （保存失敗のバナーは表示済みで、これ以上ユーザーに提示できる情報はない）
      try {
        const resumed = await resumeSession(db)
        if (resumed) {
          useSessionStore.setState({ snapshot: resumed })
          setDisplayIndex(resumed.answeredCount)
        }
      } catch (resyncErr) {
        console.error('[DrillScreen] 保存失敗後のセッション再同期にも失敗', resyncErr)
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
    // 視覚フィードバック（色・✓✕・ストリーク・振動）は猶予の有無にかかわらず即時
    setResult({ selectedKey, isCorrect, isTimeout })
    setStreak((s) => (isCorrect ? s + 1 : 0))
    triggerCorrectHaptics(hapticsEnabled, isCorrect)

    // 時間切れは猶予なしで即記録する（誤タップではないため。猶予を入れると
    // 「タイマー切れを取り消す」抜け道になる）
    const undoable = mistapUndoEnabled && !isTimeout && UNDO_TARGET_FORMATS.has(question.format)
    const payload: PendingCommit = {
      selectedKey,
      isCorrect,
      isTimeout,
      responseMs,
      streakBefore: streak,
      itemIndex: displayIndex,
      question,
      item,
      snapshot,
    }
    if (undoable) {
      schedulePendingCommit(payload)
      return
    }
    await commitAnswer(payload)
  }

  /**
   * 猶予を抜けた解答を確定して永続化する（従来の finalizeAnswer の後半）。
   * 猶予OFF・時間切れ・対象外formatの場合は finalizeAnswer から直接呼ばれる。
   * アンマウント後（flush経路）でも呼ばれるため、setStateは mountedRef で守る
   */
  async function commitAnswer(payload: PendingCommit) {
    // question / item / snapshot は**ペイロードから読む**（クロージャからは読まない）。
    // アンマウント時のflushは初回レンダーのクロージャを呼ぶため、そちらを使うと
    // 5問目の解答を1問目のIDで記録しようとして保存が失敗し、解答が失われる
    const {
      isCorrect,
      isTimeout,
      responseMs,
      question: q,
      item: sessionItem,
      snapshot: snap,
    } = payload
    clearUndoTimer()
    clearPending()
    setRetrySave(null)

    try {
      // S2は客観正誤のみのUIのため、SRS自己評価3段階への写像は正解→good/誤答→again に固定する
      // （srsGrade省略時のpipeline既定動作。item.srsCardIdが無ければreviewSrsCard自体を呼ばない）。
      // mode='battle'（ボス役セッション=M4・T-128）はレート更新の対象外（docs/22 3.5節・3.2節と同じ扱い）
      const { nextSnapshot, ratingUpdate, raidDamage } = await recordAnswerPipeline(db, {
        snapshot: snap,
        questionId: q.id,
        question: q,
        lookup: questions,
        isCorrect,
        responseMs,
        isTimeout,
        mode: sessionItem.mode,
        srsCardId: sessionItem.srsCardId,
        skip: { rating: sessionItem.mode === 'battle' },
      })
      // M4・T-129: 堅い/弱点バッジ・実ダメージ表示用（該当なしならraidDamageはundefinedのまま）
      if (raidDamage && mountedRef.current) setResult((r) => (r ? { ...r, raidDamage } : r))

      recordAnswer(nextSnapshot!, {
        questionId: q.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
      setSaveError(null)
    } catch (err) {
      // 再試行はペイロードから同じ確定をやり直す（クロージャではなく payload を使うのは
      // commitAnswer と同じ理由＝取り違え防止）
      await recoverFromSaveError(err, { retry: () => commitAnswer(payload) })
    }
  }

  function handleSelect(choiceKey: string) {
    if (!choicesInteractive) return
    // T-154: 再生中に解答したら音声を止める（残りの応答を流し続けない）
    if (isAudioOnlyMode && playState === 'playing') {
      audioPlayer.stop()
      setPlayState('played')
    }
    void finalizeAnswer(choiceKey, choiceKey === question!.answer, false)
  }

  /**
   * 誤タップの取り消し（ADR 0009）。attemptsをまだ書いていないので「記録せずに次の問題へ進む」。
   * 同じ問題を再解答させないのは、視覚フィードバックが即時＝正解が既に見えているため
   * （見た後の再解答を許すと isCorrect が偽陽性になり、測定精度の改善を自分で壊す）。
   * advanceToNext がタイマー・playState・startedAt を全てリセットするので、
   * 15秒タイマーを途中から復活させる必要が構造的に生じない
   */
  async function handleUndo() {
    // cancel() が予約タイマーの解除と猶予状態のクリアまで行う（T-156）
    const payload = cancelPendingCommit()
    if (!payload || !payload.snapshot) return
    setResult(null)
    setStreak(payload.streakBefore)
    try {
      // commitAnswer と同じ理由でペイロードの snapshot を使う（取り違え防止）
      const nextSnapshot = await advanceSession(db, payload.snapshot)
      useSessionStore.setState({ snapshot: nextSnapshot })
      setUndoNotice(true)
      advanceToNext()
    } catch (err) {
      console.warn('[DrillScreen] 取り消し後にセッションを進められませんでした', err)
      setSessionError('セッションを進められませんでした')
    }
  }

  /**
   * 語彙カード評価の取り消し（T-160）。解答経路の handleUndo と同じ思想で
   * 「記録せずに次のカードへ進む」。同じカードを再評価させないのは、評価前に
   * 4択の正誤と正解が既に見えているため（再評価を許すとSRS間隔の申告が形骸化する）
   */
  async function handleVocabUndo() {
    const payload = cancelVocabCommit()
    if (!payload || !payload.snapshot) return
    try {
      const nextSnapshot = await advanceSession(db, payload.snapshot)
      useSessionStore.setState({ snapshot: nextSnapshot })
      setUndoNotice(true)
      advanceToNext()
    } catch (err) {
      console.warn('[DrillScreen] 取り消し後にセッションを進められませんでした', err)
      setSessionError('セッションを進められませんでした')
    }
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
      // セット完了時に1回だけ=advanceSubQuestionが行うためskip.srs）。
      // mode='battle'はレート更新の対象外（finalizeAnswerと同じ理由）
      const { ratingUpdate, raidDamage } = await recordAnswerPipeline(db, {
        questionId: currentSubQuestion.id,
        question,
        lookup: subQuestionLookup,
        isCorrect,
        responseMs,
        mode: item.mode,
        skip: { srs: true, rating: item.mode === 'battle' },
      })
      if (raidDamage) setResult((r) => (r ? { ...r, raidDamage } : r))
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
    // 音声を持たない audio_qa（データ不整合時のフォールバック）は再生せずに解答へ進めるため、
    // 既定は完走扱いにする（従来どおりタイマーを開始する）
    let outcome: PlaybackOutcome = 'ended'
    try {
      await audioPlayer.unlock()
      const options: { durationMs?: number; rate?: number } = {}
      if (partialAudioMode) options.durationMs = PARTIAL_AUDIO_DURATION_MS
      // audio_qa: 音声は「質問＋応答(=正答)」の連結ファイルのため、解答前の再生は
      // 質問部終端（questionEndMs）で止めて正答の読み上げリークを防ぐ（旧生成分=
      // questionEndMs無しは従来どおり全長再生）。replay()はlastOptionsを引き継ぐため
      // 「もう一度再生」も自動的に質問部のみになる。全体は解答後の「全体を再生」で聞ける。
      // 冒頭再生モード時も、質問部が2500msより短い場合は短い方を採る（リーク防止が優先）
      // T-154: 音声のみモードでは3応答すべてを聞かせるので打ち切らない（全長再生）。
      // partialAudioMode とは排他（モーダルが単一選択）だが、念のため音声のみモードを優先する
      const questionEndMs = question!.audioMeta?.questionEndMs
      if (isAudioOnlyMode) {
        delete options.durationMs
      } else if (isAudioQa && typeof questionEndMs === 'number') {
        options.durationMs =
          options.durationMs !== undefined
            ? Math.min(options.durationMs, questionEndMs)
            : questionEndMs
      }
      if (isDictation && dictationRate !== 1) options.rate = dictationRate
      if (question!.audio) {
        outcome = await audioPlayer.play(
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
    // T-154: 音声のみモードは再生自体が約11秒（設問＋3応答）なので「表示から15秒」では
    // 再生中に時間切れになる。タイマーの意味を「再生終了後N秒」に変える。
    // T-158: 中断（再生中の解答による stop 等）で戻った場合はタイマーを開始しない。
    // 従来の `!result` ガードは再生開始時レンダーのクロージャ値を見ていたため機能せず、
    // 解答済みなのにヘッダに残秒が固着していた（docs/27 のS-2）。
    // 戻り値による判定は再生開始後の状態変化を正しく捉える（契約は T-155）
    if (isAudioQa && outcome === 'ended') {
      setRemainingSec(isAudioOnlyMode ? AUDIO_ONLY_ANSWER_SECONDS : ANSWER_TIMER_SECONDS)
    }
  }

  /**
   * 再生を止める（T-166。docs/27 のS-14）。中断として扱われるので、
   * audio_qa のタイマーは開始しない（T-158の outcome 判定に乗る）
   */
  function handleStopPlayback() {
    audioPlayer.stop()
    setPlayState('played')
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
    // 再生中はタイマーを止める（T-158・J-91）。失敗しても必ず再開させるため finally で戻す
    setIsReplaying(true)
    try {
      await audioPlayer.replay()
    } catch (err) {
      console.warn('[DrillScreen] 再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    } finally {
      setIsReplaying(false)
    }
  }

  /**
   * vocab_card: 解答後にフレーズを再生する。
   * replay() を使わないのは、イヤホンなしモードでは自動再生していないため
   * lastOptions が別問題の音声を指しうるから（VocabScreen.handlePlayPhrase と同じ理由）
   */
  async function handlePlayPhrase() {
    if (!question?.phraseAudio) return
    try {
      await audioPlayer.unlock()
      await audioPlayer.play(question.phraseAudio)
    } catch (err) {
      console.warn('[DrillScreen] フレーズの再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    }
  }

  /**
   * T-154: 解答後に特定の応答だけを聞き直す（音声のみモード）。
   * responseOffsetsMs から区間を引いて部分再生する
   */
  async function handlePlayResponse(choiceKey: string) {
    if (!question?.audio) return
    const segment = responseSegment(question, choiceKey)
    if (!segment) return
    try {
      await audioPlayer.play(question.audio, segment)
    } catch (err) {
      console.warn('[DrillScreen] 応答の再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    }
  }

  /** audio_qa: 解答後に「質問＋応答」の全体を聞き直す（正答リーク対策で解答前は質問部のみのため） */
  async function handlePlayFullExchange() {
    if (!question?.audio) return
    try {
      await audioPlayer.play(question.audio)
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
    // 猶予中の解答が残っていたら記録してから進む（「次へ」は確定後にしか出ないので
    // 通常は到達しない防御。取り消し経路は handleUndo が pendingRef をクリア済み）
    const stillPending = pendingRef.current
    if (stillPending) {
      clearUndoTimer()
      void commitAnswer(stillPending)
    }
    if (displayIndex + 1 >= total) {
      navigate('result')
      return
    }
    setDisplayIndex((i) => i + 1)
    // 次の問題の解答受付状態をリセットする（イベントハンドラ内での直接更新。react-hooks/set-state-in-effect対応）
    setResult(null)
    setPlayState('idle')
    setRemainingSec(null)
    setIsReplaying(false)
    setBlankFillsByIndex(new Map())
    setDictationRate(1)
    setSelectedChoiceKey(null)
    setDontKnowVocab(false)
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
    if (selectedChoiceKey !== null || dontKnowVocab) return
    setSelectedChoiceKey(key)
    triggerCorrectHaptics(
      hapticsEnabled,
      quizChoices.find((c) => c.key === key)?.isCorrect ?? false,
    )
  }

  // 「わからない」タップ: 選択肢は選ばず正解の提示だけ行い、「次へ」で handleVocabGrade('again') を呼ぶ。
  // isCorrectは未選択（selectedChoiceKey=null）のため false で確定する
  function handleDontKnowVocab() {
    if (selectedChoiceKey !== null || dontKnowVocab) return
    setDontKnowVocab(true)
  }

  /**
   * vocab_card の自己評価3段階（VocabScreenと同じ挙動）。
   * isCorrectは自己申告ではなく4択の客観的な正誤（ユーザー指摘による設計変更。VocabScreen参照）。
   * T-160: 猶予を挟んでから確定する（従来は即座に次のカードへ進み、フレーズや正解を
   * 読む前に押すと戻れなかった＝docs/27 のS-5）。猶予OFF時は従来どおり即確定する
   */
  async function handleVocabGrade(grade: SrsGrade) {
    if (!question || !item) return
    const isCorrect = quizChoices.find((c) => c.key === selectedChoiceKey)?.isCorrect ?? false
    const responseMs = now() - startedAt
    const payload: VocabPendingCommit = {
      grade,
      isCorrect,
      responseMs,
      question,
      item,
      snapshot,
    }
    if (mistapUndoEnabled && UNDO_TARGET_FORMATS.has(question.format)) {
      scheduleVocabCommit(payload)
      return
    }
    await commitVocabGrade(payload)
  }

  /** 猶予を抜けた語彙カード評価を確定して永続化する（T-160。従来の handleVocabGrade の後半） */
  async function commitVocabGrade(payload: VocabPendingCommit) {
    // question / item / snapshot はペイロードから読む（commitAnswer と同じ理由=取り違え防止）
    const { grade, isCorrect, responseMs, question: q, item: sessionItem, snapshot: snap } = payload
    clearVocabUndoTimer()
    clearVocabPending()
    setRetrySave(null)

    try {
      // vocab_cardは誤答してもkey語彙の復習デッキに落とさない（自己評価が別途あるため=skip.wrongAnswer）。
      // tagStats（tags=[]）・レート（part=0）はpipeline内部でno-opになる
      const { nextSnapshot, ratingUpdate } = await recordAnswerPipeline(db, {
        snapshot: snap,
        questionId: q.id,
        question: q,
        lookup: questions,
        isCorrect,
        responseMs,
        isTimeout: false,
        mode: sessionItem.mode,
        srsCardId: sessionItem.srsCardId,
        srsGrade: grade,
        skip: { wrongAnswer: true },
      })
      recordAnswer(nextSnapshot!, {
        questionId: q.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
      advanceToNext()
    } catch (err) {
      // vocab_cardはresultを使わないため、選択済みの4択表示はそのまま残る。
      // T-176: 再試行導線も出す（同じ評価をやり直す）
      await recoverFromSaveError(err, { retry: () => commitVocabGrade(payload) })
    }
  }

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={current} total={total} />
          <button type="button" className="drill-abort" onClick={() => navigate('home')}>
            中断
          </button>
          {/* T-177: 自動では消さない。ResultScreenの「表示できなかった問題: N件」と
              同じ数え方で、セッション中もその場で件数が分かるようにする */}
          {skipCount > 0 && (
            <p className="drill-skip-notice" role="status" data-testid="drill-skip-notice">
              表示できない問題を{skipCount}件スキップしました
            </p>
          )}
          {undoNotice && (
            <p className="drill-skip-notice" role="status" data-testid="drill-undo-notice">
              この解答は記録しませんでした
            </p>
          )}
          {/* docs/20 3.4節S2: パート名の英字タグ（--font-display・--goldの淡い枠）。
              表示のみの追加で、下の出題理由表示の内容は変えない */}
          <span className="drill-part-tag">{partTagLabel(question.part)}</span>
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
            <p
              className={
                isReplaying ? 'drill-timer display-num is-paused' : 'drill-timer display-num'
              }
            >
              {remainingSec}
              {/* T-158（J-91）: 止まっていることを明示する。無表示だとタイマーが
                  壊れたのか意図的に止めているのか判別できない */}
              {isReplaying && <span className="drill-timer-paused">再生中は停止</span>}
            </p>
          )}
        </>
      }
      action={
        <>
          {saveError && (
            <>
              <p className="drill-error" role="alert">
                {saveError}
              </p>
              {/* T-176（docs/27 のS-27）: 正誤表示を取り消して再解答させる代わりに、
                  同じ解答の保存をやり直す。正解が見えている状態で選び直させても意味がない */}
              {retrySave && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void retrySave.run()}
                >
                  保存を再試行する
                </button>
              )}
            </>
          )}
          {audioError && (
            <p className="drill-error" role="alert">
              {audioError}
            </p>
          )}
          {isVocabCard &&
            quizChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (selectedChoiceKey !== null || dontKnowVocab) {
                if (choice.isCorrect) state = 'correct'
                else if (choice.key === selectedChoiceKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={selectedChoiceKey !== null || dontKnowVocab}
                  onClick={() => handleSelectVocabChoice(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {/* フレーズ音声は解答後にのみ出す（解答前に流すと文脈から意味を推測できる）。
              replay() ではなく play() を使う: イヤホンなしモードでは自動再生していないので
              replay() の lastOptions が別問題の音声を指しうる */}
          {isVocabCard && answeredVocab && question.phraseAudio && (
            <button type="button" className="drill-replay" onClick={() => void handlePlayPhrase()}>
              フレーズを再生
            </button>
          )}
          {isVocabCard && selectedChoiceKey === null && !dontKnowVocab && (
            <button type="button" className="vocab-dontknow-button" onClick={handleDontKnowVocab}>
              わからない
            </button>
          )}
          {/* 「わからない」提示後は自己評価3段階を出さず「次へ」だけ（間隔はagain固定） */}
          {/* T-160: 猶予中は評価ボタンを引っ込めて「取り消し」だけを出す（解答経路と同じ思想）。
              二重評価の防止も兼ねる */}
          {isVocabCard && vocabPending !== null && (
            <button type="button" className="drill-undo" onClick={() => void handleVocabUndo()}>
              取り消し
            </button>
          )}
          {isVocabCard && dontKnowVocab && vocabPending === null && (
            <button
              type="button"
              className="vocab-grade-button"
              onClick={() => void handleVocabGrade('again')}
            >
              次へ
            </button>
          )}
          {isVocabCard && selectedChoiceKey !== null && vocabPending === null && (
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
              {/* T-166（docs/27 のS-14）: 再生中の停止導線。audioPlayer.stop() は実装済みで
                  UIに露出していなかっただけ。自動再生で流れ始めた音声を止める手段が無いと、
                  公共の場や音量調整前の再生から逃げられない */}
              {playState === 'playing' && (
                <button type="button" className="secondary-action" onClick={handleStopPlayback}>
                  停止
                </button>
              )}
              {/* T-154: 音声のみモードでは記号だけでは解答不能なので「音声なしで解答する」を
                  出さない（出すと音声404で永久に進めなくなる）。代わりにスキップを出す */}
              {audioError && isAudioQa && !isAudioOnlyMode && (
                <button type="button" className="secondary-action" onClick={handlePlayWithoutAudio}>
                  音声なしで解答する
                </button>
              )}
              {audioError && isAudioOnlyMode && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void handleSkipUnplayable()}
                >
                  この問題をスキップ
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
          {isAudioSet && playState === 'playing' && (
            <>
              <p>再生中…</p>
              <button type="button" className="secondary-action" onClick={handleStopPlayback}>
                停止
              </button>
            </>
          )}
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
              // T-154: 音声のみモードは解答前はテキストを出さない（記号のみ）。解答後は
              // 開示する（音声だけでは復習にならない）。形マーカー（▲■●◆）は
              // JV-7でイベントバトル専用と決めているので使わず、記号A/B/Cのまま
              // ラベルを空にする（本試験のマークシートも (A)(B)(C)）
              const hideLabel = isAudioOnlyMode && result === null
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={result !== null}
                  onClick={() => handleSelect(choice.key)}
                  className={hideLabel ? 'is-marker-only' : undefined}
                  // ラベルが空でマーカーはaria-hiddenなので、支援技術向けに名前を補う
                  aria-label={hideLabel ? `選択肢${choice.key}` : undefined}
                >
                  {hideLabel ? '' : choice.text}
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
                ghostDefense={
                  result.raidDamage?.ghostDefenseMultiplier !== undefined
                    ? {
                        multiplier: result.raidDamage.ghostDefenseMultiplier,
                        damage: result.raidDamage.damage,
                      }
                    : null
                }
              />
              <PrimaryButton onClick={() => void advanceSubQuestion()}>
                {subQuestionIndex + 1 < (question.subQuestions ?? []).length
                  ? '次の設問へ'
                  : '次へ'}
              </PrimaryButton>
            </>
          )}
          {/* 猶予中は「取り消し」を解説の上に出す（ADR 0009 + T-160のAmendment）。
              T-160で解説を猶予中も出すようにしたため、高さ予約の空スロットは廃止した
              （残すと確定後に48pxの空白が恒久的に居座る。ボタンの出入りに伴う移動は
              解説カードの出現と同時に起きるので回数は増えない） */}
          {!isVocabCard && !isAudioSet && pending !== null && (
            <button type="button" className="drill-undo" onClick={() => void handleUndo()}>
              取り消し
            </button>
          )}
          {/* T-160（docs/27 のS-8）: 解説は猶予中も即時に出す。従来は猶予が明けるまで
              解説・次へ・途中終了のすべてを出さず、対象formatの全問に400msの空白待ちが
              入ってテンポが崩れていた（かつformat間でテンポが不統一だった）。
              取り消しは記録せず次の問題へ進む挙動なので（ADR 0009。見た後の再解答は
              isCorrect の偽陽性になるため許さない）、解説を先に見せても正誤の測定精度は
              変わらない。失うのはレイドダメージと記録の方である */}
          {!isVocabCard && !isAudioSet && result && (
            <>
              {result.isTimeout && <p>時間切れ</p>}
              {isAudioQa && question.audio && (
                <button
                  type="button"
                  className="drill-replay"
                  onClick={() => void handlePlayFullExchange()}
                >
                  {isAudioOnlyMode ? '全体を再生（質問と3つの応答）' : '全体を再生（質問と応答）'}
                </button>
              )}
              {/* T-154: 解答後の個別応答リプレイ（responseOffsetsMs の実利用箇所）。
                  解答前には出さない: 「Bだけ聞き直す」ができると照合ゲームに戻ってしまう */}
              {isAudioOnlyMode && (
                <div className="drill-response-replays">
                  {shuffledChoices.map((choice) => (
                    <button
                      key={choice.key}
                      type="button"
                      className="drill-replay"
                      onClick={() => void handlePlayResponse(choice.key)}
                    >
                      {choice.key} を再生
                    </button>
                  ))}
                </div>
              )}
              <ExplanationCard
                question={question}
                isCorrect={result.isCorrect}
                aiClient={aiClient}
                raidApi={raidApi}
                db={db}
                ghostDefense={
                  result.raidDamage?.ghostDefenseMultiplier !== undefined
                    ? {
                        multiplier: result.raidDamage.ghostDefenseMultiplier,
                        damage: result.raidDamage.damage,
                      }
                    : null
                }
              />
            </>
          )}
          {/* 「次へ」と途中終了は猶予が明けてから出す（T-160でも据え置き）。猶予中に出すと
              未確定のまま次の問題へ進める・アンマウント時のflushと navigate('result') が
              競走する、の2つが起きる */}
          {!isVocabCard && !isAudioSet && result && pending === null && (
            <>
              <PrimaryButton onClick={handleNext}>次へ</PrimaryButton>
              {/* T-122(J-61): 途中で電車を降りるとき等、全問完走以外でリザルトへ到達する手段が
                  無かったための副次導線。確認なしで遷移する（ResultScreenはT-109でattemptIds基準の
                  全体集計のため解答済み分がそのまま正しく表示される）。最終問では「次へ」自体が
                  リザルトへ進むため出さない */}
              {current < total && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => navigate('result')}
                >
                  ここで終了して結果を見る
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {isVocabCard ? (
        // 解答前は単語のみ、解答後にフレーズを開示する（2026-07-29。VocabScreen と同一仕様）
        <div className="vocab-card vocab-card--recall">
          {question.freqRank && (
            <span className="vocab-card__rank" title={FREQ_RANK_TITLE}>
              {question.freqRank}
            </span>
          )}
          <p className="vocab-card__word">{question.front ?? ''}</p>
          {answeredVocab ? (
            <p className="vocab-card__phrase">
              <HighlightedPhrase
                phrase={question.phrase ?? question.front ?? ''}
                word={question.front ?? ''}
              />
            </p>
          ) : (
            <p className="vocab-card__prompt">この単語の意味は？</p>
          )}
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
            : isAudioOnlyMode
              ? // T-154: 音声のみモードは再生中も解答できるので「再生中…」で塞がない
                playState === 'idle'
                ? '音声で質問と3つの応答が流れます。正しい応答の記号を選んでください'
                : '聞こえた3つの応答から正しいものを選んでください'
              : playState === 'playing'
                ? '再生中…'
                : playState === 'played'
                  ? '聞こえた質問への応答として正しいものを選んでください'
                  : '音声で質問が流れます。応答として正しい選択肢を選んでください'}
        </p>
      ) : (
        <p className="question-text">{question.question}</p>
      )}
      {settingsLoaded && <span data-testid="drill-settings-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
