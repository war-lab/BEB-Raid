// T-16 完了条件のテスト:
// - 出題→解答→正誤→解説→次問→リザルト遷移、が通る
// - 誤答で srsCards（問題＋key語彙）が追加され、tagStats・ratings が更新される
// - SRS由来item（srsCardIdあり）の解答で reviewSrsCard が呼ばれる
// - 中断復帰: answeredCount > 0 のスナップショットから再開すると続きの問題が表示される
// T-17 完了条件のテスト（audio_qa。docs/10 T-17）:
// - タイマー0で自動的にisTimeout記録＋正誤表示に遷移する
// - 連続正解数がセッション内で増減する
// - 冒頭再生モードでplayがdurationMs付きで呼ばれる
// - 15秒タイマー中に解答すると残り時間に関係なく即確定する
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AudioPlayer } from '../platform'
import { answerCurrentQuestion, startSession, type SessionItem } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { DrillScreen } from './DrillScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`drill-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

/** AudioPlayer のフェイク（テスト用に呼び出しを記録する） */
class FakeAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  play = vi.fn(async () => {})
  playSequence = vi.fn(async () => {})
  replay = vi.fn(async () => {})
  stop = vi.fn(() => {})
}

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
  vi.useRealTimers()
})

function part5Question(id: string, answer: string, word: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word, sense: `${word} の意味`, freqRank: 'S' }],
    question: `Please ___ (${word}) the report.`,
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
      { key: 'C', text: 'c' },
      { key: 'D', text: 'd' },
    ],
    answer,
    explanation: '解説テキスト',
    translation: '和訳テキスト',
  }
}

const QUESTIONS = [part5Question('q-1', 'A', 'submit'), part5Question('q-2', 'B', 'attend')]

async function setupSession(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
  const snapshot = await startSession(db, { items })
  useSessionStore.getState().begin(snapshot, questions, { L: 400, R: 400 })
  return snapshot
}

/**
 * 選択肢をクリックし、非同期の解答処理チェーン（DB書き込み＋recordAnswer）が
 * 完全に完了するまで待つ。UIの正誤表示は setResult の同期更新で即座に出るため、
 * それだけを待つと answerCurrentQuestion 以降の await が終わる前に次の操作をしてしまい、
 * 「スナップショットが古い」エラーを引き起こす（recordAnswer はチェーンの最後に呼ばれる）
 */
async function answerAndSettle(choiceText: string, expectedAnsweredCount: number) {
  fireEvent.click(screen.getByText(choiceText))
  await waitFor(() =>
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(expectedAnsweredCount),
  )
}

describe('DrillScreen: 出題→解答→正誤→解説→次問→リザルト', () => {
  it('誤答すると解説カードが表示され、srsCards・tagStats・ratingsが更新される', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // q-1 の正解は A。B(誤答)を選ぶ
    await answerAndSettle('b', 1)

    expect(screen.getByText('不正解')).toBeTruthy()
    expect(screen.getByText('解説テキスト')).toBeTruthy()
    expect(screen.getByText('次へ')).toBeTruthy()

    // 誤答問題そのものと key語彙 が srsCards に追加されている
    expect(await db.srsCards.get('question:q-1')).toBeDefined()
    expect(await db.srsCards.get('vocab:submit')).toBeDefined()

    // タグ統計が更新されている
    const tagStat = await db.tagStats.get('品詞')
    expect(tagStat).toBeDefined()
    expect(tagStat!.windowTotal).toBeGreaterThan(0)

    // レートが更新されている（part5 → R セクション）
    const rating = await db.ratings.get('R')
    expect(rating).toBeDefined()
  })

  it('正解した場合は srsCards に問題カードが追加されない', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // q-1 の正解

    expect(screen.getByText('正解')).toBeTruthy()
    expect(await db.srsCards.get('question:q-1')).toBeUndefined()
  })

  it('解答済みの選択肢ボタンは再度クリックできない（二重解答防止）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1)

    expect(await db.attempts.count()).toBe(1)
    fireEvent.click(screen.getByText('b'))
    // disabled のため attempts は増えない
    expect(await db.attempts.count()).toBe(1)
  })

  it('「次へ」で次の問題に進み、最終問題後はリザルト画面へ遷移する', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1)
    fireEvent.click(screen.getByText('次へ'))

    // 2問目（q-2）が表示される
    expect(screen.getByText(/attend/)).toBeTruthy()

    await answerAndSettle('b', 2) // q-2 の正解
    fireEvent.click(screen.getByText('次へ'))

    expect(useAppStore.getState().screen).toBe('result')
  })

  it('SRS由来item（srsCardIdあり）の解答で reviewSrsCard が呼ばれる', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'question:q-1',
      refType: 'question',
      refId: 'q-1',
      stage: 0,
      dueAt: Date.now(),
      lapses: 0,
      introducedDate: null,
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const items: SessionItem[] = [{ questionId: 'q-1', mode: 'srs', srsCardId: 'question:q-1' }]
    await setupSession(db, items, [QUESTIONS[0]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // 正解 → good

    const card = await db.srsCards.get('question:q-1')
    expect(card?.introducedDate).not.toBeNull()
    expect(card?.stage).toBe(0) // good: 未導入(-1) → 0
  })

  it('中断復帰: answeredCount > 0 のスナップショットから続きの問題が表示される', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    let snapshot = await startSession(db, { items })
    // 1問目を解答済みにしてから「再開」を模擬
    snapshot = await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })
    useSessionStore.getState().begin(snapshot, QUESTIONS, { L: 400, R: 400 })

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    // 2問目（q-2）から再開する
    expect(screen.getByText(/attend/)).toBeTruthy()
  })
})

function audioQaQuestion(id: string, answer: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/dev-audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'When did you submit the report? — I submitted it yesterday.',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'In the meeting room.' },
      { key: 'C', text: 'By email.' },
    ],
    answer,
    explanation: '解説テキスト',
    translation: '和訳テキスト',
  }
}

describe('DrillScreen: audio_qa（Part2瞬発。T-17）', () => {
  it('開始タップでunlock→playが呼ばれ、再生後に3択が解答可能になる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    // 再生前は選択肢が出ない
    expect(screen.queryByText('Yesterday.')).toBeNull()

    fireEvent.click(screen.getByText('タップして開始'))
    expect(audioPlayer.unlock).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, undefined)
  })

  it('冒頭再生モード（partialAudioMode）では play が durationMs 付きで呼ばれる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    const snapshot = await startSession(db, { items: [{ questionId: q.id, mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q], { L: 400, R: 400 }, { partialAudioMode: true })
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('タップして開始'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, { durationMs: 2500 })
  })

  it('もう一度再生ボタンで audioPlayer.replay が呼ばれる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('タップして開始'))
    await waitFor(() => expect(screen.getByText('もう一度再生')).toBeTruthy())

    fireEvent.click(screen.getByText('もう一度再生'))
    expect(audioPlayer.replay).toHaveBeenCalledTimes(1)
  })

  it('連続正解でストリークが増え、誤答でリセットされる', async () => {
    const db = newDb()
    const questions = [audioQaQuestion('p2-1', 'A'), audioQaQuestion('p2-2', 'A')]
    await setupSession(
      db,
      questions.map((q) => ({ questionId: q.id, mode: 'solo' })),
      questions,
    )
    const audioPlayer = new FakeAudioPlayer()
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(screen.getByText('タップして開始'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1) // 正解
    expect(screen.getByText('🔥1')).toBeTruthy()

    fireEvent.click(screen.getByText('次へ'))
    fireEvent.click(screen.getByText('タップして開始'))
    await waitFor(() => expect(screen.getByText('In the meeting room.')).toBeTruthy())
    await answerAndSettle('In the meeting room.', 2) // 誤答（正解はA）
    expect(screen.queryByText('🔥1')).toBeNull() // ストリークがリセットされる
  })

  it('15秒タイマーが0になると自動的にisTimeout誤答として記録され、正誤表示に遷移する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    // setInterval/clearInterval のみをフェイク化する（Dexie/fake-indexeddb が
    // 内部で使う setTimeout・Promise はリアルタイムのまま動かし、デッドロックを避ける）
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('タップして開始'))
    // handlePlayStart 内の await audioPlayer.unlock()/play()（リアルタイムのマイクロタスク）を解決させる
    await vi.waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(15_000)
    // finalizeAnswer の一連（DB書き込み含む）が完了するまで待つ（answerAndSettle と同じ理由）
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    expect(screen.getByText('不正解')).toBeTruthy()
    expect(screen.getByText('時間切れ')).toBeTruthy()
    const logs = await db.attempts.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.isTimeout).toBe(true)
    expect(logs[0]!.isCorrect).toBe(false)
  })

  it('15秒タイマー中に解答すると残り時間に関係なく即確定する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('タップして開始'))
    await vi.waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(3000) // タイマーはまだ残っている状態
    fireEvent.click(screen.getByText('Yesterday.'))
    // finalizeAnswer の一連（DB書き込み含む）が完了するまで待つ（answerAndSettle と同じ理由）
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    expect(await db.attempts.count()).toBe(1)
    expect(screen.getByText('正解')).toBeTruthy()
    const logs = await db.attempts.toArray()
    expect(logs[0]!.isTimeout).toBe(false)
  })
})
