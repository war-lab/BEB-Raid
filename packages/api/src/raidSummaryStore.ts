// raidSummary:<bossId> KVレコードのキー生成ヘルパー（正本: docs/22 3.8節）。
// membersと同じKVネームスペース（env.MEMBERS）に別プレフィックスで同居させる
// （ghostStore.tsと同じ方針。専用KVバインディングは追加しない）

export const RAID_SUMMARY_KEY_PREFIX = 'raidSummary:'

export function raidSummaryKey(bossId: string): string {
  return `${RAID_SUMMARY_KEY_PREFIX}${bossId}`
}
