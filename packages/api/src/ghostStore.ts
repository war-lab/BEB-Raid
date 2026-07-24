// ghost:<deviceToken> KVレコードの型・キー生成ヘルパー（正本: docs/22 3.3節、docs/04 4節）。
// members（MemberRecord）と同じKVネームスペース（env.MEMBERS）に別プレフィックスで同居させる
// （22の作業指示どおり。ghosts専用のKVバインディングは追加しない）

import type { GhostBossInfo, GhostRecordEntry } from '@beb-raid/shared-schema'

export const GHOST_KEY_PREFIX = 'ghost:'

export function ghostKey(deviceToken: string): string {
  return `${GHOST_KEY_PREFIX}${deviceToken}`
}

/** `ghost:<deviceToken>` キー文字列からdeviceToken部分を取り出す（KV list()のkey.name向け） */
export function deviceTokenFromGhostKey(key: string): string {
  return key.slice(GHOST_KEY_PREFIX.length)
}

/** KVの `ghost:<deviceToken>` に保存する値（正本: docs/22 3.3節） */
export interface GhostRecord {
  displayName: string
  consent: true
  records: GhostRecordEntry[]
  createdAt: number
  defeatedCount: number
  lastUsedBossId: string | null
}

/** GhostRecordから配信用のGhostBossInfo（displayName・defeatedCountのみ）を作る */
export function toGhostBossInfo(record: GhostRecord): GhostBossInfo {
  return { displayName: record.displayName, defeatedCount: record.defeatedCount }
}
