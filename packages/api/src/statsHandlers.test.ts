// POST/GET /stats/questions 統合テスト（正本: docs/17_M3実装計画.md 3.1節・3.8節）
import { reset, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

const VALID_INVITE_CODE = 'test-invite-code'
// vitest.config.tsのbindingsで注入されるダミー値（adminHandlers.test.tsと同じ値）
const ADMIN_TOKEN = 'test-admin-token'

async function registerDevice(): Promise<string> {
  const deviceToken = crypto.randomUUID()
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

function postStats(deviceToken: string, stats: unknown[]): Request {
  return new Request('https://example.com/stats/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ stats }),
  })
}

/** GET /stats/questions はADMIN_TOKENのBearerで呼ぶ（T-249・29のQ-31。管理用のため一般メンバーのdeviceTokenでは読めない） */
function getStatsAsAdmin(): Request {
  return new Request('https://example.com/stats/questions', {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  })
}

afterEach(async () => {
  await reset()
})

describe('POST /stats/questions', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch(postStats('unknown-device', []))
    expect(res.status).toBe(401)
  })

  it('不正なボディは400になる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(
      new Request('https://example.com/stats/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ stats: [{ questionId: 'q-1' }] }), // correct/wrong/timeout欠落
      }),
    )
    expect(res.status).toBe(400)
  })

  it('負数・非整数のカウントは400になる（UPSERT加算集計の減算破壊を防ぐ）', async () => {
    const deviceToken = await registerDevice()
    for (const correct of [-1, 0.5, Number.NaN]) {
      const res = await SELF.fetch(
        postStats(deviceToken, [{ questionId: 'q-neg', correct, wrong: 0, timeout: 0 }]),
      )
      expect(res.status).toBe(400)
    }
  })

  it('stats件数が上限(500)を超えるリクエストは400になる', async () => {
    const deviceToken = await registerDevice()
    const stats = Array.from({ length: 501 }, (_, i) => ({
      questionId: `q-${i}`,
      correct: 1,
      wrong: 0,
      timeout: 0,
    }))
    const res = await SELF.fetch(postStats(deviceToken, stats))
    expect(res.status).toBe(400)
  })

  it('正常系: 受理件数を返し、GET（ADMIN_TOKEN）で集計値が取得できる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(
      postStats(deviceToken, [
        { questionId: 'q-1', correct: 5, wrong: 1, timeout: 0 },
        { questionId: 'q-2', correct: 0, wrong: 2, timeout: 1 },
      ]),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ accepted: 2 })

    const getRes = await SELF.fetch(getStatsAsAdmin())
    expect(getRes.status).toBe(200)
    const body = (await getRes.json()) as { stats: unknown[] }
    expect(body.stats).toEqual([
      { questionId: 'q-1', correct: 5, wrong: 1, timeout: 0 },
      { questionId: 'q-2', correct: 0, wrong: 2, timeout: 1 },
    ])
  })

  it('同一questionIdの再送は既存集計に加算される', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(
      postStats(deviceToken, [{ questionId: 'q-1', correct: 1, wrong: 0, timeout: 0 }]),
    )
    await SELF.fetch(
      postStats(deviceToken, [{ questionId: 'q-1', correct: 2, wrong: 1, timeout: 0 }]),
    )

    const getRes = await SELF.fetch(getStatsAsAdmin())
    const body = (await getRes.json()) as { stats: unknown[] }
    expect(body.stats).toEqual([{ questionId: 'q-1', correct: 3, wrong: 1, timeout: 0 }])
  })

  it('レスポンスにdeviceTokenが一切含まれない（14の4.4-④）', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(
      postStats(deviceToken, [{ questionId: 'q-1', correct: 1, wrong: 0, timeout: 0 }]),
    )

    const getRes = await SELF.fetch(getStatsAsAdmin())
    const text = await getRes.text()
    expect(text).not.toContain(deviceToken)
    expect(text).not.toContain('deviceToken')
  })
})

describe('GET /stats/questions', () => {
  // T-249・29のQ-31: 「管理用」と注記されていたが、一般メンバーのdeviceToken Bearerでも
  // 読めていた（アクセス制御と意図の不一致）。ADMIN_TOKENへ分離した後は、
  // 未登録tokenはもちろん登録済み一般メンバーのtokenでも401になることを確認する
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch('https://example.com/stats/questions', {
      headers: { Authorization: 'Bearer unknown' },
    })
    expect(res.status).toBe(401)
  })

  it('登録済み一般メンバーのdeviceTokenでは読めない（管理用のためADMIN_TOKEN必須）', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch('https://example.com/stats/questions', {
      headers: { Authorization: `Bearer ${deviceToken}` },
    })
    expect(res.status).toBe(401)
  })

  it('ADMIN_TOKENでは読める。未送信状態では空配列を返す', async () => {
    const res = await SELF.fetch(getStatsAsAdmin())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ stats: [] })
  })
})
