// 読解（RC）の速読ペース指標（T-145。正本: docs/24 3.5節）。
//
// 目的は「時間切れで解き切れない層の底上げ」であって速答を煽ることではない（3.5節）。
// そのため出すのは「1問あたり平均解答時間」と「目標ペース（約1分/問）との差」に留め、
// 合否・警告の色分けはしない。ReadingScreenのペース表示（柔らかい経過秒数）と同じトーン。

import type { AttemptRecord } from '../db/schema'
import type { QuestionLookup } from './types'

/** 本試験RCの目標ペース（約1分/問。docs/24 3.5節） */
export const RC_TARGET_MS_PER_QUESTION = 60_000

/**
 * 集計に必要な最小サンプル数。これ未満は平均が1問の当たり外れで揺れるため
 * 数値を出さない（弱点マップの WEAK_MIN_SAMPLE と同じ思想）
 */
export const RC_PACE_MIN_SAMPLE = 5

export interface ReadingPace {
  /** 集計対象の解答数 */
  count: number
  /** 1問あたり平均解答時間（ミリ秒） */
  averageMs: number
  /**
   * 目標ペースとの差（ミリ秒）。正なら目標より遅い、負なら速い。
   * 「遅い＝悪い」ではない（正確さとのトレードオフなので、判断は学習者に委ねる）
   */
  diffMs: number
}

/**
 * 読解の解答からペース指標を出す。
 *
 * 対象は `text_passage` のサブ設問への解答である。読解の attempt は `questionId` が
 * **サブ設問ID**（`<questionId>-q<n>`）で記録されるため、`questions`（パック単位の
 * lookup）には載っていない。そこで `withSubQuestionLookup` 相当の解決には依存せず、
 * 「サブ設問IDの親を引けるか」で判定する。
 *
 * 除外するもの:
 * - 時間切れ（`isTimeout`）: 読解に自動確定は無い（3.5節）ので通常は現れないが、
 *   将来入った場合に平均を壊さないよう弾く。
 * - `responseMs <= 0`: 復帰直後などに0が入りうる。0を平均へ混ぜると速く見える。
 *
 * @param attempts 対象期間の解答ログ（呼び出し側が期間で絞る）
 * @param questions 問題lookup（パック単位。サブ設問は含まない）
 */
export function computeReadingPace(
  attempts: readonly AttemptRecord[],
  questions: QuestionLookup,
): ReadingPace | null {
  const readingAttempts = attempts.filter(
    (a) => !a.isTimeout && a.responseMs > 0 && isReadingSubQuestionId(a.questionId, questions),
  )
  if (readingAttempts.length < RC_PACE_MIN_SAMPLE) return null

  const totalMs = readingAttempts.reduce((sum, a) => sum + a.responseMs, 0)
  const averageMs = Math.round(totalMs / readingAttempts.length)
  return {
    count: readingAttempts.length,
    averageMs,
    diffMs: averageMs - RC_TARGET_MS_PER_QUESTION,
  }
}

/**
 * そのattemptのquestionIdが読解のサブ設問か。
 *
 * サブ設問IDは `<親questionId>-q<n>` の規約（docs/24 3.1節）。親を lookup から引き、
 * `text_passage` であることを確認する。**親IDそのもので記録された attempt は対象外**
 * （読解は必ずサブ設問単位で記録されるため、親IDでの記録は別経路＝集計に混ぜない）
 */
function isReadingSubQuestionId(questionId: string, questions: QuestionLookup): boolean {
  const separator = questionId.lastIndexOf('-q')
  if (separator <= 0) return false
  const parentId = questionId.slice(0, separator)
  return questions.get(parentId)?.format === 'text_passage'
}

/** 表示用: ミリ秒を「1分20秒」「48秒」の形にする（小数は出さない＝精度を装わない） */
export function formatPaceDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`
}
