// プロフィール初期化サービス（T-20。正本: docs/04 3節）。
//
// profile レコードの有無が「初回起動（P0診断が未完了）」の判定そのものになる
// （App.tsx の起動時分岐がこの hasProfile を見る）。

import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID, type ProfileRecord } from '../db/schema'

export interface CreateProfileInput {
  displayName: string
  /** 自己申告TOEICスコア（未申告は null） */
  initialToeic: number | null
  now?: number
}

/** P0診断完了時にprofileを作成する（診断は1回のみ。以後の起動はこのレコードでスキップされる） */
export async function createProfile(
  db: BebRaidDatabase,
  input: CreateProfileInput,
): Promise<ProfileRecord> {
  const record: ProfileRecord = {
    id: PROFILE_ID,
    displayName: input.displayName,
    initialToeic: input.initialToeic,
    createdAt: input.now ?? Date.now(),
    deviceToken: crypto.randomUUID(),
  }
  await db.profile.put(record)
  return record
}

/** 初回起動判定（profileレコードの有無） */
export async function hasProfile(db: BebRaidDatabase): Promise<boolean> {
  return (await db.profile.get(PROFILE_ID)) !== undefined
}
