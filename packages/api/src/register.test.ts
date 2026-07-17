import { env, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { memberKey, type MemberRecord } from './env'

const VALID_INVITE_CODE = 'test-invite-code'

function registerRequest(body: unknown): Request {
  return new Request('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /register', () => {
  it('正しい招待コードでdeviceTokenがKVへ登録される', async () => {
    const deviceToken = `device-${crypto.randomUUID()}`
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'normal',
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const stored = await env.MEMBERS.get(memberKey(deviceToken))
    expect(stored).not.toBeNull()
    const record = JSON.parse(stored!) as MemberRecord
    expect(record.displayName).toBe('太郎')
    expect(record.dailyGoal).toBe('normal')
    expect(typeof record.registeredAt).toBe('number')
  })

  it('誤った招待コードは401になり、KVに書き込まれない', async () => {
    const deviceToken = `device-${crypto.randomUUID()}`
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: 'wrong-code',
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'normal',
      }),
    )

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_invite_code')
    expect(await env.MEMBERS.get(memberKey(deviceToken))).toBeNull()
  })

  it('不正なリクエストボディ（dailyGoal不正）は400になる', async () => {
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken: 'device-x',
        displayName: '太郎',
        dailyGoal: 'extreme',
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_body')
  })

  it('JSONとして壊れたボディは400になる', async () => {
    const res = await SELF.fetch(
      new Request('https://example.com/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('再登録（同一deviceToken）はdisplayName/dailyGoalを上書きしつつregisteredAtを引き継ぐ', async () => {
    const deviceToken = `device-${crypto.randomUUID()}`

    const first = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'light',
      }),
    )
    expect(first.status).toBe(200)
    const firstRecord = JSON.parse((await env.MEMBERS.get(memberKey(deviceToken)))!) as MemberRecord

    const second = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎（改名）',
        dailyGoal: 'heavy',
      }),
    )
    expect(second.status).toBe(200)
    const secondRecord = JSON.parse(
      (await env.MEMBERS.get(memberKey(deviceToken)))!,
    ) as MemberRecord

    expect(secondRecord.displayName).toBe('太郎（改名）')
    expect(secondRecord.dailyGoal).toBe('heavy')
    expect(secondRecord.registeredAt).toBe(firstRecord.registeredAt)
  })
})
