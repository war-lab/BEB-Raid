// 週次ボス生成（正本: docs/17_M3実装計画.md 3.4節）。
// Cron Trigger（月曜0:00 UTC=JST9:00）で発火する想定。
// ①前週ボスの実績からmembersのemaDailyDamageを更新 → ②更新後の値からHPを算出 → ③当週ボスDOを初期化（冪等）

import { bossProfileForWeek } from './bossProfiles'
import type { Env, MemberRecord } from './env'
import { memberKey } from './env'
import {
  BOSS_HP_FACTOR,
  DAILY_GOAL_QUESTIONS,
  DAMAGE_PER_QUESTION,
  EMA_WEIGHT,
  MIN_BOSS_HP,
  RAID_DAYS,
} from './raidConfig'
import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'

const MEMBER_KEY_PREFIX = 'member:'

function estimatedDailyDamage(member: MemberRecord): number {
  return member.emaDailyDamage ?? DAILY_GOAL_QUESTIONS[member.dailyGoal] * DAMAGE_PER_QUESTION
}

export async function generateWeeklyBoss(env: Env, now: number): Promise<void> {
  const current = isoWeekInfo(now)
  const bossId = bossIdFor(current)
  const startAt = now
  const endAt = weekEndAt(current.weekStartAt)

  const previous = previousWeekInfo(current)
  const previousBossId = bossIdFor(previous)
  const previousStub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
  const previousDamageByToken = await previousStub.totalDamageByDeviceToken()

  const memberKeys = await env.MEMBERS.list({ prefix: MEMBER_KEY_PREFIX })

  // ①前週実績からemaDailyDamageを更新する
  for (const key of memberKeys.keys) {
    const raw = await env.MEMBERS.get(key.name)
    if (!raw) continue
    const deviceToken = key.name.slice(MEMBER_KEY_PREFIX.length)
    const member = JSON.parse(raw) as MemberRecord
    const previousDamage = previousDamageByToken[deviceToken] ?? 0
    const previousDaily = previousDamage / RAID_DAYS
    const updatedEma =
      member.emaDailyDamage === undefined
        ? previousDaily
        : EMA_WEIGHT * previousDaily + (1 - EMA_WEIGHT) * member.emaDailyDamage
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ ...member, emaDailyDamage: updatedEma }),
    )
  }

  // ②更新後の値からHPを算出する
  const refreshed = await env.MEMBERS.list({ prefix: MEMBER_KEY_PREFIX })
  let totalDailyDamage = 0
  for (const key of refreshed.keys) {
    const raw = await env.MEMBERS.get(key.name)
    if (!raw) continue
    totalDailyDamage += estimatedDailyDamage(JSON.parse(raw) as MemberRecord)
  }
  const maxHp = Math.max(MIN_BOSS_HP, Math.round(totalDailyDamage * RAID_DAYS * BOSS_HP_FACTOR))

  // ③当週ボスDOを初期化する（既に存在すれば何もしない）
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
  await stub.init({
    bossId,
    profile: bossProfileForWeek(current.isoWeek),
    maxHp,
    startAt,
    endAt,
  })
}
