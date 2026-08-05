// イベントバトルWebSocketメッセージの判別ユーティリティ（M4・T-123。正本: docs/22 3.2節）。
// BattleRoomDO・クライアント双方が受信JSONの type を検証する際に使う。
// 未知の type は既知メッセージとして扱わない（discriminated unionの受信側ガード）

import type { BattleClientMessage, BattleCloseReason, BattleServerMessage } from './types.js'

const BATTLE_CLIENT_MESSAGE_TYPES = [
  'join',
  'answer',
  'openQuestion',
  'closeQuestion',
  'finish',
] as const satisfies readonly BattleClientMessage['type'][]

const BATTLE_SERVER_MESSAGE_TYPES = [
  'roomState',
  'questionOpen',
  'standings',
  'result',
  'error',
] as const satisfies readonly BattleServerMessage['type'][]

function hasStringTypeField(value: unknown): value is { type: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * ペイロード検証の上限値（T-182・29のQ-19）。
 * REST側（raidValidation・ghostValidation・register）は上限を含めて堅実に検証しているが、
 * WS層は type しか見ていなかった。同じ「桁違いの値だけを構造的に弾く」考え方をここでも適用する
 */
// register.ts の MAX_DISPLAY_NAME_LENGTH と同じ考え方（全参加者へ配信される値のため上限を持つ）。
// shared-schemaはapi側へ依存できないため値を複製している
const MAX_BATTLE_DISPLAY_NAME_LENGTH = 32
const MAX_QUESTION_ID_LENGTH = 200
// 基礎点はengine/rating.tsのBASE_POINTS_MAX(130)でクランプされる。
// ここでは正確な値へ結合せず、桁違いの値だけを弾く安全マージンとして持つ
const MAX_ANSWER_POINTS = 1_000
// ルームの出題数は12問（docs/22 3.2節）。桁違いの値だけを弾く安全マージンとして持つ
const MAX_QUESTION_INDEX = 1_000

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 集計を破壊しうる値（負数・非整数・桁違い）を弾く。0は許容する */
function isNonNegativeInteger(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

function isValidJoinPayload(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.displayName, MAX_BATTLE_DISPLAY_NAME_LENGTH) &&
    isFiniteNumber(value.expectedPointsPerQuestion)
  )
}

function isValidAnswerPayload(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeInteger(value.questionIndex, MAX_QUESTION_INDEX) &&
    isNonNegativeInteger(value.points, MAX_ANSWER_POINTS)
  )
}

function isValidOpenQuestionPayload(value: Record<string, unknown>): boolean {
  return (
    isNonNegativeInteger(value.questionIndex, MAX_QUESTION_INDEX) &&
    isNonEmptyString(value.questionId, MAX_QUESTION_ID_LENGTH)
  )
}

function isValidCloseQuestionPayload(value: Record<string, unknown>): boolean {
  return isNonNegativeInteger(value.questionIndex, MAX_QUESTION_INDEX)
}

/**
 * 受信JSONが既知のBattleClientMessage typeを持ち、かつ各typeのペイロードが
 * 型・長さ・範囲の検証を満たすかどうかを判別する（T-182・29のQ-19）。
 * 未知のtype、またはペイロードが不正な既知typeはfalseを返す。
 * 呼び出し側（BattleRoomDO.webSocketMessage）はfalseの場合に`error`を返すのみで、
 * 接続は切らない
 */
export function isBattleClientMessage(value: unknown): value is BattleClientMessage {
  if (!hasStringTypeField(value)) return false
  if (!(BATTLE_CLIENT_MESSAGE_TYPES as readonly string[]).includes(value.type)) return false

  const payload = value as Record<string, unknown>
  switch (value.type as BattleClientMessage['type']) {
    case 'join':
      return isValidJoinPayload(payload)
    case 'answer':
      return isValidAnswerPayload(payload)
    case 'openQuestion':
      return isValidOpenQuestionPayload(payload)
    case 'closeQuestion':
      return isValidCloseQuestionPayload(payload)
    case 'finish':
      return true
  }
}

/**
 * 受信JSONが既知のBattleServerMessage typeを持つかどうかを判別する。
 * 未知のtypeはfalseを返す
 */
export function isBattleServerMessage(value: unknown): value is BattleServerMessage {
  return (
    hasStringTypeField(value) &&
    (BATTLE_SERVER_MESSAGE_TYPES as readonly string[]).includes(value.type)
  )
}

/**
 * サーバーが付与しうるクローズ理由の一覧（close frame の reason 文字列の正本）。
 * BattleRoomDO側の close(code, reason) とクライアント側の案内文の出し分けが、
 * この1箇所を参照して食い違わないようにするために置く
 */
const BATTLE_CLOSE_REASONS = [
  'unauthorized',
  'room_not_found',
  'room_closed',
] as const satisfies readonly BattleCloseReason[]

/**
 * クローズ理由の文字列が既知のBattleCloseReasonかどうかを判別する。
 * 通信断のように理由が空文字・未知の場合はfalseを返す（呼び出し側は汎用の案内文に落とす）
 */
export function isBattleCloseReason(value: string): value is BattleCloseReason {
  return (BATTLE_CLOSE_REASONS as readonly string[]).includes(value)
}
