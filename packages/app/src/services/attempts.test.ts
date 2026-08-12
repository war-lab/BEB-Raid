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

// T-300（K-28）: answeredAtにNaNが入るとIndexedDBの範囲インデックス（answeredAt）から
// 実質的に見えなくなり、レコードは物理的に存在するのに日次集計・ストリーク等の
// 範囲クエリから無音で消える。呼び出し側の計算ミス（0除算・未初期化の引き算等）で
// NaNが渡っても、保存前にDate.now()へフォールバックする
describe('buildAttempt: answeredAtが非有限値の場合のフォールバック（T-300・K-28）', () => {
  const base = { questionId: 'q-1', mode: 'solo' as const, isCorrect: true, responseMs: 1000 }

  it('answeredAtがNaNならDate.now()相当にフォールバックする', () => {
    const before = Date.now()
    const a = buildAttempt({ ...base, answeredAt: Number.NaN })
    const after = Date.now()
    expect(Number.isFinite(a.answeredAt)).toBe(true)
    expect(a.answeredAt).toBeGreaterThanOrEqual(before)
    expect(a.answeredAt).toBeLessThanOrEqual(after)
  })

  it('answeredAtがInfinityでもフォールバックする', () => {
    const a = buildAttempt({ ...base, answeredAt: Number.POSITIVE_INFINITY })
    expect(Number.isFinite(a.answeredAt)).toBe(true)
  })

  it('answeredAtが有効な数値ならその値をそのまま使う', () => {
    const a = buildAttempt({ ...base, answeredAt: 1_700_000_000_000 })
    expect(a.answeredAt).toBe(1_700_000_000_000)
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
