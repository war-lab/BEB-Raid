// T-21 完了条件のテスト:
// - ホーム→クエスト開始が2タップ以内（主ボタン→即開始。時間チップは既定7分）
// - SRS期限数・ストリークが実データ（fake-indexeddb）で表示される
// - gap≥2 で「途切れ」表示になる
// - 期限0・ストリーク0の初期状態でも破綻しない表示
// T-23 完了条件のテスト:
// - イヤホンなしONでクイックパックにリスニング問題が含まれない
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { toDateString } from '../engine/date'
import { NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { HomeScreen } from './HomeScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`home-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function vocabQuestion(word: string): Question {
  return {
    id: `vocab-${word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: word,
    phrase: `Please ${word} it.`,
    back: `${word} の意味`,
    freqRank: 'S',
    levelBand: 730,
  }
}

function part2Question(id: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/dev-audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'When did you submit it? — Yesterday.',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'By email.' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

function part5Question(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word: 'attend', sense: '出席する', freqRank: 'A' }],
    question: 'Please ___ the meeting.',
    choices: [
      { key: 'A', text: 'attend' },
      { key: 'B', text: 'attends' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

/**
 * HomeScreen の起動時データ読み込み（evaluateStreak/getStreak/getSrsQueue）の完了を待つ。
 * 0件データ時は表示上の変化がなく検出できないため、専用の非表示マーカーで判定する
 */
const flushLoad = () => screen.findByTestId('home-loaded')

const QUESTION_POOL: Question[] = [
  vocabQuestion('submit'),
  vocabQuestion('attend'),
  vocabQuestion('negotiate'),
  part2Question('p2-1'),
  part2Question('p2-2'),
  part5Question('p5-1'),
  part5Question('p5-2'),
]

describe('HomeScreen: 初期状態でも破綻しない', () => {
  it('期限0・ストリーク0でも破綻せず描画できる', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)

    expect(screen.getByText('今日のクエスト')).toBeTruthy()
    expect(screen.queryByText(/SRS期限/)).toBeNull()
    expect(screen.queryByText(/途切れ/)).toBeNull()
    // データロード完了後も壊れないことを確認
    await flushLoad()
    expect(screen.getByText('今日のクエスト')).toBeTruthy()
    expect(screen.queryByText(/SRS期限/)).toBeNull()
    expect(screen.queryByText(/途切れ/)).toBeNull()
  })
})

describe('HomeScreen: 実データの表示', () => {
  it('SRS期限数とストリークが実データで表示される', async () => {
    const db = newDb()
    const today = toDateString(Date.now())
    await db.streak.put({
      id: 'streak',
      currentDays: 3,
      bestDays: 5,
      lastActiveDate: today,
      protectionUsedAt: null,
    })
    await db.srsCards.bulkPut([
      {
        id: 'vocab:a',
        refType: 'vocab',
        refId: 'a',
        stage: 1,
        dueAt: Date.now() - 1000,
        lapses: 0,
        introducedDate: '2026-07-01',
        graduatedAt: null,
        sourceQuestionId: null,
      },
      {
        id: 'vocab:b',
        refType: 'vocab',
        refId: 'b',
        stage: 1,
        dueAt: Date.now() - 1000,
        lapses: 0,
        introducedDate: '2026-07-01',
        graduatedAt: null,
        sourceQuestionId: null,
      },
    ])

    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    expect(screen.getByText('🔥3')).toBeTruthy()
    expect(screen.getByText('SRS期限 2')).toBeTruthy()
  })

  it('gap≥2 かつ本日未成立の場合は「途切れ（前回N日）」表示になる', async () => {
    const db = newDb()
    const threeDaysAgo = toDateString(Date.now() - 3 * 86_400_000)
    await db.streak.put({
      id: 'streak',
      currentDays: 5,
      bestDays: 5,
      lastActiveDate: threeDaysAgo,
      protectionUsedAt: null,
    })

    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    expect(screen.getByText('途切れ（前回5日）')).toBeTruthy()
    expect(screen.queryByText('🔥5')).toBeNull()
  })
})

describe('HomeScreen: クエスト開始が2タップ以内', () => {
  it('主ボタンを1タップするだけで既定7分のクエストが開始する', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    // 既定で7分チップが選択されている
    expect(screen.getByText('7分').className).toContain('is-selected')

    fireEvent.click(screen.getByText('今日のクエスト'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot).not.toBeNull()
    expect(useSessionStore.getState().snapshot!.items.length).toBeGreaterThan(0)
  })

  it('時間チップで3分に切り替えてからクエスト開始できる（2タップ）', async () => {
    const db = newDb()
    // 3分（SRSのみ構成）は期限カードが無いと空パックになるため、1件仕込む
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 1,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('3分'))
    expect(screen.getByText('3分').className).toContain('is-selected')
    fireEvent.click(screen.getByText('今日のクエスト'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
  })

  it('下方グリッドから語彙SRSへ直接遷移できる', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('語彙SRS'))
    expect(useAppStore.getState().screen).toBe('vocab')
  })

  it('下方グリッドからダッシュボードへ直接遷移できる', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('ダッシュボード'))
    expect(useAppStore.getState().screen).toBe('dashboard')
  })
})

describe('HomeScreen: Part2単独モードの再生バリエーション選択（T-39）', () => {
  it('Part2瞬発タップで選択肢が出て、「通常」選択では partialAudioMode が false のまま開始する', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('Part2瞬発'))
    expect(screen.getByText('通常')).toBeTruthy()
    expect(screen.getByText('冒頭だけ再生（特訓）')).toBeTruthy()

    fireEvent.click(screen.getByText('通常'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(false)
  })

  it('「冒頭だけ再生（特訓）」選択では partialAudioMode が true でセッションが始まる', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('Part2瞬発'))
    fireEvent.click(screen.getByText('冒頭だけ再生（特訓）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(true)
  })

  it('今日のクエスト開始では partialAudioMode が false のまま（回帰確認）', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(false)
  })
})

describe('HomeScreen: イヤホンなしモード（T-23）', () => {
  it('ONの場合、今日のクエストにリスニング問題(audio_qa)が含まれない', async () => {
    const db = newDb()
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: true })
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))

    const snapshot = useSessionStore.getState().snapshot!
    const questions = useSessionStore.getState().questions
    const hasListening = snapshot.items.some(
      (item) => questions.get(item.questionId)?.format === 'audio_qa',
    )
    expect(hasListening).toBe(false)
  })
})

describe('HomeScreen: シーズン表示・フェーズ駆動クエスト（T-54）', () => {
  it('phase不在（初回起動相当）でもP1「土台」が表示される', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    expect(screen.getByTestId('home-season').textContent).toContain('シーズン1「土台」')
  })

  it('総合レートが高いユーザーはP3「実戦」が初期表示される', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 700, updatedAt: 0 },
      { section: 'R', rating: 700, updatedAt: 0 },
    ])
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    expect(screen.getByTestId('home-season').textContent).toContain('シーズン3「実戦」')
  })

  it('今日のクエスト開始時、generateQuickPackにフェーズが渡り配分が反映される（回帰しない）', async () => {
    const db = newDb()
    render(<HomeScreen db={db} questionPool={QUESTION_POOL} />)
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    // フェーズ駆動でも既存どおりセッションが開始できることの回帰確認
    expect(useSessionStore.getState().snapshot!.items.length).toBeGreaterThan(0)
  })
})
