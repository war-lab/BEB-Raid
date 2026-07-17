// T-98完了条件のテスト（正本: docs/17_M3実装計画.md 3.7節・5節T-98シート）:
// - 未登録→登録→参加→raidState書込＋raidSyncEnabled=ON の一連
// - 「レイドに挑む」でセッションのmodeが'raid'になる
// - 討伐状態受信で演出表示
import 'fake-indexeddb/auto'
import type { Question, RaidBossState, RegisterRequest } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID, RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { resetRaidSyncFlagsForTest, syncRaidDamage } from '../services/raidSync'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { RaidScreen } from './RaidScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`raid-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
  resetRaidSyncFlagsForTest()
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const ACTIVE_BOSS: RaidBossState = {
  bossId: 'boss-2026-W30',
  name: 'テストボス',
  hp: 4000,
  maxHp: 5000,
  startAt: 0,
  endAt: 1_000_000,
  status: 'active',
  participantCount: 1,
  myDamage: 100,
  contributions: [{ displayName: '太郎', damage: 100 }],
}

class FakeRaidApi implements RaidApi {
  configured = true
  currentBoss: RaidBossState | null = ACTIVE_BOSS
  registerShouldFail: 'unauthorized' | 'network' | null = null
  registerCalls: RegisterRequest[] = []

  isConfigured = () => this.configured
  register = vi.fn(async (req: RegisterRequest) => {
    this.registerCalls.push(req)
    if (this.registerShouldFail === 'unauthorized') {
      throw new RaidApiError('unauthorized', '招待コードが不正です')
    }
    if (this.registerShouldFail === 'network') {
      throw new RaidApiError('network', '通信エラー')
    }
  })
  fetchCurrentBoss = vi.fn(async () => this.currentBoss)
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: this.currentBoss ?? ACTIVE_BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
}

function textBlankQuestion(id: string): Question {
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
    explanation: '解説',
    translation: '和訳',
  }
}

const QUESTION_POOL: Question[] = Array.from({ length: 10 }, (_, i) => textBlankQuestion(`q-${i}`))

async function putProfile(db: BebRaidDatabase) {
  await db.profile.put({
    id: PROFILE_ID,
    displayName: '太郎',
    initialToeic: null,
    createdAt: 0,
    deviceToken: 'device-1',
  })
}

describe('RaidScreen: 未登録→登録→参加の一連（T-98）', () => {
  it('未登録なら登録フォームが表示される', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByTestId('raid-register-form')).toBeTruthy()
    expect(screen.getByDisplayValue('太郎')).toBeTruthy()
  })

  it('登録成功で settings.raidRegisteredAt が保存され、ボス表示へ切り替わる', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.change(screen.getByLabelText('招待コード'), { target: { value: 'invite-1' } })
    fireEvent.click(screen.getByText('登録する'))

    await screen.findByTestId('raid-boss')
    expect(raidApi.registerCalls).toEqual([
      { inviteCode: 'invite-1', deviceToken: 'device-1', displayName: '太郎', dailyGoal: 'normal' },
    ])
    await waitFor(async () => {
      expect((await db.settings.get(RAID_REGISTERED_AT_KEY))?.value).toBeTypeOf('number')
    })
  })

  it('招待コードが不正なら401エラーメッセージを表示し、登録フォームのまま', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()
    raidApi.registerShouldFail = 'unauthorized'

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.change(screen.getByLabelText('招待コード'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('登録する'))

    expect(await screen.findByText('招待コードが正しくありません')).toBeTruthy()
    expect(screen.getByTestId('raid-register-form')).toBeTruthy()
  })

  it('登録済み（既にraidRegisteredAtがある）なら登録フォームを飛ばしてボスを表示する', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByTestId('raid-boss')).toBeTruthy()
    expect(screen.queryByTestId('raid-register-form')).toBeNull()
  })

  it('「参加する」でraidStateが書き込まれ、raidSyncEnabledがONになる', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('参加する'))

    await waitFor(async () => {
      const raidState = await db.raidState.get(RAID_STATE_ID)
      expect(raidState?.joined).toBe(true)
      expect(raidState?.bossId).toBe(ACTIVE_BOSS.bossId)
    })
    expect((await db.settings.get(RAID_SYNC_ENABLED_KEY))?.value).toBe(true)
    expect(await screen.findByText('レイドに挑む')).toBeTruthy()
  })

  it('今週のボスが未生成なら案内文が出て参加ボタンも出ない', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = null

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('今週のボスはまだ生成されていません')).toBeTruthy()
    expect(screen.queryByText('参加する')).toBeNull()
  })
})

describe('RaidScreen: レイドに挑む（T-98）', () => {
  async function joinedSetup() {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: ACTIVE_BOSS.bossId,
      profileJson: JSON.stringify({ name: ACTIVE_BOSS.name }),
      hp: ACTIVE_BOSS.hp,
      maxHp: ACTIVE_BOSS.maxHp,
      myDamage: ACTIVE_BOSS.myDamage,
      joined: true,
      startAt: ACTIVE_BOSS.startAt,
      endAt: ACTIVE_BOSS.endAt,
      lastSyncedAt: 0,
    })
    const raidApi = new FakeRaidApi()
    return { db, raidApi }
  }

  it('セッションの全itemがmode="raid"になり、drill画面へ遷移する', async () => {
    const { db, raidApi } = await joinedSetup()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('レイドに挑む'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    const snapshot = useSessionStore.getState().snapshot
    expect(snapshot).not.toBeNull()
    expect(snapshot!.items.length).toBeGreaterThan(0)
    expect(snapshot!.items.every((item) => item.mode === 'raid')).toBe(true)
  })
})

describe('RaidScreen: オフライン表示規約（M3・T-99）', () => {
  async function joinedSetupWithSync(lastSyncedAt: number) {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: ACTIVE_BOSS.bossId,
      profileJson: JSON.stringify({ name: ACTIVE_BOSS.name }),
      hp: ACTIVE_BOSS.hp,
      maxHp: ACTIVE_BOSS.maxHp,
      myDamage: ACTIVE_BOSS.myDamage,
      joined: true,
      startAt: ACTIVE_BOSS.startAt,
      endAt: ACTIVE_BOSS.endAt,
      lastSyncedAt,
    })
    return { db, raidApi: new FakeRaidApi() }
  }

  it('最終同期をN分前として表示する（強調なし）', async () => {
    const { db, raidApi } = await joinedSetupWithSync(Date.now() - 5 * 60_000)

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const label = await screen.findByTestId('raid-last-synced')
    expect(label.textContent).toContain('最終同期: 5分前')
    expect(label.className).not.toContain('is-stale')
  })

  it('直近の同期が失敗していた場合、最終同期表示が強調色（is-stale）になる', async () => {
    const { db, raidApi } = await joinedSetupWithSync(Date.now() - 10 * 60_000)
    const failingRaidApi = new FakeRaidApi()
    failingRaidApi.syncDamage = vi.fn(async () => {
      throw new Error('network error')
    })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await syncRaidDamage(db, failingRaidApi) // lastSyncFailedフラグを実際の失敗経路で立てる

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const label = await screen.findByTestId('raid-last-synced')
    expect(label.className).toContain('is-stale')
  })

  it('参加前（未joined）は最終同期表示を出さない', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('raid-last-synced')).toBeNull()
  })
})

describe('RaidScreen: 討伐演出（T-98）', () => {
  it('status="defeated"のとき討伐演出が表示される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = { ...ACTIVE_BOSS, status: 'defeated', hp: 0 }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByTestId('raid-defeated')).toBeTruthy()
    expect(screen.getByText('討伐成功！')).toBeTruthy()
  })

  it('status="active"のときは討伐演出が出ない', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('raid-defeated')).toBeNull()
  })
})

describe('RaidScreen: 獲得バッジ一覧（M3・T-102）', () => {
  it('レイド系バッジがあれば一覧表示される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.badges.bulkPut([
      { badgeId: 'raid-first-clear', earnedAt: 1000 },
      { badgeId: 'raid-clear:boss-2026-W29', earnedAt: 2000 },
    ])
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const list = await screen.findByTestId('raid-badges')
    expect(list.textContent).toContain('初回討伐')
    expect(list.textContent).toContain('討伐: boss-2026-W29')
  })

  it('レイド系バッジが無ければ一覧セクション自体が出ない', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('raid-badges')).toBeNull()
  })

  it('レイド系以外のバッジ（badgeIdがraid-*でない）は一覧に含めない', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.badges.put({ badgeId: 'first-session', earnedAt: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('raid-badges')).toBeNull()
  })
})

describe('RaidScreen: isConfigured=false（縮退設計）', () => {
  it('レイド機能が利用できない旨のメッセージのみ表示する', async () => {
    const db = newDb()
    const raidApi = new FakeRaidApi()
    raidApi.configured = false

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('レイド機能は現在利用できません')).toBeTruthy()
    expect(raidApi.fetchCurrentBoss).not.toHaveBeenCalled()
  })
})
