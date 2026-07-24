// ゴースト週次組込テスト（正本: docs/22 3.3節、docs/21 T-127行）。
// 週次cron（generateWeeklyBoss）へのゴースト選定・defense変換・defeatedCount加算・
// クールダウン・撤回スキップの分岐と、GET /raid/currentでのdefense配信を検証する
import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import { ghostKey, type GhostRecord } from './ghostStore'
import { GHOST_MULTIPLIER_SOLID, GHOST_MULTIPLIER_WEAK } from './raidConfig'
import type { RaidBossDO } from './raidBossDo'
import { bossIdFor, isoWeekInfo, previousWeekInfo } from './raidWeek'
import { generateWeeklyBoss } from './scheduled'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const VALID_INVITE_CODE = 'test-invite-code'

async function registerDevice(displayName = '太郎'): Promise<string> {
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

async function seedGhostRecord(
  deviceToken: string,
  overrides: Partial<GhostRecord> = {},
): Promise<void> {
  const record: GhostRecord = {
    displayName: 'ゴースト花子',
    consent: true,
    records: [
      { questionId: 'q-1', correct: true },
      { questionId: 'q-2', correct: false },
    ],
    createdAt: 0,
    defeatedCount: 0,
    lastUsedBossId: null,
    ...overrides,
  }
  await env.MEMBERS.put(ghostKey(deviceToken), JSON.stringify(record))
}

// KV(MEMBERS)・DOは全テストで共有されるため、リセットしないと先行テストの
// ghost記録・ボス状態が後続テストの選定結果を汚染する
afterEach(async () => {
  await reset()
})

describe('generateWeeklyBoss（ゴースト週の生成）', () => {
  it('承認済みゴースト記録があればghost週として生成される（defense変換・HP・ボス名）', async () => {
    const monday = Date.UTC(2027, 2, 1) // 2027-03-01は月曜
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { createdAt: 100 })

    await generateWeeklyBoss(env, monday)

    const current = isoWeekInfo(monday)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(monday),
    )

    expect(state?.bossType).toBe('ghost')
    expect(state?.name).toBe('ゴースト・ゴースト花子')
    expect(state?.defense).toEqual([
      { questionId: 'q-1', multiplier: GHOST_MULTIPLIER_SOLID },
      { questionId: 'q-2', multiplier: GHOST_MULTIPLIER_WEAK },
    ])
    expect(state?.ghost).toEqual({ displayName: 'ゴースト花子', defeatedCount: 0 })
    expect(state?.maxHp).toBeGreaterThan(0)

    // 選定した記録のlastUsedBossIdが今回のbossIdへ更新される
    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const updated = JSON.parse(raw!) as GhostRecord
    expect(updated.lastUsedBossId).toBe(bossId)
  })

  it('GET /raid/current でbossType・defense・ghostが配信される', async () => {
    const ghostToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(ghostToken, { createdAt: 100 })
    // GET /raid/currentはDate.now()基準でボスを解決するため、実際の「今週」に生成する
    await generateWeeklyBoss(env, Date.now())

    const viewerToken = await registerDevice()
    const res = await SELF.fetch('https://example.com/raid/current', {
      headers: { Authorization: `Bearer ${viewerToken}` },
    })
    expect(res.status).toBe(200)
    const boss = (await res.json()) as {
      bossType: string
      defense: { questionId: string; multiplier: number }[]
      ghost: { displayName: string; defeatedCount: number }
    }
    expect(boss.bossType).toBe('ghost')
    expect(boss.defense).toEqual([
      { questionId: 'q-1', multiplier: GHOST_MULTIPLIER_SOLID },
      { questionId: 'q-2', multiplier: GHOST_MULTIPLIER_WEAK },
    ])
    expect(boss.ghost).toEqual({ displayName: 'ゴースト花子', defeatedCount: 0 })
  })

  it('承認済みゴースト記録が無ければ従来どおりsyntheticになる（回帰）', async () => {
    const monday = Date.UTC(2027, 2, 15)
    await generateWeeklyBoss(env, monday)

    const current = isoWeekInfo(monday)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(monday),
    )
    expect(state?.bossType).toBe('synthetic')
    expect(state?.defense).toBeUndefined()
    expect(state?.ghost).toBeUndefined()
    expect(state?.name).toBe(bossProfileForWeek(current.isoWeek).name)
  })

  it('直近2週以内に使われた記録はクールダウンで除外され、他に候補が無ければsyntheticになる', async () => {
    const monday = Date.UTC(2027, 2, 22)
    const current = isoWeekInfo(monday)
    const previousBossId = bossIdFor(previousWeekInfo(current))
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { lastUsedBossId: previousBossId })

    await generateWeeklyBoss(env, monday)

    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(monday),
    )
    expect(state?.bossType).toBe('synthetic')
  })

  it('複数の承認済み記録がある場合、createdAtが最古のものが選ばれる', async () => {
    const monday = Date.UTC(2027, 3, 5)
    const older = `ghost-device-${crypto.randomUUID()}`
    const newer = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(older, { displayName: '古参ゴースト', createdAt: 100 })
    await seedGhostRecord(newer, { displayName: '新参ゴースト', createdAt: 200 })

    await generateWeeklyBoss(env, monday)

    const current = isoWeekInfo(monday)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(monday),
    )
    expect(state?.ghost?.displayName).toBe('古参ゴースト')
  })
})

describe('generateWeeklyBoss（ゴースト週クローズ処理・defeatedCount）', () => {
  it('前週がghost週で討伐成立していれば、翌週cronでdefeatedCountが+1される', async () => {
    const week1 = Date.UTC(2027, 3, 12) // 月曜
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { createdAt: 100, defeatedCount: 3 })

    await generateWeeklyBoss(env, week1)
    const week1BossId = bossIdFor(isoWeekInfo(week1))
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))

    const week1State = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.getBossState(week1),
    )
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'killer-device',
        [
          {
            attemptId: 'kill-1',
            damage: week1State!.maxHp,
            questionCount: 1,
            answeredAt: week1 + HOUR_MS,
          },
        ],
        week1 + HOUR_MS,
      ),
    )
    const afterKill = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.getBossState(week1 + HOUR_MS),
    )
    expect(afterKill?.status).toBe('defeated')

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const updated = JSON.parse(raw!) as GhostRecord
    expect(updated.defeatedCount).toBe(4)
  })

  it('討伐不成立ならdefeatedCountは加算されない', async () => {
    const week1 = Date.UTC(2027, 3, 26)
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { createdAt: 100, defeatedCount: 1 })

    await generateWeeklyBoss(env, week1)
    // ダメージを与えない=討伐不成立のまま

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const updated = JSON.parse(raw!) as GhostRecord
    expect(updated.defeatedCount).toBe(1)
  })

  it('討伐成立していても記録が撤回済み（KVに無い）ならdefeatedCount加算はスキップされる', async () => {
    const week1 = Date.UTC(2027, 4, 3)
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { createdAt: 100 })

    await generateWeeklyBoss(env, week1)
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(isoWeekInfo(week1))))
    const week1State = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.getBossState(week1),
    )
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'killer-device',
        [
          {
            attemptId: 'kill-1',
            damage: week1State!.maxHp,
            questionCount: 1,
            answeredAt: week1 + HOUR_MS,
          },
        ],
        week1 + HOUR_MS,
      ),
    )

    // 撤回（DELETE /ghosts/ownと同じ効果）: KVから記録を削除する
    await env.MEMBERS.delete(ghostKey(deviceToken))

    const week2 = week1 + 7 * DAY_MS
    await expect(generateWeeklyBoss(env, week2)).resolves.not.toThrow()
    // 撤回済みなので加算対象レコード自体が存在しない（再作成もされない）
    expect(await env.MEMBERS.get(ghostKey(deviceToken))).toBeNull()
  })

  it('同じ週内でcronが2回実行されてもdefeatedCountは二重加算されない（冪等）', async () => {
    const week1 = Date.UTC(2027, 4, 10)
    const deviceToken = `ghost-device-${crypto.randomUUID()}`
    await seedGhostRecord(deviceToken, { createdAt: 100, defeatedCount: 0 })

    await generateWeeklyBoss(env, week1)
    const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(isoWeekInfo(week1))))
    const week1State = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.getBossState(week1),
    )
    await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'killer-device',
        [
          {
            attemptId: 'kill-1',
            damage: week1State!.maxHp,
            questionCount: 1,
            answeredAt: week1 + HOUR_MS,
          },
        ],
        week1 + HOUR_MS,
      ),
    )

    const week2 = week1 + 7 * DAY_MS
    await generateWeeklyBoss(env, week2)
    await generateWeeklyBoss(env, week2 + HOUR_MS) // 同じ週内の再実行（cron再試行を想定）

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const updated = JSON.parse(raw!) as GhostRecord
    expect(updated.defeatedCount).toBe(1)
  })
})
