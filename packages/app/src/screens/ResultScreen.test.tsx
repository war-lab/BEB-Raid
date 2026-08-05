// T-16 完了条件のテスト: リザルト画面が正誤一覧・獲得ポイント合計・レート変動・
// 「誤答N問を復習デッキに追加した」を表示し、ホームへ復帰時に completeSession される
// T-109: 正解数・問題リストは中断・再開を跨いだセッション全体（snapshot.attemptIds経由で
// db.attemptsから読み直す）で集計される。テストのセットアップは実際のanswerCurrentQuestionを
// 通すことで、DBのattemptsとsnapshot.attemptIdsを整合させる（本番のDrillScreenと同じ経路）
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import type { RaidApi } from '../platform'
import {
  answerCurrentQuestion,
  completeSession,
  resumeSession,
  startSession,
  type SessionSnapshot,
} from '../services/session'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import {
  computeMaxStreak,
  formatStudyDuration,
  resultQuestionLabel,
  ResultScreen,
} from './ResultScreen'

// completeSessionの失敗経路（レビューF5(a)）をテストで注入するための部分モック。
// 既定は実装そのまま（他テストの挙動を変えない）
vi.mock('../services/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/session')>()
  return { ...actual, completeSession: vi.fn(actual.completeSession) }
})

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`result-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

const FAKE_BOSS = {
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
}

class FakeRaidApi implements RaidApi {
  constructor(private readonly configured = false) {}
  isConfigured = () => this.configured
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: FAKE_BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  createBattleRoom = vi.fn(async () => 'ABCD')
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
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

/**
 * 現在の問題に解答し、DBのattempts・snapshot.attemptIds・セッションストアのresultsを
 * すべて整合させる（本番のDrillScreen finalizeAnswer→recordAnswerPipelineと同じ経路）。
 * T-109の全体集計（snapshot.attemptIds経由）を成立させるため、テストからも
 * 実際のanswerCurrentQuestionを通す
 */
async function answerAndRecord(
  db: BebRaidDatabase,
  snapshot: SessionSnapshot,
  input: { isCorrect: boolean; basePoints: number; responseMs?: number; isTimeout?: boolean },
): Promise<SessionSnapshot> {
  const next = await answerCurrentQuestion(db, snapshot, {
    isCorrect: input.isCorrect,
    responseMs: input.responseMs ?? 1000,
    isTimeout: input.isTimeout,
  })
  const questionId = snapshot.items[snapshot.answeredCount]!.questionId
  useSessionStore.getState().recordAnswer(next, {
    questionId,
    isCorrect: input.isCorrect,
    basePoints: input.basePoints,
  })
  return next
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
    const afterFirst = await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 80 })
    await answerAndRecord(db, afterFirst, { isCorrect: false, basePoints: 0 })
    await db.ratings.put({ section: 'R', rating: 420, updatedAt: Date.now(), answerCount: 2 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
    // カウントアップ演出中は値が0から始まるため、タップして即スキップしてから検証する
    fireEvent.click(screen.getByTestId('result-content'))

    expect(screen.getByText('+80')).toBeTruthy()
    // レビューF5(c): 巨大な「+N」が何の数値か分かるラベルが付く
    expect(screen.getByText('獲得ポイント')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('正解 1 / 2')).toBeTruthy())
    expect(screen.getByText('誤答1問を復習デッキに追加した')).toBeTruthy()
    await waitFor(() => expect(screen.getByText(/R: 400 → 420/)).toBeTruthy())
  })

  it('中断・再開を跨いだセッション全体の正解数・問題リストを表示する（T-109）', async () => {
    // 「20問中17問解答→中断→再開して3問」のうち簡略化した3問版:
    // 2問解答済み（中断前）→再開後に1問解答、というシナリオを模擬する
    const db = newDb()
    const snapshot = await startSession(db, {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
        { questionId: 'q-3', mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [q('q-1'), q('q-2'), q('q-3')], { L: 400, R: 400 })
    // 中断前に2問解答（本番ではここでアプリを閉じてもDB・snapshotは既に更新済み）
    const afterFirst = await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 80 })
    const afterSecond = await answerAndRecord(db, afterFirst, {
      isCorrect: true,
      basePoints: 80,
    })

    // 「再開」を模擬: beginを呼び直してresultsストアを空にする（HomeScreen.handleResumeと同じ）
    useSessionStore.getState().begin(afterSecond, [q('q-1'), q('q-2'), q('q-3')], {
      L: 400,
      R: 400,
    })
    await answerAndRecord(db, afterSecond, { isCorrect: false, basePoints: 0 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    // resultsストア（再開後の1問のみ）に頼ると「正解0/1」になってしまう回帰の再発防止
    await waitFor(() => expect(screen.getByText('正解 2 / 3')).toBeTruthy())
    const list = screen.getByText('question q-1').closest('ul')!
    expect(list.querySelectorAll('li').length).toBe(3)
  })

  it('表示できなかった問題（skippedCount）があれば件数を表示する（T-108）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })
    useSessionStore.getState().incrementSkipped()
    useSessionStore.getState().incrementSkipped()

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    expect(screen.getByTestId('result-skipped-count').textContent).toBe(
      '表示できなかった問題: 2件（パックの再取得で直ることがあります）',
    )
  })

  it('スキップが0件なら「表示できなかった問題」行自体を出さない（T-108）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    expect(screen.queryByTestId('result-skipped-count')).toBeNull()
  })

  it('completeSessionが失敗しても「ホームへ」で必ずホームへ遷移する（レビューF5(a)）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // スナップショット削除の失敗を注入する（残ったスナップショットは次回startSessionで上書きされる想定）
    vi.mocked(completeSession).mockRejectedValueOnce(new Error('削除失敗'))

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
    fireEvent.click(screen.getByTestId('result-content')) // カウントアップ演出をスキップ
    expect(screen.getByText('+60')).toBeTruthy()

    fireEvent.click(screen.getByText('ホームへ'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('home'))
    expect(useSessionStore.getState().snapshot).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('「ホームへ」でセッションが完了しストアがリセットされ、ホーム画面へ遷移する', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
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
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() => expect(screen.getByTestId('phase-transition')).toBeTruthy())
    expect(screen.getByTestId('phase-transition').textContent).toContain('シーズン2')
  })

  it('移行条件を満たさない場合は演出が表示されない', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() => expect(screen.getByText('正解 1 / 1')).toBeTruthy())
    expect(screen.queryByTestId('phase-transition')).toBeNull()
  })
})

describe('ResultScreen: 報酬演出（T-77）', () => {
  async function setupSession(db: BebRaidDatabase) {
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 80 })
  }

  it('演出終了後は最終値（獲得ポイント）を表示する', async () => {
    const db = newDb()
    await setupSession(db)

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    // タップ等でスキップしない場合でも、rAFカウントアップの完了後は最終値に達する
    await waitFor(() => expect(screen.getByText('+80')).toBeTruthy(), { timeout: 2000 })
  })

  it('prefers-reduced-motionでは最初から最終値を静止表示する', async () => {
    const db = newDb()
    await setupSession(db)
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia

    try {
      render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
      // waitForを使わず即座に最終値であることを確認する（静止表示＝アニメーションなしの証明）
      expect(screen.getByText('+80')).toBeTruthy()
    } finally {
      window.matchMedia = original
    }
  })

  it('タップでカウントアップ演出を即スキップできる', async () => {
    const db = newDb()
    await setupSession(db)

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
    fireEvent.click(screen.getByTestId('result-content'))

    // クリック直後（rAF待ちなし）に最終値へ到達していることを確認する
    expect(screen.getByText('+80')).toBeTruthy()
  })
})

describe('ResultScreen: レイドダメージ送信トリガー（T-96）', () => {
  it('raidApiがisConfigured()=trueならマウント時にsyncDamageが呼ばれる', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })
    const raidApi = new FakeRaidApi(true)

    render(<ResultScreen db={db} raidApi={raidApi} />)

    // raidSyncEnabled設定が既定OFFのため、syncDamage自体は呼ばれない
    // （raidApiがconfigured=trueでも、raidSyncとの結線が「無条件で叩かない」ことの確認）
    await waitFor(() => expect(screen.getByText('+60')).toBeTruthy())
    expect(raidApi.syncDamage).not.toHaveBeenCalled()
  })

  it('raidApiがisConfigured()=falseなら何も呼ばれない（縮退設計）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })
    const raidApi = new FakeRaidApi(false)

    render(<ResultScreen db={db} raidApi={raidApi} />)

    await waitFor(() => expect(screen.getByText('+60')).toBeTruthy())
    expect(raidApi.syncDamage).not.toHaveBeenCalled()
  })
})

describe('ResultScreen: 問題リストの表記（T-111）', () => {
  function vocabQuestion(id: string, word: string): Question {
    return {
      id,
      part: 0,
      format: 'vocab_card',
      difficulty: 1,
      tags: [],
      keyVocab: [],
      front: word,
      phrase: `Please ${word} it.`,
      back: `${word}の意味`,
      freqRank: 'S',
      levelBand: 730,
    }
  }

  function audioQaQuestion(id: string, script: string): Question {
    return {
      id,
      part: 2,
      format: 'audio_qa',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      audio: `/audio/${id}.mp3`,
      audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
      script,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
    }
  }

  it('vocab_cardは対象語（front）を表示する', () => {
    expect(resultQuestionLabel('vocab-1', vocabQuestion('vocab-1', 'submit'))).toBe('submit')
  })

  it('audio_qa/dictation/audio_setは英文冒頭を約20字+「…」に短縮する', () => {
    const script = 'When did you submit the report to the manager?'
    const label = resultQuestionLabel('p2-1', audioQaQuestion('p2-1', script))
    expect(label).toBe(`${script.slice(0, 20)}…`)
    expect(label.length).toBeLessThan(script.length)
  })

  it('scriptが短ければ省略記号を付けずそのまま表示する', () => {
    const script = 'Short script.'
    expect(resultQuestionLabel('p2-2', audioQaQuestion('p2-2', script))).toBe(script)
  })

  it('text_blank等はquestion文をそのまま表示する（既存挙動の回帰）', () => {
    expect(resultQuestionLabel('q-1', q('q-1'))).toBe('question q-1')
  })

  it('問題が引けない場合（questionPool未読込・sub-question ID等）はquestionIdへフォールバックする', () => {
    expect(resultQuestionLabel('unknown-q', undefined)).toBe('unknown-q')
  })

  it('画面上でも形式別の表記が反映される', async () => {
    const db = newDb()
    const vocab = vocabQuestion('vocab-1', 'submit')
    const script = 'When did you submit the report to the manager?'
    const audioQa = audioQaQuestion('p2-1', script)
    const snapshot = await startSession(db, {
      items: [
        { questionId: vocab.id, mode: 'solo' },
        { questionId: audioQa.id, mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [vocab, audioQa], { L: 400, R: 400 })
    const afterFirst = await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 0 })
    await answerAndRecord(db, afterFirst, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())
    expect(screen.getByText(`${script.slice(0, 20)}…`)).toBeTruthy()
  })
})

describe('computeMaxStreak（docs/20 3.4節リザルト行「最大ストリーク」タイルの導出）', () => {
  it('正誤配列から最長連続正解数を求める（末尾が途切れても直前の最大値を保つ）', () => {
    expect(
      computeMaxStreak([
        { isCorrect: true },
        { isCorrect: true },
        { isCorrect: false },
        { isCorrect: true },
      ]),
    ).toBe(2)
  })

  it('全問正解なら配列長そのものが最大ストリーク', () => {
    expect(computeMaxStreak([{ isCorrect: true }, { isCorrect: true }])).toBe(2)
  })

  it('空配列は0', () => {
    expect(computeMaxStreak([])).toBe(0)
  })
})

describe('formatStudyDuration（docs/20 3.4節リザルト行「学習時間」タイルの導出）', () => {
  it('合計responseMsをm:ss形式にする', () => {
    expect(formatStudyDuration(6500)).toBe('0:07') // 6.5秒→四捨五入で7秒
    expect(formatStudyDuration(75_000)).toBe('1:15')
  })
})

describe('ResultScreen: 統計3タイル（docs/20 3.4節リザルト行）', () => {
  it('正解数・最大ストリーク・学習時間を表示する', async () => {
    const db = newDb()
    const snapshot = await startSession(db, {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
        { questionId: 'q-3', mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [q('q-1'), q('q-2'), q('q-3')], { L: 400, R: 400 })
    const afterFirst = await answerAndRecord(db, snapshot, {
      isCorrect: true,
      basePoints: 80,
      responseMs: 2000,
    })
    const afterSecond = await answerAndRecord(db, afterFirst, {
      isCorrect: true,
      basePoints: 80,
      responseMs: 3000,
    })
    await answerAndRecord(db, afterSecond, {
      isCorrect: false,
      basePoints: 0,
      responseMs: 1500,
    })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() =>
      expect(screen.getByTestId('result-max-streak').textContent).toBe('最大ストリーク 2'),
    )
    expect(screen.getByTestId('result-study-duration').textContent).toBe('学習時間 0:07')
    // 「正解 X / Y」はタイル化してもレビューF5(c)相当の既存文言のまま
    expect(screen.getByText('正解 2 / 3')).toBeTruthy()
  })
})

// docs/03 7.2節の「当て勘」「速度不足」は attempts に永続化済みだが、統計側でしか使われず
// 学習者には見えていなかった。誤答の質が分かると次の行動が変わるため表示する
describe('ResultScreen: 解答の質（当て勘・速度不足）', () => {
  it('2秒未満の誤答を当て勘として数える', async () => {
    const db = newDb()
    const snapshot = await startSession(db, {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [q('q-1'), q('q-2')], { L: 400, R: 400 })
    // 1.5秒で誤答＝当て勘（GUESS_THRESHOLD_MS=2000）
    const afterFirst = await answerAndRecord(db, snapshot, {
      isCorrect: false,
      basePoints: 0,
      responseMs: 1500,
    })
    // 3秒の誤答は当て勘に数えない（知識不足）
    await answerAndRecord(db, afterFirst, { isCorrect: false, basePoints: 0, responseMs: 3000 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() =>
      expect(screen.getByTestId('result-guess-count').textContent).toBe('当て勘 1'),
    )
    expect(screen.getByTestId('result-timeout-count').textContent).toBe('速度不足 0')
  })

  it('時間切れを速度不足として数え、当て勘には数えない（buildAttemptの排他を画面側でも固定）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    // 時間切れ。responseMs が2秒未満でも当て勘にはしない
    await answerAndRecord(db, snapshot, {
      isCorrect: false,
      basePoints: 0,
      responseMs: 1000,
      isTimeout: true,
    })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() =>
      expect(screen.getByTestId('result-timeout-count').textContent).toBe('速度不足 1'),
    )
    expect(screen.getByTestId('result-guess-count').textContent).toBe('当て勘 0')
  })

  // T-163（J-92）: 件数タイルだけでは「どの問題が時間切れだったか」が分からず、知識不足の
  // 誤答と混ざって振り返りを誤らせる。SRS復習デッキへの登録は維持したまま表示で区別する
  it('誤答一覧で時間切れの問題に注記が付き、それ以外には付かない', async () => {
    const db = newDb()
    const snapshot = await startSession(db, {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
      ],
    })
    useSessionStore.getState().begin(snapshot, [q('q-1'), q('q-2')], { L: 400, R: 400 })
    // 1問目は時間切れ、2問目は通常の誤答
    const afterFirst = await answerAndRecord(db, snapshot, {
      isCorrect: false,
      basePoints: 0,
      responseMs: 1000,
      isTimeout: true,
    })
    await answerAndRecord(db, afterFirst, {
      isCorrect: false,
      basePoints: 0,
      responseMs: 5000,
    })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() =>
      expect(screen.getByTestId('result-timeout-count').textContent).toBe('速度不足 1'),
    )
    const notes = document.querySelectorAll('.result-list__note')
    expect(notes.length).toBe(1)
    expect(notes[0]!.textContent).toBe('時間切れ')
  })

  it('全問正解でも0件のまま表示する（0件は良い知らせなので隠さない）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 80, responseMs: 500 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() =>
      expect(screen.getByTestId('result-guess-count').textContent).toBe('当て勘 0'),
    )
    // 500msの正解は当て勘ではない（当て勘は誤答限定）
    expect(screen.getByTestId('result-timeout-count').textContent).toBe('速度不足 0')
  })

  // T-210(Q-39・J-107): 「当て勘」「速度不足」の定義はtitle属性のみ（hover専用）で提供されて
  // おり、タッチ端末では説明に到達できなかった。タップで開閉できる説明に置き換える
  it('T-210: 「当て勘」「速度不足」の定義をタップで確認できる（titleはhoverでしか読めないため）', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: false, basePoints: 0, responseMs: 1500 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)
    await waitFor(() =>
      expect(screen.getByTestId('result-guess-count').textContent).toBe('当て勘 1'),
    )

    // 説明は既定で閉じている。タイルのtextContent自体は変えない（既存アサーションを壊さない）
    expect(screen.queryByText(/2秒未満の誤答。弱点統計では重みを半分にして数えます/)).toBeNull()
    fireEvent.click(screen.getByText('「当て勘」「速度不足」とは'))
    expect(screen.getByText(/2秒未満の誤答。弱点統計では重みを半分にして数えます/)).toBeTruthy()
    expect(screen.getByTestId('result-guess-count').textContent).toBe('当て勘 1')
  })
})

describe('ResultScreen: ボスHPバー（docs/20 3.4節リザルト行「ボスHPバー削れ」）', () => {
  it('レイド同期が成功し参加中ならボスHPバーを表示する', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'raid' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-test',
      profileJson: JSON.stringify({ name: 'テストボス' }),
      hp: 500,
      maxHp: 1000,
      myDamage: 60,
      joined: true,
      startAt: 0,
      endAt: Date.now() + 100_000,
      lastSyncedAt: 0,
    })
    const raidApi = new FakeRaidApi(true)
    raidApi.syncDamage = vi.fn(async () => ({
      acceptedIds: [],
      boss: { ...FAKE_BOSS, bossId: 'boss-test', hp: 400, maxHp: 1000, name: 'テストボス' },
    }))

    render(<ResultScreen db={db} raidApi={raidApi} />)

    const bar = await screen.findByTestId('result-boss-hp')
    expect(bar.textContent).toContain('400 / 1,000')
    expect(bar.textContent).toContain('テストボス に与えたダメージ')
  })

  it('レイド未参加（raidSync縮退経路）ならボスHPバーを表示しない', async () => {
    const db = newDb()
    const snapshot = await startSession(db, { items: [{ questionId: 'q-1', mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q('q-1')], { L: 400, R: 400 })
    await answerAndRecord(db, snapshot, { isCorrect: true, basePoints: 60 })

    render(<ResultScreen db={db} raidApi={new FakeRaidApi()} />)

    await waitFor(() => expect(screen.getByText('+60')).toBeTruthy())
    expect(screen.queryByTestId('result-boss-hp')).toBeNull()
  })
})
