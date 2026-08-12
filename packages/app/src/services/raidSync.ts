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
import type { PendingSyncRecord, RaidBossTypeCache } from '../db/schema'
import { RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { useRaidSyncStore } from '../store/raidSyncStore'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from './settingsKeys'

/**
 * RaidBossStateからraidStateキャッシュ用の3フィールド（M4・T-129。docs/22 3.4節）を組み立てる。
 * bossState.defense（questionId別の配列）はO(1)引きのためRecordへ変換してJSON化する。
 * サーバー未送出（synthetic週・旧クライアント互換の省略）はいずれもundefined/nullを維持し、
 * answerPipelineの倍率解決がsynthetic/API無効時と完全に同一挙動になるようにする
 */
export function buildRaidStateBossCache(boss: RaidBossState): {
  bossType: RaidBossTypeCache
  defenseJson: string | null
  ghostJson: string | null
} {
  return {
    bossType: boss.bossType ?? 'synthetic',
    defenseJson: boss.defense
      ? JSON.stringify(Object.fromEntries(boss.defense.map((d) => [d.questionId, d.multiplier])))
      : null,
    ghostJson: boss.ghost ? JSON.stringify(boss.ghost) : null,
  }
}

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

/**
 * T-278（K-1）: 400（invalid_body）応答時の隔離と復旧。
 * 送信前の丸め（T-274・answerPipeline.ts）以前にキューへ入った小数damage等の
 * レコードが混ざると、サーバーがバッチ全体を400で拒否し以後syncRaidDamageが
 * 恒久停止する。非整数damageはMath.roundして書き戻し、丸めても不正
 * （NaN・負値等）なら警告してpendingSyncから削除する（attemptsには一切触れない）
 */
async function repairInvalidDamagePayloads(
  db: BebRaidDatabase,
  pending: PendingSyncRecord[],
): Promise<{ pending: PendingSyncRecord[]; payloads: DamageSyncPayload[] }> {
  const repairedPending: PendingSyncRecord[] = []
  const repairedPayloads: DamageSyncPayload[] = []
  const deleteIds: number[] = []

  for (const record of pending) {
    const payload = JSON.parse(record.payloadJson) as DamageSyncPayload
    if (Number.isInteger(payload.damage)) {
      repairedPending.push(record)
      repairedPayloads.push(payload)
      continue
    }

    const rounded = Math.round(payload.damage)
    if (Number.isInteger(rounded) && rounded >= 0) {
      const fixedPayload: DamageSyncPayload = { ...payload, damage: rounded }
      await db.pendingSync.update(record.id!, { payloadJson: JSON.stringify(fixedPayload) })
      repairedPending.push(record)
      repairedPayloads.push(fixedPayload)
    } else {
      console.warn(
        `raidSync: 丸めても復旧不能なdamageを持つpendingSyncレコードを削除する (id=${record.id})`,
      )
      deleteIds.push(record.id!)
    }
  }
  if (deleteIds.length > 0) await db.pendingSync.bulkDelete(deleteIds)

  return { pending: repairedPending, payloads: repairedPayloads }
}

/** 1リクエストで送る上限（3.6節。超過分は次回のトリガーに回る） */
export const RAID_SYNC_BATCH_LIMIT = 200

/** syncRaidDamageの戻り値。okは同期成否、bossは成功時のみ（T-104: 呼び出し側が追加fetchなしに画面を更新できるようにする） */
export interface RaidSyncResult {
  ok: boolean
  boss?: RaidBossState
}

/**
 * 実行中フラグ（questionStats.tsのsendInFlightと同じ流儀。T-193・Q-104）。
 * App.tsxの起動時自動同期・ResultScreen/RaidScreenの完了時同期・RaidScreenの手動同期ボタンが
 * 同じ関数を並行して呼びうる。並行実行を許すと同一pendingSyncバッチを2回送信し、
 * サーバー側で二重計上されたり、片方のraidState.put書き込みがもう片方の結果を
 * 上書きする競合が起きるため、実行中の再入は黙って抑止する
 */
let syncInFlight = false

/** テスト専用: 実行中フラグをリセットする（テスト間の状態漏れ防止） */
export function resetRaidSyncFlagsForTest(): void {
  syncInFlight = false
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

  if (syncInFlight) return { ok: false }
  syncInFlight = true
  try {
    const candidates = (await db.pendingSync.toArray())
      .filter((record) => record.kind === 'raidDamage')
      .slice(0, RAID_SYNC_BATCH_LIMIT)

    // payloadJsonが破損したレコード（外部編集されたバックアップのインポート等）は、
    // 残すと毎回の同期でJSON.parseが例外になりキュー全体が恒久的に詰まるため、
    // 警告して削除し、残りの送信を続行する
    let pending: typeof candidates = []
    let payloads: DamageSyncPayload[] = []
    const corruptedIds: number[] = []
    for (const record of candidates) {
      try {
        payloads.push(JSON.parse(record.payloadJson) as DamageSyncPayload)
        pending.push(record)
      } catch {
        console.warn(
          `raidSync: payloadJsonが破損したpendingSyncレコードを削除する (id=${record.id})`,
        )
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
      // T-278（K-1）: 400（invalid_body）はバッチ中の不正なdamageが原因である可能性が高い。
      // 隔離・復旧してから1回だけ再送し、この呼び出し内で復旧を完了させる
      // （次回の自然な再送を待たない。他のエラー種別は復旧を試みず従来どおり保持する）
      if (e instanceof RaidApiError && e.status === 400) {
        const repaired = await repairInvalidDamagePayloads(db, pending)
        pending = repaired.pending
        payloads = repaired.payloads
        try {
          const result = await raidApi.syncDamage(payloads)
          acceptedIds = result.acceptedIds
          boss = result.boss
          useRaidSyncStore.getState().recordSuccess()
        } catch (e2) {
          const unauthorized2 = e2 instanceof RaidApiError && e2.kind === 'unauthorized'
          useRaidSyncStore.getState().recordFailure(unauthorized2)
          return { ok: false }
        }
      } else {
        const unauthorized = e instanceof RaidApiError && e.kind === 'unauthorized'
        useRaidSyncStore.getState().recordFailure(unauthorized)
        return { ok: false }
      }
    }

    // T-285（K-8）: 当週ボスが未生成のときサーバーはboss:nullを返す（acceptedIdsは
    // 前週分等を含みうるため有効）。この場合はweekRolledOverを判定できないため、
    // raidStateの更新（bossId切替・joinedリセット等）は一切行わない
    const weekRolledOver = boss !== null && boss.bossId !== raidState.bossId

    if (pending.length > 0) {
      const accepted = new Set(acceptedIds)
      const idsToDelete = pending
        .filter((record) =>
          accepted.has((JSON.parse(record.payloadJson) as DamageSyncPayload).attemptId),
        )
        .map((record) => record.id!)
      if (idsToDelete.length > 0) await db.pendingSync.bulkDelete(idsToDelete)

      // T-193（Q-105）: 週替わりを検知した場合、raidState.joinedはこの直後にfalseへ戻り、
      // 以降のsyncRaidDamage呼び出しは縮退ゲート（raidState.joined!==true）で即returnして
      // 二度とこの掃除コードへ到達しない。受理されなかった旧週（raidState.bossId）分の
      // pendingSyncは今後も二度と受理されないため、このタイミングで掃除しないと
      // 永久に滞留する（再参加後の週でも再送され続けキューが単調増加する）
      if (weekRolledOver) {
        const staleWeekIds = pending
          .filter((record) => {
            const payload = JSON.parse(record.payloadJson) as DamageSyncPayload
            return !accepted.has(payload.attemptId) && payload.bossId === raidState.bossId
          })
          .map((record) => record.id!)
        if (staleWeekIds.length > 0) await db.pendingSync.bulkDelete(staleWeekIds)
      }
    }

    if (boss !== null) {
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
        joined: weekRolledOver ? false : raidState.joined,
        startAt: boss.startAt,
        endAt: boss.endAt,
        lastSyncedAt: Date.now(),
        ...buildRaidStateBossCache(boss),
      })

      await grantRaidBadgesIfDefeated(db, boss)
    }

    return { ok: true, boss: boss ?? undefined }
  } finally {
    syncInFlight = false
  }
}
