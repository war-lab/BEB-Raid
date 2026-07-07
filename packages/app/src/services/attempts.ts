// 解答記録サービス（T-07。正本: docs/03 7.2節・docs/04 3節）。
//
// 【不変条件】解答は発生のたびに IndexedDB へ即時保存する（オフラインが正常系）。
// attempts は追記のみで、このサービスも削除・更新APIを提供しない。

import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode, AttemptRecord } from '../db/schema'

/** 当て勘判定のしきい値: 応答がこれ未満の誤答は当て勘（03の7.2節） */
export const GUESS_THRESHOLD_MS = 2000

export interface RecordAttemptInput {
  questionId: string
  mode: AttemptMode
  /** 時間切れの場合は無視され false になる */
  isCorrect: boolean
  responseMs: number
  /** 時間切れ（速度不足として知識不足と別カウント） */
  isTimeout?: boolean
  /** 省略時は現在時刻 */
  answeredAt?: number
}

/**
 * 入力から attempts レコードを組み立てる（保存はしない）。
 * - 時間切れは誤答扱い（isCorrect=false）で isTimeout に別カウント
 * - 当て勘フラグ: 応答<2秒の誤答（時間切れは対象外）
 */
export function buildAttempt(input: RecordAttemptInput): AttemptRecord {
  const isTimeout = input.isTimeout ?? false
  const isCorrect = isTimeout ? false : input.isCorrect
  return {
    id: crypto.randomUUID(),
    questionId: input.questionId,
    mode: input.mode,
    isCorrect,
    responseMs: input.responseMs,
    isTimeout,
    isGuess: !isTimeout && !isCorrect && input.responseMs < GUESS_THRESHOLD_MS,
    answeredAt: input.answeredAt ?? Date.now(),
  }
}

/** 解答1件を即時保存する。戻り値は保存済みレコード */
export async function recordAttempt(
  db: BebRaidDatabase,
  input: RecordAttemptInput,
): Promise<AttemptRecord> {
  const attempt = buildAttempt(input)
  await db.attempts.add(attempt)
  return attempt
}
