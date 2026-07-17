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

export function isQuestionReportPayload(value: unknown): value is QuestionReportPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.questionId === 'string' && v.questionId.length > 0 && isQuestionReportReason(v.reason)
  )
}

function isQuestionStatPayload(value: unknown): value is QuestionStatPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.questionId === 'string' &&
    v.questionId.length > 0 &&
    typeof v.correct === 'number' &&
    typeof v.wrong === 'number' &&
    typeof v.timeout === 'number'
  )
}

export function isQuestionStatsRequest(body: unknown): body is QuestionStatsRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return Array.isArray(b.stats) && b.stats.every(isQuestionStatPayload)
}
