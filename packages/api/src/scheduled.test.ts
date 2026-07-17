import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import { memberKey, type MemberRecord } from './env'
import { MIN_BOSS_HP } from './raidConfig'
import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'
import { generateWeeklyBoss } from './scheduled'
import type { RaidBossDO } from './raidBossDo'

const HOUR_MS = 60 * 60 * 1000

async function seedPreviousWeekDamage(
  currentMondayEpoch: number,
  deviceToken: string,
  totalDamage: number,
) {
  const current = isoWeekInfo(currentMondayEpoch)
  const previous = previousWeekInfo(current)
  const previousBossId = bossIdFor(previous)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
  const startAt = previous.weekStartAt
  const endAt = weekEndAt(previous.weekStartAt)

  await runInDurableObject(stub, (instance: RaidBossDO) => {
    instance.init({
      bossId: previousBossId,
      profile: bossProfileForWeek(previous.isoWeek),
      maxHp: 999_999,
      startAt,
      endAt,
    })
  })
  await runInDurableObject(stub, (instance: RaidBossDO) =>
    instance.syncDamage(
      deviceToken,
      [
        {
          attemptId: `seed-${deviceToken}`,
          damage: totalDamage,
          questionCount: 1,
          answeredAt: startAt + HOUR_MS,
        },
      ],
      startAt + HOUR_MS,
    ),
  )
}

describe('generateWeeklyBoss', () => {
  it('前週実績が無いメンバーはemaDailyDamage=0になり、HPは下限(MIN_BOSS_HP)まで下がる', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 4) // 適当な月曜（他テストと衝突しない週）
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '新規太郎', dailyGoal: 'normal', registeredAt: 0 }),
    )

    await generateWeeklyBoss(env, currentMondayEpoch)

    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    expect(updated.emaDailyDamage).toBe(0)

    const current = isoWeekInfo(currentMondayEpoch)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )
    expect(state?.maxHp).toBe(MIN_BOSS_HP)
    expect(state?.name).toBe(bossProfileForWeek(current.isoWeek).name)
    expect(state?.startAt).toBe(currentMondayEpoch)
    expect(state?.endAt).toBe(weekEndAt(current.weekStartAt))
  })

  it('前週実績があるメンバーはemaDailyDamageが実績値(初回=前週日次そのまま)になり、HPがそれを反映する', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 11) // 前のテストと別の週
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '活動太郎', dailyGoal: 'normal', registeredAt: 0 }),
    )
    // 前週(5日換算)で合計20000ダメージ稼いだ実績を用意 → 前週日次 = 20000/5 = 4000
    await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 20_000)

    await generateWeeklyBoss(env, currentMondayEpoch)

    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    expect(updated.emaDailyDamage).toBe(4000)

    const current = isoWeekInfo(currentMondayEpoch)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )
    // maxHp = round(4000 × 5日 × 0.85) = 17000 (MIN_BOSS_HPを上回るので下限は使われない)
    expect(state?.maxHp).toBe(17_000)
    expect(state?.maxHp).toBeGreaterThan(MIN_BOSS_HP)
  })

  it('同じ週に2回実行しても当週ボスは初期化済みのまま変化しない（冪等）', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 18) // 別の週
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '二回太郎', dailyGoal: 'heavy', registeredAt: 0 }),
    )

    await generateWeeklyBoss(env, currentMondayEpoch)
    const current = isoWeekInfo(currentMondayEpoch)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const firstState = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )

    // 2回目実行（EMA更新自体は起きるが、ボスDOのinitは冪等なので状態は変わらない）
    await generateWeeklyBoss(env, currentMondayEpoch + HOUR_MS)
    const secondState = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )

    expect(secondState?.maxHp).toBe(firstState?.maxHp)
    expect(secondState?.startAt).toBe(firstState?.startAt)
  })
})
