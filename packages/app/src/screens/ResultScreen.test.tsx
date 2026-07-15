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

describe('ResultScreen: フェーズ移行判定・演出（T-54）', () => {
  function vocabCardQuestion(id: string, word: string): Question {
    return {
      id,
      part: 0,
      format: 'vocab_card',
      difficulty: 1,
      tags: [],
      keyVocab: [],
      front: word,
      phrase: `use ${word}`,
      phraseAudio: `audio/${word}.mp3`,
      back: '意味',
      freqRank: 'S',
      levelBand: 600,
    }
  }

  it('P1→P2の移行条件を満たすセッション完了で移行演出が表示される', async () => {
    const db = newDb()
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`)
    const vocabQuestions = words.map((w) => vocabCardQuestion(`vocab-${w}`, w))
    await db.srsCards.bulkPut(
      words.map((w) => ({
        id: `vocab:${w}`,
        refType: 'vocab' as const,
        refId: w,
        stage: 3,
        dueAt: 0,
        lapses: 0,
        introducedDate: '2026-07-01',
        graduatedAt: null,
        sourceQuestionId: null,
      })),
    )
    const p2Question: Question = {
      id: 'p2-1',
      part: 2,
      format: 'audio_qa',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      audio: '/audio/p2-1.mp3',
      audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
      script: 'test',
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
    }
    await db.attempts.bulkAdd(
      Array.from({ length: 100 }, (_, i) => ({
        id: `a-${i}`,
        questionId: 'p2-1',
        mode: 'solo' as const,
        isCorrect: i < 80,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: i,
      })),
    )

    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore
      .getState()
      .begin(snapshot, [q('q-1'), p2Question, ...vocabQuestions], { L: 400, R: 400 })
    useSessionStore.getState().recordAnswer(snapshot, {
      questionId: 'q-1',
      isCorrect: true,
      basePoints: 60,
    })

    render(<ResultScreen db={db} />)

    await waitFor(() => expect(screen.getByTestId('phase-transition')).toBeTruthy())
    expect(screen.getByTestId('phase-transition').textContent).toContain('シーズン2')
  })

  it('移行条件を満たさない場合は演出が表示されない', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    useSessionStore.getState().recordAnswer(snapshot, {
      questionId: 'q-1',
      isCorrect: true,
      basePoints: 60,
    })

    render(<ResultScreen db={db} />)

    await waitFor(() => expect(screen.getByText('正解 1 / 1')).toBeTruthy())
    expect(screen.queryByTestId('phase-transition')).toBeNull()
  })
})
