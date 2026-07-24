// GhostRecordPayloadの型検証（正本: docs/22 3.1節・3.3節）。
// consentはリテラルtrue固定（boolean不可）であることをここでも実行時に強制する
// （shared-schemaのGhostRecordPayload型・buildGhostRecordPayloadと同じ思想。J-67）

import type { GhostRecordEntry, GhostRecordPayload } from '@beb-raid/shared-schema'

/** 1記録あたりのquestionId件数上限（ボス役セッションは30問=docs/22 3.5節。桁違いの値を弾く） */
export const MAX_GHOST_RECORDS = 100

function isGhostRecordEntry(value: unknown): value is GhostRecordEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.questionId === 'string' &&
    v.questionId.length > 0 &&
    v.questionId.length <= 200 &&
    typeof v.correct === 'boolean'
  )
}

export function isGhostRecordPayload(body: unknown): body is GhostRecordPayload {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    // consent === true のみ許容する（boolean型のfalseは当然、真偽以外の値も弾く）
    b.consent === true &&
    typeof b.displayName === 'string' &&
    b.displayName.length > 0 &&
    b.displayName.length <= 100 &&
    Array.isArray(b.records) &&
    b.records.length > 0 &&
    b.records.length <= MAX_GHOST_RECORDS &&
    b.records.every(isGhostRecordEntry)
  )
}
