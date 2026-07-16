// レイドダメージ送信ペイロードの構築（M3基盤・T-89。正本: docs/14 4.4節）。
// 個人単位の正誤詳細（questionId・isCorrect・レート実値・responseMs等）が
// 誤って混入しないよう、フィールドを明示的に1つずつ選び出す（スプレッド構文を使わない）。
// この関数がapp/api双方から見て「共有APIに実際に送られる形」の単一の正本になる

import type { DamageSyncPayload } from './types.js'

export interface DamageSyncPayloadInput {
  attemptId: string
  bossId: string
  damage: number
  questionCount: number
}

/** DamageSyncPayloadのホワイトリスト（このキー以外を持たせない） */
export const DAMAGE_SYNC_PAYLOAD_KEYS: readonly (keyof DamageSyncPayload)[] = [
  'attemptId',
  'bossId',
  'damage',
  'questionCount',
]

export function buildDamageSyncPayload(input: DamageSyncPayloadInput): DamageSyncPayload {
  return {
    attemptId: input.attemptId,
    bossId: input.bossId,
    damage: input.damage,
    questionCount: input.questionCount,
  }
}
