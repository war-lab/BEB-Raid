// レイドダメージの送信サービス（M3・T-96。正本: docs/17_M3実装計画.md 3.6節）。
//
// pendingSync（kind='raidDamage'）を読み、RaidApi.syncDamage経由でサーバーへ送る。
// 受理済み（acceptedIds）のレコードのみ削除し、レスポンスのbossでraidStateを更新する。
// 失敗時（通信断・サーバーエラー等）はpendingSyncを一切変更しない（キュー保持・次回自然再送）。
//
// 【縮退設計】isConfigured()=false または raidSyncEnabled=false または未参加（raidState.joined!==true）
// のいずれかなら、関数冒頭で即returnし通信・追加のDB読み取りを最小化する
//
// レイド系バッジの導出（M3・T-102。正本: docs/17 3.9節）: サーバーはバッジを持たず、
// 端末側がこの同期レスポンスから導出する。boss.status==='defeated' && myDamage>0のときのみ
// raid-first-clear・raid-clear:<bossId>をbadgesストアへput（badgeId主キーで冪等。
// 既に獲得済みならearnedAtを上書きしない）

import type { DamageSyncPayload, RaidBossState } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

/** 初回討伐参加バッジ（週を問わず1回のみ） */
export const RAID_FIRST_CLEAR_BADGE_ID = 'raid-first-clear'

/** 週次討伐バッジ（`raid-clear:<bossId>`） */
export function raidClearBadgeId(bossId: string): string {
  return `raid-clear:${bossId}`
}

async function grantRaidBadgesIfDefeated(db: BebRaidDatabase, boss: RaidBossState): Promise<void> {
  if (boss.status !== 'defeated' || boss.myDamage <= 0) return

  const now = Date.now()
  for (const badgeId of [RAID_FIRST_CLEAR_BADGE_ID, raidClearBadgeId(boss.bossId)]) {
    const existing = await db.badges.get(badgeId)
    if (!existing) {
      await db.badges.put({ badgeId, earnedAt: now })
    }
  }
}

/** 1リクエストで送る上限（3.6節。超過分は次回のトリガーに回る） */
export const RAID_SYNC_BATCH_LIMIT = 200

/**
 * 直近の同期が401（未登録/失効deviceToken）だったか（3.6節: 「判定は同期時のエラー種別を
 * メモリ保持でよい」）。永続化はせず、S5表示時に「登録が無効です」の案内に使う
 */
let lastSyncUnauthorized = false
/**
 * 直近の同期試行が失敗したか（種別を問わない。T-99のオフライン表示規約で
 * 「最終同期」表示を強調色にするために使う。永続化しない）
 */
let lastSyncFailed = false

export function isLastRaidSyncUnauthorized(): boolean {
  return lastSyncUnauthorized
}

export function isLastRaidSyncFailed(): boolean {
  return lastSyncFailed
}

/** テスト専用: モジュールスコープの一時フラグをリセットする（テスト間の状態漏れ防止） */
export function resetRaidSyncFlagsForTest(): void {
  lastSyncUnauthorized = false
  lastSyncFailed = false
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
    lastSyncFailed = false
  } catch (e) {
    if (e instanceof RaidApiError && e.kind === 'unauthorized') lastSyncUnauthorized = true
    lastSyncFailed = true
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

  await grantRaidBadgesIfDefeated(db, boss)

  return true
}
