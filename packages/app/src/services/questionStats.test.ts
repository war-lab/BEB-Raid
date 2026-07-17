// T-100完了条件のテスト（正本: docs/17_M3実装計画.md 3.8節）:
// - 保存対象へdeviceTokenが混入しない（sendQuestionStatsへ渡す型に不在。RaidApi側で担保）
// - watermark集計（前回送信以降のみ・shadow:除外）
// - 設定OFF（既定）で一切送信されない
import 'fake-indexeddb/auto'
import type { QuestionStatPayload } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import type { RaidApi } from '../platform'
import { sendQuestionStats } from './questionStats'
import { QUESTION_STATS_ENABLED_KEY, QUESTION_STATS_LAST_SENT_AT_KEY } from './settingsKeys'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`question-stats-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

class FakeRaidApi implements RaidApi {
  isConfigured: () => boolean
  sendQuestionStats = vi.fn(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 型（mock.callsの引数型）を保つために宣言する
    async (stats: QuestionStatPayload[]): Promise<number> => 0,
  )
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

  constructor(configured = true) {
    this.isConfigured = () => configured
  }
}

function attempt(overrides: Partial<AttemptRecord> & Pick<AttemptRecord, 'id'>): AttemptRecord {
  return {
    questionId: 'q-1',
    mode: 'solo',
    isCorrect: true,
    responseMs: 1000,
    isTimeout: false,
    isGuess: false,
    answeredAt: 1000,
    ...overrides,
  }
}

describe('sendQuestionStats: 縮退設計（OFF時は通信しない）', () => {
  it('isConfigured=falseならsendQuestionStatsが呼ばれない', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.attempts.add(attempt({ id: 'a-1' }))
    const raidApi = new FakeRaidApi(false)

    await sendQuestionStats(db, raidApi)

    expect(raidApi.sendQuestionStats).not.toHaveBeenCalled()
  })

  it('questionStatsEnabled=false（既定）ならsendQuestionStatsが呼ばれない', async () => {
    const db = newDb()
    await db.attempts.add(attempt({ id: 'a-1' }))
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    expect(raidApi.sendQuestionStats).not.toHaveBeenCalled()
  })
})

describe('sendQuestionStats: watermark集計', () => {
  it('questionId別に正解/誤答/timeoutを集計して送信し、watermarkを最大answeredAtへ進める', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.attempts.bulkAdd([
      attempt({ id: 'a-1', questionId: 'q-1', isCorrect: true, answeredAt: 100 }),
      attempt({ id: 'a-2', questionId: 'q-1', isCorrect: false, answeredAt: 200 }),
      attempt({ id: 'a-3', questionId: 'q-1', isCorrect: false, isTimeout: true, answeredAt: 300 }),
      attempt({ id: 'a-4', questionId: 'q-2', isCorrect: true, answeredAt: 150 }),
    ])
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    expect(raidApi.sendQuestionStats).toHaveBeenCalledTimes(1)
    const sent = raidApi.sendQuestionStats.mock.calls[0]![0]
    expect(sent.sort((a, b) => a.questionId.localeCompare(b.questionId))).toEqual([
      { questionId: 'q-1', correct: 1, wrong: 1, timeout: 1 },
      { questionId: 'q-2', correct: 1, wrong: 0, timeout: 0 },
    ])

    const watermark = await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY)
    expect(watermark?.value).toBe(300)
  })

  it('前回watermark以前のattemptsは集計対象に含まれない', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: 200 })
    await db.attempts.bulkAdd([
      attempt({ id: 'a-1', questionId: 'q-1', isCorrect: true, answeredAt: 100 }),
      attempt({ id: 'a-2', questionId: 'q-1', isCorrect: false, answeredAt: 300 }),
    ])
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    const sent = raidApi.sendQuestionStats.mock.calls[0]![0]
    expect(sent).toEqual([{ questionId: 'q-1', correct: 0, wrong: 1, timeout: 0 }])
  })

  it('shadow:プレフィックスのquestionIdは集計から除外されるが、watermarkは進む', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.attempts.bulkAdd([
      attempt({ id: 'a-1', questionId: 'shadow:q-1', isCorrect: true, answeredAt: 100 }),
      attempt({ id: 'a-2', questionId: 'q-2', isCorrect: true, answeredAt: 200 }),
    ])
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    const sent = raidApi.sendQuestionStats.mock.calls[0]![0]
    expect(sent).toEqual([{ questionId: 'q-2', correct: 1, wrong: 0, timeout: 0 }])
    expect((await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value).toBe(200)
  })

  it('対象がshadow:のみの場合、送信せずwatermarkだけ進む', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.attempts.add(attempt({ id: 'a-1', questionId: 'shadow:q-1', answeredAt: 100 }))
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    expect(raidApi.sendQuestionStats).not.toHaveBeenCalled()
    expect((await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value).toBe(100)
  })

  it('対象attemptsが無ければ何もしない', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    const raidApi = new FakeRaidApi(true)

    await sendQuestionStats(db, raidApi)

    expect(raidApi.sendQuestionStats).not.toHaveBeenCalled()
    expect(await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY)).toBeUndefined()
  })
})

describe('sendQuestionStats: 失敗時はwatermarkを進めない', () => {
  it('sendQuestionStatsが失敗しても次回同じ範囲を再集計できるようwatermarkは変わらない', async () => {
    const db = newDb()
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: true })
    await db.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: 50 })
    await db.attempts.add(attempt({ id: 'a-1', questionId: 'q-1', answeredAt: 100 }))
    const raidApi = new FakeRaidApi(true)
    raidApi.sendQuestionStats.mockRejectedValueOnce(new Error('network error'))

    await sendQuestionStats(db, raidApi)

    expect((await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value).toBe(50)
  })
})
