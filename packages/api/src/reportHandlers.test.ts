// POST /reports 統合テスト（正本: docs/17_M3実装計画.md 3.1節・3.8節、docs/16 T-101完了条件）
import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { STATS_DO_NAME } from './statsDo'
import type { StatsDO } from './statsDo'

const VALID_INVITE_CODE = 'test-invite-code'

async function registerDevice(): Promise<string> {
  const deviceToken = `device-${crypto.randomUUID()}`
  const res = await SELF.fetch('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteCode: VALID_INVITE_CODE,
      deviceToken,
      displayName: '太郎',
      dailyGoal: 'normal',
    }),
  })
  expect(res.status).toBe(200)
  return deviceToken
}

function postReport(deviceToken: string, body: unknown): Request {
  return new Request('https://example.com/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify(body),
  })
}

function statsStub() {
  return env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
}

afterEach(async () => {
  await reset()
})

describe('POST /reports', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch(
      postReport('unknown-device', { questionId: 'q-1', reason: 'unnatural' }),
    )
    expect(res.status).toBe(401)
  })

  it('reasonが不正な値なら400になる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(postReport(deviceToken, { questionId: 'q-1', reason: 'spam' }))
    expect(res.status).toBe(400)
  })

  it('questionId欠落は400になる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(postReport(deviceToken, { reason: 'unnatural' }))
    expect(res.status).toBe(400)
  })

  it('正常系: 送信すると{ ok: true }を返し、StatsDO側の集計値が増加する', async () => {
    const deviceToken = await registerDevice()

    const res = await SELF.fetch(
      postReport(deviceToken, { questionId: 'q-1', reason: 'bad_explanation' }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const reports = await runInDurableObject(statsStub(), (instance: StatsDO) =>
      instance.getAllReports(),
    )
    expect(reports).toEqual([{ questionId: 'q-1', reason: 'bad_explanation', count: 1 }])
  })

  it('同一questionId×reasonの再送は集計値が加算される', async () => {
    const deviceToken = await registerDevice()

    await SELF.fetch(postReport(deviceToken, { questionId: 'q-1', reason: 'wrong_answer' }))
    await SELF.fetch(postReport(deviceToken, { questionId: 'q-1', reason: 'wrong_answer' }))

    const reports = await runInDurableObject(statsStub(), (instance: StatsDO) =>
      instance.getAllReports(),
    )
    expect(reports).toEqual([{ questionId: 'q-1', reason: 'wrong_answer', count: 2 }])
  })
})
