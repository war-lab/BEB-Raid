// ghost:<deviceToken> KVレコードの型・キー生成ヘルパー（正本: docs/22 3.3節、docs/04 4節）。
// members（MemberRecord）と同じKVネームスペース（env.MEMBERS）に別プレフィックスで同居させる
// （22の作業指示どおり。ghosts専用のKVバインディングは追加しない）

import type { GhostBossInfo, GhostRecordEntry } from '@beb-raid/shared-schema'

import type { Env } from './env'

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
  /**
   * このゴーストが使われた週のbossId（新しい順）。撤回時に派生データ（各週のRaidBossDOが
   * 保持する `defenseJson`＝本人の問題別正誤に1対1で対応する防御倍率）を全て消すために使う。
   *
   * `lastUsedBossId` だけでは直近1週しか辿れず、W20とW23で使われたゴーストをW24に撤回すると
   * W20のDOに正誤詳細が保持期間の終わりまで残っていた（レビュー指摘5）。同意画面が約束する
   * 「撤回すると記録がサーバーから即時削除される」を満たさないため、履歴で持つ。
   * `lastUsedBossId` はクールダウン判定（直近2週に使われたゴーストを選ばない）で引き続き使う
   * ため残す（既存レコードとの互換のためにも消さない）。
   *
   * 保持数はRaidBossDOの保持期間（RAID_BOSS_RETENTION_WEEKS）を超える分だけあればよい。
   * それより古い週のDOは掃除で消えており、消しに行く先が無い
   */
  usedBossIds?: string[]
}

/** usedBossIds の保持上限。RaidBossDOの保持期間より古い週は掃除済みで消す対象が無い */
export const GHOST_USED_BOSS_HISTORY_LIMIT = 8

/** GhostRecordから配信用のGhostBossInfo（displayName・defeatedCountのみ）を作る */
export function toGhostBossInfo(record: GhostRecord): GhostBossInfo {
  return { displayName: record.displayName, defeatedCount: record.defeatedCount }
}

/**
 * ghost:<deviceToken> レコードをKVで安全に更新する（T-248・29のQ-30）。
 *
 * Workers KVにはcompare-and-swap相当の原子的な条件付き書込が無い。週次cronの
 * read-modify-write（前週ghostレコードのdefeatedCount加算・選定記録のlastUsedBossId更新）が
 * `DELETE /ghosts/own`（撤回）と競合すると、cronが読み取った後にユーザーが削除し、
 * その後cronが古い内容のまま書き戻して撤回済みレコードが復活しうる。
 *
 * 対策として、値を読んでから実際に書き込むまでの間に**もう一度**存在確認を挟み、
 * その時点で既に削除されていれば（＝読取がnullを返せば）書込を取りやめる。
 * 1回の読取だけでは「読取の実行中（応答が返るより前）に撤回が完了し、読取自体は
 * 削除前のスナップショットを返す」という順序を検出できない——読取が値を返した時点では
 * 既に撤回が完了している場合があるため、その値を信用したまま書けば復活する。
 * putの直前にもう一度読み直せば、その時点までに撤回が完了していれば必ずnullが返る
 * （このタイミングの読取と撤回のDELETEが競合する余地はもう無い。値を検証してから
 * 使うまでの間隔がここより先には存在しないため）。
 *
 * これでもなお「この再取得の直後・書込の直前」という更に狭い窓は理論上残る
 * （KVにCASが無い以上、完全な排他はDurable Object化しない限り原理的に作れない）。
 * ただし、この窓は元の実装の窓（closeOutPreviousGhostは読取→即書込、
 * lastUsedBossId更新は選定から書込までに全メンバーのEMA更新ループを挟み
 * 実運用で数百ms〜秒オーダーだった）よりも大幅に狭く、実務上許容できる残留リスクである
 */
export async function updateGhostRecordIfPresent(
  env: Env,
  deviceToken: string,
  updater: (current: GhostRecord) => GhostRecord,
): Promise<void> {
  const key = ghostKey(deviceToken)
  const raw = await env.MEMBERS.get(key)
  if (!raw) return
  const updated = updater(JSON.parse(raw) as GhostRecord)

  // 書込直前の再確認（上のコメント参照）。ここでnullなら、上の読取から今までの間に
  // 撤回が完了しているので書込を取りやめる
  const stillPresent = await env.MEMBERS.get(key)
  if (!stillPresent) return

  await env.MEMBERS.put(key, JSON.stringify(updated))
}
