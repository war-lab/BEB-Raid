// POST /battle/rooms のテスト（正本: docs/22_M4実装計画.md 3.1節・6節T-124シート）

import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { generateRoomCode, handleCreateBattleRoom } from './battleHandlers'

const VALID_INVITE_CODE = 'test-invite-code'

async function registerDevice(displayName: string): Promise<string> {
  const deviceToken = `device-${crypto.randomUUID()}`
  const res = await SELF.fetch('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteCode: VALID_INVITE_CODE,
      deviceToken,
      displayName,
      dailyGoal: 'normal',
    }),
  })
  expect(res.status).toBe(200)
  return deviceToken
}

describe('generateRoomCode', () => {
  it('4文字英数字大文字を生成する', () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateRoomCode()
      expect(code).toMatch(/^[A-Z0-9]{4}$/)
    }
  })
})

describe('handleCreateBattleRoom', () => {
  it('コードを発行しレスポンスに含める', async () => {
    const hostToken = await registerDevice('作成者')
    const res = await handleCreateBattleRoom(env, hostToken, Date.now())
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: string }
    expect(body.code).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('POST /battle/rooms はBearer認証必須', async () => {
    const res = await SELF.fetch('https://example.com/battle/rooms', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('認証済みならSELF経由でもルームコードを取得できる', async () => {
    const hostToken = await registerDevice('作成者2')
    const res = await SELF.fetch('https://example.com/battle/rooms', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hostToken}` },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: string }
    expect(body.code).toMatch(/^[A-Z0-9]{4}$/)
  })

  it('同一コードの衝突が続く場合は5回試行後に500を返す', async () => {
    const hostToken = await registerDevice('作成者3')
    const fixedCode = 'AAAA'
    // 事前にAAAAをopen状態のルームとして予約しておき、生成コードが常に衝突する状況を作る
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(fixedCode))
    await stub.tryInit(fixedCode, 'someone-else', Date.now())

    const originalRandom = crypto.getRandomValues
    // generateRoomCodeが常にfixedCodeを生成するようcrypto.getRandomValuesをスタブする
    // (fixedCode='AAAA'はROOM_CODE_CHARS[0]='A'に対応するため全バイトを0にする)
    crypto.getRandomValues = ((array: Uint8Array) => {
      array.fill(0)
      return array
    }) as typeof crypto.getRandomValues

    try {
      const res = await handleCreateBattleRoom(env, hostToken, Date.now())
      expect(res.status).toBe(500)
    } finally {
      crypto.getRandomValues = originalRandom
    }
  })
})
