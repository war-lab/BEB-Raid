// 復習セッション開始フックの単体テスト（T-264。29の11節「テスト空白地帯」）。
// 何を防ぐか: 進行中セッションがあるのに黙って破棄する（J-34の扱いを外す）、
// conflict確定後にdiscardAndStart/resumeのどちらを呼んでも意図通りに分岐しない、
// といった「間違えた問題一覧（S9）」「イベントバトル後の復習」共通の退行。

import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  ACTIVE_SESSION_KEY,
  startSession,
  type SessionItem,
  type SessionSnapshot,
} from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { useReviewSession } from './useReviewSession'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`use-review-session-test-${++seq}`)
  dbs.push(db)
  return db
}

function part5(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: `Please ___ the ${id}.`,
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: `${id}の解説`,
    translation: '和訳',
  }
}

beforeEach(() => {
  useAppStore.setState({ screen: 'wrongAnswers' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('useReviewSession', () => {
  it('進行中セッションが無ければ即座に開始し、drillへ遷移する', async () => {
    const db = newDb()
    const pool = [part5('a'), part5('b')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start(['a', 'b'])
    })

    expect(result.current.conflict).toBe(false)
    expect(useAppStore.getState().screen).toBe('drill')
    expect(useSessionStore.getState().snapshot?.items.map((i) => i.questionId)).toEqual(['a', 'b'])
    // 開始したitemsはS9/バトル復習のため常にmode='solo'（SRS復習カードとしては扱わない）
    expect(useSessionStore.getState().snapshot?.items.every((i) => i.mode === 'solo')).toBe(true)
  })

  it('questionIdsが空なら何もしない（既存の進行中セッションにも触れない）', async () => {
    const db = newDb()
    const existingItems: SessionItem[] = [{ questionId: 'existing', mode: 'solo' }]
    await startSession(db, { items: existingItems })
    const pool = [part5('existing')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start([])
    })

    expect(result.current.conflict).toBe(false)
    expect(useAppStore.getState().screen).toBe('wrongAnswers')
    const stored = await db.settings.get(ACTIVE_SESSION_KEY)
    expect(stored?.value).toMatchObject({ items: existingItems })
  })

  it('進行中セッションがある状態でstartを呼ぶとconflictが立ち、黙って開始しない', async () => {
    const db = newDb()
    const existingItems: SessionItem[] = [{ questionId: 'existing', mode: 'solo' }]
    await startSession(db, { items: existingItems })
    const pool = [part5('existing'), part5('new')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start(['new'])
    })

    expect(result.current.conflict).toBe(true)
    // conflict中はまだ画面遷移していない（黙って破棄しない=J-34と同じ扱い）
    expect(useAppStore.getState().screen).toBe('wrongAnswers')
    expect(useSessionStore.getState().snapshot).toBeNull()
  })

  it('conflict後にdiscardAndStartを呼ぶと、保留していた新セッションが開始される', async () => {
    const db = newDb()
    const existingItems: SessionItem[] = [{ questionId: 'existing', mode: 'solo' }]
    await startSession(db, { items: existingItems })
    const pool = [part5('existing'), part5('new')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start(['new'])
    })
    expect(result.current.conflict).toBe(true)

    await act(async () => {
      await result.current.discardAndStart()
    })

    expect(result.current.conflict).toBe(false)
    expect(useAppStore.getState().screen).toBe('drill')
    expect(useSessionStore.getState().snapshot?.items.map((i) => i.questionId)).toEqual(['new'])
    // DBのスナップショットも新セッションに上書きされている（旧セッションは残らない）
    const stored = await db.settings.get(ACTIVE_SESSION_KEY)
    const storedSnapshot = stored?.value as SessionSnapshot | undefined
    expect(storedSnapshot?.items.map((i) => i.questionId)).toEqual(['new'])
  })

  it('conflict後にresumeを呼ぶと、保留していた新セッションではなく既存セッションの続きへ戻る', async () => {
    const db = newDb()
    const existingItems: SessionItem[] = [{ questionId: 'existing', mode: 'solo' }]
    const existingSnapshot = await startSession(db, { items: existingItems })
    const pool = [part5('existing'), part5('new')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start(['new'])
    })
    expect(result.current.conflict).toBe(true)

    await act(async () => {
      await result.current.resume()
    })

    expect(result.current.conflict).toBe(false)
    expect(useAppStore.getState().screen).toBe('drill')
    // 新セッション（'new'）ではなく既存セッション（'existing'）が再開される
    expect(useSessionStore.getState().snapshot?.sessionId).toBe(existingSnapshot.sessionId)
    expect(useSessionStore.getState().snapshot?.items.map((i) => i.questionId)).toEqual([
      'existing',
    ])
  })

  it('cancelはconflictを取り下げるのみで、既存セッション・画面のどちらも変えない', async () => {
    const db = newDb()
    const existingItems: SessionItem[] = [{ questionId: 'existing', mode: 'solo' }]
    await startSession(db, { items: existingItems })
    const pool = [part5('existing'), part5('new')]

    const { result } = renderHook(() => useReviewSession(db, pool))
    await act(async () => {
      await result.current.start(['new'])
    })
    expect(result.current.conflict).toBe(true)

    act(() => result.current.cancel())

    expect(result.current.conflict).toBe(false)
    expect(useAppStore.getState().screen).toBe('wrongAnswers')
    expect(useSessionStore.getState().snapshot).toBeNull()
    const stored = await db.settings.get(ACTIVE_SESSION_KEY)
    expect(stored?.value).toMatchObject({ items: existingItems })
  })
})
