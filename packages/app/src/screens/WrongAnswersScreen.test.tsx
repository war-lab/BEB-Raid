// S9 間違えた問題一覧（発起人の要望、2026-08-03）。
// 何を防ぐか:
// - 誤答が一覧に出ない／正解した問題が混ざる
// - 一覧から復習セッションを始められない（見て終わりになる）
// - 進行中セッションを黙って破棄する（J-34の扱いを外す）
// - 解いた選択肢を表示したように見せる（attemptsに選択キーは無い＝出せない）
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { recordAttempt } from '../services/attempts'
import { startSession } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { WrongAnswersScreen } from './WrongAnswersScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`wrong-answers-test-${++seq}`)
  dbs.push(db)
  return db
}

beforeEach(() => {
  useAppStore.setState({ screen: 'wrongAnswers' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function part5(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
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

function part2(id: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    audio: '/dev-audio/dummy.mp3',
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 1000 },
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
    ],
    answer: 'A',
    explanation: '',
    translation: '',
  }
}

describe('WrongAnswersScreen', () => {
  it('誤答だけが一覧に出て、正解した問題は出ない', async () => {
    const db = newDb()
    const pool = [part5('q-1'), part5('q-2')]
    await recordAttempt(db, { questionId: 'q-1', mode: 'solo', isCorrect: false, responseMs: 5000 })
    await recordAttempt(db, { questionId: 'q-2', mode: 'solo', isCorrect: true, responseMs: 5000 })

    render(<WrongAnswersScreen db={db} questionPool={pool} />)

    const items = await screen.findAllByTestId('wrong-answer-item')
    expect(items).toHaveLength(1)
    expect(items[0]!.textContent).toContain('Please ___ the q-1.')
    // 正解は出さない
    expect(screen.queryByText(/Please ___ the q-2\./)).toBeNull()
    // 正解の選択肢は本文つきで出す（キーだけでは思い出せない）
    expect(items[0]!.textContent).toContain('正解: A. submit')
  })

  it('解説はたたんだ状態から開ける', async () => {
    const db = newDb()
    await recordAttempt(db, { questionId: 'q-1', mode: 'solo', isCorrect: false, responseMs: 5000 })

    render(<WrongAnswersScreen db={db} questionPool={[part5('q-1')]} />)
    await screen.findAllByTestId('wrong-answer-item')

    expect(screen.queryByText('q-1の解説')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '解説' }))
    expect(await screen.findByText('q-1の解説')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '解説を閉じる' }))
    expect(screen.queryByText('q-1の解説')).toBeNull()
  })

  it('Partで絞り込める', async () => {
    const db = newDb()
    await recordAttempt(db, { questionId: 'q-1', mode: 'solo', isCorrect: false, responseMs: 5000 })
    await recordAttempt(db, {
      questionId: 'p2-1',
      mode: 'solo',
      isCorrect: false,
      responseMs: 4000,
    })

    render(<WrongAnswersScreen db={db} questionPool={[part5('q-1'), part2('p2-1')]} />)
    expect(await screen.findAllByTestId('wrong-answer-item')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Part5' }))
    await waitFor(() => expect(screen.getAllByTestId('wrong-answer-item')).toHaveLength(1))
    expect(screen.getByTestId('wrong-answer-list').textContent).toContain('Please ___ the q-1.')
  })

  it('一覧から復習セッションを開始してドリルへ進む', async () => {
    const db = newDb()
    const pool = [part5('q-1'), part5('q-2')]
    await recordAttempt(db, { questionId: 'q-1', mode: 'solo', isCorrect: false, responseMs: 5000 })
    await recordAttempt(db, { questionId: 'q-2', mode: 'solo', isCorrect: false, responseMs: 5000 })

    render(<WrongAnswersScreen db={db} questionPool={pool} />)
    fireEvent.click(await screen.findByRole('button', { name: /この一覧で復習する（2問）/ }))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    const snapshot = useSessionStore.getState().snapshot!
    expect(snapshot.items.map((i) => i.questionId).sort()).toEqual(['q-1', 'q-2'])
    expect(snapshot.items.every((i) => i.mode === 'solo')).toBe(true)
  })

  it('進行中セッションがあるときは確認してから始める（黙って破棄しない）', async () => {
    const db = newDb()
    await recordAttempt(db, { questionId: 'q-1', mode: 'solo', isCorrect: false, responseMs: 5000 })
    // 別セッションが進行中の状態を作る
    await startSession(db, { items: [{ questionId: 'q-9', mode: 'solo' }] })

    render(<WrongAnswersScreen db={db} questionPool={[part5('q-1')]} />)
    fireEvent.click(await screen.findByRole('button', { name: /この一覧で復習する（1問）/ }))

    expect(await screen.findByText('進行中のセッションを破棄して復習を始めますか？')).toBeTruthy()
    // 確認中はまだ遷移していない
    expect(useAppStore.getState().screen).toBe('wrongAnswers')

    fireEvent.click(screen.getByRole('button', { name: '破棄して復習を始める' }))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot!.items[0]!.questionId).toBe('q-1')
  })

  it('問題データを引けない誤答は件数と理由を出す', async () => {
    const db = newDb()
    await recordAttempt(db, {
      questionId: 'vocab:submit',
      mode: 'srs',
      isCorrect: false,
      responseMs: 3000,
    })

    render(<WrongAnswersScreen db={db} questionPool={[]} />)

    expect(await screen.findByText(/問題データを引けない誤答が1件あります/)).toBeTruthy()
  })

  it('誤答が無ければ何をすれば並ぶのかを出す', async () => {
    const db = newDb()
    render(<WrongAnswersScreen db={db} questionPool={[part5('q-1')]} />)
    expect(await screen.findByText(/まだ誤答の記録がありません/)).toBeTruthy()
  })
})
