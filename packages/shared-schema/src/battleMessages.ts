// 昼バトルWebSocketメッセージの判別ユーティリティ（M4・T-123。正本: docs/22 3.2節）。
// BattleRoomDO・クライアント双方が受信JSONの type を検証する際に使う。
// 未知の type は既知メッセージとして扱わない（discriminated unionの受信側ガード）

import type { BattleClientMessage, BattleServerMessage } from './types.js'

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
 * 受信JSONが既知のBattleClientMessage typeを持つかどうかを判別する。
 * 未知のtype（例: サーバー専用typeの誤送信・スキーマ不一致）はfalseを返す
 */
export function isBattleClientMessage(value: unknown): value is BattleClientMessage {
  return (
    hasStringTypeField(value) &&
    (BATTLE_CLIENT_MESSAGE_TYPES as readonly string[]).includes(value.type)
  )
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
