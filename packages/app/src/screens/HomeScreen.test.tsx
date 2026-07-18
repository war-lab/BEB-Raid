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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import { toDateString } from '../engine/date'
import * as shuffleModule from '../engine/shuffle'
import type { RaidApi } from '../platform'
import { syncRaidDamage } from '../services/raidSync'
import {
  NO_EARPHONE_MODE_KEY,
  QUEST_DURATION_KEY,
  RAID_REGISTERED_AT_KEY,
  RAID_SYNC_ENABLED_KEY,
  SINGLE_MODE_COUNT_KEY,
} from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { resetRaidSyncStoreForTest } from '../store/raidSyncStore'
import { useSessionStore } from '../store/sessionStore'
import { HomeScreen } from './HomeScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`home-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

class FakeRaidApi implements RaidApi {
  constructor(private readonly configured = false) {}
  isConfigured = () => this.configured
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => ({
    acceptedIds: [],
    boss: {
      bossId: 'boss-test',
      name: 'テストボス',
      hp: 100,
      maxHp: 100,
      startAt: 0,
      endAt: 0,
      status: 'active' as const,
      participantCount: 0,
      myDamage: 0,
      contributions: [],
    },
  }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
}

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  resetRaidSyncStoreForTest()
  vi.useRealTimers()
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
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )

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

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
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

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText('途切れ（前回5日）')).toBeTruthy()
    expect(screen.queryByText('🔥5')).toBeNull()
  })
})

describe('HomeScreen: ミニヒートマップ・ストリークパルス（T-78）', () => {
  it('直近4週間のattemptsのみがミニヒートマップに反映される（4週より前のデータは除外）', async () => {
    const db = newDb()
    const now = Date.now()
    const WEEK_MS = 7 * 86_400_000
    await db.attempts.bulkAdd([
      {
        id: 'recent',
        questionId: 'q-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now,
      },
      {
        // 4週間の表示窓より古い解答（クエリ時点で除外される想定）
        id: 'too-old',
        questionId: 'q-2',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now - 5 * WEEK_MS,
      },
    ])

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    const heatmap = await screen.findByTestId('home-mini-heatmap')
    const filledCells = Array.from(heatmap.querySelectorAll('.chart-heatmap rect')).filter(
      (r) => r.getAttribute('fill') !== 'none',
    )
    expect(filledCells.length).toBe(1)
  })

  it('前回表示時よりストリーク日数が増えたときだけパルス表示になる', async () => {
    const db = newDb()
    const today = toDateString(Date.now())
    await db.streak.put({
      id: 'streak',
      currentDays: 3,
      bestDays: 3,
      lastActiveDate: today,
      protectionUsedAt: null,
    })

    // 1回目の表示: lastSeenStreak未保存のため、初回はパルスする
    const first = render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()
    expect(screen.getByText('🔥3').className).toContain('is-pulse')
    first.unmount()

    // 2回目の表示: 同じストリーク日数のままなのでパルスしない
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()
    expect(screen.getByText('🔥3').className).not.toContain('is-pulse')
  })
})

describe('HomeScreen: クエスト開始が2タップ以内', () => {
  it('主ボタンを1タップするだけで既定7分のクエストが開始する', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
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
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('3分'))
    expect(screen.getByText('3分').className).toContain('is-selected')
    fireEvent.click(screen.getByText('今日のクエスト'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
  })

  it('下方グリッドから語彙SRSへ直接遷移できる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('語彙SRS'))
    expect(useAppStore.getState().screen).toBe('vocab')
  })

  it('下方グリッドからダッシュボードへ直接遷移できる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('ダッシュボード'))
    expect(useAppStore.getState().screen).toBe('dashboard')
  })

  it('下方グリッドからシャドーイングへ直接遷移でき、listeningStageが併記される（T-48）', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText(/シャドーイング L1/)).toBeTruthy()
    fireEvent.click(screen.getByText(/シャドーイング/))
    expect(useAppStore.getState().screen).toBe('shadowing')
  })
})

describe('HomeScreen: 時間チップの明確化と保存（T-112）', () => {
  it('「クエストの長さ」ラベルがチップ群に付き、今日のクエストボタンとグループ化される', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    const label = screen.getByText('クエストの長さ')
    const group = label.closest('.home-quest-group')
    expect(group).toBeTruthy()
    expect(group?.textContent).toContain('今日のクエスト')
    expect(group?.querySelector('.home-duration-chips')).toBeTruthy()
  })

  it('時間チップの選択がsettingsへ保存され、値がそのまま渡って開始できる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('15分'))

    await waitFor(async () => {
      expect((await db.settings.get(QUEST_DURATION_KEY))?.value).toBe(15)
    })
    expect(screen.getByText('15分').className).toContain('is-selected')
  })

  it('選択値が再マウント後も復元される（画面遷移・再起動を跨いだ維持）', async () => {
    const db = newDb()
    await db.settings.put({ key: QUEST_DURATION_KEY, value: 15 })

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText('15分').className).toContain('is-selected')
    expect(screen.getByText('7分').className).not.toContain('is-selected')
  })

  it('不正な保存値（3/7/15以外）は無視して既定7分のまま表示する', async () => {
    const db = newDb()
    await db.settings.put({ key: QUEST_DURATION_KEY, value: 999 })

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText('7分').className).toContain('is-selected')
  })
})

describe('HomeScreen: Part2単独モードの再生バリエーション選択（T-39）', () => {
  it('Part2瞬発タップで選択肢が出て、「通常」選択では partialAudioMode が false のまま開始する', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part2瞬発'))
    expect(screen.getByText('通常')).toBeTruthy()
    expect(screen.getByText('冒頭だけ再生（特訓）')).toBeTruthy()
    // T-116(8): スクロールしないと見えない問題への対処。画面中央固定のダイアログとして出す
    expect(screen.getByRole('dialog', { name: '音声の再生方法を選択' })).toBeTruthy()

    fireEvent.click(screen.getByText('通常'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(false)
  })

  it('「冒頭だけ再生（特訓）」選択では partialAudioMode が true でセッションが始まる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part2瞬発'))
    fireEvent.click(screen.getByText('冒頭だけ再生（特訓）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(true)
  })

  it('今日のクエスト開始では partialAudioMode が false のまま（回帰確認）', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
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
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
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
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByTestId('home-season').textContent).toContain('シーズン1「土台」')
  })

  it('総合レートが高いユーザーはP3「実戦」が初期表示される', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 700, updatedAt: 0 },
      { section: 'R', rating: 700, updatedAt: 0 },
    ])
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByTestId('home-season').textContent).toContain('シーズン3「実戦」')
  })

  it('今日のクエスト開始時、generateQuickPackにフェーズが渡り配分が反映される（回帰しない）', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    // フェーズ駆動でも既存どおりセッションが開始できることの回帰確認
    expect(useSessionStore.getState().snapshot!.items.length).toBeGreaterThan(0)
  })
})

describe('HomeScreen: セッション中断復帰（T-67）', () => {
  function snapshotOf(overrides: Partial<import('../services/session').SessionSnapshot> = {}) {
    return {
      sessionId: 'resume-session-1',
      items: [
        { questionId: 'p2-1', mode: 'solo' as const },
        { questionId: 'p2-2', mode: 'solo' as const },
      ],
      answeredCount: 1,
      attemptIds: ['a-1'],
      startedAt: 0,
      updatedAt: 0,
      ...overrides,
    }
  }

  it('進行中セッションが無いとき再開ボタンは出ない', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.queryByText(/続きから再開/)).toBeNull()
  })

  it('進行中セッションがあるとき「続きから再開（残りN問）」が表示され、タップでdrillへ進む', async () => {
    const db = newDb()
    const snapshot = snapshotOf()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={snapshot}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText('続きから再開（残り1問）')).toBeTruthy()
    fireEvent.click(screen.getByText('続きから再開（残り1問）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot).toEqual(snapshot)
  })

  it('進行中セッションがある状態で「今日のクエスト」を開始しようとするとconfirmが出て、キャンセルすると開始しない', async () => {
    const db = newDb()
    const snapshot = snapshotOf()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={snapshot}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled())

    expect(useAppStore.getState().screen).toBe('home')
    confirmSpy.mockRestore()
  })

  it('進行中セッションがある状態でconfirmを承諾すると新規セッションが開始する', async () => {
    const db = newDb()
    const snapshot = snapshotOf()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={snapshot}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('今日のクエスト'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot!.sessionId).not.toBe(snapshot.sessionId)
    confirmSpy.mockRestore()
  })
})

describe('HomeScreen: 出題プール空の案内（T-73）', () => {
  it('questionPoolが空のとき、主ボタンがdisabledになり案内文が表示される', async () => {
    const db = newDb()
    render(
      <HomeScreen db={db} questionPool={[]} resumeSnapshot={null} raidApi={new FakeRaidApi()} />,
    )
    await flushLoad()

    const button = screen.getByText('今日のクエスト') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(
      screen.getByText('問題データを取得できていません。オンラインで開き直してください'),
    ).toBeTruthy()
  })

  it('questionPoolがあるとき、主ボタンは有効で案内文は出ない', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    const button = screen.getByText('今日のクエスト') as HTMLButtonElement
    expect(button.disabled).toBe(false)
    expect(screen.queryByText(/問題データを取得できていません/)).toBeNull()
  })
})

describe('HomeScreen: レイドHPバー（M3・T-97）', () => {
  async function putRaidState(
    db: BebRaidDatabase,
    overrides: Partial<{
      joined: boolean
      hp: number
      maxHp: number
      endAt: number
      lastSyncedAt: number
    }> = {},
  ) {
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: JSON.stringify({ name: 'テストボス' }),
      hp: overrides.hp ?? 4200,
      maxHp: overrides.maxHp ?? 5000,
      myDamage: 300,
      joined: overrides.joined ?? true,
      startAt: Date.now() - 86_400_000,
      endAt: overrides.endAt ?? Date.now() + 2 * 86_400_000,
      lastSyncedAt: overrides.lastSyncedAt ?? Date.now(),
    })
  }

  it('raidStateが無ければ何も表示されない', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    expect(screen.queryByTestId('home-raid-hp')).toBeNull()
  })

  it('raidApi.isConfigured()=falseなら、raidState.joined=trueでも表示されない', async () => {
    const db = newDb()
    await putRaidState(db, { joined: true })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(false)}
      />,
    )
    await flushLoad()

    expect(screen.queryByTestId('home-raid-hp')).toBeNull()
  })

  it('raidState.joined=falseなら表示されない', async () => {
    const db = newDb()
    await putRaidState(db, { joined: false })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    expect(screen.queryByTestId('home-raid-hp')).toBeNull()
  })

  it('isConfigured=true かつ joined=true なら、ボス名・HP%・残り日数が表示される', async () => {
    const db = newDb()
    await putRaidState(db, {
      hp: 2500,
      maxHp: 5000,
      endAt: Date.now() + 3 * 86_400_000 - 1000,
    })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    const hpBar = await screen.findByTestId('home-raid-hp')
    expect(hpBar.textContent).toContain('テストボス')
    expect(hpBar.textContent).toContain('残り3日')
    // レビューF2(b): button内はspan構成にし、button全体の意味はaria-labelで伝える
    expect(hpBar.getAttribute('aria-label')).toBe('ボスHP 50%、残り3日。タップでレイド画面へ')
    // button内容モデル違反（<p>）が残っていない
    expect(hpBar.querySelector('p')).toBeNull()
  })

  it('profileJsonが破損していてもホームは白画面にならず、HPバーだけ非表示になる（レビューF2(a)）', async () => {
    const db = newDb()
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: '{broken json',
      hp: 4200,
      maxHp: 5000,
      myDamage: 300,
      joined: true,
      startAt: Date.now() - 86_400_000,
      endAt: Date.now() + 2 * 86_400_000,
      lastSyncedAt: Date.now(),
    })

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    expect(screen.queryByTestId('home-raid-hp')).toBeNull()
    expect(screen.getByText('今日のクエスト')).toBeTruthy() // 学習動線は無傷
  })

  it('討伐の成立はサーバーで確定する旨の注記を表示する', async () => {
    const db = newDb()
    await putRaidState(db)
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    const hpBar = await screen.findByTestId('home-raid-hp')
    expect(hpBar.textContent).toContain('討伐の成立は同期時にサーバーで確定します')
  })
})

describe('HomeScreen: オフライン表示規約（M3・T-99）', () => {
  async function putRaidStateWithSync(db: BebRaidDatabase, lastSyncedAt: number) {
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: JSON.stringify({ name: 'テストボス' }),
      hp: 4200,
      maxHp: 5000,
      myDamage: 300,
      joined: true,
      startAt: Date.now() - 86_400_000,
      endAt: Date.now() + 2 * 86_400_000,
      lastSyncedAt,
    })
  }

  it('最終同期をN分前として表示する（強調なし）', async () => {
    const db = newDb()
    await putRaidStateWithSync(db, Date.now() - 5 * 60_000)
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    const label = await screen.findByTestId('home-raid-last-synced')
    expect(label.textContent).toContain('最終同期: 5分前')
    expect(label.className).not.toContain('is-stale')
  })

  it('直近の同期が失敗していた場合、最終同期表示が強調色（is-stale）になる', async () => {
    const db = newDb()
    await putRaidStateWithSync(db, Date.now() - 10 * 60_000)
    const failingRaidApi = new FakeRaidApi(true)
    failingRaidApi.syncDamage.mockRejectedValueOnce(new Error('network error'))
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await syncRaidDamage(db, failingRaidApi) // lastSyncFailedフラグを実際の失敗経路で立てる

    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()

    const label = await screen.findByTestId('home-raid-last-synced')
    expect(label.className).toContain('is-stale')
  })
})

describe('HomeScreen: バックグラウンド同期完了への画面追従（T-103）', () => {
  async function putRaidState(db: BebRaidDatabase, hp: number, lastSyncedAt: number) {
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: JSON.stringify({ name: 'テストボス' }),
      hp,
      maxHp: 5000,
      myDamage: 300,
      joined: true,
      startAt: Date.now() - 86_400_000,
      endAt: Date.now() + 2 * 86_400_000,
      lastSyncedAt,
    })
  }

  it('マウント後の同期完了で、再マウントなしにHPバー・最終同期表示が更新される', async () => {
    const db = newDb()
    await putRaidState(db, 4200, Date.now() - 60 * 60_000)
    const raidApi = new FakeRaidApi(true)
    // 同一bossId（週替わりなし）で返し、joinedがリセットされないようにする
    raidApi.syncDamage.mockResolvedValueOnce({
      acceptedIds: [],
      boss: {
        bossId: 'boss-2026-W30',
        name: 'テストボス',
        hp: 1000,
        maxHp: 5000,
        startAt: Date.now() - 86_400_000,
        endAt: Date.now() + 2 * 86_400_000,
        status: 'active',
        participantCount: 0,
        myDamage: 0,
        contributions: [],
      },
    })
    render(
      <HomeScreen db={db} questionPool={QUESTION_POOL} resumeSnapshot={null} raidApi={raidApi} />,
    )
    await flushLoad()
    expect((await screen.findByTestId('home-raid-last-synced')).textContent).toContain('1時間前')

    // 同期成功でDB側のraidStateが更新される
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await syncRaidDamage(db, raidApi)

    await waitFor(async () => {
      const label = await screen.findByTestId('home-raid-last-synced')
      expect(label.textContent).toContain('たった今')
    })
  })

  it('同期失敗でis-stale強調が付き、次の成功で消える（再マウントなし）', async () => {
    const db = newDb()
    await putRaidState(db, 4200, Date.now())
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    const raidApi = new FakeRaidApi(true)
    // 同一bossId（週替わりなし）で返し、joinedがリセットされないようにする
    raidApi.syncDamage.mockResolvedValue({
      acceptedIds: [],
      boss: {
        bossId: 'boss-2026-W30',
        name: 'テストボス',
        hp: 4200,
        maxHp: 5000,
        startAt: Date.now() - 86_400_000,
        endAt: Date.now() + 2 * 86_400_000,
        status: 'active',
        participantCount: 0,
        myDamage: 0,
        contributions: [],
      },
    })
    render(
      <HomeScreen db={db} questionPool={QUESTION_POOL} resumeSnapshot={null} raidApi={raidApi} />,
    )
    await flushLoad()
    expect((await screen.findByTestId('home-raid-last-synced')).className).not.toContain('is-stale')

    raidApi.syncDamage.mockRejectedValueOnce(new Error('network error'))
    await syncRaidDamage(db, raidApi)
    await waitFor(async () => {
      expect((await screen.findByTestId('home-raid-last-synced')).className).toContain('is-stale')
    })

    await syncRaidDamage(db, raidApi)
    await waitFor(async () => {
      expect((await screen.findByTestId('home-raid-last-synced')).className).not.toContain(
        'is-stale',
      )
    })
  })
})

describe('HomeScreen: 時刻追従（T-105）', () => {
  it('60秒tickで「最終同期」の相対表示が更新される', async () => {
    const db = newDb()
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W30',
      profileJson: JSON.stringify({ name: 'テストボス' }),
      hp: 4200,
      maxHp: 5000,
      myDamage: 300,
      joined: true,
      startAt: Date.now() - 86_400_000,
      endAt: Date.now() + 2 * 86_400_000,
      lastSyncedAt: Date.now(),
    })
    // setInterval/clearInterval・Dateのみフェイク化する（setTimeout・Promiseはリアルタイムのまま
    // 動かし、findByTestId等のRTLの待機処理とのデッドロックを避ける）
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(true)}
      />,
    )
    await flushLoad()
    expect((await screen.findByTestId('home-raid-last-synced')).textContent).toContain('たった今')

    await vi.advanceTimersByTimeAsync(90 * 60_000) // 90分進める

    await waitFor(async () => {
      expect((await screen.findByTestId('home-raid-last-synced')).textContent).toContain('1時間前')
    })
  })

  it('raidStateが無ければtickは起動しない（例外も出ない）', async () => {
    const db = newDb()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(false)}
      />,
    )
    await flushLoad()

    expect(() => vi.advanceTimersByTime(5 * 60_000)).not.toThrow()
    expect(screen.queryByTestId('home-raid-hp')).toBeNull()
  })

  it('visibilitychangeで日付が変わっていたら再読込される（SRS期限バッジの追従で確認）', async () => {
    const db = newDb()
    const realNow = Date.now()
    // マウント時点ではまだ期限が来ていないSRSカード（1日後にdueAt）
    await db.srsCards.put({
      id: 'vocab:tomorrow-due',
      refType: 'vocab',
      refId: 'tomorrow-due',
      stage: 1,
      dueAt: realNow + 20 * 60 * 60_000, // 20時間後
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()
    expect(screen.queryByText(/SRS期限/)).toBeNull()

    // 日付を跨いで（visibleへの復帰想定）Date.nowを1日進める
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow + 86_400_000)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(screen.getByText('SRS期限 1')).toBeTruthy())
    dateNowSpy.mockRestore()
  })
})

describe('HomeScreen: 単独モードの問数選択とシャッフル（T-118）', () => {
  // Part5プールを問数選択肢（10/20/50）を跨いで検証できるだけの件数に増やす
  const MANY_PART5: Question[] = Array.from({ length: 30 }, (_, i) => part5Question(`p5-many-${i}`))
  const POOL_WITH_MANY_PART5: Question[] = [...QUESTION_POOL, ...MANY_PART5]

  it('Part5タップで問数選択モーダルが開き、既定20問が選択されている', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    expect(screen.getByRole('dialog', { name: 'Part5の問題数を選択' })).toBeTruthy()
    expect(screen.getByText('20問').className).toContain('is-selected')
  })

  it('選択した問数でPart5セッションが始まる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    fireEvent.click(screen.getByText('10問'))
    fireEvent.click(screen.getByText('開始'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot!.items.length).toBe(10)
  })

  it('プールが選択問数未満のときはある分だけで開始する', async () => {
    const db = newDb()
    // QUESTION_POOLのPart5（text_blank）は p5-1・p5-2 の2問のみ
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    fireEvent.click(screen.getByText('開始')) // 既定20問だがプールは2問のみ

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot!.items.length).toBe(2)
  })

  it('出題はプール順固定ではなくシャッフルされた結果から抽選される', async () => {
    const db = newDb()
    // shuffleを「反転」に固定し、プール順そのままでは起こり得ない並びが実際に使われることを検証する
    const shuffleSpy = vi
      .spyOn(shuffleModule, 'shuffle')
      .mockImplementation((items: readonly unknown[]) => [...items].reverse())
    render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    fireEvent.click(screen.getByText('10問'))
    fireEvent.click(screen.getByText('開始'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    const part5Pool = POOL_WITH_MANY_PART5.filter((q) => q.format === 'text_blank')
    const expectedIds = [...part5Pool]
      .reverse()
      .slice(0, 10)
      .map((q) => q.id)
    const actualIds = useSessionStore.getState().snapshot!.items.map((i) => i.questionId)
    expect(actualIds).toEqual(expectedIds)
    shuffleSpy.mockRestore()
  })

  it('選択した問数が保存され、再マウント後も復元される', async () => {
    const db = newDb()
    const first = render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part2瞬発'))
    fireEvent.click(screen.getByText('50問'))
    fireEvent.click(screen.getByText('通常'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))

    expect((await db.settings.get(SINGLE_MODE_COUNT_KEY))?.value).toBe(50)
    first.unmount()

    useAppStore.setState({ screen: 'home' })
    useSessionStore.getState().reset()
    render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    expect(screen.getByText('50問').className).toContain('is-selected')
  })

  it('不正な保存値は既定20問へフォールバックする', async () => {
    const db = newDb()
    await db.settings.put({ key: SINGLE_MODE_COUNT_KEY, value: 999 })
    render(
      <HomeScreen
        db={db}
        questionPool={POOL_WITH_MANY_PART5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByText('Part5'))
    expect(screen.getByText('20問').className).toContain('is-selected')
  })
})
