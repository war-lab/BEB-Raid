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
 * questionIdの形式（T-333・K-68）。以前は「1〜200字の非空文字列」としか検証しておらず、
 * question_statsが任意の文字列で無制限に増えうる構造的な弱点だった（bossIdのT-243と同種）。
 * content/packs/*.jsonの実際のquestionId（part2-submit・p34-p3-01・vocab-meeting・
 * similar-account-1等）と、audio_set/読解のサブ設問合成ID（`<parentId>-q<index>`）は
 * いずれも「小文字英数字のハイフン区切り」で表現できるため、この構造だけを強制する
 * （個別のプレフィックスを列挙すると新パック追加のたびに追随が必要になり脆いため避ける）
 */
const QUESTION_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_QUESTION_ID_LENGTH = 100

function isValidQuestionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_QUESTION_ID_LENGTH &&
    QUESTION_ID_PATTERN.test(value)
  )
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
  return isValidQuestionId(v.questionId) && isQuestionReportReason(v.reason)
}

function isQuestionStatPayload(value: unknown): value is QuestionStatPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    isValidQuestionId(v.questionId) &&
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
