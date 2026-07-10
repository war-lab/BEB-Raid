// ストリーク（T-14。正本: docs/02 7節）。
//
// 連続学習日数。「SRS 5問で成立」の軽い条件が継続の主動線。
// - ストリーク保護: 週1回まで欠席（1日）を免除
// - 脅し演出はしない（表示は UI 側。エンジンは事実だけを返す）
//
// 当日のSRS解答数は attempts（mode='srs'）から導出する。専用カウンタを
// 持たないため、エクスポート/インポートや再インストール後も正しく再計算される。

import type { BebRaidDatabase } from '../db/database'
import type { StreakRecord } from '../db/schema'
import { STREAK_ID } from '../db/schema'
import { daysBetween, localMidnightAfterDays, parseDateString, toDateString } from './date'
import type { StreakStatus } from './types'

/** ストリーク成立に必要な当日のSRS解答数（02の7節） */
export const STREAK_REQUIRED_SRS_ANSWERS = 5
/** ストリーク保護の再使用に必要な間隔（日）。「週1回まで」の解釈 */
export const PROTECTION_INTERVAL_DAYS = 7

/** 現在のストリークレコード（無ければ初期値） */
export async function getStreak(db: BebRaidDatabase): Promise<StreakRecord> {
  return (
    (await db.streak.get(STREAK_ID)) ?? {
      id: STREAK_ID,
      currentDays: 0,
      bestDays: 0,
      lastActiveDate: null,
      protectionUsedAt: null,
    }
  )
}

/** 指定暦日のSRS解答数（attempts の mode='srs' を数える） */
export async function countSrsAnswersOn(db: BebRaidDatabase, date: string): Promise<number> {
  const from = parseDateString(date)
  const to = localMidnightAfterDays(from, 1)
  return db.attempts
    .where('answeredAt')
    .between(from, to, true, false)
    .filter((a) => a.mode === 'srs')
    .count()
}

/** 欠席日 missedDate に保護を使えるか（前回使用から7日以上空いているか） */
function protectionAvailable(record: StreakRecord, missedDate: string): boolean {
  return (
    record.protectionUsedAt === null ||
    daysBetween(record.protectionUsedAt, missedDate) >= PROTECTION_INTERVAL_DAYS
  )
}

/**
 * ストリークを評価・更新する。SRS解答の記録後やホーム表示時に呼ぶ（冪等）。
 * - 当日のSRS解答が5問に達した最初の評価で当日分が成立する
 * - 前回成立日との間隔が1日（連続）なら +1
 * - 欠席がちょうど1日で保護が使えれば免除して +1（保護使用日=欠席日を記録）
 * - それ以外（2日以上の欠席、保護使用済みでの欠席）は 1 から数え直し
 */
export async function evaluateStreak(
  db: BebRaidDatabase,
  now: number = Date.now(),
): Promise<StreakStatus> {
  const today = toDateString(now)
  return db.transaction('rw', db.streak, db.attempts, async () => {
    const record = await getStreak(db)
    const todaySrsCount = await countSrsAnswersOn(db, today)

    const alreadyCounted = record.lastActiveDate === today
    if (alreadyCounted || todaySrsCount < STREAK_REQUIRED_SRS_ANSWERS) {
      return {
        currentDays: record.currentDays,
        bestDays: record.bestDays,
        todaySrsCount,
        todayCompleted: alreadyCounted,
        protectionUsed: false,
      }
    }

    // 当日分の成立
    let currentDays: number
    let protectionUsed = false
    let protectionUsedAt = record.protectionUsedAt
    if (record.lastActiveDate === null) {
      currentDays = 1
    } else {
      const gap = daysBetween(record.lastActiveDate, today)
      if (gap <= 0) {
        // 時計の巻き戻し等。何もしない（lastActiveDate は最新のまま）
        currentDays = record.currentDays
      } else if (gap === 1) {
        currentDays = record.currentDays + 1
      } else if (gap === 2) {
        const missedDate = toDateString(
          localMidnightAfterDays(parseDateString(record.lastActiveDate), 1),
        )
        if (protectionAvailable(record, missedDate)) {
          // 欠席1日を保護で免除（欠席日は学習日として数えない。継続だけ守る）
          currentDays = record.currentDays + 1
          protectionUsed = true
          protectionUsedAt = missedDate
        } else {
          currentDays = 1
        }
      } else {
        currentDays = 1 // 2日以上の欠席は保護でも守れない
      }
    }

    const next: StreakRecord = {
      id: STREAK_ID,
      currentDays,
      bestDays: Math.max(record.bestDays, currentDays),
      lastActiveDate: today,
      protectionUsedAt,
    }
    await db.streak.put(next)
    return {
      currentDays: next.currentDays,
      bestDays: next.bestDays,
      todaySrsCount,
      todayCompleted: true,
      protectionUsed,
    }
  })
}
