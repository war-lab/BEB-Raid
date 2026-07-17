// 今日の実施数（T-78。完了カード=CompletionCardの表示に使う薄いヘルパー）。
import type { BebRaidDatabase } from '../db/database'
import { startOfLocalDay } from '../engine/date'

export async function countAttemptsToday(
  db: BebRaidDatabase,
  now: number = Date.now(),
): Promise<number> {
  return db.attempts.where('answeredAt').aboveOrEqual(startOfLocalDay(now)).count()
}
