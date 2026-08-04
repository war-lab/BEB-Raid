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
import {
  formatReadingEstimate,
  HomeScreen,
  readingQuestionEstimate,
  remainingAnswerSlots,
} from './HomeScreen'

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
  createBattleRoom = vi.fn(async () => 'ABCD')
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
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

/** T-143: 読解（Part7単一）。1パッセージが複数設問を持つ点がPart2/5と違う */
function part7Question(id: string, subCount = 3): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: ['パラフレーズ照合'],
    keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'S' }],
    passages: [{ id: `${id}-p1`, kind: 'email', text: `${id}の本文。` }],
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `設問${i}`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: '解説',
      translation: '和訳',
    })),
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

    expect(screen.getByRole('button', { name: /今日のクエスト/ })).toBeTruthy()
    expect(screen.queryByText(/SRS期限/)).toBeNull()
    expect(screen.queryByText(/途切れ/)).toBeNull()
    // データロード完了後も壊れないことを確認
    await flushLoad()
    expect(screen.getByRole('button', { name: /今日のクエスト/ })).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))

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
    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))

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

    fireEvent.click(screen.getByRole('button', { name: /語彙SRS/ }))
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

  // 発起人の要望（2026-08-03）: 過去の誤答をあとから見返す入口
  it('下方グリッドから間違えた問題一覧へ遷移できる', async () => {
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

    fireEvent.click(screen.getByText('間違えた問題'))
    expect(useAppStore.getState().screen).toBe('wrongAnswers')
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

    expect(screen.getByRole('button', { name: /シャドーイング L1/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /シャドーイング/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
    fireEvent.click(screen.getByText('冒頭だけ再生（特訓）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().partialAudioMode).toBe(true)
  })

  // T-154: 本試験形式（3応答すべてを音声で流す）。ADR 0008でトグル併存と決定
  it('「音声のみで解答（本試験形式）」で audioOnlyPart2 が true・partialAudioMode は false で始まる', async () => {
    const db = newDb()
    // 応答音声が生成済み（responseOffsetsMs あり）の問題を混ぜる
    const audioOnlyQ = part2Question('p2-audio-only')
    audioOnlyQ.audioMeta = {
      accent: 'US',
      tts: false,
      voice: 'dev',
      durationMs: 12000,
      questionEndMs: 2700,
      responseOffsetsMs: [2900, 5300],
    }
    render(
      <HomeScreen
        db={db}
        questionPool={[...QUESTION_POOL, audioOnlyQ]}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
    fireEvent.click(screen.getByText('音声のみで解答（本試験形式）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().audioOnlyPart2).toBe(true)
    expect(useSessionStore.getState().partialAudioMode).toBe(false)
    // 未対応の問題（応答音声なし）はプールから除外される
    const items = useSessionStore.getState().snapshot?.items ?? []
    expect(items.map((i) => i.questionId)).toEqual(['p2-audio-only'])
  })

  it('音声のみモードに対応した問題が無ければセッションを始めず案内を出す', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
    fireEvent.click(screen.getByText('音声のみで解答（本試験形式）'))

    expect(await screen.findByText(/音声のみモードに対応した問題がまだありません/)).toBeTruthy()
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('通常・冒頭だけ再生では audioOnlyPart2 は false のまま（回帰）', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
    fireEvent.click(screen.getByText('冒頭だけ再生（特訓）'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().audioOnlyPart2).toBe(false)
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
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

  // 何を防ぐか（T-200。docs/29 Q-10）: 読解・audio_setは1itemでサブ設問複数を要求し、
  // 全問終わるまでanswerCurrentSubQuestionはitemを進めない（answeredCountは変わらず
  // snapshot.subAnswersだけが増える）。remainingAnswerSlotsがsubAnswersを見ずにitem単位で
  // 数えると、Part7で3問中1問だけ解答して「次へ」の前に中断した場合、その1問分が
  // 残数に反映されず「残り7問」のまま（実際は6問）になる。実機でも再現した
  // （Playwrightでpart7を1問解答→中断→ホームで「続きから再開（残り7問）」を確認）
  it('T-200: 読解の途中（次へを押す前）で中断すると、解答済みサブ設問が残数から引かれる', async () => {
    const pool = [...QUESTION_POOL, part7Question('p7-resume', 3)]
    const snapshot = snapshotOf({
      items: [
        { questionId: 'p7-resume', mode: 'solo' as const },
        { questionId: 'p2-1', mode: 'solo' as const },
      ],
      answeredCount: 0, // itemはまだ進んでいない（3問中1問答えただけ）
      attemptIds: ['a-1'],
      subAnswers: [{ subQuestionId: 'p7-resume-q0', selectedKey: 'A', isCorrect: true }],
    })

    // 純関数側: p7-resume(3スロット)+p2-1(1スロット)=4 のうち1問答え済みなので残り3
    expect(remainingAnswerSlots(snapshot, pool)).toBe(3)

    render(
      <HomeScreen
        db={newDb()}
        questionPool={pool}
        resumeSnapshot={snapshot}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    expect(screen.getByText('続きから再開（残り3問）')).toBeTruthy()
  })

  // T-162（docs/27 のS-38）で window.confirm を3択のアプリ内ダイアログへ置き換えた。
  // Yes/Noでは「続きから再開する」をその場で選べず、ホームへ戻って別のボタンを探す
  // 必要があったため（従来のテストは confirm の呼び出しを見ていたので書き換える）
  it('進行中セッションがある状態で開始しようとすると3択の確認が出る（残り問数入り）', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))

    // ダイアログ自体の出現を待つ（/残り1問/ は常設の「続きから再開（残り1問）」にも
    // 一致してしまい、状態更新の反映前に次のアサーションへ進んでしまう）
    const overlay = await screen.findByTestId('confirm-overlay')
    // T-122(J-61): 何を破棄するのか分かるよう、確認メッセージに残り問数を含める
    expect(overlay.textContent).toContain('残り1問')
    expect(screen.getByText('続きから再開する')).toBeTruthy()
    expect(screen.getByText('破棄して新しく始める')).toBeTruthy()
    expect(screen.getByText('やめる')).toBeTruthy()
    // まだ何も起きていない
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('「やめる」なら開始しない', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
    fireEvent.click(await screen.findByText('やめる'))

    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('「破棄して新しく始める」で新規セッションが開始する', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
    fireEvent.click(await screen.findByText('破棄して新しく始める'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(useSessionStore.getState().snapshot!.sessionId).not.toBe(snapshot.sessionId)
  })

  // 何を防ぐか: window.confirm の2択では選べなかった第3の選択肢が、実際に再開へ繋がること
  it('「続きから再開する」で中断していたセッションが再開する', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
    fireEvent.click(await screen.findByText('続きから再開する'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    // 新規ではなく中断していたセッションが復帰する
    expect(useSessionStore.getState().snapshot!.sessionId).toBe(snapshot.sessionId)
  })
})

describe('HomeScreen: 出題プール空の案内（T-73）', () => {
  it('questionPoolが空のとき、主ボタンがdisabledになり案内文が表示される', async () => {
    const db = newDb()
    render(
      <HomeScreen db={db} questionPool={[]} resumeSnapshot={null} raidApi={new FakeRaidApi()} />,
    )
    await flushLoad()

    const button = screen.getByRole('button', { name: /今日のクエスト/ }) as HTMLButtonElement
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

    const button = screen.getByRole('button', { name: /今日のクエスト/ }) as HTMLButtonElement
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
    expect(screen.getByRole('button', { name: /今日のクエスト/ })).toBeTruthy() // 学習動線は無傷
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /Part2瞬発/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
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

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
    expect(screen.getByText('20問').className).toContain('is-selected')
  })
})

describe('HomeScreen: 空パック時のフィードバック（T-121・J-60）', () => {
  it('SRSカードなしで3分クエストを開始するとメッセージが表示され、drillへ遷移しない', async () => {
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

    fireEvent.click(screen.getByText('3分'))
    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))

    expect(
      await screen.findByText(
        '今は出題できる問題がありません。3分クエストはSRS復習が中心です。復習カードが無いときは7分・15分をお試しください',
      ),
    ).toBeTruthy()
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('7分に切り替えて開始成功すると、3分の空パックメッセージは消える', async () => {
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

    fireEvent.click(screen.getByText('3分'))
    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
    await screen.findByText(/今は出題できる問題がありません/)

    fireEvent.click(screen.getByText('7分'))
    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(screen.queryByText(/今は出題できる問題がありません/)).toBeNull()
  })

  it('単独モードでプールに対象formatが無ければメッセージが表示される', async () => {
    const db = newDb()
    // Part5(text_blank)を含まないプール
    const poolWithoutPart5 = QUESTION_POOL.filter((q) => q.format !== 'text_blank')
    render(
      <HomeScreen
        db={db}
        questionPool={poolWithoutPart5}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
    fireEvent.click(screen.getByText('開始'))

    expect(await screen.findByText('今は出題できる問題がありません')).toBeTruthy()
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('単独モード開始成功時は、残っていた空パックメッセージをクリアする', async () => {
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

    fireEvent.click(screen.getByText('3分'))
    fireEvent.click(screen.getByRole('button', { name: /今日のクエスト/ }))
    await screen.findByText(/今は出題できる問題がありません/)

    fireEvent.click(screen.getByRole('button', { name: /^Part5/ }))
    fireEvent.click(screen.getByText('開始'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    expect(screen.queryByText(/今は出題できる問題がありません/)).toBeNull()
  })
})

describe('HomeScreen: イベントバトル参加の入口（M4・T-125。22の3.6節）', () => {
  it('raidApi.isConfigured()=falseなら入口ボタンが表示されない（縮退設計）', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(false)}
      />,
    )
    await flushLoad()

    expect(screen.queryByRole('button', { name: 'イベントバトルに参加' })).toBeNull()
  })

  it('raidApi.isConfigured()=trueなら入口ボタンが表示され、タップでbattle画面へ遷移する', async () => {
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

    const button = screen.getByRole('button', { name: 'イベントバトルに参加' })
    fireEvent.click(button)
    expect(useAppStore.getState().screen).toBe('battle')
  })
})

describe('HomeScreen: イベントバトル主催の入口（M4・T-126。22の3.6節）', () => {
  it('raidApi.isConfigured()=falseなら入口ボタンが表示されない（縮退設計）', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={QUESTION_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi(false)}
      />,
    )
    await flushLoad()

    expect(screen.queryByRole('button', { name: 'イベントバトルを主催' })).toBeNull()
  })

  it('raidApi.isConfigured()=trueなら入口ボタンが表示され、タップでbattleHost画面へ遷移する', async () => {
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

    const button = screen.getByRole('button', { name: 'イベントバトルを主催' })
    fireEvent.click(button)
    expect(useAppStore.getState().screen).toBe('battleHost')
  })
})

// V-13（docs/25 4.8節）: .home-gridの表層整備。構造（2列グリッド・素のボタン列）を
// 変えないことと、アイコン追加でアクセシブルネームが変わらないことを機械的に担保する
describe('HomeScreen: .home-gridの表層（V-13。docs/25 4.8節）', () => {
  async function renderConfigured() {
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
    const grid = document.querySelector('.home-grid')
    expect(grid).toBeTruthy()
    return grid as HTMLElement
  }

  it('構造は2列グリッドの素のボタン列のまま（直下の子は全てbutton要素）', async () => {
    const grid = await renderConfigured()
    // 間違えた問題・ダッシュボード・設定・レイド・イベントバトル参加・イベントバトル主催の6導線
    // （「間違えた問題」は2026-08-03に追加。モードタイルではなくナビゲーション枠に置く）
    expect(grid.children).toHaveLength(6)
    expect(Array.from(grid.children).every((el) => el.tagName === 'BUTTON')).toBe(true)
  })

  it('イベントバトルの2導線だけがアイコンを持ち、アイコンはaria-hiddenでラベルは変わらない', async () => {
    const grid = await renderConfigured()
    const withIcon = Array.from(grid.children).filter((el) => el.querySelector('.home-grid__icon'))
    expect(withIcon.map((el) => el.textContent)).toEqual([
      'イベントバトルに参加',
      'イベントバトルを主催',
    ])
    for (const el of withIcon) {
      expect(el.querySelector('.home-grid__icon')?.getAttribute('aria-hidden')).toBe('true')
    }
    // アクセシブルネームは文字ラベルのみで成立する（07の原則4: 色・形だけに頼らない）
    expect(screen.getByRole('button', { name: 'イベントバトルに参加' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'イベントバトルを主催' })).toBeTruthy()
  })
})

describe('HomeScreen: Part7読解モード（T-143・J-80）', () => {
  const READING_POOL: Question[] = [
    ...QUESTION_POOL,
    part7Question('p7-1', 3),
    part7Question('p7-2', 2),
    part7Question('p7-3', 4),
    part7Question('p7-4', 3),
  ]

  // 何を防ぐか（J-80）: Part7のコンテンツがあるのに、通勤クエストのパック配分経由でしか
  // 出会えない状態。着席・自宅で読解だけをやる導線が無かった
  it('モードグリッドに独立入口があり、パッセージ数と時間目安を選んで開始できる', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={READING_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Part7 読解/ }))

    // 問数ではなくパッセージ数で選ばせる（1パッセージが2〜4設問を要求するため）
    expect(await screen.findByText('読解（Part7）のパッセージ数を選んでください')).toBeTruthy()
    expect(screen.getByText('パッセージ数')).toBeTruthy()
    // J-80: 着席想定なので時間目安を出す。実際の出題はシャッフル後のN本なので、
    // 起こりうる設問数の範囲で出す（レビュー指摘、2026-08-03）
    expect(screen.getByText(/設問（目安/)).toBeTruthy()

    fireEvent.click(screen.getByText('開始'))

    // 読解なのでdrillを経由せずreadingへ直行する
    await waitFor(() => expect(useAppStore.getState().screen).toBe('reading'))
    const snapshot = useSessionStore.getState().snapshot!
    // 既定は2パッセージ
    expect(snapshot.items).toHaveLength(2)
    // Part7のitemだけが選ばれる（語彙・Part2・Part5は混ざらない）
    const lookup = new Map(READING_POOL.map((q) => [q.id, q]))
    expect(snapshot.items.every((i) => lookup.get(i.questionId)?.part === 7)).toBe(true)
  })

  it('パッセージ数の選択が保存され、次回に復元される', async () => {
    const db = newDb()
    const view = render(
      <HomeScreen
        db={db}
        questionPool={READING_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Part7 読解/ }))
    fireEvent.click(await screen.findByText('3本'))
    await waitFor(async () => expect((await db.settings.get('readingSetCount'))?.value).toBe(3))
    view.unmount()

    // 再マウントで復元される
    render(
      <HomeScreen
        db={db}
        questionPool={READING_POOL}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()
    fireEvent.click(screen.getByRole('button', { name: /Part7 読解/ }))
    await waitFor(() => expect(screen.getByText('3本').className).toContain('is-selected'))
  })

  it('プールにPart7が無ければ案内文を出して開始しない（T-121と同じ扱い）', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Part7 読解/ }))
    fireEvent.click(await screen.findByText('開始'))

    expect(await screen.findByText('今は出題できる問題がありません')).toBeTruthy()
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('プールが選択パッセージ数より少なければある分だけで開始する', async () => {
    const db = newDb()
    render(
      <HomeScreen
        db={db}
        questionPool={[...QUESTION_POOL, part7Question('p7-only', 2)]}
        resumeSnapshot={null}
        raidApi={new FakeRaidApi()}
      />,
    )
    await flushLoad()

    fireEvent.click(screen.getByRole('button', { name: /Part7 読解/ }))
    fireEvent.click(await screen.findByText('開始'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('reading'))
    expect(useSessionStore.getState().snapshot!.items).toHaveLength(1)
  })
})

// 何を防ぐか（レビュー指摘、2026-08-03）: 目安がプール先頭N件の合計だったため、
// 実際の出題（シャッフル後のN件）と設問数がずれていたこと。1パッセージ2〜5問のばらつきが
// そのまま表示の誤差になっていた
describe('readingQuestionEstimate（読解の設問数の見積り）', () => {
  const pool = [
    part7Question('p7-a', 2),
    part7Question('p7-b', 5),
    part7Question('p7-c', 3),
    part7Question('p7-d', 4),
  ]

  it('選ぶ本数から起こりうる最小・最大の設問数を返す', () => {
    // 2本なら最小=2+3、最大=5+4
    expect(readingQuestionEstimate(pool, 2)).toEqual({
      sets: 2,
      minQuestions: 5,
      maxQuestions: 9,
    })
    // 全部選ぶなら幅は無くなる
    expect(readingQuestionEstimate(pool, 4)).toEqual({
      sets: 4,
      minQuestions: 14,
      maxQuestions: 14,
    })
  })

  it('プールが選択本数より少なければある分だけで見積る', () => {
    expect(readingQuestionEstimate(pool.slice(0, 1), 3)).toEqual({
      sets: 1,
      minQuestions: 2,
      maxQuestions: 2,
    })
  })

  it('幅があるときだけ範囲表示にする', () => {
    expect(formatReadingEstimate({ sets: 2, minQuestions: 5, maxQuestions: 9 })).toBe(
      '約5〜9設問（目安5〜9分）',
    )
    expect(formatReadingEstimate({ sets: 1, minQuestions: 3, maxQuestions: 3 })).toBe(
      '約3設問（目安3分）',
    )
  })
})
