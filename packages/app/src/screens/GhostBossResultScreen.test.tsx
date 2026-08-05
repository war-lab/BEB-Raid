// T-128完了条件のテスト（正本: docs/22 3.5節）:
// - 正誤一覧・「弱点として公開される問題数」（誤答数）の表示
// - 送信ボタンでconsented=trueのsendGhostBossRecord経由でraidApi.sendGhostRecordが呼ばれる
// - 破棄すると送信せずホームへ戻る（completeSession呼び出し）
import 'fake-indexeddb/auto'
import type { Question, RaidBossState } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { RaidApi } from '../platform'
import { GHOST_BOSS_SUBMITTED_AT_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { GhostBossResultScreen } from './GhostBossResultScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`ghost-boss-result-test-${++seq}`)
  dbs.push(db)
  return db
}

const FAKE_BOSS: RaidBossState = {
  bossId: 'boss-test',
  name: 'テストボス',
  hp: 100,
  maxHp: 100,
  startAt: 0,
  endAt: 0,
  status: 'active',
  participantCount: 0,
  myDamage: 0,
  contributions: [],
}

class FakeRaidApi implements RaidApi {
  isConfigured = () => true
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: FAKE_BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
  createBattleRoom = vi.fn(async () => 'ABCD')
}

function q(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 4,
    tags: [],
    keyVocab: [],
    question: `question ${id}`,
  }
}

beforeEach(() => {
  useAppStore.setState({ screen: 'result' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

async function seedGhostBossSession(db: BebRaidDatabase) {
  await db.profile.put({
    id: PROFILE_ID,
    displayName: '花子',
    initialToeic: null,
    createdAt: 0,
    deviceToken: 'device-1',
  })
  const questions = [q('q-1'), q('q-2'), q('q-3')]
  useSessionStore.getState().begin(
    {
      sessionId: 'ghost-boss-1',
      items: questions.map((question) => ({ questionId: question.id, mode: 'battle' as const })),
      answeredCount: 3,
      attemptIds: ['a-1', 'a-2', 'a-3'],
      startedAt: 0,
      updatedAt: 0,
    },
    questions,
    null,
    { isGhostBossSession: true },
  )
  useSessionStore.getState().recordAnswer(useSessionStore.getState().snapshot!, {
    questionId: 'q-1',
    isCorrect: true,
    basePoints: 10,
  })
  useSessionStore.getState().recordAnswer(useSessionStore.getState().snapshot!, {
    questionId: 'q-2',
    isCorrect: false,
    basePoints: 0,
  })
  useSessionStore.getState().recordAnswer(useSessionStore.getState().snapshot!, {
    questionId: 'q-3',
    isCorrect: false,
    basePoints: 0,
  })
}

describe('GhostBossResultScreen: 記録プレビュー', () => {
  it('正解数・「弱点として公開される問題数」（誤答数）を表示する', async () => {
    const db = newDb()
    await seedGhostBossSession(db)
    const raidApi = new FakeRaidApi()

    render(<GhostBossResultScreen db={db} raidApi={raidApi} />)

    expect(await screen.findByText('正解 1 / 3')).toBeTruthy()
    expect(screen.getByTestId('ghost-boss-weakness-count').textContent).toContain(
      '弱点として公開される問題数: 2問',
    )
  })

  // docs/25 V-16: 同意判断の材料になる数値なので、--warn枠の注意カード内に数値だけを
  // 独立した要素として出す（誤答を悪と示さないため--ngは使わない）
  it('弱点として公開される問題数は注意カード内の独立した要素に出す', async () => {
    const db = newDb()
    await seedGhostBossSession(db)
    const raidApi = new FakeRaidApi()

    render(<GhostBossResultScreen db={db} raidApi={raidApi} />)

    const line = await screen.findByTestId('ghost-boss-weakness-count')
    expect(line.closest('.ghost-preview-notice')).toBeTruthy()
    expect(line.querySelector('.ghost-preview-notice__count')?.textContent).toBe('2')
  })

  it('送信ボタンでconsented=trueのsendGhostBossRecord経由でraidApi.sendGhostRecordが呼ばれ、送信済みフラグが保存される', async () => {
    const db = newDb()
    await seedGhostBossSession(db)
    const raidApi = new FakeRaidApi()

    render(<GhostBossResultScreen db={db} raidApi={raidApi} />)
    fireEvent.click(screen.getByText('送信する'))

    await waitFor(() => expect(raidApi.sendGhostRecord).toHaveBeenCalledTimes(1))
    expect(raidApi.sendGhostRecord).toHaveBeenCalledWith({
      consent: true,
      displayName: '花子',
      records: [
        { questionId: 'q-1', correct: true },
        { questionId: 'q-2', correct: false },
        { questionId: 'q-3', correct: false },
      ],
    })
    await waitFor(async () => {
      expect((await db.settings.get(GHOST_BOSS_SUBMITTED_AT_KEY))?.value).toBeTypeOf('number')
    })
    expect(await screen.findByTestId('ghost-boss-sent')).toBeTruthy()
  })

  // T-202（docs/29 Q-34）: 「送信する」の直下に隣接し、確認なしの1タップで記録が
  // 失われていた。確認ダイアログを経由するようになった
  it('破棄は確認を経てからsendGhostRecordを呼ばずホームへ戻る（キャンセルでは閉じない）', async () => {
    const db = newDb()
    await seedGhostBossSession(db)
    const raidApi = new FakeRaidApi()

    render(<GhostBossResultScreen db={db} raidApi={raidApi} />)
    fireEvent.click(screen.getByText('破棄する'))

    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()
    expect(useAppStore.getState().screen).not.toBe('home')

    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()

    fireEvent.click(screen.getByText('破棄する'))
    fireEvent.click(await screen.findByText('破棄する', { selector: '.confirm-dialog__primary' }))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('home'))
    expect(raidApi.sendGhostRecord).not.toHaveBeenCalled()
    expect(await db.settings.get(GHOST_BOSS_SUBMITTED_AT_KEY)).toBeUndefined()
  })

  it('送信失敗時はエラーメッセージを表示し、送信済みフラグは保存されない', async () => {
    const db = newDb()
    await seedGhostBossSession(db)
    const raidApi = new FakeRaidApi()
    raidApi.sendGhostRecord = vi.fn(async () => {
      throw new Error('network error')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    render(<GhostBossResultScreen db={db} raidApi={raidApi} />)
    fireEvent.click(screen.getByText('送信する'))

    expect(await screen.findByText(/送信に失敗しました/)).toBeTruthy()
    expect(await db.settings.get(GHOST_BOSS_SUBMITTED_AT_KEY)).toBeUndefined()
    warnSpy.mockRestore()
  })
})
