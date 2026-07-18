// QuestionStatsRequest・QuestionReportPayloadの型検証（正本: docs/17_M3実装計画.md 3.1節・3.8節）

import type {
  QuestionReportPayload,
  QuestionReportReason,
  QuestionStatPayload,
  QuestionStatsRequest,
} from '@beb-raid/shared-schema'

const QUESTION_REPORT_REASONS: readonly QuestionReportReason[] = [
  'wrong_answer',
  'unnatural',
  'bad_explanation',
]

function isQuestionReportReason(value: unknown): value is QuestionReportReason {
  return QUESTION_REPORT_REASONS.includes(value as QuestionReportReason)
}

/**
 * 1問・1バッチあたりの回数上限。UPSERT加算のみの集計のため、負数を許すと
 * 統計を減算破壊できる（非負・整数・桁違い排除だけを構造的に保証する）
 */
const MAX_COUNT_PER_STAT = 10_000
/** 1リクエストあたりのstats件数上限 */
export const MAX_STATS_PER_REQUEST = 500

function isCountValue(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_COUNT_PER_STAT
  )
}

export function isQuestionReportPayload(value: unknown): value is QuestionReportPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.questionId === 'string' &&
    v.questionId.length > 0 &&
    v.questionId.length <= 200 &&
    isQuestionReportReason(v.reason)
  )
}

function isQuestionStatPayload(value: unknown): value is QuestionStatPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.questionId === 'string' &&
    v.questionId.length > 0 &&
    v.questionId.length <= 200 &&
    isCountValue(v.correct) &&
    isCountValue(v.wrong) &&
    isCountValue(v.timeout)
  )
}

export function isQuestionStatsRequest(body: unknown): body is QuestionStatsRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    Array.isArray(b.stats) &&
    b.stats.length <= MAX_STATS_PER_REQUEST &&
    b.stats.every(isQuestionStatPayload)
  )
}
