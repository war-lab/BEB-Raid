// T-07 完了条件のテスト:
// - オフラインで一連の解答→リロード→ログ残存（fake-indexeddb 上でリロードを模擬）
// - セッション途中でアプリを閉じて再起動すると同じ問題から再開する
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  answerCurrentQuestion,
  completeSession,
  currentQuestionId,
  resumeSession,
  startSession,
} from './session'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(name?: string): BebRaidDatabase {
  const db = new BebRaidDatabase(name ?? `session-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const QUESTIONS = ['q-1', 'q-2', 'q-3']

describe('セッションの開始と進行', () => {
  it('開始直後は先頭の問題が現在問題になる', async () => {
    const db = newDb()
    const s = await startSession(db, { mode: 'solo', questionIds: QUESTIONS })
    expect(currentQuestionId(s)).toBe('q-1')
  })

  it('解答するたびに attempts へ追記され、現在問題が進む', async () => {
    const db = newDb()
    let s = await startSession(db, { mode: 'solo', questionIds: QUESTIONS })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: false, responseMs: 1000 })

    expect(currentQuestionId(s)).toBe('q-3')
    expect(await db.attempts.count()).toBe(2)
    // セッションの mode と問題IDが解答ログへ引き継がれている
    const logs = await db.attempts.orderBy('answeredAt').toArray()
    expect(logs.map((a) => a.questionId)).toEqual(['q-1', 'q-2'])
    expect(logs.every((a) => a.mode === 'solo')).toBe(true)
  })

  it('全問解答後の解答はエラーになる', async () => {
    const db = newDb()
    let s = await startSession(db, { mode: 'srs', questionIds: ['q-1'] })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    await expect(answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 1 })).rejects.toThrow()
  })

  it('問題0件のセッションは開始できない', async () => {
    const db = newDb()
    await expect(startSession(db, { mode: 'solo', questionIds: [] })).rejects.toThrow()
  })
})

describe('中断復帰（02の2.1節: 電車を降りる瞬間に離脱しても何も失わない）', () => {
  it('途中離脱→リロードで同じ問題から再開し、解答済みログが残っている', async () => {
    const name = `session-test-resume-${++seq}`
    const db = newDb(name)
    let s = await startSession(db, { mode: 'solo', questionIds: QUESTIONS })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: false, responseMs: 1500 })
    // ここでアプリを閉じる（リロードを模擬: 同名DBを開き直す）
    db.close()

    const reopened = newDb(name)
    const resumed = await resumeSession(reopened)
    expect(resumed).not.toBeNull()
    // 3問目（q-3）から再開する
    expect(currentQuestionId(resumed!)).toBe('q-3')
    expect(resumed!.sessionId).toBe(s.sessionId)
    // 解答済み2問のログが失われていない
    expect(await reopened.attempts.count()).toBe(2)
    expect(resumed!.attemptIds).toHaveLength(2)

    // 再開したセッションをそのまま続行できる
    const done = await answerCurrentQuestion(reopened, resumed!, {
      isCorrect: true,
      responseMs: 2500,
    })
    expect(currentQuestionId(done)).toBeNull()
    expect(await reopened.attempts.count()).toBe(3)
  })

  it('セッション完了後は復帰対象がなくなるが、解答ログは残る', async () => {
    const db = newDb()
    let s = await startSession(db, { mode: 'solo', questionIds: ['q-1'] })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    expect(currentQuestionId(s)).toBeNull()

    await completeSession(db)
    expect(await resumeSession(db)).toBeNull()
    expect(await db.attempts.count()).toBe(1)
  })

  it('進行中セッションがなければ resumeSession は null', async () => {
    const db = newDb()
    expect(await resumeSession(db)).toBeNull()
  })
})
