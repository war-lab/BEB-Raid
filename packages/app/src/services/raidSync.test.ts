// T-96完了条件のテスト（正本: docs/17_M3実装計画.md 3.6節）:
// - OFF（isConfigured=false / raidSyncEnabled=false / 未参加）のいずれかでfetchが一切呼ばれない
// - 送信成功で受理済み（acceptedIds）のみpendingSyncから削除され、raidStateが更新される
// - fetch失敗・部分受理でpendingSyncが失われない（保持されたまま次回に回る）
import 'fake-indexeddb/auto'
import type { DamageSyncPayload, RaidBossState, RaidSyncResponse } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import type { RaidApi } from '../platform'
import { syncRaidDamage } from './raidSync'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`raid-sync-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const BOSS: RaidBossState = {
  bossId: 'boss-2026-W30',
  name: 'テストボス',
  hp: 4200,
  maxHp: 5000,
  startAt: 1000,
  endAt: 2000,
  status: 'active',
  participantCount: 2,
  myDamage: 300,
  contributions: [],
}

class FakeRaidApi implements RaidApi {
  isConfigured: () => boolean
  syncDamage = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 型（mock.callsの引数型）を保つために宣言する
    async (payloads: DamageSyncPayload[]): Promise<RaidSyncResponse> => ({
      acceptedIds: [],
      boss: BOSS,
    }),
  )
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)

  constructor(configured = true) {
    this.isConfigured = () => configured
  }
}

async function seedJoinedRaidState(db: BebRaidDatabase) {
  await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
  await db.raidState.put({
    id: RAID_STATE_ID,
    bossId: 'boss-2026-W29',
    profileJson: '{}',
    hp: 4800,
    maxHp: 5000,
    myDamage: 200,
    joined: true,
    startAt: 0,
    endAt: 1000,
    lastSyncedAt: 500,
  })
}

async function addPendingRaidDamage(
  db: BebRaidDatabase,
  attemptId: string,
): Promise<number | undefined> {
  const payload: DamageSyncPayload = {
    attemptId,
    bossId: 'boss-2026-W30',
    damage: 100,
    questionCount: 1,
    answeredAt: 1500,
  }
  return db.pendingSync.add({
    kind: 'raidDamage',
    payloadJson: JSON.stringify(payload),
    createdAt: 1500,
  })
}

describe('syncRaidDamage: 縮退設計（OFF時は通信しない）', () => {
  it('isConfigured=falseならsyncDamageが呼ばれない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    await addPendingRaidDamage(db, 'a-1')
    const raidApi = new FakeRaidApi(false)

    await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).not.toHaveBeenCalled()
    expect(await db.pendingSync.count()).toBe(1)
  })

  it('raidSyncEnabled=false（既定）ならsyncDamageが呼ばれない', async () => {
    const db = newDb()
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: '{}',
      hp: 5000,
      maxHp: 5000,
      myDamage: 0,
      joined: true,
      startAt: 0,
      endAt: 1000,
      lastSyncedAt: 0,
    })
    await addPendingRaidDamage(db, 'a-1')
    const raidApi = new FakeRaidApi(true)

    await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).not.toHaveBeenCalled()
  })

  it('raidState.joined!==trueならsyncDamageが呼ばれない', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await addPendingRaidDamage(db, 'a-1')
    const raidApi = new FakeRaidApi(true)

    await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).not.toHaveBeenCalled()
  })
})

describe('syncRaidDamage: 正常系', () => {
  it('全件受理でpendingSyncが空になり、raidStateがbossから更新される', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const id1 = await addPendingRaidDamage(db, 'a-1')
    const id2 = await addPendingRaidDamage(db, 'a-2')
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: ['a-1', 'a-2'], boss: BOSS })

    await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).toHaveBeenCalledTimes(1)
    const sentPayloads = raidApi.syncDamage.mock.calls[0]![0]
    expect(sentPayloads.map((p) => p.attemptId).sort()).toEqual(['a-1', 'a-2'])
    expect(await db.pendingSync.get(id1!)).toBeUndefined()
    expect(await db.pendingSync.get(id2!)).toBeUndefined()

    const raidState = await db.raidState.get(RAID_STATE_ID)
    expect(raidState?.bossId).toBe(BOSS.bossId)
    expect(raidState?.hp).toBe(BOSS.hp)
    expect(raidState?.maxHp).toBe(BOSS.maxHp)
    expect(raidState?.myDamage).toBe(BOSS.myDamage)
    expect(raidState?.joined).toBe(true)
    expect(raidState?.lastSyncedAt).toBeGreaterThan(500)
  })

  it('部分受理: acceptedIdsに含まれる分だけpendingSyncから削除される', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const id1 = await addPendingRaidDamage(db, 'a-1')
    const id2 = await addPendingRaidDamage(db, 'a-2')
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: ['a-1'], boss: BOSS })

    await syncRaidDamage(db, raidApi)

    expect(await db.pendingSync.get(id1!)).toBeUndefined()
    expect(await db.pendingSync.get(id2!)).toBeDefined()
  })

  it('pendingSyncが空でも参加中なら同期は実行され、raidStateが最新化される', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)

    await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).toHaveBeenCalledWith([])
    const raidState = await db.raidState.get(RAID_STATE_ID)
    expect(raidState?.hp).toBe(BOSS.hp)
  })

  it('raidDamage以外のkindのpendingSyncには触れない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const otherId = await db.pendingSync.add({
      kind: 'other',
      payloadJson: '{}',
      createdAt: 1000,
    })
    const raidApi = new FakeRaidApi(true)

    await syncRaidDamage(db, raidApi)

    expect(await db.pendingSync.get(otherId)).toBeDefined()
  })
})

describe('syncRaidDamage: 失敗時はpendingSyncを失わない', () => {
  it('syncDamageが失敗（通信断・401等）してもpendingSyncは保持され、raidStateも変わらない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const id1 = await addPendingRaidDamage(db, 'a-1')
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockRejectedValueOnce(new Error('network error'))

    await syncRaidDamage(db, raidApi)

    expect(await db.pendingSync.get(id1!)).toBeDefined()
    const raidState = await db.raidState.get(RAID_STATE_ID)
    expect(raidState?.lastSyncedAt).toBe(500) // 更新されていない
    expect(raidState?.hp).toBe(4800) // BOSSの値(4200)に変わっていない
  })
})
