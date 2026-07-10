// T-14: ストリークのテスト（02の7節）。
// 完了条件: 日付跨ぎ・保護使用・保護使い切り後の途切れ、の各ケースが通る
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { STREAK_ID } from '../db/schema'
import { evaluateStreak, STREAK_REQUIRED_SRS_ANSWERS } from './streak'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`streak-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** 指定日の正午の epoch ms */
function noonOf(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0).getTime()
}

let attemptSeq = 0
/** 指定時刻に count 問のSRS解答を記録する */
async function answerSrs(db: BebRaidDatabase, at: number, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await db.attempts.add({
      id: `srs-a-${++attemptSeq}`,
      questionId: `q-${attemptSeq}`,
      mode: 'srs',
      isCorrect: true,
      responseMs: 3000,
      isTimeout: false,
      isGuess: false,
      answeredAt: at + i,
    })
  }
}

/** 指定日に5問解いてストリークを成立させる */
async function studyOn(db: BebRaidDatabase, y: number, m: number, d: number) {
  const at = noonOf(y, m, d)
  await answerSrs(db, at, STREAK_REQUIRED_SRS_ANSWERS)
  return evaluateStreak(db, at)
}

describe('成立条件: SRS 5問', () => {
  it('5問未満では成立しない（進捗だけ返る）', async () => {
    const db = newDb()
    await answerSrs(db, noonOf(2026, 7, 9), 4)
    const status = await evaluateStreak(db, noonOf(2026, 7, 9))
    expect(status.todayCompleted).toBe(false)
    expect(status.todaySrsCount).toBe(4)
    expect(status.currentDays).toBe(0)
    expect(await db.streak.get(STREAK_ID)).toBeUndefined()
  })

  it('SRS以外のモードの解答は数えない', async () => {
    const db = newDb()
    const at = noonOf(2026, 7, 9)
    for (let i = 0; i < 5; i++) {
      await db.attempts.add({
        id: `solo-${i}`,
        questionId: `q-${i}`,
        mode: 'solo',
        isCorrect: true,
        responseMs: 3000,
        isTimeout: false,
        isGuess: false,
        answeredAt: at + i,
      })
    }
    expect((await evaluateStreak(db, at)).todaySrsCount).toBe(0)
  })

  it('5問で成立し、同日の再評価では増えない（冪等）', async () => {
    const db = newDb()
    const first = await studyOn(db, 2026, 7, 9)
    expect(first.todayCompleted).toBe(true)
    expect(first.currentDays).toBe(1)

    await answerSrs(db, noonOf(2026, 7, 9) + 1000, 5)
    const second = await evaluateStreak(db, noonOf(2026, 7, 9) + 2000)
    expect(second.currentDays).toBe(1)
    expect(second.todayCompleted).toBe(true)
  })
})

describe('日付跨ぎ', () => {
  it('連続する日の成立で +1 され、bestDays が追随する', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 10)
    const status = await studyOn(db, 2026, 7, 11)
    expect(status.currentDays).toBe(3)
    expect(status.bestDays).toBe(3)
  })

  it('日付を跨いだだけ（当日未成立）では途切れ処理は起きない', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    // 翌日、まだ解いていない時点の評価
    const status = await evaluateStreak(db, noonOf(2026, 7, 10))
    expect(status.currentDays).toBe(1)
    expect(status.todayCompleted).toBe(false)
  })
})

describe('ストリーク保護（週1回の欠席免除）', () => {
  it('1日欠席しても保護で継続する（保護使用日=欠席日が記録される）', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 10)
    // 7/11 欠席 → 7/12 に学習
    const status = await studyOn(db, 2026, 7, 12)
    expect(status.currentDays).toBe(3)
    expect(status.protectionUsed).toBe(true)
    expect((await db.streak.get(STREAK_ID))?.protectionUsedAt).toBe('2026-07-11')
  })

  it('保護使用から7日以内の再欠席は守れず途切れる（使い切り後の途切れ）', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 11) // 7/10 欠席を保護で免除
    // 7/12 学習、7/13 欠席、7/14 学習 → 保護は 7/10 に使用済み（4日前）なので途切れ
    await studyOn(db, 2026, 7, 12)
    const status = await studyOn(db, 2026, 7, 14)
    expect(status.currentDays).toBe(1)
    expect(status.protectionUsed).toBe(false)
    expect(status.bestDays).toBe(3) // 過去最長は残る
  })

  it('保護使用から7日以上空けば再び使える', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 11) // 保護1回目（7/10 欠席）
    // 7/12〜7/17 まで連続学習
    for (let d = 12; d <= 17; d++) await studyOn(db, 2026, 7, d)
    // 7/18 欠席 → 7/19 学習。前回保護 7/10 から 8日経過なので免除される
    const status = await studyOn(db, 2026, 7, 19)
    expect(status.protectionUsed).toBe(true)
    expect(status.currentDays).toBe(9)
  })

  it('2日以上の欠席は保護があっても途切れる', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    const status = await studyOn(db, 2026, 7, 12) // 7/10・7/11 欠席
    expect(status.currentDays).toBe(1)
    expect(status.protectionUsed).toBe(false)
  })
})
