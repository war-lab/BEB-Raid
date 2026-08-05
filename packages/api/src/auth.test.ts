import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { authenticateRequest } from './auth'
import { memberKey, type MemberRecord } from './env'

function requestWithAuth(header?: string): Request {
  const headers = new Headers()
  if (header !== undefined) headers.set('Authorization', header)
  return new Request('https://example.com/whatever', { headers })
}

describe('authenticateRequest', () => {
  it('Authorizationヘッダが無ければ401を返す', async () => {
    const result = await authenticateRequest(requestWithAuth(undefined), env)
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it('Bearer形式でないヘッダは401を返す', async () => {
    const result = await authenticateRequest(requestWithAuth('Basic xyz'), env)
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it('KV未登録のdeviceTokenは401（unregistered）を返す', async () => {
    const result = await authenticateRequest(requestWithAuth('Bearer unknown-device'), env)
    expect(result).toBeInstanceOf(Response)
    const res = result as Response
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('unregistered')
  })

  it('KV登録済みのdeviceTokenは認証を通過しmemberレコードを返す', async () => {
    const deviceToken = `device-${crypto.randomUUID()}`
    const record: MemberRecord = {
      displayName: '花子',
      dailyGoal: 'normal',
      registeredAt: 1_700_000_000_000,
    }
    await env.MEMBERS.put(memberKey(deviceToken), JSON.stringify(record))

    const result = await authenticateRequest(requestWithAuth(`Bearer ${deviceToken}`), env)
    expect(result).not.toBeInstanceOf(Response)
    const success = result as { deviceToken: string; member: MemberRecord }
    expect(success.deviceToken).toBe(deviceToken)
    expect(success.member.displayName).toBe('花子')
  })

  // T-242・J-103: /registerにはUUID v4形式強制を追加した（register.ts参照）が、
  // authenticateRequestには意図的に適用しない。本番KVの既存トークン形式を事前確認
  // できないため、非UUID形式の既存端末が認証できなくなる事故を避ける安全側の判断。
  // このテストは「KVに存在しさえすれば、形式を問わず認証を通過する」ことの回帰防止
  it('UUID v4形式でない既存トークンでも、KVに存在すれば認証を通過する（形式検証は新規登録経路にのみ適用）', async () => {
    const legacyStyleToken = 'legacy-non-uuid-token-12345'
    const record: MemberRecord = {
      displayName: '旧トークン太郎',
      dailyGoal: 'normal',
      registeredAt: 1_600_000_000_000,
    }
    await env.MEMBERS.put(memberKey(legacyStyleToken), JSON.stringify(record))

    const result = await authenticateRequest(requestWithAuth(`Bearer ${legacyStyleToken}`), env)
    expect(result).not.toBeInstanceOf(Response)
    const success = result as { deviceToken: string; member: MemberRecord }
    expect(success.deviceToken).toBe(legacyStyleToken)
  })
})
