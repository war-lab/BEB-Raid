// レイドダメージの送信サービス（M3・T-96。正本: docs/17_M3実装計画.md 3.6節）。
//
// pendingSync（kind='raidDamage'）を読み、RaidApi.syncDamage経由でサーバーへ送る。
// 受理済み（acceptedIds）のレコードのみ削除し、レスポンスのbossでraidStateを更新する。
// 失敗時（通信断・サーバーエラー等）はpendingSyncを一切変更しない（キュー保持・次回自然再送）。
//
// 【縮退設計】isConfigured()=false・未登録（raidRegisteredAt無し。T-115）・
// raidSyncEnabled=false・未参加（raidState.joined!==true）のいずれかなら、
// 関数冒頭で即returnし通信・追加のDB読み取りを最小化する
//
// レイド系バッジの導出（M3・T-102。正本: docs/17 3.9節）: サーバーはバッジを持たず、
// 端末側がこの同期レスポンスから導出する。boss.status==='defeated' && myDamage>0のときのみ
// raid-first-clear・raid-clear:<bossId>をbadgesストアへput（badgeId主キーで冪等。
// 既に獲得済みならearnedAtを上書きしない）

import type { DamageSyncPayload, RaidBossState } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { useRaidSyncStore } from '../store/raidSyncStore'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from './settingsKeys'

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

/** syncRaidDamageの戻り値。okは同期成否、bossは成功時のみ（T-104: 呼び出し側が追加fetchなしに画面を更新できるようにする） */
export interface RaidSyncResult {
  ok: boolean
  boss?: RaidBossState
}

/**
 * 戻り値のokは「サーバーとの同期が成功したか」（3.6節の手動同期ボタンがエラー表示するために使う）。
 * 縮退ゲート（未設定/OFF/未参加）はok:falseを返すが、これらは通常UIから到達しない経路のため
 * 呼び出し側でエラー表示に使う想定はしていない。成功時のbossはRaidScreenの手動同期が
 * 追加のfetchCurrentBossなしに画面を更新するために使う（T-104）
 */
export async function syncRaidDamage(
  db: BebRaidDatabase,
  raidApi: RaidApi,
): Promise<RaidSyncResult> {
  if (!raidApi.isConfigured()) return { ok: false }

  // T-115(b): 未登録端末（招待コードでの登録が未了）は認証必須APIを叩かない。
  // 登録前でもraidSyncEnabled=trueかつraidState.joined=trueになりうる経路は無いはずだが、
  // 401を毎回コンソールへ出さないための多層防御として先頭でゲートする
  const registeredSetting = await db.settings.get(RAID_REGISTERED_AT_KEY)
  if (registeredSetting === undefined) return { ok: false }

  const enabledSetting = await db.settings.get(RAID_SYNC_ENABLED_KEY)
  if (enabledSetting?.value !== true) return { ok: false }

  const raidState = await db.raidState.get(RAID_STATE_ID)
  if (!raidState?.joined) return { ok: false }

  const candidates = (await db.pendingSync.toArray())
    .filter((record) => record.kind === 'raidDamage')
    .slice(0, RAID_SYNC_BATCH_LIMIT)

  // payloadJsonが破損したレコード（外部編集されたバックアップのインポート等）は、
  // 残すと毎回の同期でJSON.parseが例外になりキュー全体が恒久的に詰まるため、
  // 警告して削除し、残りの送信を続行する
  const pending: typeof candidates = []
  const payloads: DamageSyncPayload[] = []
  const corruptedIds: number[] = []
  for (const record of candidates) {
    try {
      payloads.push(JSON.parse(record.payloadJson) as DamageSyncPayload)
      pending.push(record)
    } catch {
      console.warn(`raidSync: payloadJsonが破損したpendingSyncレコードを削除する (id=${record.id})`)
      corruptedIds.push(record.id!)
    }
  }
  if (corruptedIds.length > 0) await db.pendingSync.bulkDelete(corruptedIds)

  let acceptedIds: string[]
  let boss: Awaited<ReturnType<RaidApi['syncDamage']>>['boss']
  try {
    const result = await raidApi.syncDamage(payloads)
    acceptedIds = result.acceptedIds
    boss = result.boss
    useRaidSyncStore.getState().recordSuccess()
  } catch (e) {
    const unauthorized = e instanceof RaidApiError && e.kind === 'unauthorized'
    useRaidSyncStore.getState().recordFailure(unauthorized)
    return { ok: false }
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
    // 週替わり（レスポンスのbossが端末の知るbossIdと別）ならjoinedを引き継がずfalseへ
    // リセットする。「参加」はS5の参加ボタンによるraidState書込と定義されており（docs/17）、
    // 引き継ぐと参加操作を経ないまま新ボスへ自動参加してしまう
    joined: boss.bossId === raidState.bossId ? raidState.joined : false,
    startAt: boss.startAt,
    endAt: boss.endAt,
    lastSyncedAt: Date.now(),
  })

  await grantRaidBadgesIfDefeated(db, boss)

  return { ok: true, boss }
}
