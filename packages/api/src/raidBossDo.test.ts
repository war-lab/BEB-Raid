import { env, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { memberKey } from './env'
import type { RaidBossDO } from './raidBossDo'

const HOUR_MS = 60 * 60 * 1000
const START_AT = Date.UTC(2026, 6, 13) // 月曜0時UTC
const END_AT = START_AT + 4 * 24 * HOUR_MS + 15 * HOUR_MS // 金曜15時UTC

function freshStub(suffix: string) {
  const id = env.RAID_BOSS.idFromName(`boss-test-${suffix}`)
  return env.RAID_BOSS.get(id)
}

async function initBoss(
  stub: ReturnType<typeof freshStub>,
  overrides: Partial<{ bossId: string; maxHp: number; startAt: number; endAt: number }> = {},
) {
  await runInDurableObject(stub, async (instance: RaidBossDO) => {
    instance.init({
      bossId: overrides.bossId ?? 'boss-test',
      profile: { name: 'テストボス', flavor: 'テスト用' },
      maxHp: overrides.maxHp ?? 1000,
      startAt: overrides.startAt ?? START_AT,
      endAt: overrides.endAt ?? END_AT,
    })
  })
}

describe('RaidBossDO', () => {
  it('ダメージを加算するとHPが減る', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })

    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 300, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )

    expect(result.acceptedIds).toEqual(['a-1'])
    expect(result.boss.hp).toBe(700)
    expect(result.boss.status).toBe('active')
  })

  it('HPが0以下になると討伐成立し、以降のダメージは加算されない', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 500 })

    const receivedAt = START_AT + HOUR_MS
    const killShot = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 600, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )
    expect(killShot.boss.hp).toBe(0)
    expect(killShot.boss.status).toBe('defeated')

    const afterDefeat = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-2',
        [{ attemptId: 'a-2', damage: 100, questionCount: 1, answeredAt: receivedAt + HOUR_MS }],
        receivedAt + HOUR_MS,
      ),
    )
    // acceptedIdsには含めてクライアント側キューは掃除させるが、加算はしない
    expect(afterDefeat.acceptedIds).toEqual(['a-2'])
    expect(afterDefeat.boss.hp).toBe(0)
    expect(afterDefeat.boss.myDamage).toBe(0)
  })

  it('同一attemptIdの二重送信は無視され、二重計上されない（冪等）', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })

    const receivedAt = START_AT + HOUR_MS
    const entries = [{ attemptId: 'dup-1', damage: 100, questionCount: 1, answeredAt: receivedAt }]

    const first = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage('device-1', entries, receivedAt),
    )
    const second = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage('device-1', entries, receivedAt + HOUR_MS),
    )

    expect(first.acceptedIds).toEqual(['dup-1'])
    expect(second.acceptedIds).toEqual(['dup-1'])
    expect(second.boss.hp).toBe(900) // 100だけ減った状態のまま(二重減算されない)
  })

  it('answeredAtがボス期間外のダメージは加算されない（J-49）が、acceptedIdsには含まれる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const beforePeriod = START_AT - HOUR_MS
    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'out-of-period', damage: 500, questionCount: 1, answeredAt: beforePeriod }],
        receivedAt,
      ),
    )

    expect(result.acceptedIds).toEqual(['out-of-period'])
    expect(result.boss.hp).toBe(1000) // 加算されていない
  })

  it('未来方向に大きくずれたansweredAtは受信時刻へクランプされる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const receivedAt = START_AT + HOUR_MS // 期間内
    const farFuture = receivedAt + 6 * 60 * 1000 // 6分後(5分クランプの閾値を超える)
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'future-1', damage: 200, questionCount: 1, answeredAt: farFuture }],
        receivedAt,
      ),
    )

    // クランプ後のanswered Atはreceived At(期間内)になるため加算される
    expect(result.boss.hp).toBe(800)
  })

  it('受信時刻が期限後（期限切れ）の場合は加算されない', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const afterDeadline = END_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'late-1', damage: 200, questionCount: 1, answeredAt: END_AT - HOUR_MS }],
        afterDeadline,
      ),
    )

    expect(result.acceptedIds).toEqual(['late-1'])
    expect(result.boss.hp).toBe(1000)
    expect(result.boss.status).toBe('closed')
  })

  it('contributionsにKVの表示名が反映される', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })
    await env.MEMBERS.put(
      memberKey('device-1'),
      JSON.stringify({ displayName: '花子', dailyGoal: 'normal', registeredAt: 0 }),
    )

    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 100, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )

    expect(result.boss.contributions).toEqual([{ displayName: '花子', damage: 100 }])
    expect(result.boss.participantCount).toBe(1)
  })

  it('未初期化のボスへsyncDamageすると例外になる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await expect(
      runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.syncDamage('device-1', [], START_AT),
      ),
    ).rejects.toThrow()
  })

  it('getBossStateは未初期化のときundefinedを返す', async () => {
    const stub = freshStub(crypto.randomUUID())
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(START_AT),
    )
    expect(state).toBeUndefined()
  })
})
