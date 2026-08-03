// T-07 完了条件のテスト:
// - オフラインで一連の解答→リロード→ログ残存（fake-indexeddb 上でリロードを模擬）
// - セッション途中でアプリを閉じて再起動すると同じ問題から再開する
// T-16（3.3節）: SessionItem 化（per-item mode）後の同条件の回帰確認＋旧形式破棄を追加
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  advanceSession,
  answerCurrentQuestion,
  answerCurrentSubQuestion,
  completeSession,
  currentItem,
  resumeSession,
  StaleSnapshotError,
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

describe('advanceSession（M2・T-49: audio_setのセット完了後にattempts無しで進める）', () => {
  it('attemptsを書かずにanswered Countだけ進む', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items() })
    s = await advanceSession(db, s)
    expect(s.answeredCount).toBe(1)
    expect(currentItem(s)?.questionId).toBe('q-2')
    expect(await db.attempts.count()).toBe(0)
  })

  it('全問解答済みのセッションを進めようとするとエラー', async () => {
    const db = newDb()
    let s = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    s = await advanceSession(db, s)
    await expect(advanceSession(db, s)).rejects.toThrow()
  })

  it('古いスナップショットからの呼び出しは拒否される（二重進行防止）', async () => {
    const db = newDb()
    const s = await startSession(db, { items: items() })
    await advanceSession(db, s)
    await expect(advanceSession(db, s)).rejects.toThrow()
  })
})

// 複合問題（読解・audio_set）のサブ設問記録（レビュー指摘、2026-08-03）。
// 何を防ぐか: サブ設問の解答がスナップショットに残らないことで、(1) 中断復帰後に
// 解答済みの設問が再出題されて attempt・レート・タグ統計が重複する、
// (2) 完走してもリザルトの集計（snapshot.attemptIds 基準）から漏れて「正解 0/0」になる
describe('answerCurrentSubQuestion（複合問題のサブ設問記録）', () => {
  it('itemは進めず、attemptとattemptIds・subAnswersを追加する', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items() })

    s = await answerCurrentSubQuestion(db, s, {
      questionId: 'q-1-sub0',
      selectedKey: 'A',
      isCorrect: true,
      responseMs: 3000,
    })

    // itemは進まない（サブ設問全問が終わるまで親itemの位置は同じ）
    expect(s.answeredCount).toBe(0)
    expect(currentItem(s)?.questionId).toBe('q-1')
    // リザルトの集計入力に入る
    expect(s.attemptIds).toHaveLength(1)
    expect(s.subAnswers).toEqual([{ subQuestionId: 'q-1-sub0', selectedKey: 'A', isCorrect: true }])

    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.questionId).toBe('q-1-sub0')
    expect(attempts[0]!.id).toBe(s.attemptIds[0])
    // DBのスナップショットにも反映済み（=中断してもこの位置から再開できる）
    expect((await resumeSession(db))?.subAnswers).toHaveLength(1)
  })

  it('同じサブ設問の二度目の記録は拒否される（二重解答・複数タブ）', async () => {
    const db = newDb()
    const s = await startSession(db, { items: items() })
    const input = { questionId: 'q-1-sub0', selectedKey: 'A', isCorrect: true, responseMs: 3000 }
    await answerCurrentSubQuestion(db, s, input)

    await expect(answerCurrentSubQuestion(db, s, input)).rejects.toThrow(StaleSnapshotError)
    expect(await db.attempts.count()).toBe(1)
  })

  it('一手古いスナップショットから呼んでも記録済みのサブ設問を取りこぼさない', async () => {
    const db = newDb()
    const s = await startSession(db, { items: items() })
    // 1問目の結果を画面が受け取り損ねた状態（同じ s から2問目を記録する）を作る
    await answerCurrentSubQuestion(db, s, {
      questionId: 'q-1-sub0',
      selectedKey: 'A',
      isCorrect: true,
      responseMs: 3000,
    })
    const next = await answerCurrentSubQuestion(db, s, {
      questionId: 'q-1-sub1',
      selectedKey: 'B',
      isCorrect: false,
      responseMs: 4000,
    })

    expect(next.subAnswers?.map((a) => a.subQuestionId)).toEqual(['q-1-sub0', 'q-1-sub1'])
    expect(next.attemptIds).toHaveLength(2)
  })

  it('itemを進めるとサブ設問の記録は空に戻る（advanceSession・answerCurrentQuestion）', async () => {
    const db = newDb()
    let s = await startSession(db, { items: items() })
    s = await answerCurrentSubQuestion(db, s, {
      questionId: 'q-1-sub0',
      selectedKey: 'A',
      isCorrect: true,
      responseMs: 3000,
    })
    s = await advanceSession(db, s)
    expect(s.subAnswers).toEqual([])
    // attemptIdsは累積したまま（リザルトの集計対象から消さない）
    expect(s.attemptIds).toHaveLength(1)

    s = await answerCurrentSubQuestion(db, s, {
      questionId: 'q-2-sub0',
      selectedKey: 'A',
      isCorrect: true,
      responseMs: 3000,
    })
    expect(s.subAnswers).toHaveLength(1)
    s = await answerCurrentQuestion(db, s, { isCorrect: true, responseMs: 1000 })
    expect(s.subAnswers).toEqual([])
    expect(s.attemptIds).toHaveLength(3)
  })
})
