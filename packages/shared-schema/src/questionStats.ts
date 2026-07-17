// 匿名問題別正誤集計ペイロードの構築（M3基盤・T-91。正本: docs/14 4.4-④節、docs/17 3.8節）。
// deviceTokenが誤って混入しないよう、フィールドを明示的に1つずつ選び出す
// （スプレッド構文を使わない。buildDamageSyncPayloadと同じ方式）

import type { QuestionStatPayload } from './types.js'

export interface QuestionStatPayloadInput {
  questionId: string
  correct: number
  wrong: number
  timeout: number
}

/** QuestionStatPayloadのホワイトリスト（このキー以外を持たせない。deviceTokenは含まない） */
export const QUESTION_STAT_PAYLOAD_KEYS: readonly (keyof QuestionStatPayload)[] = [
  'questionId',
  'correct',
  'wrong',
  'timeout',
]

export function buildQuestionStatPayload(input: QuestionStatPayloadInput): QuestionStatPayload {
  return {
    questionId: input.questionId,
    correct: input.correct,
    wrong: input.wrong,
    timeout: input.timeout,
  }
}
