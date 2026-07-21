// T-104 完了条件のテスト（正本: docs/18 3.5節・4節T-104）:
// - Part6（4空所）が表示され、空所をタップして該当設問へジャンプできる
// - 空所を解答すると本文の該当箇所に選択結果が反映される
// - Part7単一（マーカーなし）を順に解答するとattemptsにサブ設問IDで記録され、
//   2/3ルールを使わずRセクションのレートが更新される
// - 中断復帰: 完了済みの1問目（パッセージ）をスキップして2問目から表示される
// - ペース表示（15秒タイマーではない柔らかい目安）が出る
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { advanceSession, startSession, type SessionItem } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ReadingScreen } from './ReadingScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`reading-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

beforeEach(() => {
  useAppStore.setState({ screen: 'reading' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

async function setupSession(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
  const snapshot = await startSession(db, { items })
  useSessionStore.getState().begin(snapshot, questions, { L: 400, R: 400 })
  return snapshot
}

/** Part6: 本文に [[1]]…[[4]] の空所マーカーを持つ問題（docs/18 3.1節） */
function part6Question(id: string): Question {
  const subCount = 4
  return {
    id,
    part: 6,
    format: 'text_passage',
    difficulty: 2,
    tags: ['文法'],
    keyVocab: [{ word: 'meeting', sense: '会議', freqRank: 'S' }],
    passages: [
      {
        id: `${id}-p1`,
        kind: 'notice',
        text:
          'Dear Team, [[1]] the meeting has been moved. [[2]] Please [[3]] your calendars ' +
          'accordingly. [[4]] Thank you for your understanding.',
      },
    ],
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `空所(${i + 1})に入る最も適切な語は？`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: `設問${i}の解説`,
      translation: `設問${i}の和訳`,
    })),
  }
}

/** Part7単一: マーカーを持たない1文書＋複数設問 */
function part7Question(id: string, subCount = 3, passageText?: string): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: ['パラフレーズ照合'],
    keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'S' }],
    passages: [
      {
        id: `${id}-p1`,
        kind: 'email',
        text: passageText ?? `${id}という請求書に関するメール本文。`,
      },
    ],
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `設問${i}`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: `設問${i}の解説`,
      translation: `設問${i}の和訳`,
    })),
  }
}

describe('ReadingScreen: Part6（T-104）', () => {
  it('本文に4つの空所プレースホルダーと現在の設問・ペース目安が表示される', async () => {
    const db = newDb()
    const q = part6Question('p6-1')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-blank-1').textContent).toBe('___(1)___')
    expect(screen.getByTestId('passage-blank-4').textContent).toBe('___(4)___')
    expect(screen.getByTestId('reading-question').textContent).toContain('設問1/4')
    expect(screen.getByText(/目安1問\/分/)).toBeTruthy()
  })

  it('空所を解答すると本文の該当箇所に選択結果が反映され、他の空所へジャンプできる', async () => {
    const db = newDb()
    const q = part6Question('p6-2')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))

    await waitFor(() => expect(screen.getByTestId('passage-blank-1').textContent).toBe('(1) a'))
    expect(screen.getByTestId('passage-blank-1').className).toContain('is-correct')
    // 未解答のまま残る空所はプレースホルダーのまま
    expect(screen.getByTestId('passage-blank-2').textContent).toBe('___(2)___')

    // 空所3を直接タップすると設問3へジャンプする（線形進行を強制しない=3.5節）
    fireEvent.click(screen.getByTestId('passage-blank-3'))
    await waitFor(() =>
      expect(screen.getByTestId('reading-question').textContent).toContain('設問3/4'),
    )
  })
})

describe('ReadingScreen: Part7単一（T-104）', () => {
  it('順に解答するとattemptsにサブ設問IDで記録され、Rセクションのレートが更新される', async () => {
    const db = newDb()
    const q = part7Question('p7-1', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
      fireEvent.click(screen.getByText('次へ'))
      if (i < 2) {
        await waitFor(() =>
          expect(screen.getByTestId('reading-question').textContent).toContain(`設問${i + 2}/3`),
        )
      }
    }

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(3)
    expect(attempts.map((a) => a.questionId).sort()).toEqual(['p7-1-q0', 'p7-1-q1', 'p7-1-q2'])
    expect(attempts.every((a) => a.isCorrect)).toBe(true)

    const rating = await db.ratings.get('R')
    expect(rating).toBeDefined()
  })

  it('誤答した設問はkeyVocabがSRSに追加される（2/3ルールは使わず1問ごとに独立採点）', async () => {
    const db = newDb()
    const q = part7Question('p7-2', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('b')) // 誤答

    await waitFor(() => expect(screen.getByText('不正解')).toBeTruthy())
    await waitFor(async () => expect(await db.srsCards.get('vocab:invoice')).toBeDefined())
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.isCorrect).toBe(false)
  })
})

describe('ReadingScreen: 中断復帰（T-104）', () => {
  it('完了済みの1問目（パッセージ）をスキップして2問目から表示される', async () => {
    const db = newDb()
    const q1 = part7Question('p7-resume-1', 2, '1問目のパッセージ本文。')
    const q2 = part7Question('p7-resume-2', 2, '2問目のパッセージ本文。')
    let snapshot = await startSession(db, {
      items: [
        { questionId: q1.id, mode: 'solo' },
        { questionId: q2.id, mode: 'solo' },
      ],
    })
    // 1問目は前回のセッションで解答済み（=item境界を進めた状態）を模擬する
    snapshot = await advanceSession(db, snapshot)
    useSessionStore.getState().begin(snapshot, [q1, q2], { L: 400, R: 400 })

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-text').textContent).toBe('2問目のパッセージ本文。')
    expect(screen.getByTestId('reading-question').textContent).toContain('設問1/2')
  })
})
