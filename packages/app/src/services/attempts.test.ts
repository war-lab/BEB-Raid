// T-07: 解答記録の当て勘フラグ・時間切れ別カウント・即時保存のテスト（03の7.2節）
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { buildAttempt, GUESS_THRESHOLD_MS, recordAttempt } from './attempts'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(name?: string): BebRaidDatabase {
  const db = new BebRaidDatabase(name ?? `attempts-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  // attempts は clear 不可のため DB ごと削除する
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('buildAttempt: 当て勘フラグ（応答<2秒の誤答）', () => {
  const base = { questionId: 'q-1', mode: 'solo' as const, responseMs: 1500 }

  it('2秒未満の誤答は当て勘', () => {
    const a = buildAttempt({ ...base, isCorrect: false })
    expect(a.isGuess).toBe(true)
  })

  it('2秒未満でも正解なら当て勘ではない', () => {
    const a = buildAttempt({ ...base, isCorrect: true })
    expect(a.isGuess).toBe(false)
  })

  it('2秒以上の誤答は当て勘ではない', () => {
    const a = buildAttempt({ ...base, responseMs: GUESS_THRESHOLD_MS, isCorrect: false })
    expect(a.isGuess).toBe(false)
  })
})

describe('buildAttempt: 時間切れの別カウント', () => {
  it('時間切れは誤答扱いだが isTimeout に別カウントされ、当て勘にもならない', () => {
    const a = buildAttempt({
      questionId: 'q-1',
      mode: 'solo',
      isCorrect: true, // タイムアウト時は無視される
      responseMs: 0,
      isTimeout: true,
    })
    expect(a.isCorrect).toBe(false)
    expect(a.isTimeout).toBe(true)
    expect(a.isGuess).toBe(false)
  })
})

describe('recordAttempt: 即時保存', () => {
  it('保存後すぐに別のDBハンドル（リロード相当）から読める', async () => {
    const name = `attempts-test-reload-${++seq}`
    const db = newDb(name)
    const saved = await recordAttempt(db, {
      questionId: 'q-1',
      mode: 'srs',
      isCorrect: true,
      responseMs: 3000,
    })

    // アプリのリロードを模擬: 同名DBを別インスタンスで開き直す
    db.close()
    const reopened = newDb(name)
    const found = await reopened.attempts.get(saved.id)
    expect(found).toMatchObject({ questionId: 'q-1', mode: 'srs', isCorrect: true })
  })

  it('mode / answeredAt が指定どおり保存される', async () => {
    const db = newDb()
    const saved = await recordAttempt(db, {
      questionId: 'q-2',
      mode: 'solo',
      isCorrect: false,
      responseMs: 5000,
      answeredAt: 1234,
    })
    expect((await db.attempts.get(saved.id))?.answeredAt).toBe(1234)
  })
})
