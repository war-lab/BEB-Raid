// T-96完了条件のテスト（正本: docs/17_M3実装計画.md 3.6節）:
// - OFF（isConfigured=false / raidSyncEnabled=false / 未参加）のいずれかでfetchが一切呼ばれない
// - 送信成功で受理済み（acceptedIds）のみpendingSyncから削除され、raidStateが更新される
// - fetch失敗・部分受理でpendingSyncが失われない（保持されたまま次回に回る）
import 'fake-indexeddb/auto'
import type { DamageSyncPayload, RaidBossState, RaidSyncResponse } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { resetRaidSyncStoreForTest, useRaidSyncStore } from '../store/raidSyncStore'
import { syncRaidDamage } from './raidSync'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from './settingsKeys'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`raid-sync-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  resetRaidSyncStoreForTest()
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
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  createBattleRoom = vi.fn(async () => 'ABCD')

  constructor(configured = true) {
    this.isConfigured = () => configured
  }
}

/** 参加中のraidStateを仕込む。bossIdは既定でレスポンス（BOSS）と同一週にする */
async function seedJoinedRaidState(db: BebRaidDatabase, bossId = BOSS.bossId) {
  await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
  await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
  await db.raidState.put({
    id: RAID_STATE_ID,
    bossId,
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

  it('未登録（raidRegisteredAt無し）ならsyncDamageが呼ばれない（T-115: 認証必須APIへの誤アクセス防止）', async () => {
    const db = newDb()
    // raidRegisteredAtだけ与えず、それ以外（raidSyncEnabled・joined）は満たしておく
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: BOSS.bossId,
      profileJson: '{}',
      hp: 4800,
      maxHp: 5000,
      myDamage: 200,
      joined: true,
      startAt: 0,
      endAt: 1000,
      lastSyncedAt: 500,
    })
    await addPendingRaidDamage(db, 'a-1')
    const raidApi = new FakeRaidApi(true)

    const result = await syncRaidDamage(db, raidApi)

    expect(raidApi.syncDamage).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
    expect(await db.pendingSync.count()).toBe(1)
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

  it('週替わり（レスポンスのbossIdが端末の知るbossIdと別）ならjoinedをfalseへリセットする', async () => {
    // joinedを引き継ぐと、S5の参加ボタン（=参加の定義。docs/17）を経ないまま
    // 新ボスへ自動参加してしまうバグの回帰テスト
    const db = newDb()
    await seedJoinedRaidState(db, 'boss-2026-W29') // 先週のボスに参加中
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: [], boss: BOSS }) // W30が返る

    await syncRaidDamage(db, raidApi)

    const raidState = await db.raidState.get(RAID_STATE_ID)
    expect(raidState?.bossId).toBe(BOSS.bossId)
    expect(raidState?.joined).toBe(false)
  })

  it('同一bossIdの同期ではjoined=trueが維持される', async () => {
    const db = newDb()
    await seedJoinedRaidState(db) // BOSSと同一bossId
    const raidApi = new FakeRaidApi(true)

    await syncRaidDamage(db, raidApi)

    expect((await db.raidState.get(RAID_STATE_ID))?.joined).toBe(true)
  })

  it('payloadJsonが破損したレコードは警告して削除し、残りの送信を続行する（キューの恒久的な詰まりを防ぐ）', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const corruptedId = await db.pendingSync.add({
      kind: 'raidDamage',
      payloadJson: '{broken json',
      createdAt: 1000,
    })
    const validId = await addPendingRaidDamage(db, 'a-1')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: ['a-1'], boss: BOSS })

    const result = await syncRaidDamage(db, raidApi)

    expect(result.ok).toBe(true)
    // 破損レコードは削除され、正常レコードは送信されて受理・削除される
    expect(await db.pendingSync.get(corruptedId)).toBeUndefined()
    expect(await db.pendingSync.get(validId!)).toBeUndefined()
    const sentPayloads = raidApi.syncDamage.mock.calls[0]![0]
    expect(sentPayloads.map((p) => p.attemptId)).toEqual(['a-1'])
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
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

describe('syncRaidDamage: 戻り値とraidSyncStore（M3・T-98の手動同期ボタン・T-103の画面追従が使う）', () => {
  it('成功時は{ok: true, boss}を返す（T-104: RaidScreenが追加fetchなしに使う）', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)

    const result = await syncRaidDamage(db, raidApi)

    expect(result.ok).toBe(true)
    expect(result.boss).toEqual(BOSS)
  })

  it('isConfigured=falseで即returnした場合は{ok: false}を返し、ストアも更新されない（未試行）', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(false)

    const result = await syncRaidDamage(db, raidApi)
    expect(result.ok).toBe(false)
    expect(result.boss).toBeUndefined()
    expect(useRaidSyncStore.getState().syncCount).toBe(0)
  })

  it('通信失敗（network）は{ok: false}を返すが、lastUnauthorizedはtrueにしない。syncCountは+1される', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockRejectedValueOnce(new Error('network error'))

    const result = await syncRaidDamage(db, raidApi)

    expect(result.ok).toBe(false)
    expect(useRaidSyncStore.getState().lastUnauthorized).toBe(false)
    expect(useRaidSyncStore.getState().lastFailed).toBe(true)
    expect(useRaidSyncStore.getState().syncCount).toBe(1)
  })

  it('401（RaidApiError kind=unauthorized）はlastUnauthorizedをtrueにし、次回成功時にfalseへ戻る', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockRejectedValueOnce(new RaidApiError('unauthorized', '401'))

    const failed = await syncRaidDamage(db, raidApi)
    expect(failed.ok).toBe(false)
    expect(useRaidSyncStore.getState().lastUnauthorized).toBe(true)
    expect(useRaidSyncStore.getState().syncCount).toBe(1)

    const succeeded = await syncRaidDamage(db, raidApi)
    expect(succeeded.ok).toBe(true)
    expect(useRaidSyncStore.getState().lastUnauthorized).toBe(false)
    expect(useRaidSyncStore.getState().lastFailed).toBe(false)
    expect(useRaidSyncStore.getState().syncCount).toBe(2)
  })
})

describe('syncRaidDamage: レイド系バッジの導出（M3・T-102）', () => {
  const DEFEATED_BOSS: RaidBossState = { ...BOSS, status: 'defeated', myDamage: 300 }

  it('討伐確定（status=defeated）かつmyDamage>0でraid-first-clear・raid-clear:<bossId>が書き込まれる', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: [], boss: DEFEATED_BOSS })

    await syncRaidDamage(db, raidApi)

    const badges = await db.badges.toArray()
    expect(badges.map((b) => b.badgeId).sort()).toEqual(
      ['raid-clear:boss-2026-W30', 'raid-first-clear'].sort(),
    )
  })

  it('myDamage=0（貢献なし）ではバッジが書き込まれない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({
      acceptedIds: [],
      boss: { ...DEFEATED_BOSS, myDamage: 0 },
    })

    await syncRaidDamage(db, raidApi)

    expect(await db.badges.count()).toBe(0)
  })

  it('status=activeではバッジが書き込まれない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValueOnce({ acceptedIds: [], boss: BOSS })

    await syncRaidDamage(db, raidApi)

    expect(await db.badges.count()).toBe(0)
  })

  it('再受信（同一bossIdの討伐済みを2回受信）してもearnedAtは上書きされない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage.mockResolvedValue({ acceptedIds: [], boss: DEFEATED_BOSS })

    await syncRaidDamage(db, raidApi)
    const firstEarnedAt = (await db.badges.get('raid-first-clear'))?.earnedAt

    await syncRaidDamage(db, raidApi)
    const secondEarnedAt = (await db.badges.get('raid-first-clear'))?.earnedAt

    expect(await db.badges.count()).toBe(2)
    expect(secondEarnedAt).toBe(firstEarnedAt)
  })
})
