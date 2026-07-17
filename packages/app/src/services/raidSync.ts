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
import { RaidApiError, type RaidApi } from '../platform'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

/** 1リクエストで送る上限（3.6節。超過分は次回のトリガーに回る） */
export const RAID_SYNC_BATCH_LIMIT = 200

/**
 * 直近の同期が401（未登録/失効deviceToken）だったか（3.6節: 「判定は同期時のエラー種別を
 * メモリ保持でよい」）。永続化はせず、S5表示時に「登録が無効です」の案内に使う
 */
let lastSyncUnauthorized = false

export function isLastRaidSyncUnauthorized(): boolean {
  return lastSyncUnauthorized
}

/**
 * 戻り値は「サーバーとの同期が成功したか」（3.6節の手動同期ボタンがエラー表示するために使う）。
 * 縮退ゲート（未設定/OFF/未参加）はfalseを返すが、これらは通常UIから到達しない経路のため
 * 呼び出し側でエラー表示に使う想定はしていない
 */
export async function syncRaidDamage(db: BebRaidDatabase, raidApi: RaidApi): Promise<boolean> {
  if (!raidApi.isConfigured()) return false

  const enabledSetting = await db.settings.get(RAID_SYNC_ENABLED_KEY)
  if (enabledSetting?.value !== true) return false

  const raidState = await db.raidState.get(RAID_STATE_ID)
  if (!raidState?.joined) return false

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
    lastSyncUnauthorized = false
  } catch (e) {
    if (e instanceof RaidApiError && e.kind === 'unauthorized') lastSyncUnauthorized = true
    return false
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
  return true
}
