import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import type { RaidBossDO } from './raidBossDo'
import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'

const VALID_INVITE_CODE = 'test-invite-code'
const HOUR_MS = 60 * 60 * 1000

async function registerDevice(displayName = '太郎'): Promise<string> {
  const deviceToken = crypto.randomUUID()
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

// endAtは既定でISO週の実スケジュール（金曜終了）を使うため、テストを土日に実行すると
// 「今週のボス」が既にclosedになる。statusを検証するテストはendAtOverrideで期限を
// 未来に置き、実行曜日に依存しない期待値にすること
async function initCurrentBoss(maxHp: number, endAtOverride?: number) {
  const current = isoWeekInfo(Date.now())
  const bossId = bossIdFor(current)
  const endAt = endAtOverride ?? weekEndAt(current.weekStartAt)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
  await runInDurableObject(stub, (instance: RaidBossDO) => {
    instance.init({
      bossId,
      profile: bossProfileForWeek(current.isoWeek),
      maxHp,
      startAt: current.weekStartAt,
      endAt,
    })
  })
  return { bossId, startAt: current.weekStartAt, endAt }
}

function syncRequest(deviceToken: string, payloads: unknown[]): Request {
  return new Request('https://example.com/raid/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ payloads }),
  })
}

// initCurrentBoss/registerDeviceは実際の現在時刻(Date.now())ベースのbossIdを使う
// （index.tsのroute()がDate.now()で当週を解決するため）。同じ「今週」のDOに全テストが
// 相乗りすると状態が混ざるため、各テスト後にKV/DOの全データをリセットする
afterEach(async () => {
  await reset()
})

describe('GET /raid/current', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch('https://example.com/raid/current', {
      headers: { Authorization: 'Bearer unknown' },
    })
    expect(res.status).toBe(401)
  })

  it('ボス未生成の週は404になる（未初期化のbossIdを直接使う）', async () => {
    const deviceToken = await registerDevice()
    // 現在週のボスをあえて初期化せず問い合わせる
    const res = await SELF.fetch('https://example.com/raid/current', {
      headers: { Authorization: `Bearer ${deviceToken}` },
    })
    expect(res.status).toBe(404)
  })

  it('ボス生成済みなら現在の状態を返す', async () => {
    const deviceToken = await registerDevice()
    await initCurrentBoss(5000, Date.now() + HOUR_MS) // status='active'の検証のため期限を未来に置く

    const res = await SELF.fetch('https://example.com/raid/current', {
      headers: { Authorization: `Bearer ${deviceToken}` },
    })
    expect(res.status).toBe(200)
    const boss = (await res.json()) as { maxHp: number; hp: number; status: string }
    expect(boss.maxHp).toBe(5000)
    expect(boss.hp).toBe(5000)
    expect(boss.status).toBe('active')
  })
})

describe('POST /raid/sync', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch(syncRequest('unknown-device', []))
    expect(res.status).toBe(401)
  })

  it('不正なボディは400になる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(
      new Request('https://example.com/raid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
        body: JSON.stringify({ payloads: [{ attemptId: 'a-1' }] }), // 必須フィールド欠落
      }),
    )
    expect(res.status).toBe(400)
  })

  it('負数・非整数のdamageは400になる（HP回復・討伐判定の逆行を防ぐ）', async () => {
    const deviceToken = await registerDevice()
    const { bossId, startAt } = await initCurrentBoss(1000)
    const base = { bossId, questionCount: 1, answeredAt: startAt + HOUR_MS }

    for (const damage of [-100, 1.5, Number.NaN, 1_000_000]) {
      const res = await SELF.fetch(
        syncRequest(deviceToken, [{ attemptId: 'bad-1', damage, ...base }]),
      )
      expect(res.status).toBe(400)
    }
  })

  it('payload件数が上限(500)を超えるリクエストは400になる', async () => {
    const deviceToken = await registerDevice()
    const { bossId, startAt } = await initCurrentBoss(1000)
    const payloads = Array.from({ length: 501 }, (_, i) => ({
      attemptId: `bulk-${i}`,
      bossId,
      damage: 1,
      questionCount: 1,
      answeredAt: startAt + HOUR_MS,
    }))

    const res = await SELF.fetch(syncRequest(deviceToken, payloads))
    expect(res.status).toBe(400)
  })

  it('正常系: 新規attemptが受理されHPが減る', async () => {
    const deviceToken = await registerDevice()
    const { bossId, startAt } = await initCurrentBoss(1000)

    const res = await SELF.fetch(
      syncRequest(deviceToken, [
        {
          attemptId: 'a-1',
          bossId,
          damage: 300,
          questionCount: 1,
          answeredAt: startAt + HOUR_MS,
        },
      ]),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { acceptedIds: string[]; boss: { hp: number } }
    expect(body.acceptedIds).toEqual(['a-1'])
    expect(body.boss.hp).toBe(700)
  })

  // T-243・29のQ-22: bossIdはクライアントの自己申告文字列で、以前は「1〜200字の非空文字列」
  // としか検証していなかった。認証済みメンバーはidFromName(bossId)経由で任意個の
  // RaidBossDOインスタンスを作れてしまい（コンストラクタでSQLiteテーブルをCREATEするため
  // 未初期化ボス宛でも永続ストレージが発生する）、1リクエストの上限（500件）まで
  // 任意種のインスタンスを一括生成できた。boss-<ISO年>-W<ISO週番号2桁>の形式のみ許可する
  it('bossIdが `boss-YYYY-Wnn` 形式でないpayloadは400になる（任意DO作成の防止）', async () => {
    const deviceToken = await registerDevice()
    const { startAt } = await initCurrentBoss(1000)
    const base = { questionCount: 1, answeredAt: startAt + HOUR_MS }

    for (const bossId of [
      'arbitrary-attacker-controlled-id',
      'boss-2026-W3', // 週番号が1桁（2桁固定でない）
      'boss-26-W03', // 年が2桁
      'boss-2026-w03', // 小文字
      'boss-2026-W03-extra', // 余分な文字列
      '../../../etc/passwd',
    ]) {
      const res = await SELF.fetch(
        syncRequest(deviceToken, [{ attemptId: `bad-boss-${bossId}`, bossId, damage: 1, ...base }]),
      )
      expect(res.status).toBe(400)
    }
  })

  it('bossIdが正しい形式（前週分含む）なら受理される', async () => {
    const deviceToken = await registerDevice()
    const { bossId, startAt } = await initCurrentBoss(1000)

    const res = await SELF.fetch(
      syncRequest(deviceToken, [
        {
          attemptId: 'valid-boss-id',
          bossId,
          damage: 100,
          questionCount: 1,
          answeredAt: startAt + HOUR_MS,
        },
      ]),
    )
    expect(res.status).toBe(200)
  })

  it('冪等系: 同一attemptIdの二重送信は二重計上されない', async () => {
    const deviceToken = await registerDevice()
    const { bossId, startAt } = await initCurrentBoss(1000)
    const payload = {
      attemptId: 'dup-1',
      bossId,
      damage: 200,
      questionCount: 1,
      answeredAt: startAt + HOUR_MS,
    }

    const first = await SELF.fetch(syncRequest(deviceToken, [payload]))
    const second = await SELF.fetch(syncRequest(deviceToken, [payload]))

    const firstBody = (await first.json()) as { acceptedIds: string[]; boss: { hp: number } }
    const secondBody = (await second.json()) as { acceptedIds: string[]; boss: { hp: number } }
    expect(firstBody.acceptedIds).toEqual(['dup-1'])
    expect(secondBody.acceptedIds).toEqual(['dup-1'])
    expect(secondBody.boss.hp).toBe(800) // 200だけ減った状態のまま
  })

  it('境界系(J-49): 前週ボス宛のpayloadは前週DOへ正しくルーティングされ、レスポンスのbossは今週のまま', async () => {
    const deviceToken = await registerDevice()
    const current = isoWeekInfo(Date.now())
    const previous = previousWeekInfo(current)
    const previousBossId = bossIdFor(previous)
    const previousStub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
    await runInDurableObject(previousStub, (instance: RaidBossDO) => {
      instance.init({
        bossId: previousBossId,
        profile: bossProfileForWeek(previous.isoWeek),
        maxHp: 2000,
        startAt: previous.weekStartAt,
        endAt: weekEndAt(previous.weekStartAt),
      })
    })

    const { bossId: currentBossId } = await initCurrentBoss(1000)

    const res = await SELF.fetch(
      syncRequest(deviceToken, [
        {
          attemptId: 'late-arrival',
          bossId: previousBossId,
          damage: 500,
          questionCount: 1,
          answeredAt: previous.weekStartAt + HOUR_MS,
        },
      ]),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      acceptedIds: string[]
      boss: { bossId: string; hp: number }
    }
    expect(body.acceptedIds).toEqual(['late-arrival'])
    // レスポンスのbossは今週のもの(前週ダメージの影響を受けない)
    expect(body.boss.bossId).toBe(currentBossId)
    expect(body.boss.hp).toBe(1000)

    // 前週DO側は実際にダメージが加算されていることを直接確認
    const previousState = await runInDurableObject(previousStub, (instance: RaidBossDO) =>
      instance.getBossState(previous.weekStartAt + HOUR_MS),
    )
    expect(previousState?.hp).toBe(1500)
  })
})
