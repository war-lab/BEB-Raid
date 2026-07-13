// T-16 完了条件のテスト: リザルト画面が正誤一覧・獲得ポイント合計・レート変動・
// 「誤答N問を復習デッキに追加した」を表示し、ホームへ復帰時に completeSession される
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { resumeSession, startSession } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ResultScreen } from './ResultScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`result-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

beforeEach(() => {
  useAppStore.setState({ screen: 'result' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function q(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: `question ${id}`,
  }
}

describe('ResultScreen', () => {
  it('正誤一覧・獲得ポイント合計・誤答復習デッキ追加メッセージを表示する', async () => {
    const db = newDb()
    const snapshot = await startSession(db, {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [q('q-1'), q('q-2')], { L: 400, R: 400 })
    useSessionStore.getState().recordAnswer(snapshot, {
      questionId: 'q-1',
      isCorrect: true,
      basePoints: 80,
    })
    useSessionStore.getState().recordAnswer(snapshot, {
      questionId: 'q-2',
      isCorrect: false,
      basePoints: 0,
    })
    await db.ratings.put({ section: 'R', rating: 420, updatedAt: Date.now(), answerCount: 2 })

    render(<ResultScreen db={db} />)

    expect(screen.getByText('+80')).toBeTruthy()
    expect(screen.getByText('正解 1 / 2')).toBeTruthy()
    expect(screen.getByText('誤答1問を復習デッキに追加した')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/R: 400 → 420/)).toBeTruthy())
  })

  it('「ホームへ」でセッションが完了しストアがリセットされ、ホーム画面へ遷移する', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    useSessionStore.getState().recordAnswer(snapshot, {
      questionId: 'q-1',
      isCorrect: true,
      basePoints: 60,
    })

    render(<ResultScreen db={db} />)
    fireEvent.click(screen.getByText('ホームへ'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('home'))
    expect(useSessionStore.getState().snapshot).toBeNull()
    expect(await resumeSession(db)).toBeNull()
  })
})
