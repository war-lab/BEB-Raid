// POST /battle/rooms（正本: docs/22_M4実装計画.md 3.1節・6節T-124シート）。
// 認証（Bearer）はindex.tsのroute()側で行い、ここには認証済みdeviceTokenを渡す。
// GET /battle/rooms/:code/ws はWebSocket UpgradeのためBearerヘッダを使えず、
// BattleRoomDO.fetch()内でSec-WebSocket-Protocol経由の認証を行う（このファイルでは扱わない）

import type { CreateBattleRoomResponse } from '@beb-raid/shared-schema'

import type { Env } from './env'

const ROOM_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const ROOM_CODE_LENGTH = 4
const MAX_CODE_ATTEMPTS = 5

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

/** 4文字英数字大文字のルームコードを生成する（衝突時は呼び出し側で再生成する） */
export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))
  let code = ''
  for (const byte of bytes) {
    code += ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]
  }
  return code
}

/**
 * ルーム作成: コード発行→idFromName(code)でDO解決→衝突チェック込みの初期化。
 * 既存ルームがopen（closed済みでない）なら衝突とみなし再生成し、最大5回で500を返す
 */
export async function handleCreateBattleRoom(
  env: Env,
  hostToken: string,
  now: number,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateRoomCode()
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))
    const created = await stub.tryInit(code, hostToken, now)
    if (created) {
      return jsonResponse({ code } satisfies CreateBattleRoomResponse)
    }
  }
  return errorResponse(
    500,
    'room_code_exhausted',
    `${MAX_CODE_ATTEMPTS}回試行してもルームコードが確保できませんでした`,
  )
}
