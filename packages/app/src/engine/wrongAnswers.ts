// 間違えた問題一覧の集計（発起人の要望、2026-08-03）。
//
// attempts（追記のみ・分析の基盤）から誤答を拾って「問題単位」に畳む。
// セッション直後のリザルトにも誤答一覧はあるが、そちらはそのセッション分だけで、
// 過去の誤答をあとから見返す経路が無かった。
//
// 【出せないもの】attempts は選んだ選択肢を保存していない（AttemptRecord は
// questionId / isCorrect / responseMs / isTimeout / isGuess / answeredAt のみ）。
// そのため一覧に「自分が選んだ選択肢」は出せない。正解・解説は問題データから出せる。

import type { Question, SubQuestion } from '@beb-raid/shared-schema'
import type { AttemptRecord } from '../db/schema'
import type { QuestionLookup } from './types'

export interface WrongAnswerEntry {
  /** attempts 上のID。複合問題のサブ設問なら `<親questionId>-q<n>` */
  attemptQuestionId: string
  /** 出題に使う問題。サブ設問の誤答では**親**が入る（復習セッションはitem単位で組む） */
  question: Question
  /** サブ設問の誤答のみ。設問文・正解・解説はこちらが正 */
  subQuestion?: SubQuestion
  /** 誤答回数（同じ問題を何度も間違えた分を数える） */
  wrongCount: number
  /** 最後に間違えた時刻 */
  lastWrongAt: number
  /** 最後の解答が正解だったか（＝その後できるようになった） */
  recovered: boolean
  /** 直近の誤答が時間切れだったか（知識不足と速度不足を混ぜないための注記。03の7.2節） */
  lastWrongTimeout: boolean
  /** 直近の誤答が当て勘だったか（同上） */
  lastWrongGuess: boolean
}

export interface WrongAnswerSummary {
  /** 最後に間違えた順（新しい順） */
  entries: WrongAnswerEntry[]
  /**
   * 問題データを引けなかった誤答の件数。
   * 語彙カード（`vocab:*`）・配信から外れた問題が該当する。**黙って捨てない**
   * （件数が合わないのに理由が出ないと、記録が消えたように見える）
   */
  unresolvedCount: number
}

/**
 * 1回の復習セッションに入れる最大item数（単独モードの既定と同じ20問。J-57のテンポ基準）。
 * 間違えた問題一覧とイベントバトル直後の復習で共有する
 */
export const WRONG_ANSWER_REVIEW_LIMIT = 20

/** 内部集計用の可変レコード（問題単位。正解・誤答それぞれの最新時刻をanansweredAtで追う） */
interface Bucket {
  question: Question
  subQuestion?: SubQuestion
  /** その問題への誤答一覧（1件以上あるものだけentries化する） */
  wrongAttempts: AttemptRecord[]
  /** 正解attemptsの中で最も新しいanansweredAt（無ければnull） */
  latestCorrectAt: number | null
}

/**
 * 誤答を問題単位に畳む。
 *
 * recovered（その後できるようになったか）は「正解の最新answeredAtが、誤答の最新answeredAt
 * 以降か」で判定する。走査中の途中経過（Draft）ではなく各attemptのanansweredAtタイムスタンプ
 * だけで決まるため、attemptsを配列のどの順序で渡しても結果は変わらない
 * （旧実装は「最初に処理したattemptが正解か誤答か」に依存するバグがあり、唯一の呼び出し元
 * WrongAnswersScreenが新しい順=`orderBy('answeredAt').reverse()`で渡すため、本番では
 * recoveredが実質常にfalseになっていた。T-186）
 *
 * @param attempts 走査対象の解答ログ（順序は問わない。answeredAtで最新を判定するため、
 *   呼び出し側がどの並び順で渡しても結果は変わらない。件数を絞るのは呼び出し側の責務のまま）
 * @param questions 問題lookup（パック単位。サブ設問は含まないので親から解決する）
 */
export function collectWrongAnswers(
  attempts: readonly AttemptRecord[],
  questions: QuestionLookup,
): WrongAnswerSummary {
  const buckets = new Map<string, Bucket>()
  let unresolvedCount = 0

  for (const attempt of attempts) {
    const resolved = resolveQuestion(attempt.questionId, questions)
    if (!resolved) {
      if (!attempt.isCorrect) unresolvedCount += 1
      continue
    }
    let bucket = buckets.get(attempt.questionId)
    if (!bucket) {
      bucket = {
        question: resolved.question,
        subQuestion: resolved.subQuestion,
        wrongAttempts: [],
        latestCorrectAt: null,
      }
      buckets.set(attempt.questionId, bucket)
    }
    if (attempt.isCorrect) {
      // 正解は「その後できるようになったか」の判定にのみ使う（一覧には載せない）
      if (bucket.latestCorrectAt === null || attempt.answeredAt >= bucket.latestCorrectAt) {
        bucket.latestCorrectAt = attempt.answeredAt
      }
    } else {
      bucket.wrongAttempts.push(attempt)
    }
  }

  const entries: WrongAnswerEntry[] = []
  for (const [questionId, bucket] of buckets) {
    if (bucket.wrongAttempts.length === 0) continue // 誤答が無ければ一覧に載せない
    const lastWrong = bucket.wrongAttempts.reduce((latest, a) =>
      a.answeredAt >= latest.answeredAt ? a : latest,
    )
    entries.push({
      attemptQuestionId: questionId,
      question: bucket.question,
      subQuestion: bucket.subQuestion,
      wrongCount: bucket.wrongAttempts.length,
      lastWrongAt: lastWrong.answeredAt,
      recovered: bucket.latestCorrectAt !== null && bucket.latestCorrectAt >= lastWrong.answeredAt,
      lastWrongTimeout: lastWrong.isTimeout,
      lastWrongGuess: lastWrong.isGuess,
    })
  }

  entries.sort((a, b) => b.lastWrongAt - a.lastWrongAt)
  return { entries, unresolvedCount }
}

/**
 * attempts のquestionIdから表示・出題に使う問題を引く。
 *
 * 複合問題（読解 text_passage・リスニング audio_set）の解答は**サブ設問ID**で
 * 記録されるため lookup には無い。`<親questionId>-q<n>` の規約（docs/24 3.1節）で
 * 親を引き、その `subQuestions` から該当設問を取る
 */
function resolveQuestion(
  questionId: string,
  questions: QuestionLookup,
): { question: Question; subQuestion?: SubQuestion } | null {
  const direct = questions.get(questionId)
  if (direct) return { question: direct }

  const separator = questionId.lastIndexOf('-q')
  if (separator <= 0) return null
  const parent = questions.get(questionId.slice(0, separator))
  const subQuestion = parent?.subQuestions?.find((sub) => sub.id === questionId)
  if (!parent || !subQuestion) return null
  return { question: parent, subQuestion }
}

/**
 * 一覧の日付表示（M/D）。
 * 相対表示（「N日前」）は履歴を並べたときに互いの前後関係が読み取りにくいので絶対日付にする
 */
export function formatWrongAnswerDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/** 一覧に出す設問文（サブ設問ならその設問文。音声問題は本文を持たないので指示文） */
export function wrongAnswerPrompt(entry: WrongAnswerEntry): string {
  const text = entry.subQuestion?.question ?? entry.question.question
  if (text) return text
  return '（音声問題）'
}

/** 一覧に出す正解の選択肢テキスト（キーだけでは思い出せないため本文を添える） */
export function wrongAnswerCorrectText(entry: WrongAnswerEntry): string {
  const source = entry.subQuestion ?? entry.question
  const answerKey = source.answer
  if (!answerKey) return '—'
  const choice = source.choices?.find((c) => c.key === answerKey)
  return choice ? `${answerKey}. ${choice.text}` : answerKey
}

/**
 * 復習セッションのitem（questionId）列を作る。
 *
 * サブ設問の誤答は**親item**へ畳む（1パッセージで3設問間違えても出題は1item）。
 * 並びは一覧と同じ「最後に間違えた順」で、`limit` 件で切る
 */
export function wrongAnswerReviewIds(
  // イベントバトルのリザルトからも呼ぶため、必要な形だけを要求する
  entries: readonly Pick<WrongAnswerEntry, 'question'>[],
  limit: number,
): string[] {
  const ids: string[] = []
  for (const entry of entries) {
    if (ids.length >= limit) break
    if (!ids.includes(entry.question.id)) ids.push(entry.question.id)
  }
  return ids
}
