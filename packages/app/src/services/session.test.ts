// T-07 完了条件のテスト:
// - オフラインで一連の解答→リロード→ログ残存（fake-indexeddb 上でリロードを模擬）
// - セッション途中でアプリを閉じて再起動すると同じ問題から再開する
// T-16（3.3節）: SessionItem 化（per-item mode）後の同条件の回帰確認＋旧形式破棄を追加
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  answerCurrentQuestion,
  completeSession,
  currentItem,
  resumeSession,
  startSession,
  type SessionItem,
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

function items(mode: SessionItem['mode'] = 'solo'): SessionItem[] {
  return [
    { questionId: 'q-1', mode },
    { questionId: 'q-2', mode },
    { questionId: 'q-3', mode },
  ]
}

describe('セッションの開始と進行', () => {
  it('開始直後は先頭の問題が現在問題になる', async () => {
    const db = newDb()
    const s = await startSession(db, { items: items() })
    expect(currentItem(s)?.questionId).toBe('q-1')
  })

  it('解答するたびに attempts へ追記され、現在問題が進む', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items() })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: false, responseMs: 1000 })

    expect(currentItem(s)?.questionId).toBe('q-3')
    expect(await db.attempts.count()).toBe(2)
    // item の mode が解答ログへ引き継がれている
    const logs = await db.attempts.orderBy('answeredAt').toArray()
    expect(logs.map((a) => a.questionId)).toEqual(['q-1', 'q-2'])
    expect(logs.every((a) => a.mode === 'solo')).toBe(true)
  })

  it('item ごとに異なる mode（SRSとドリルの混在）が attempts に正しく反映される', async () => {
    const db = newDb()
    const mixed: SessionItem[] = [
      { questionId: 'q-srs', mode: 'srs', srsCardId: 'question:q-srs' },
      { questionId: 'q-drill', mode: 'solo' },
    ]
    let s = await startSession(db, { items: mixed })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    void s
    const logs = await db.attempts.orderBy('answeredAt').toArray()
    expect(logs.find((a) => a.questionId === 'q-srs')?.mode).toBe('srs')
    expect(logs.find((a) => a.questionId === 'q-drill')?.mode).toBe('solo')
  })

  it('全問解答後の解答はエラーになる', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items('srs') })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    await expect(answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 1 })).rejects.toThrow()
  })

  it('問題0件のセッションは開始できない', async () => {
    const db = newDb()
    await expect(startSession(db, { items: [] })).rejects.toThrow()
  })

  it('同じスナップショットでの二重解答は拒否され、重複ログが残らない', async () => {
    const db = newDb()
    const s = await startSession(db, { items: items() })
    await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    // 二度押し・複数タブを模擬: 進める前の古いスナップショットで再度解答
    await expect(
      answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 }),
    ).rejects.toThrow(/古い/)
    expect(await db.attempts.count()).toBe(1)
  })

  it('セッション終了後の stale スナップショットでの解答は拒否され、セッションが復活しない', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items() })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    await completeSession(db)

    await expect(
      answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 }),
    ).rejects.toThrow(/古い/)
    expect(await resumeSession(db)).toBeNull() // activeSession が復活していない
    expect(await db.attempts.count()).toBe(1)
  })
})

describe('中断復帰（02の2.1節: 電車を降りる瞬間に離脱しても何も失わない）', () => {
  it('途中離脱→リロードで同じ問題から再開し、解答済みログが残っている', async () => {
    const name = `session-test-resume-${++seq}`
    const db = newDb(name)
    let s = await startSession(db, { items: items() })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    s = await answerCurrentQuestion(db, s, { isCorrect: false, responseMs: 1500 })
    // ここでアプリを閉じる（リロードを模擬: 同名DBを開き直す）
    db.close()

    const reopened = newDb(name)
    const resumed = await resumeSession(reopened)
    expect(resumed).not.toBeNull()
    // 3問目（q-3）から再開する
    expect(currentItem(resumed!)?.questionId).toBe('q-3')
    expect(resumed!.sessionId).toBe(s.sessionId)
    // 解答済み2問のログが失われていない
    expect(await reopened.attempts.count()).toBe(2)
    expect(resumed!.attemptIds).toHaveLength(2)

    // 再開したセッションをそのまま続行できる
    const done = await answerCurrentQuestion(reopened, resumed!, {
      isCorrect: true,
      responseMs: 2500,
    })
    expect(currentItem(done)).toBeNull()
    expect(await reopened.attempts.count()).toBe(3)
  })

  it('セッション完了後は復帰対象がなくなるが、解答ログは残る', async () => {
    const db = newDb()
    let s = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 3000 })
    expect(currentItem(s)).toBeNull()

    await completeSession(db)
    expect(await resumeSession(db)).toBeNull()
    expect(await db.attempts.count()).toBe(1)
  })

  it('進行中セッションがなければ resumeSession は null', async () => {
    const db = newDb()
    expect(await resumeSession(db)).toBeNull()
  })

  it('旧形式（questionIds ベース）のスナップショットは破棄され、新規開始扱いになる', async () => {
    const db = newDb()
    // T-15以前の旧形式を模擬（items ではなく questionIds を持つ）
    await db.settings.put({
      key: 'activeSession',
      value: {
        sessionId: 'old-session',
        mode: 'solo',
        questionIds: ['q-1', 'q-2'],
        answeredCount: 0,
        attemptIds: [],
        startedAt: 0,
        updatedAt: 0,
      },
    })
    expect(await resumeSession(db)).toBeNull()
  })
})
