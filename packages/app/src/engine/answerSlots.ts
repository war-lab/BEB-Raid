// セッションの「解答回数」の数え方（T-168ではなくT-175。docs/27 のS-26）。
//
// 進捗表示の分母に item 数を使うと実態と合わない。audio_set（Part3/4）は1itemで
// 3サブ設問、text_passage（Part6/7）は1itemでサブ設問全問の解答を要求するため、
// 「7分・20問」で開始しても実際の解答回数は数十回になる。さらに1item内で複数問
// 答えても進捗バーが動かないので、進捗が止まって見える。
//
// セッションのitem構成（quickPackConfig の totalItems）は変えない。表示だけを合わせる。

import type { Question } from '@beb-raid/shared-schema'
import type { SessionItem } from '../services/session'
import type { QuestionLookup } from './types'

/** 1itemが要求する解答回数。サブ設問を持つformatはその件数、それ以外は1 */
export function answerSlotsOf(question: Question | undefined): number {
  if (!question) return 1 // 未解決のitem（未読込パック等）は1回として数える
  if (question.format === 'audio_set' || question.format === 'text_passage') {
    return Math.max(1, question.subQuestions?.length ?? 1)
  }
  return 1
}

/** セッション全体の解答回数（進捗の分母） */
export function totalAnswerSlots(items: readonly SessionItem[], questions: QuestionLookup): number {
  return items.reduce((sum, item) => sum + answerSlotsOf(questions.get(item.questionId)), 0)
}

/**
 * 表示中itemより前のitemが消費した解答回数（進捗の分子の土台）。
 * 現在itemの中で答え終わったサブ設問数は呼び出し側が足す（画面ごとに保持場所が違う）
 */
export function answerSlotsBefore(
  items: readonly SessionItem[],
  questions: QuestionLookup,
  itemIndex: number,
): number {
  return totalAnswerSlots(items.slice(0, itemIndex), questions)
}
