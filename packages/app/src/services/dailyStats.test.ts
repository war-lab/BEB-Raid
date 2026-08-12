// T-294（K-21）: 今日の実施数（CompletionCard表示用）の薄いヘルパーに専用テストが無かった。
// startOfLocalDay境界の扱い（>=なのでちょうど0時の解答も含む）を検証する
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { startOfLocalDay } from '../engine/date'
import { countAttemptsToday } from './dailyStats'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`daily-stats-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function attempt(id: string, answeredAt: number) {
  return {
    id,
    questionId: 'q-1',
    mode: 'solo' as const,
    isCorrect: true,
    responseMs: 1000,
    isTimeout: false,
    isGuess: false,
    answeredAt,
  }
}

describe('countAttemptsToday', () => {
  it('今日0時以降の解答だけを数える', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 14, 15, 0, 0, 0).getTime()
    const todayMidnight = startOfLocalDay(now)
    await db.attempts.bulkAdd([
      attempt('a-1', todayMidnight), // ちょうど0時（境界。含まれる）
      attempt('a-2', now), // 今日の午後
      attempt('a-3', todayMidnight - 1), // 前日23:59:59.999（境界外）
    ])

    expect(await countAttemptsToday(db, now)).toBe(2)
  })

  it('解答が1件も無ければ0を返す', async () => {
    const db = newDb()
    expect(await countAttemptsToday(db, Date.now())).toBe(0)
  })

  it('今日より前の解答しかない場合は0を返す', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 14, 12, 0, 0, 0).getTime()
    const yesterday = startOfLocalDay(now) - 1
    await db.attempts.add(attempt('a-1', yesterday))

    expect(await countAttemptsToday(db, now)).toBe(0)
  })

  it('nowを省略すると現在時刻基準で数える', async () => {
    const db = newDb()
    await db.attempts.add(attempt('a-1', Date.now()))

    expect(await countAttemptsToday(db)).toBe(1)
  })
})
