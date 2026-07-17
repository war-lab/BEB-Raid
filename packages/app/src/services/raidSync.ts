// レイドダメージの送信サービス（M3・T-96。正本: docs/17_M3実装計画.md 3.6節）。
//
// pendingSync（kind='raidDamage'）を読み、RaidApi.syncDamage経由でサーバーへ送る。
// 受理済み（acceptedIds）のレコードのみ削除し、レスポンスのbossでraidStateを更新する。
// 失敗時（通信断・サーバーエラー等）はpendingSyncを一切変更しない（キュー保持・次回自然再送）。
//
// 【縮退設計】isConfigured()=false または raidSyncEnabled=false または未参加（raidState.joined!==true）
// のいずれかなら、関数冒頭で即returnし通信・追加のDB読み取りを最小化する

import type { DamageSyncPayload } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import type { RaidApi } from '../platform'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

/** 1リクエストで送る上限（3.6節。超過分は次回のトリガーに回る） */
export const RAID_SYNC_BATCH_LIMIT = 200

export async function syncRaidDamage(db: BebRaidDatabase, raidApi: RaidApi): Promise<void> {
  if (!raidApi.isConfigured()) return

  const enabledSetting = await db.settings.get(RAID_SYNC_ENABLED_KEY)
  if (enabledSetting?.value !== true) return

  const raidState = await db.raidState.get(RAID_STATE_ID)
  if (!raidState?.joined) return

  const pending = (await db.pendingSync.toArray())
    .filter((record) => record.kind === 'raidDamage')
    .slice(0, RAID_SYNC_BATCH_LIMIT)
  const payloads = pending.map((record) => JSON.parse(record.payloadJson) as DamageSyncPayload)

  let acceptedIds: string[]
  let boss: Awaited<ReturnType<RaidApi['syncDamage']>>['boss']
  try {
    const result = await raidApi.syncDamage(payloads)
    acceptedIds = result.acceptedIds
    boss = result.boss
  } catch {
    return
  }

  if (pending.length > 0) {
    const accepted = new Set(acceptedIds)
    const idsToDelete = pending
      .filter((record) =>
        accepted.has((JSON.parse(record.payloadJson) as DamageSyncPayload).attemptId),
      )
      .map((record) => record.id!)
    if (idsToDelete.length > 0) await db.pendingSync.bulkDelete(idsToDelete)
  }

  await db.raidState.put({
    id: RAID_STATE_ID,
    bossId: boss.bossId,
    profileJson: JSON.stringify({ name: boss.name }),
    hp: boss.hp,
    maxHp: boss.maxHp,
    myDamage: boss.myDamage,
    joined: raidState.joined,
    startAt: boss.startAt,
    endAt: boss.endAt,
    lastSyncedAt: Date.now(),
  })
}
