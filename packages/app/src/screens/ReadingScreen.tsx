// 読解（Part6/7単一）専用画面（T-104。正本: docs/24 3.5節・02の2.2節）。
// DrillScreenに分岐追加ではなく専用画面にする理由: 本文＋設問の2ペインが
// 既存4択UI（1問1画面）と別レイアウトのため（3.5節）。
// Part7複数パッセージ（相互参照）はT-165でタブ切替を実装した（docs/27 のS-32）。
// 従来は passages[0] のみを描画しており、相互参照型の設問が出ると2通目を読めないまま
// 解答不能になっていた。通常パック配分からの除外（isReadingAllocatable）は維持する——
// あれは「じっくり読解モード専用」という長さの判断（docs/24 3.3節・ADR 0006 判断2）で、
// 表示できるかどうかの話ではない。一方でSRS復習item経由の混入は**許してよくなった**
// （タブで全通を読めるので解答不能にならない）ため、isServable 側にフィルタは足していない。
//
// 採点方針（ADR 0006 判断4・docs/24 3.2節）: audio_setの2/3セット正解ルールは使わず、
// 各subQuestionを独立採点対象とする。レートはRセクションへ1問ごとに反映
// （question.part=6/7→engine/rating.tsのsectionForPartが自動でRへ振る）。
// SRSレビューは本文まるごと再出題しない（3.4節）ため、audio_setと違いセット完了時の
// reviewSrsCard呼び出しは行わない。
//
// Part6は本文に空所マーカー [[1]]…[[n]] を持つ（subQuestions[i]がマーカー[[i+1]]に対応。
// docs/24 3.1節）。空所は非線形にタップして該当設問へジャンプできる（3.5節）。
// Part7単一はマーカーを持たず、設問は「次へ」で順番に進める。
//
// 画面切替（T-105。docs/24 3.3節・3.5節）: 7分/15分パックにPart6・Part7単一が弱点配分で
// 混在するようになったため、セッション内の現在item（useSessionStoreで共有）の
// question.formatを見て、text_passageならこの画面、それ以外ならDrillScreenへ自動的に
// 切り替える（対の効果をDrillScreen側にも実装）。T-104時点では未実装だった
// 「通常セッションからreading画面への遷移方式」の設計判断はここで確定した
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Question, SubQuestion } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { withSubQuestionLookup } from '../engine/subQuestionLookup'
import { answerSlotsBefore, totalAnswerSlots } from '../engine/answerSlots'
import { shuffle } from '../engine/shuffle'
import type { QuestionLookup } from '../engine/types'
import type { AiClient, RaidApi } from '../platform'
import { recordAnswerPipeline, type RaidDamageResult } from '../services/answerPipeline'
import {
  advanceSession,
  completeSession,
  currentSubAnswers,
  type SessionItem,
  type SessionSnapshot,
} from '../services/session'
import { MISTAP_UNDO_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ExplanationCard } from '../components/ExplanationCard'
import { PassageText, type PassageAnswer } from '../components/PassageText'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'
import { usePendingCommit } from '../hooks/usePendingCommit'
import { useSaveGuard } from '../hooks/useSaveGuard'

interface Props {
  db: BebRaidDatabase
  /** BYOK AIクライアント（M2・T-56。未注入ならExplanationCardの「AIに聞く」は出ない） */
  aiClient?: AiClient
  /** 共有API（レイド）クライアント（M3・T-101。未注入ならExplanationCardの報告ボタンは出ない） */
  raidApi?: RaidApi
}

/**
 * ペース表示の目安（3.5節: 1問1分）。T-164でこの秒数を超えたら数値のカウントアップを止める
 * （制限時間ではないので自動確定はしない）
 */
const PACE_GUIDE_SECONDS = 60

/**
 * ペース表示のラベル（T-164。docs/27 のS-13）。
 * 目安を超えたら数値のカウントアップをやめる——制限時間ではないのに「経過180秒」と
 * 出続けると、機能的な影響なしに心理的な圧だけが増える。
 *
 * 判定規則を純関数に切り出しているのは、画面テストで60秒の経過を作るには `Date` を
 * フェイクにする必要があり、同一ファイル内の他テスト（実データのDexie操作）と干渉して
 * 不安定になったため。規則はこの関数の単体テストで固定し、画面側は配線だけを見る
 */
export function readingPaceLabel(elapsedSec: number): string {
  return elapsedSec >= PACE_GUIDE_SECONDS
    ? '目安1問/分（1分超）'
    : `目安1問/分（経過${elapsedSec}秒）`
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
// （DrillScreenと同じ回避策）、別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

/**
 * 中断復帰時に、解答済みサブ設問の正誤表示を復元する（レビュー指摘、2026-08-03）。
 * スナップショットは現在itemのサブ設問の解答をIDで持つので、表示に使うインデックスへ写す。
 * 復元しないと解答済みのサブ設問が未解答として再出題され、attempt・レート・タグ統計が重複する
 */
export function restoreSubAnswers(
  snapshot: SessionSnapshot | null,
  questions: ReadonlyMap<string, Question>,
): Map<number, PassageAnswer> {
  const restored = new Map<number, PassageAnswer>()
  if (!snapshot) return restored
  const item = snapshot.items[snapshot.answeredCount]
  const subQuestions = (item && questions.get(item.questionId)?.subQuestions) ?? []
  for (const record of currentSubAnswers(snapshot)) {
    const index = subQuestions.findIndex((sub) => sub.id === record.subQuestionId)
    if (index < 0) continue
    restored.set(index, { selectedKey: record.selectedKey ?? '', isCorrect: record.isCorrect })
  }
  return restored
}

/** 未解答のうち先頭のサブ設問インデックス（全問解答済みなら0） */
function firstUnansweredIndex(answered: ReadonlyMap<number, PassageAnswer>, count: number): number {
  for (let i = 0; i < count; i++) {
    if (!answered.has(i)) return i
  }
  return 0
}

/**
 * 猶予中の未確定なサブ設問解答（T-268。docs/29 Q-113・ADR 0009 2026-08-05 Amendmentの改訂）。
 * DrillScreen・VocabScreenの解答経路と同じ理由で、確定に必要な値をタップ時点で確定させて
 * すべてペイロードに載せる（アンマウント後のflushはクロージャではなくこの値を読む）。
 * 読解は各subQuestionを独立採点するため（ADR 0006 判断4）、audio_setのような
 * セット単位の巻き戻しは発生せず、DrillScreenのPendingCommitと同型で足りる
 */
interface ReadingPendingCommit {
  /** どのサブ設問に対する解答か（取り消し時にanswersから該当indexだけ除く） */
  index: number
  choiceKey: string
  isCorrect: boolean
  /** タップ時点で確定させた応答時間。commit時刻で計算すると猶予分が乗り、当て勘判定がずれる */
  responseMs: number
  question: Question
  sub: SubQuestion
  item: SessionItem
  subQuestionLookup: QuestionLookup
  snapshot: SessionSnapshot | undefined
}

export function ReadingScreen({ db, aiClient, raidApi }: Props) {
  const snapshot = useSessionStore((s) => s.snapshot)
  const questions = useSessionStore((s) => s.questions)
  const recordAnswer = useSessionStore((s) => s.recordAnswer)
  const navigate = useAppStore((s) => s.navigate)

  // 表示中の item インデックス（DrillScreenと同じ理由でsnapshot.answeredCountと独立に持つ）
  const [displayIndex, setDisplayIndex] = useState(() => snapshot?.answeredCount ?? 0)
  // サブ設問インデックス（0始まり）→ 解答済みの結果。Part6は非線形にタップされうるためMapで持つ。
  // 初期値は中断復帰分（スナップショットのsubAnswers）から復元する
  const [answers, setAnswers] = useState<Map<number, PassageAnswer>>(() =>
    restoreSubAnswers(snapshot, questions),
  )
  // M4・T-129: サブ設問インデックス→レイドダメージ結果（該当時のみ設定。ExplanationCardの
  // 堅い/弱点バッジ・実ダメージ表示に使う。answersと同じライフサイクルでitem切替時にクリアする）
  const [ghostDefenseByIndex, setGhostDefenseByIndex] = useState<Map<number, RaidDamageResult>>(
    new Map(),
  )
  // 現在選択肢を表示しているサブ設問（空所タップ・「次へ」で切り替わる）。
  // 中断復帰時は解答済みの設問ではなく未解答の先頭から始める
  const [activeIndex, setActiveIndex] = useState(() => {
    const restored = restoreSubAnswers(snapshot, questions)
    const item = snapshot?.items[snapshot.answeredCount]
    const count = (item && questions.get(item.questionId)?.subQuestions?.length) ?? 0
    return firstUnansweredIndex(restored, count)
  })
  const [startedAt, setStartedAt] = useState(() => now())
  // ペース表示用の経過秒数（3.5節: 15秒タイマーは付けない。柔らかい目安のみ）
  const [elapsedSec, setElapsedSec] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  // T-176: 保存の進行ガードと再試行導線（多重実行・保存中の進行のガードはフック側）
  const saveGuard = useSaveGuard()
  // T-162（docs/27 のS-7）: 中断の確認
  const [abortConfirm, setAbortConfirm] = useState(false)
  // 誤タップの取り消し猶予（T-268。ADR 0009。既定ON。DrillScreen・VocabScreenと同じ設定キー）
  const [mistapUndoEnabled, setMistapUndoEnabled] = useState(true)
  /**
   * T-165（docs/27 のS-32）: 表示中のパッセージ（複数文書のPart7用）。
   * 従来は passages[0] しか描画せず、相互参照型の設問が出ると2通目を読めないまま
   * 解答不能になっていた
   */
  const [activePassageIndex, setActivePassageIndex] = useState(0)
  // T-230（docs/29 Q-68・WAI-ARIA APG Tabsパターン）: 矢印キー移動時にDOMへ直接フォーカスを
  // 当てるためのタブリスト要素参照（roving tabindexは選択状態から算出するため配列refは不要）
  const tabListRef = useRef<HTMLDivElement | null>(null)

  const item = snapshot?.items[displayIndex]
  const question = item ? questions.get(item.questionId) : undefined
  const subQuestions = question?.subQuestions ?? []
  const passages = question?.passages ?? []
  // 範囲外（item切替直後にindexが残っている等）は先頭へ落とす
  const passage = passages[activePassageIndex] ?? passages[0]
  const activeSub = subQuestions[activeIndex]
  const activeAnswer = answers.get(activeIndex) ?? null

  const subQuestionLookup = useMemo(
    () => (question ? withSubQuestionLookup(question, questions) : questions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id],
  )

  // T-79と同じ理由: 選択肢は設問が変わるたびに1回だけシャッフルする（丸暗記防止）
  const shuffledChoices = useMemo(
    () => (activeSub?.choices ? shuffle(activeSub.choices) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id, activeIndex],
  )

  // ペース表示の秒針を進める。解答済みなら止める（速答を煽らないため自動確定はしない）。
  // T-164: 目安（PACE_GUIDE_SECONDS）を超えたら更新自体を止める（表示が「1分超」に切り替わり
  // 数値を出さなくなるため、進め続ける意味がない）
  useEffect(() => {
    if (activeAnswer || elapsedSec >= PACE_GUIDE_SECONDS) return
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeAnswer, startedAt, elapsedSec])

  // T-105（24の3.3節・3.5節）: 7分/15分パックに読解以外のitem（Part2音声・Part5等）が
  // 混在するようになったため、現在itemがtext_passageでなければDrillScreenへ切り替える
  // （DrillScreen側の対の効果と合わせ、item.question.formatに応じて2画面を往復する）
  useEffect(() => {
    if (!snapshot || !item || !question || question.format === 'text_passage') return
    navigate('drill')
  }, [item, question, snapshot, navigate])

  // item はあるが questionId が解決できない場合（DrillScreenと同じ理由のリカバリ）
  useEffect(() => {
    if (!snapshot || !item || question) return
    let cancelled = false
    console.warn(`[ReadingScreen] questionIdが解決できないためスキップ: ${item.questionId}`)
    void advanceSession(db, snapshot)
      .then((nextSnapshot) => {
        if (cancelled) return
        useSessionStore.setState({ snapshot: nextSnapshot })
        if (displayIndex + 1 >= snapshot.items.length) {
          // T-267: 全問スキップ完了もリザルトへの正規到達経路のひとつ。finishSession()の
          // 説明（DrillScreenの同名関数と同じ理由）を参照。このeffectのdeps配列に
          // 新しいローカル関数を足さないため直接呼ぶ
          void completeSession(db, snapshot.sessionId).catch((e: unknown) => {
            console.warn('[ReadingScreen] セッション完了処理に失敗', e)
          })
          navigate('result')
        } else {
          setDisplayIndex((i) => i + 1)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [item, question, snapshot, displayIndex, db, navigate])

  // 誤タップの取り消し猶予の設定読み込み（T-268。DrillScreen・VocabScreenと同じ既定ON）
  useEffect(() => {
    let cancelled = false
    void db.settings.get(MISTAP_UNDO_ENABLED_KEY).then((setting) => {
      if (!cancelled) setMistapUndoEnabled(setting?.value !== false)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  /**
   * サブ設問解答の猶予付き確定（T-268）。**早期returnより前に置くこと**——後ろに置くと
   * レンダーごとにフック数が変わる（VocabScreenの2インスタンスと同じ注意）。
   * commitSubQuestionAnswerは関数宣言のため巻き上げられ、実際に呼ばれるのは
   * レンダー完了後（タイマー発火・アンマウント時flush・イベントハンドラ経由）なので、
   * ここで先に参照しても本文の関数定義は解決済みになっている（DrillScreenのcommitAnswer・
   * VocabScreenのcommitGrade/commitTriageと同じパターン）。
   */
  /* eslint-disable react-hooks/immutability -- 関数宣言の巻き上げにより実行時は問題ないが、
     react-compilerの静的解析がこの参照順を追えず誤検知する（DrillScreen・VocabScreenの
     同型コードでは発生しない。原因未特定だが巻き上げにより実害は無い） */
  const {
    pending: readingPending,
    schedule: scheduleReadingCommit,
    cancel: cancelReadingCommit,
    clearTimer: clearReadingTimer,
    clearPending: clearReadingPending,
    mountedRef,
  } = usePendingCommit<ReadingPendingCommit>((payload) => commitSubQuestionAnswer(payload))
  /* eslint-enable react-hooks/immutability */

  /**
   * リザルト画面へ遷移する時点でDB上のアクティブセッションを確実に消す
   * （T-196・T-267。docs/29 Q-5、DrillScreenの同名関数と同じ理由）。リザルトへ到達する
   * 経路はすべてここを通す: 「ここで終了して結果を見る」（早期終了）・全問解答後の
   * 「次へ」（正規完走）・questionIdが解決できない異常系のスキップ完了・itemが尽きた
   * ときの描画フォールバック。当初は早期終了のみT-196で対処したが、全問完走の方が
   * 通過頻度が高く、同じ欠陥がQ-5の症状として日常的に発生しうると判断してT-267で
   * 経路を揃えた。
   * useSessionStore側の画面内スナップショットは消さない。ResultScreenのattemptIds基準
   * 集計（T-109）はこちらを読むため、DB側だけ完了させても表示は壊れない。
   * completeSessionはsettings.deleteのみで冪等なため、ResultScreen側の「ホームへ」で
   * 再度呼ばれても害はない（二重呼び出しは許容する。PR #137参照）。
   * useCallbackで安定化するのは、下のuseEffectの依存配列に含めるため（T-320・K-53）
   */
  const finishSession = useCallback(() => {
    // T-193でcompleteSessionがsessionId照合を要するようになったため、snapshotが無い場合は
    // 完了対象が無いものとして呼ばない（複数タブでの誤破棄を防ぐ照合の前提を崩さない）
    if (snapshot) {
      void completeSession(db, snapshot.sessionId).catch((e: unknown) => {
        console.warn('[ReadingScreen] セッション完了処理に失敗', e)
      })
    }
    navigate('result')
  }, [snapshot, db, navigate])

  // T-320（K-53）: 全item解答済み（snapshotはあるがitemが無い）でのfinishSession()呼び出しが
  // レンダー本体（return null直前）にあり、レンダー中にnavigate（内部的にstateを更新する
  // pushState相当の操作）を呼んでいた
  useEffect(() => {
    if (snapshot && !item) finishSession()
  }, [snapshot, item, finishSession])

  if (!snapshot || !item || !question) {
    return null
  }
  // text_passage以外はこのコンポーネントの担当外（上のeffectがdrill画面へ切り替える）。
  // 切り替え完了までの1レンダーは何も描画しない
  if (question.format !== 'text_passage') return null

  // T-175（docs/27 のS-26）: 進捗の分母を実際の解答回数にする。text_passage は1itemで
  // サブ設問全問を要求するため、item数だと進捗が実態と合わない
  const total = totalAnswerSlots(snapshot.items, questions)
  // レビュー指摘: 読解5問なら最終解答後に 6/5 と出てしまう（バー幅だけは丸められるが
  // 表示文字とaria-valuenowは超過する）。総数で丸める
  const current = Math.min(
    answerSlotsBefore(snapshot.items, questions, displayIndex) + answers.size + 1,
    total,
  )
  // 保存中・保存失敗中は進行させない（レビュー指摘、2026-08-03）。saveError は
  // saveGuard.blocked と重なるが、再試行を出さない失敗経路が将来増えても止まるように併記する
  const canAdvance = !saveGuard.blocked && saveError === null
  // T-268: 現在表示中のサブ設問が猶予中かどうか（他のサブ設問の猶予中はここではfalse。
  // 空所タップで別の設問へジャンプできる=3.5節ため、取り消しボタンは表示中の設問のものだけ出す）
  const pendingForActive = readingPending !== null && readingPending.index === activeIndex

  /** 空所タップ・設問切替（該当設問へジャンプ。3.5節）。解答済み設問も閲覧のため切替可 */
  function handleSelectBlank(index: number) {
    setActiveIndex(index)
  }

  /**
   * 文書タブの矢印キー操作（T-230。docs/29 Q-68・WAI-ARIA APG Tabsパターン）。
   * roving tabindexなのでTabキーでの移動先はタブリストへの出入りのみ（各タブは個別に
   * フォーカスストップしない）。Left/Rightは循環、Home/Endは端へ直接移動する。
   * automatic activation（フォーカス移動と同時に選択も切り替える）はクリック時の挙動と
   * 揃えている——タブ切替そのものは軽い操作（本文の再取得等を伴わない）ため、
   * 選択確定の別操作を挟む理由が無い
   */
  function handleTabKeyDown(event: { key: string; preventDefault: () => void }, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % passages.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + passages.length) % passages.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = passages.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    setActivePassageIndex(nextIndex)
    // 選択状態の反映を待たずに、その場でDOM上のタブへフォーカスを移す（roving tabindexの定石）
    const tabs = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[nextIndex]?.focus()
  }

  /**
   * サブ設問1問のタップを受け付ける（T-268で猶予付きに変更）。
   * 視覚フィードバック（正誤の色）は即時に出し、`attempts` への書き込みだけを
   * 猶予中は `commitSubQuestionAnswer` へ委ねる（ADR 0009 2026-08-05 Amendmentの改訂）。
   * 猶予が無効な設定の場合は従来どおり即座に確定する
   */
  function finalizeSubQuestionAnswer(index: number, choiceKey: string) {
    const sub = subQuestions[index]
    if (!question || !item || !sub || answers.has(index)) return
    const isCorrect = choiceKey === sub.answer
    const responseMs = now() - startedAt
    setAnswers((prev) => new Map(prev).set(index, { selectedKey: choiceKey, isCorrect }))
    setSaveError(null)
    // 保存を始めた時点で古い再試行の登録を捨てる（同期。これ自体が再入ガードにもなる）
    saveGuard.clearRetry()

    const payload: ReadingPendingCommit = {
      index,
      choiceKey,
      isCorrect,
      responseMs,
      question,
      sub,
      item,
      subQuestionLookup,
      snapshot,
    }
    if (mistapUndoEnabled) {
      scheduleReadingCommit(payload)
      return
    }
    void commitSubQuestionAnswer(payload)
  }

  /**
   * サブ設問1問の解答を確定して永続化する（猶予タイマー・アンマウント時のflush・
   * 保存失敗からの再試行のいずれからも呼ばれる）。**値はすべてpayloadから読む**
   * （クロージャを読むと、猶予中に離脱した場合に古いitem/questionで保存を試みてしまう。
   * DrillScreenのcommitAnswerと同じ理由）
   */
  async function commitSubQuestionAnswer(payload: ReadingPendingCommit) {
    clearReadingTimer()
    clearReadingPending()
    const {
      index,
      choiceKey,
      isCorrect,
      responseMs,
      question: q,
      sub,
      item: it,
      subQuestionLookup: lookup,
      snapshot: snap,
    } = payload
    try {
      // 読解は各subQuestionを独立採点（2/3ルール不使用=3.2節）。SRSレビューは
      // 本文まるごと再出題しないため呼ばない（skip.srs）。レート・tagStats・
      // keyVocab循環は通常どおり（skipしない）。ただしmode='battle'（ボス役セッション=
      // M4・T-128）はレート更新の対象外（docs/22 3.5節・DrillScreenと同じ扱い）
      // track で包む間は saveGuard.blocked が true になり、「次へ」「ここで終了」を出さない
      // （レビュー指摘、2026-08-03。正誤表示は保存より先に出るため、包まないと未保存のまま
      // 最終サブ設問からリザルトへ進める）
      const { nextSnapshot, ratingUpdate, raidDamage } = await saveGuard.track(() =>
        recordAnswerPipeline(db, {
          // snapshot＋subQuestion でサブ設問として記録する（レビュー指摘、2026-08-03）。
          // itemは進めず、attemptIdと解答済み位置だけをスナップショットへ追加する。
          // 従来は snapshot を渡さず recordAttempt で直接保存していたため、中断すると
          // 解答済みのサブ設問が再開後に再出題され、完走してもリザルトの集計
          // （snapshot.attemptIds 基準）から漏れていた
          snapshot: snap,
          subQuestion: { selectedKey: choiceKey },
          questionId: sub.id,
          question: q,
          lookup,
          isCorrect,
          responseMs,
          mode: it.mode,
          skip: { srs: true, rating: it.mode === 'battle' },
        }),
      )
      if (raidDamage && mountedRef.current) {
        setGhostDefenseByIndex((prev) => new Map(prev).set(index, raidDamage))
      }
      recordAnswer(nextSnapshot!, {
        questionId: sub.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
      if (mountedRef.current) setSaveError(null)
      saveGuard.clearRetry()
    } catch (err) {
      console.error('[ReadingScreen] 解答の保存に失敗', err)
      // T-207（Q-41）: 保存先はローカルのIndexedDBで通信は無関係。「通信状態」への言及は
      // 圏外利用者に誤った原因究明をさせる（オフラインが正常系という設計とも矛盾する）ため外す
      if (mountedRef.current) {
        setSaveError('解答を保存できませんでした。空き容量を確認してください')
      }
      // T-176（docs/27 のS-27）: 正誤フィードバックは保持したまま再試行させる。
      // 従来は answers から該当indexを消して選び直させていたが、正解が既に見えている
      // 状態で選び直させることになり操作の意味がなかった。再試行は猶予を挟まず
      // 同じpayloadで直接コミットし直す（DrillScreenのrecoverFromSaveErrorと同じ扱い）
      saveGuard.offerRetry(() => commitSubQuestionAnswer(payload))
    }
  }

  function handleSelectChoice(choiceKey: string) {
    // 保存中・保存失敗中は別のサブ設問の解答も受け付けない（レビュー指摘、2026-08-03）。
    // 空所タップでの設問切替は閲覧目的なので止めない。ここを開けておくと、
    // 未保存の再試行が残っているのに別の設問を解答して retry の登録を捨ててしまう。
    // T-268: 猶予中（readingPending !== null）も同様に止める。空所タップで別のサブ設問へ
    // ジャンプすること自体は許すが（3.5節）、その場でさらに別解答を確定させると、
    // usePendingCommitが「猶予中に再度scheduleされたら前のpendingを即flushする」ため
    // （T-194・Q-107）、先行する解答の保存とこの解答の保存が並行して走りうる
    if (activeAnswer || saveGuard.blocked || readingPending !== null) return
    finalizeSubQuestionAnswer(activeIndex, choiceKey)
  }

  /** 次の未解答設問へ（無ければ次の未解答へ巡回）。全問解答済みならitemを進める */
  function findNextUnanswered(from: number, answered: ReadonlyMap<number, PassageAnswer>) {
    for (let step = 1; step <= subQuestions.length; step++) {
      const idx = (from + step) % subQuestions.length
      if (!answered.has(idx)) return idx
    }
    return null
  }

  /** payload.index自身を除いた、他に残る未解答サブ設問（取り消し後の遷移先を探す用） */
  function firstUnansweredExcluding(
    excludeIndex: number,
    answered: ReadonlyMap<number, PassageAnswer>,
  ): number | null {
    for (let i = 0; i < subQuestions.length; i++) {
      if (i === excludeIndex || answered.has(i)) continue
      return i
    }
    return null
  }

  /**
   * 現在のitem（パッセージ）を消化済みとして次のitemへ進める。全問解答後の「次へ」
   * （handleNext）と、取り消しが最後の1問だった場合（handleReadingUndo。他に未解答の
   * サブ設問が残っていない＝この設問の分だけ未記録のまま進める）の両方から呼ぶ
   */
  async function advanceReadingItem() {
    const nextSnapshot = await advanceSession(db, snapshot!)
    useSessionStore.setState({ snapshot: nextSnapshot })
    // 終了判定は**item数**で行う（レビュー指摘、2026-07-31）。displayIndex は item 単位、
    // total（T-175）はサブ設問を展開した解答数なので、複数設問を含むセッションでは
    // 最終itemでも `displayIndex + 1 >= total` が成立せず、範囲外へ進んだ次のレンダーで
    // `!item` のフォールバックに拾われてリザルトへ飛ぶという遠回りになっていた
    if (displayIndex + 1 >= snapshot!.items.length) {
      finishSession()
      return
    }
    setDisplayIndex((i) => i + 1)
    setAnswers(new Map())
    setGhostDefenseByIndex(new Map())
    setActiveIndex(0)
    setActivePassageIndex(0)
    setStartedAt(now())
    setElapsedSec(0)
  }

  async function handleNext() {
    // T-198（Q-7）: startedAtだけ更新してelapsedSecを残すと、一度60秒を超えた設問の後は
    // 以降すべての設問で「1分超」表示に固着する（tick用effectはelapsedSec>=60で早期returnし
    // 自己回復しない）。設問・パッセージを切り替えるたびに両方リセットする
    if (answers.size >= subQuestions.length) {
      await advanceReadingItem()
      return
    }
    const next = findNextUnanswered(activeIndex, answers)
    if (next !== null) {
      setActiveIndex(next)
      setStartedAt(now())
      setElapsedSec(0)
    }
  }

  /**
   * サブ設問の解答の取り消し（T-268。ADR 0009 2026-08-05 Amendmentの改訂）。
   * 「記録せず次へ進む」はDrillScreen・VocabScreenと同じ意味だが、読解は1itemに
   * 複数サブ設問を持つため、「次へ」は次の未解答サブ設問（同じitem内）を指す。
   * 同じサブ設問を再表示して選び直させないのは、正解が既に見えているため
   * isCorrect が偽陽性になるからである（他画面と同じ理由）。
   * 他に未解答のサブ設問が残っていない場合（取り消した設問がこのitemの最後の1問）は
   * advanceReadingItemでitemごと進める。audio_setと違い各subQuestionは独立採点なので、
   * 1問分が未記録のまま進めても他の設問の記録には影響しない
   */
  async function handleReadingUndo() {
    const payload = cancelReadingCommit()
    if (!payload) return
    const remaining = new Map(answers)
    remaining.delete(payload.index)
    setAnswers(remaining)
    setGhostDefenseByIndex((prev) => {
      if (!prev.has(payload.index)) return prev
      const next = new Map(prev)
      next.delete(payload.index)
      return next
    })
    const next = firstUnansweredExcluding(payload.index, remaining)
    if (next !== null) {
      setActiveIndex(next)
      setStartedAt(now())
      setElapsedSec(0)
      return
    }
    await advanceReadingItem()
  }

  return (
    <ScreenLayout
      status={
        <>
          {/* T-162（docs/27 のS-7）: 中断は画面最上部にあり、誤タップでセッションから
              抜けていた。ダイアログは position:fixed なのでDOM上の位置は問わない */}
          {abortConfirm && (
            <ConfirmDialog
              message="読解を中断してホームへ戻りますか？（解答済みの分は保存されます）"
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
                { label: '読解を続ける', onSelect: () => setAbortConfirm(false) },
              ]}
            />
          )}
          <SessionProgress current={current} total={total} />
          <button type="button" className="drill-abort" onClick={() => setAbortConfirm(true)}>
            中断
          </button>
          {/* docs/25 4.8節（V-19）: DrillScreenと同じ英字パートタグ（.drill-part-tagを再利用）。
              表示のみの追加で、読解は必ずPart6/7なのでVOCAB分岐は持たない */}
          <span className="drill-part-tag">PART {question.part}</span>
          {/* T-164（docs/27 のS-13）: 目安の1分を超えたら数値のカウントアップを止める。
              制限時間ではないのに「経過180秒」と出続けると、機能的な影響なしに心理的な圧だけが
              増える。自動確定は従来どおり行わない（速答を煽らない=3.5節） */}
          {!activeAnswer && <p className="reading-pace">{readingPaceLabel(elapsedSec)}</p>}
        </>
      }
      action={
        <>
          {saveError && (
            <>
              <p className="drill-error" role="alert">
                {saveError}
              </p>
              {saveGuard.retryShown && (
                <button
                  type="button"
                  className="secondary-action"
                  disabled={saveGuard.retryBusy}
                  aria-busy={saveGuard.retryBusy}
                  onClick={() => void saveGuard.runRetry()}
                >
                  保存を再試行する
                </button>
              )}
            </>
          )}
          {activeSub &&
            shuffledChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (activeAnswer) {
                if (choice.key === activeSub.answer) state = 'correct'
                else if (choice.key === activeAnswer.selectedKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  // T-268: 別のサブ設問が猶予中（readingPending）の間は、このボタンを押しても
                  // handleSelectChoiceが無視するだけなので、無反応タップにしないよう見た目も止める
                  disabled={activeAnswer !== null || readingPending !== null}
                  onClick={() => handleSelectChoice(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {activeAnswer && activeSub && (
            <>
              <ExplanationCard
                question={{
                  ...question,
                  question: activeSub.question,
                  choices: activeSub.choices,
                  answer: activeSub.answer,
                  explanation: activeSub.explanation,
                  translation: activeSub.translation,
                }}
                isCorrect={activeAnswer.isCorrect}
                aiClient={aiClient}
                raidApi={raidApi}
                db={db}
                ghostDefense={
                  ghostDefenseByIndex.get(activeIndex)?.ghostDefenseMultiplier !== undefined
                    ? {
                        multiplier: ghostDefenseByIndex.get(activeIndex)!.ghostDefenseMultiplier!,
                        damage: ghostDefenseByIndex.get(activeIndex)!.damage,
                      }
                    : null
                }
              />
              {/* T-268: 猶予中（ADR 0009）は「取り消し」だけを出す。DrillScreen・VocabScreenと
                  同じ思想で、解説は猶予中も即時に出しつつ（ADR 0009 T-160 Amendment 決定2）、
                  未確定のまま次へ進める導線・途中終了は猶予が明けてから出す */}
              {pendingForActive && (
                <button
                  type="button"
                  className="drill-undo"
                  onClick={() => void handleReadingUndo()}
                >
                  取り消し
                </button>
              )}
              {/* 保存が終わるまでは進行導線を出さない（レビュー指摘、2026-08-03）。
                  正誤表示は保存処理より先に出るため、出しておくと最終サブ設問で
                  attempt未保存のまま advanceSession → リザルトへ進めてしまう。
                  保存失敗中（再試行待ち）も同様に止め、再試行だけを前進手段にする */}
              {canAdvance && !pendingForActive && (
                <PrimaryButton onClick={() => void handleNext()}>次へ</PrimaryButton>
              )}
              {/* T-164（docs/27 のS-31）: T-122でドリルに入れた途中終了導線を読解にも適用する。
                  従来は全サブ設問を解き切るまでリザルトへ到達できず、抜ける手段は「中断」
                  （ホーム直行）だけだったため、Part7の長文を全問解く覚悟がないと入れなかった。
                  解答済みが1問以上あり、かつ未解答が残っているときだけ出す */}
              {canAdvance && !pendingForActive && answers.size < subQuestions.length && (
                <button type="button" className="secondary-action" onClick={finishSession}>
                  ここで終了して結果を見る
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {/* T-165（docs/27 のS-32）: 複数文書のときだけタブを出す。1件のときは従来の表示を
          変えない（タブが常に出ると単一文書の読解に無用な要素が増える） */}
      {passages.length >= 2 && (
        <div
          className="reading-passage-tabs"
          role="tablist"
          aria-label="文書の切り替え"
          ref={tabListRef}
        >
          {passages.map((p, i) => (
            <button
              key={p.id}
              // T-230: tabpanel側のaria-labelledbyから参照する安定id（passages[i].id由来）
              id={`reading-tab-${p.id}`}
              type="button"
              role="tab"
              aria-selected={i === activePassageIndex}
              aria-controls={`reading-tabpanel-${p.id}`}
              // T-230: roving tabindex。選択中タブのみ0、他は-1（Tabキーではタブリストへ
              // 1回入るだけにし、以降の移動は矢印キーに委ねるAPGパターン）
              tabIndex={i === activePassageIndex ? 0 : -1}
              className={i === activePassageIndex ? 'is-selected' : ''}
              onClick={() => setActivePassageIndex(i)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
            >
              文書{i + 1}（{p.kind}）
            </button>
          ))}
        </div>
      )}
      {passage && (
        // docs/25 4.8節（V-19）: パッセージ面に--surface-gradを当てる。面と罫線だけで、
        // 光暈・アニメーションは足さない（07の原則3: 読解中は静かであるべき）
        // T-230: タブが出る（複数文書の）ときだけtabpanelとして紐づける。単一文書には
        // タブリスト自体が無いため、tabpanel役を持たせる意味が無い
        <div
          className="reading-passage"
          role={passages.length >= 2 ? 'tabpanel' : undefined}
          id={passages.length >= 2 ? `reading-tabpanel-${passage.id}` : undefined}
          aria-labelledby={passages.length >= 2 ? `reading-tab-${passage.id}` : undefined}
        >
          <p className="passage-kind">{passage.kind}</p>
          <PassageText
            text={passage.text}
            subQuestions={subQuestions}
            answers={answers}
            activeIndex={activeIndex}
            onSelectBlank={handleSelectBlank}
          />
        </div>
      )}
      {activeSub && (
        // T-224（J-108）: 「設問n/m:」は日本語ラベル、設問文（英文）だけをspanで括る
        <p className="question-text" data-testid="reading-question">
          設問{activeIndex + 1}/{subQuestions.length}: <span lang="en">{activeSub.question}</span>
        </p>
      )}
    </ScreenLayout>
  )
}
