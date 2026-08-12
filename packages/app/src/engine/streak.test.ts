// T-14: ストリークのテスト（02の7節）。
// 完了条件: 日付跨ぎ・保護使用・保護使い切り後の途切れ、の各ケースが通る
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { STREAK_ID } from '../db/schema'
import { countSrsAnswersOn, evaluateStreak, STREAK_REQUIRED_SRS_ANSWERS } from './streak'

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

/** 指定時刻に count 件のシャドーイング実施ログを記録する（ShadowingScreenと同型） */
async function answerShadow(db: BebRaidDatabase, at: number, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await db.attempts.add({
      id: `shadow-a-${++attemptSeq}`,
      questionId: `shadow:q-${attemptSeq}`,
      mode: 'solo',
      isCorrect: true,
      responseMs: 3000,
      isTimeout: false,
      isGuess: false,
      answeredAt: at + i,
    })
  }
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

  // T-195（Q-102）: 何を防ぐか。ストリークが途切れた後もcurrentDaysが旧値のまま返り続け、
  // ホームに「N日連続」が欠席後も表示され続けて次の成立日に突然1へ落ちる（急な段差でユーザーが
  // 混乱する）のを防ぐ。途切れが確定した時点（gap>=2で保護が使えない）で0を返す
  it('2日以上の欠席で保護不可（gap>2）なら、当日未成立でも0を返す（旧値を返さない）', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9) // currentDays=1, lastActiveDate=7/9
    // 7/10・7/11 欠席。7/12 時点ではまだ当日分（5問）を解いていない
    const status = await evaluateStreak(db, noonOf(2026, 7, 12))
    expect(status.currentDays).toBe(0)
    expect(status.todayCompleted).toBe(false)
    // 未成立の評価はDBを更新しない（次の成立日に1から正しく数え直すため）
    expect((await db.streak.get(STREAK_ID))?.currentDays).toBe(1)
  })

  it('gap=2でも保護使用済み（7日以内の再欠席）なら、当日未成立時点で0を返す', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 11) // 7/10欠席を保護で免除。currentDays=2、保護使用=7/10
    await studyOn(db, 2026, 7, 12)
    // 7/13欠席。7/14時点でまだ当日分を解いていない → 保護使用から7日以内の再欠席なので途切れ確定
    const status = await evaluateStreak(db, noonOf(2026, 7, 14))
    expect(status.currentDays).toBe(0)
    expect(status.todayCompleted).toBe(false)
  })

  it('gap=2かつ保護が使える状態では、当日未成立でも旧値のまま返す（保護でまだ救えるため）', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9) // currentDays=1, 保護未使用
    // 7/10欠席。7/11時点ではまだ当日分を解いていないが、保護が使えるためこの時点では未確定
    const status = await evaluateStreak(db, noonOf(2026, 7, 11))
    expect(status.currentDays).toBe(1)
    expect(status.todayCompleted).toBe(false)
  })
})

// T-304（K-32）改修前は、lastActiveDateが未来値（端末時計を進めた状態で成立させた後に
// 実時刻へ戻した状況を再現）だとput せず終了しており、実日付がlastActiveDateへ
// 追いつくまで（時計操作次第で恒久的に）ストリークが1日も成立しなかった。
// 今日へ巻き戻り、1から再開する（二重加算は起きない）のが改修後の挙動
describe('時計の巻き戻し（T-304・K-32）', () => {
  it('lastActiveDateが未来値のとき、今日へ巻き戻り1から再開する', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 10) // currentDays=2, lastActiveDate=7/10（端末時計を進めた想定）

    // 時計が 7/9 に戻った状態で5問解く → 今日(7/9)へ巻き戻り、1から再開する
    const rolledBack = await studyOn(db, 2026, 7, 9)
    expect(rolledBack.currentDays).toBe(1)
    expect(rolledBack.todayCompleted).toBe(true)
    expect((await db.streak.get(STREAK_ID))?.lastActiveDate).toBe('2026-07-09')

    // 同日内の再評価では二重加算されない（alreadyCounted）
    const again = await evaluateStreak(db, noonOf(2026, 7, 9) + 1000)
    expect(again.currentDays).toBe(1)
    expect(again.todayCompleted).toBe(true)
  })

  it('巻き戻り後、翌日の学習で通常どおり+1される（据え置きのbestDaysは維持）', async () => {
    const db = newDb()
    await studyOn(db, 2026, 7, 9)
    await studyOn(db, 2026, 7, 10) // currentDays=2, bestDays=2
    await studyOn(db, 2026, 7, 9) // 巻き戻り。currentDays=1

    const next = await studyOn(db, 2026, 7, 10)
    expect(next.currentDays).toBe(2)
    expect(next.bestDays).toBe(2) // 巻き戻り前の最高値は下がらない
  })
})

// 何を防ぐか（T-307・K-35）: シャドーイングはmode:'solo'・shadow:プレフィックスの
// questionIdで記録される（ShadowingScreen）。docs/03 8節は「ストリーク成立には
// カウントする」と書いているが、mode==='srs'のみを見る実装漏れでシャドーイングが
// 一切算入されていなかった
describe('シャドーイングのストリーク算入（T-307・K-35）', () => {
  it('countSrsAnswersOnはmode=srsに加えてshadow:プレフィックスの解答も数える', async () => {
    const db = newDb()
    const at = noonOf(2026, 7, 9)
    await answerSrs(db, at, 2)
    await answerShadow(db, at + 100, 3)

    expect(await countSrsAnswersOn(db, '2026-07-09')).toBe(5)
  })

  it('シャドーイングのみでもストリークが成立する（SRS 0問・シャドーイング5件）', async () => {
    const db = newDb()
    const at = noonOf(2026, 7, 9)
    await answerShadow(db, at, STREAK_REQUIRED_SRS_ANSWERS)

    const status = await evaluateStreak(db, at)
    expect(status.todayCompleted).toBe(true)
    expect(status.currentDays).toBe(1)
  })

  it('shadow:以外のquestionIdでmode=solo記録した通常ドリルは数えない（誤検知防止）', async () => {
    const db = newDb()
    const at = noonOf(2026, 7, 9)
    await db.attempts.add({
      id: 'solo-a-1',
      questionId: 'q-1', // shadow:プレフィックスなし
      mode: 'solo',
      isCorrect: true,
      responseMs: 1000,
      isTimeout: false,
      isGuess: false,
      answeredAt: at,
    })

    expect(await countSrsAnswersOn(db, '2026-07-09')).toBe(0)
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
