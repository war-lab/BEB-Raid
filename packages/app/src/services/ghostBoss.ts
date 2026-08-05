// ボス役記録の送信（M4・T-128。正本: docs/22 3.5節、docs/21 J-67）。
//
// 同意の構造的強制: buildGhostRecordPayload（shared-schema・T-123で実装済み）は
// consented=false なら例外を投げ、GhostRecordPayloadを構築できない。
// この関数はその構築結果を raidApi.sendGhostRecord へ渡すだけなので、
// consented が false（または未指定=デフォルトfalse）の呼び出しでは
// buildGhostRecordPayload が例外を投げた時点で処理が止まり、
// raidApi.sendGhostRecord は一度も呼ばれない（＝送信APIへ到達するコードパスが存在しない）。
//
// 呼び出し元（RaidScreen）は、同意画面のチェックボックス＋確定操作を経てからのみ
// consented=true でこの関数を呼ぶ。UIのボタン無効化だけに頼らず、
// この関数自体が「同意済みでなければ何も送信しない」ことを保証する

import { buildGhostRecordPayload, type GhostRecordEntry } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { RaidApi } from '../platform'
import { GHOST_BOSS_PENDING_RESULT_KEY } from './settingsKeys'

export interface GhostBossRecordInput {
  displayName: string
  records: GhostRecordEntry[]
}

/**
 * ボス役の記録を送信する。consented=false（既定値）では
 * buildGhostRecordPayload が例外を投げ、raidApi.sendGhostRecord は呼ばれない
 */
export async function sendGhostBossRecord(
  raidApi: RaidApi,
  consented: boolean,
  input: GhostBossRecordInput,
): Promise<void> {
  const payload = buildGhostRecordPayload(consented, input)
  await raidApi.sendGhostRecord(payload)
}

/** ボス役記録の撤回（設定/S5からいつでも可能=J-67の開示事項）。認証のみで本文は不要 */
export async function withdrawGhostBossRecord(raidApi: RaidApi): Promise<void> {
  await raidApi.deleteOwnGhostRecord()
}

/**
 * 未送信のボス役結果（正誤一覧）の一時保存（T-272。docs/30 17節）。
 *
 * GhostBossResultScreenの結果保持がReact state（useSessionStore）のみだと、
 * 送信成功前にアプリを終了・再読み込みすると解き切った結果が失われる。
 * settings（キーバリュー型ストア）に間借りする（DIAGNOSTIC_PROGRESS_KEYと同じ方針。
 * db/schema.tsのストア定義自体は変更しない）
 */
export interface PendingGhostBossResult {
  records: GhostRecordEntry[]
  savedAt: number
}

/** 完走直後（送信前）に呼ぶ。既存の保存があれば上書きする（settings.putは冪等） */
export async function savePendingGhostBossResult(
  db: BebRaidDatabase,
  records: GhostRecordEntry[],
): Promise<void> {
  const value: PendingGhostBossResult = { records, savedAt: Date.now() }
  await db.settings.put({ key: GHOST_BOSS_PENDING_RESULT_KEY, value })
}

/** 起動時にApp.tsxが呼ぶ。無ければnull */
export async function loadPendingGhostBossResult(
  db: BebRaidDatabase,
): Promise<PendingGhostBossResult | null> {
  const stored = await db.settings.get(GHOST_BOSS_PENDING_RESULT_KEY)
  return (stored?.value as PendingGhostBossResult | undefined) ?? null
}

/** 送信成功時・破棄確定時に呼ぶ。settings.deleteは無くても例外にならない（冪等） */
export async function clearPendingGhostBossResult(db: BebRaidDatabase): Promise<void> {
  await db.settings.delete(GHOST_BOSS_PENDING_RESULT_KEY)
}
