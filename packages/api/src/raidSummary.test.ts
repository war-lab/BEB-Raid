// 週次サマリのKV書込・GET /raid/summary（正本: docs/22 3.8節、docs/21 T-131行）。
// 週次cron（generateWeeklyBoss）のクローズ処理で前週ボスのサマリが個人別データ非含有で
// KVへ保存され、管理用エンドポイントで取得できることを検証する
import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { memberKey } from './env'
import { ghostKey, type GhostRecord } from './ghostStore'
import type { RaidBossDO } from './raidBossDo'
import { raidSummaryKey } from './raidSummaryStore'
import { bossIdFor, isoWeekInfo, previousWeekInfo } from './raidWeek'
import { generateWeeklyBoss } from './scheduled'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VALID_INVITE_CODE = 'test-invite-code'

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

interface RaidSummaryJson {
  bossId: string
  bossType: string
  maxHp: number
  remainingHp: number
  defeated: boolean
  defeatedAt: number | null
  participantCount: number
}

// KV(MEMBERS)・DOは全テストで共有されるため、リセットしないと先行テストの状態が
// 後続テストの週次サマリ・件数を汚染する
afterEach(async () => {
  await reset()
})

describe('週次サマリのKV書込（generateWeeklyBossのクローズ処理）', () => {
  it('前週ボスが未討伐なら defeated=false・defeatedAt=null・participantCountが正しく書かれる', async () => {
    const week1 = Date.UTC(2027, 5, 7) // 月曜
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '太郎', dailyGoal: 'normal', registeredAt: 0 }),
    )

    await generateWeeklyBoss(env, week1)
    const week1BossId = bossIdFor(isoWeekInfo(week1))
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))
    // 討伐に満たないダメージのみ与える
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'participant-a',
        [{ attemptId: 'p-1', damage: 1, questionCount: 1, answeredAt: week1 + HOUR_MS }],
        week1 + HOUR_MS,
      ),
    )

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const raw = await env.MEMBERS.get(raidSummaryKey(week1BossId))
    expect(raw).not.toBeNull()
    const summary = JSON.parse(raw!) as RaidSummaryJson
    expect(summary.bossId).toBe(week1BossId)
    expect(summary.bossType).toBe('synthetic')
    expect(summary.defeated).toBe(false)
    expect(summary.defeatedAt).toBeNull()
    expect(summary.participantCount).toBe(1)
    expect(summary.remainingHp).toBe(summary.maxHp - 1)
    // 個人別データ（displayName・deviceToken等）を一切含まない
    expect(Object.keys(summary).sort()).toEqual(
      [
        'bossId',
        'bossType',
        'defeated',
        'defeatedAt',
        'maxHp',
        'participantCount',
        'remainingHp',
      ].sort(),
    )
  })

  it('前週ボスが討伐済みなら defeated=true・defeatedAtが記録される', async () => {
    const week1 = Date.UTC(2027, 5, 14)
    const week1BossId = bossIdFor(isoWeekInfo(week1))
    await generateWeeklyBoss(env, week1)
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))
    const state = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.getBossState(week1),
    )
    const defeatedAt = week1 + HOUR_MS
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'killer',
        [{ attemptId: 'kill-1', damage: state!.maxHp, questionCount: 1, answeredAt: defeatedAt }],
        defeatedAt,
      ),
    )

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const raw = await env.MEMBERS.get(raidSummaryKey(week1BossId))
    const summary = JSON.parse(raw!) as RaidSummaryJson
    expect(summary.defeated).toBe(true)
    expect(summary.defeatedAt).toBe(defeatedAt)
    expect(summary.remainingHp).toBe(0)
  })

  it('ghost週のサマリはbossType=ghostで書かれる', async () => {
    const week1 = Date.UTC(2027, 5, 21)
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    const record: GhostRecord = {
      displayName: 'ゴースト花子',
      consent: true,
      records: [{ questionId: 'q-1', correct: true }],
      createdAt: 100,
      defeatedCount: 0,
      lastUsedBossId: null,
    }
    await env.MEMBERS.put(ghostKey(deviceToken), JSON.stringify(record))

    await generateWeeklyBoss(env, week1)
    const week1BossId = bossIdFor(isoWeekInfo(week1))

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const raw = await env.MEMBERS.get(raidSummaryKey(week1BossId))
    const summary = JSON.parse(raw!) as RaidSummaryJson
    expect(summary.bossType).toBe('ghost')
  })

  it('前週ボスが未初期化（サービス開始直後）なら例外を投げず、サマリも書かれない', async () => {
    const week1 = Date.UTC(2027, 6, 5)
    const previousBossId = bossIdFor(previousWeekInfo(isoWeekInfo(week1)))

    await expect(generateWeeklyBoss(env, week1)).resolves.not.toThrow()
    expect(await env.MEMBERS.get(raidSummaryKey(previousBossId))).toBeNull()
  })

  it('同じ週内でcronが2回実行されてもサマリ書込は冪等（値が変わらない）', async () => {
    const week1 = Date.UTC(2027, 6, 12)
    const week1BossId = bossIdFor(isoWeekInfo(week1))
    await generateWeeklyBoss(env, week1)
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'participant-a',
        [{ attemptId: 'p-1', damage: 500, questionCount: 1, answeredAt: week1 + HOUR_MS }],
        week1 + HOUR_MS,
      ),
    )

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)
    const firstRaw = await env.MEMBERS.get(raidSummaryKey(week1BossId))

    await generateWeeklyBoss(env, week2 + HOUR_MS) // 同じ週内の再実行
    const secondRaw = await env.MEMBERS.get(raidSummaryKey(week1BossId))

    expect(secondRaw).toEqual(firstRaw)
  })
})

describe('GET /raid/summary', () => {
  it('認証なしは401', async () => {
    const res = await SELF.fetch('https://example.com/raid/summary')
    expect(res.status).toBe(401)
  })

  it('保存済みサマリを配列で返す（クライアントは呼ばない管理用途）', async () => {
    const week1 = Date.UTC(2027, 6, 19)
    const week1BossId = bossIdFor(isoWeekInfo(week1))
    await generateWeeklyBoss(env, week1)
    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const viewerToken = await registerDevice()
    const res = await SELF.fetch('https://example.com/raid/summary', {
      headers: { Authorization: `Bearer ${viewerToken}` },
    })
    expect(res.status).toBe(200)
    const summaries = (await res.json()) as RaidSummaryJson[]
    expect(summaries.some((s) => s.bossId === week1BossId)).toBe(true)
  })

  // T-244・29のQ-23: env.MEMBERS.list({prefix: 'raidSummary:'})は1ページ最大1,000件までしか
  // 返さない。週次サマリは毎週1件ずつ蓄積される運用データのため、長期運用で1,000件を超えると
  // cursorを追わない実装では古いサマリが無言で欠落していた
  it('サマリが1,000件を超えても全件返す（KV.listのcursor対応）', async () => {
    const SUMMARY_COUNT = 1005
    const puts: Promise<unknown>[] = []
    for (let i = 0; i < SUMMARY_COUNT; i++) {
      const bossId = `boss-2020-W${String((i % 52) + 1).padStart(2, '0')}-bulk-${i}`
      puts.push(
        env.MEMBERS.put(
          raidSummaryKey(bossId),
          JSON.stringify({
            bossId,
            bossType: 'synthetic',
            maxHp: 1000,
            remainingHp: 1000,
            defeated: false,
            defeatedAt: null,
            participantCount: 0,
          } satisfies RaidSummaryJson),
        ),
      )
    }
    await Promise.all(puts)

    const viewerToken = await registerDevice()
    const res = await SELF.fetch('https://example.com/raid/summary', {
      headers: { Authorization: `Bearer ${viewerToken}` },
    })
    expect(res.status).toBe(200)
    const summaries = (await res.json()) as RaidSummaryJson[]
    expect(summaries.length).toBe(SUMMARY_COUNT)
  }, 30_000)

  it('サマリが1件も無ければ空配列を返す', async () => {
    const viewerToken = await registerDevice()
    const res = await SELF.fetch('https://example.com/raid/summary', {
      headers: { Authorization: `Bearer ${viewerToken}` },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })
})
