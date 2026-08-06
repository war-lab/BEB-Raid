// アンマウント時flush失敗の退避（T-297・K-23。正本: docs/31 K-23、docs/32 T-297）。
//
// usePendingCommit の猶予付き確定（ADR 0009）はアンマウント後にも commit を呼ぶ（flush）。
// 各画面のcommit関数は保存失敗時にsaveErrorバナー・再試行ボタンで復旧させるが、
// それらはReact stateなので、既にアンマウント済みの画面には効かない（画面ごと消えている）。
// 従来はconsole.errorに流すだけで、解答が無言で失われていた。
// ここに「失敗した」ことだけを記録し、次回起動時にApp.tsxが通知する
// （解答そのものはundo猶予後の再解答でしか再現できないため、再送はできない）

import type { BebRaidDatabase } from '../db/database'
import { PENDING_COMMIT_FAILURE_KEY } from './settingsKeys'

/** commit関数のcatch節から呼ぶ。既存の記録があれば上書きする（settings.putは冪等） */
export async function recordPendingCommitFailure(db: BebRaidDatabase): Promise<void> {
  await db.settings.put({ key: PENDING_COMMIT_FAILURE_KEY, value: Date.now() })
}

/** 起動時にApp.tsxが呼ぶ。記録が無ければnull */
export async function loadPendingCommitFailure(db: BebRaidDatabase): Promise<number | null> {
  const stored = await db.settings.get(PENDING_COMMIT_FAILURE_KEY)
  return typeof stored?.value === 'number' ? stored.value : null
}

/** 通知を確認（了解）した時に呼ぶ。settings.deleteは無くても例外にならない（冪等） */
export async function clearPendingCommitFailure(db: BebRaidDatabase): Promise<void> {
  await db.settings.delete(PENDING_COMMIT_FAILURE_KEY)
}
