// T-98完了条件のテスト（正本: docs/17_M3実装計画.md 3.7節・5節T-98シート）:
// - 未登録→登録→参加→raidState書込＋raidSyncEnabled=ON の一連
// - 「レイドに挑む」でセッションのmodeが'raid'になる
// - 討伐状態受信で演出表示
import 'fake-indexeddb/auto'
import type { Question, RaidBossState, RegisterRequest } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { toDateString } from '../engine/date'
import { PROFILE_ID, RAID_STATE_ID } from '../db/schema'
import { RaidApiError, type RaidApi } from '../platform'
import { syncRaidDamage } from '../services/raidSync'
import { RAID_REGISTERED_AT_KEY, RAID_SYNC_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { resetRaidSyncStoreForTest } from '../store/raidSyncStore'
import { useSessionStore } from '../store/sessionStore'
import { raidBadgeLabel, RaidScreen } from './RaidScreen'

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
  resetRaidSyncStoreForTest()
  vi.useRealTimers()
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const DAY_MS = 86_400_000

const ACTIVE_BOSS: RaidBossState = {
  bossId: 'boss-2026-W30',
  name: 'テストボス',
  hp: 4000,
  maxHp: 5000,
  startAt: 0,
  // 期限切れ判定（レビューF1(d)）が誤発火しないよう、必ず未来のendAtにする
  endAt: Date.now() + 3 * DAY_MS,
  status: 'active',
  participantCount: 1,
  myDamage: 100,
  contributions: [{ displayName: '太郎', damage: 100 }],
}

class FakeRaidApi implements RaidApi {
  configured = true
  currentBoss: RaidBossState | null = ACTIVE_BOSS
  registerShouldFail: 'unauthorized' | 'network' | 'badRequest' | null = null
  /** fetchCurrentBossを通信失敗（throw）にする（404=nullとの区別テスト用。レビューF1(b)） */
  fetchShouldFail = false
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
    if (this.registerShouldFail === 'badRequest') {
      throw new RaidApiError('unknown', 'レイドAPIの呼び出しに失敗しました（400）', undefined, 400)
    }
  })
  fetchCurrentBoss = vi.fn(async () => {
    if (this.fetchShouldFail) throw new RaidApiError('network', '通信エラーが発生しました')
    return this.currentBoss
  })
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: this.currentBoss ?? ACTIVE_BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  createBattleRoom = vi.fn(async () => 'ABCD')
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
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

/** M4・T-128: ボス役セッションの抽選対象（difficulty>=4）フィクスチャ */
function hardQuestion(id: string): Question {
  return { ...textBlankQuestion(id), difficulty: 4 }
}

/** difficulty>=4が30問以上ある在庫プール（正常系: 抽選が成立する） */
const GHOST_BOSS_READY_POOL: Question[] = [
  ...QUESTION_POOL,
  ...Array.from({ length: 32 }, (_, i) => hardQuestion(`hard-${i}`)),
]

/** difficulty>=3の合計が10問未満の在庫プール（停止条件: 抽選不成立） */
const GHOST_BOSS_INSUFFICIENT_POOL: Question[] = Array.from({ length: 3 }, (_, i) =>
  hardQuestion(`hard-${i}`),
)

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

describe('RaidScreen: 初期診断未完了ユーザーの登録ガード（issue #43）', () => {
  it('プロフィール未作成なら登録フォームを出さず初期診断へ誘導し、register APIを呼ばない', async () => {
    const db = newDb() // putProfileしない = deviceTokenが空のまま
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    // 登録フォームではなく診断誘導が出る
    expect(await screen.findByTestId('raid-needs-profile')).toBeTruthy()
    expect(screen.queryByTestId('raid-register-form')).toBeNull()

    // 「初期診断へ」で診断画面へ遷移する
    fireEvent.click(screen.getByText('初期診断へ'))
    expect(useAppStore.getState().screen).toBe('diagnostic')

    // 空deviceTokenの登録が送信されない（API側400の往復を発生させない）
    expect(raidApi.register).not.toHaveBeenCalled()
  })

  it('プロフィール作成済みなら日本語表示名を含めて正常に登録できる', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'みぞぐち',
      initialToeic: null,
      createdAt: 0,
      deviceToken: 'device-1',
    })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.change(screen.getByLabelText('招待コード'), { target: { value: 'invite-1' } })
    fireEvent.click(screen.getByText('登録する'))

    await screen.findByTestId('raid-boss')
    expect(raidApi.registerCalls).toEqual([
      {
        inviteCode: 'invite-1',
        deviceToken: 'device-1',
        displayName: 'みぞぐち',
        dailyGoal: 'normal',
      },
    ])
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

  // T-162（docs/27 のS-38）で window.confirm を3択のアプリ内ダイアログへ置き換えた。
  // レイド画面では「続きから再開する」の代わりに「ホームへ戻って続きから再開する」を出す
  // （他モードのセッションをこの画面から再開させない）
  it('進行中セッションがあるとき、3択の確認が出て残り問数が含まれる（T-122・J-61）', async () => {
    const { db, raidApi } = await joinedSetup()

    render(
      <RaidScreen
        db={db}
        raidApi={raidApi}
        questionPool={QUESTION_POOL}
        resumeSnapshot={{
          sessionId: 'resume-1',
          items: [
            { questionId: 'q-0', mode: 'solo' },
            { questionId: 'q-1', mode: 'solo' },
            { questionId: 'q-2', mode: 'solo' },
          ],
          answeredCount: 1,
          attemptIds: ['a-1'],
          startedAt: 0,
          updatedAt: 0,
        }}
      />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('レイドに挑む'))

    const overlay = await screen.findByTestId('confirm-overlay')
    expect(overlay.textContent).toContain('残り2問')
    expect(screen.getByText('破棄してレイドに挑む')).toBeTruthy()
    expect(screen.getByText('ホームへ戻って続きから再開する')).toBeTruthy()
    expect(useAppStore.getState().screen).not.toBe('drill')

    // 「やめる」で閉じるだけ（レイドは始まらない）
    fireEvent.click(screen.getByText('やめる'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(useAppStore.getState().screen).not.toBe('drill')
  })

  it('「破棄してレイドに挑む」でレイドセッションが始まる（T-162）', async () => {
    const { db, raidApi } = await joinedSetup()

    render(
      <RaidScreen
        db={db}
        raidApi={raidApi}
        questionPool={QUESTION_POOL}
        resumeSnapshot={{
          sessionId: 'resume-1',
          items: [
            { questionId: 'q-0', mode: 'solo' },
            { questionId: 'q-1', mode: 'solo' },
          ],
          answeredCount: 1,
          attemptIds: ['a-1'],
          startedAt: 0,
          updatedAt: 0,
        }}
      />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('レイドに挑む'))
    fireEvent.click(await screen.findByText('破棄してレイドに挑む'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
  })

  it('生成パックが0問なら案内文を表示し、drillへ遷移しない（T-121・J-60）', async () => {
    const { db, raidApi } = await joinedSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={[]} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('レイドに挑む'))

    expect(await screen.findByText('今は出題できる問題がありません')).toBeTruthy()
    expect(useAppStore.getState().screen).not.toBe('drill')
    expect(useSessionStore.getState().snapshot).toBeNull()
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

  it('マウント後の同期完了で、再マウントなしにis-stale表示が追従する（T-103）', async () => {
    const { db, raidApi } = await joinedSetupWithSync(Date.now())
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')
    expect((await screen.findByTestId('raid-last-synced')).className).not.toContain('is-stale')

    raidApi.syncDamage = vi.fn(async () => {
      throw new Error('network error')
    })
    await syncRaidDamage(db, raidApi)

    await waitFor(async () => {
      expect((await screen.findByTestId('raid-last-synced')).className).toContain('is-stale')
    })
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
    // レビューF1(h): bossIdは人が読める形式に整形する
    expect(list.textContent).toContain('討伐: 2026年 第29週')
    // V-15（docs/25 4.6節・07の6節）: 取得済みバッジは取得日を併記する
    expect(list.textContent).toContain(toDateString(1000))
    expect(screen.queryByTestId('raid-badges-empty')).toBeNull()
  })

  it('raidBadgeLabel: 規約外のbossIdはID表示にフォールバックする（レビューF1(h)）', () => {
    expect(raidBadgeLabel('raid-clear:boss-2026-W29')).toBe('討伐: 2026年 第29週')
    expect(raidBadgeLabel('raid-clear:special-event')).toBe('討伐: special-event')
  })

  // V-15（docs/25 4.6節・6.3節）で「0件ならセクションを出さない」から
  // 「0件でもセクションを出し空状態の文を見せる」へ変更した（見出しだけが浮く状態を作らない方針の
  // 適用範囲がバッジ0件にも及ぶため）。バッジの列挙条件（レイド系のみ）は変えていない
  it('レイド系バッジが無ければ一覧の代わりに空状態が出る', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    const section = screen.getByTestId('raid-badges')
    expect(section.querySelector('.raid-badges__list')).toBeNull()
    const empty = screen.getByTestId('raid-badges-empty')
    expect(empty.textContent).toContain('まだバッジはありません')
    // 煽らない・責めないトーン（4.6節）: 次の行動が分かる文になっている
    expect(empty.textContent).toContain('ボスを討伐すると')
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

    // セクションは出るが一覧は空（=レイド系以外は列挙されない）
    expect(screen.getByTestId('raid-badges').querySelector('.raid-badges__list')).toBeNull()
    expect(screen.getByTestId('raid-badges-empty')).toBeTruthy()
    expect(screen.getByTestId('raid-badges').textContent).not.toContain('first-session')
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

describe('RaidScreen: 読み込み中・読み込み失敗（レビューF1(a)）', () => {
  it('データ読み込み完了までは白画面ではなく「読み込み中…」を表示する', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    // load()解決前の同期描画時点でプレースホルダが出ている
    expect(screen.getByText('読み込み中…')).toBeTruthy()
    await screen.findByTestId('raid-register-form')
  })

  it('DB読み取りが失敗しても「読み込み中…」のまま固まらない（loadedはfinallyで立つ）', async () => {
    const db = newDb()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    db.close() // 読み取り失敗を再現する
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    // 失敗時は未登録扱いのフォールバック表示になる（白画面にならない）
    expect(await screen.findByTestId('raid-register-form')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('RaidScreen: 404と通信失敗の区別（レビューF1(b)）', () => {
  it('通信失敗時、raidStateキャッシュがあればボス名・HPバー・最終同期＋取得失敗メッセージを表示する', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: ACTIVE_BOSS.bossId,
      profileJson: JSON.stringify({ name: 'キャッシュボス' }),
      hp: 2500,
      maxHp: 5000,
      myDamage: 100,
      joined: true,
      startAt: 0,
      endAt: Date.now() + 2 * DAY_MS,
      lastSyncedAt: Date.now() - 5 * 60_000,
    })
    const raidApi = new FakeRaidApi()
    raidApi.fetchShouldFail = true

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('最新情報を取得できませんでした')).toBeTruthy()
    const cached = screen.getByTestId('raid-boss-cached')
    expect(cached.textContent).toContain('キャッシュボス')
    expect(cached.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50')
    expect(screen.getByTestId('raid-last-synced').textContent).toContain('最終同期: 5分前')
    // 通信失敗を「未生成」と誤案内しない
    expect(screen.queryByText('今週のボスはまだ生成されていません')).toBeNull()
  })

  it('通信失敗時、キャッシュが無ければ取得失敗メッセージのみ表示する', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.fetchShouldFail = true

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('最新情報を取得できませんでした')).toBeTruthy()
    expect(screen.queryByTestId('raid-boss-cached')).toBeNull()
    expect(screen.queryByText('今週のボスはまだ生成されていません')).toBeNull()
  })
})

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

// T-212(Q-44): 取得失敗の表示に再試行導線が無く、オフラインとサーバー障害の区別も
// 付かなかった。「開き直す」以外の復帰手段が無い状態だった
describe('RaidScreen: 取得失敗からの再試行とオフライン/サーバー障害の区別（T-212）', () => {
  afterEach(() => {
    setOnline(true)
  })

  it('再試行ボタンをタップし、成功すればボス表示に復帰する', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.fetchShouldFail = true

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('最新情報を取得できませんでした')).toBeTruthy()
    const retryButton = screen.getByTestId('raid-retry-boss-fetch')
    expect(retryButton.textContent).toBe('再試行')

    // 再試行時に通信が復旧した状態を模する
    raidApi.fetchShouldFail = false
    fireEvent.click(retryButton)

    expect(await screen.findByTestId('raid-boss')).toBeTruthy()
    expect(screen.queryByText('最新情報を取得できませんでした')).toBeNull()
    expect(screen.queryByTestId('raid-retry-boss-fetch')).toBeNull()
  })

  it('再試行しても失敗が続く場合は取得失敗表示のまま留まる', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.fetchShouldFail = true

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    expect(await screen.findByText('最新情報を取得できませんでした')).toBeTruthy()
    const callsBeforeRetry = raidApi.fetchCurrentBoss.mock.calls.length
    fireEvent.click(screen.getByTestId('raid-retry-boss-fetch'))

    await waitFor(() =>
      expect(raidApi.fetchCurrentBoss.mock.calls.length).toBe(callsBeforeRetry + 1),
    )
    expect(screen.getByText('最新情報を取得できませんでした')).toBeTruthy()
  })

  it('オフライン時はオフラインの案内を、オンライン時はサーバー障害の案内を出す', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.fetchShouldFail = true

    setOnline(false)
    const { unmount } = render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    expect(await screen.findByText(/オフラインになっています/)).toBeTruthy()
    unmount()

    setOnline(true)
    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    expect(await screen.findByText(/サーバー側に問題が発生している可能性/)).toBeTruthy()
  })
})

describe('RaidScreen: 手動同期の表示更新（T-104）', () => {
  it('同期成功時、追加fetchなしでボス表示が更新される（fetchCurrentBossは再呼びされない）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
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
      lastSyncedAt: Date.now() - 60_000,
    })
    const raidApi = new FakeRaidApi()
    const SYNCED_BOSS: RaidBossState = { ...ACTIVE_BOSS, hp: 1000, myDamage: 900 }
    raidApi.syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: SYNCED_BOSS }))

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')
    const fetchCallsBeforeSync = raidApi.fetchCurrentBoss.mock.calls.length

    fireEvent.click(screen.getByText('今すぐ同期'))

    await waitFor(() => {
      const boss = screen.getByTestId('raid-boss')
      expect(boss.textContent).toContain('HP残り 20%') // 1000/5000
    })
    expect(raidApi.fetchCurrentBoss.mock.calls.length).toBe(fetchCallsBeforeSync)
  })
})

describe('RaidScreen: 401検出時の再登録導線（レビューF1(c)）', () => {
  it('同期が401で失敗すると「再登録する」が出て、押すと登録フォームへ戻れる', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
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
      lastSyncedAt: Date.now(),
    })
    const raidApi = new FakeRaidApi()
    raidApi.syncDamage = vi.fn(async () => {
      throw new RaidApiError('unauthorized', '認証エラーです（401）')
    })

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('今すぐ同期'))

    expect(await screen.findByText('登録が無効です。招待コードで再登録してください')).toBeTruthy()
    fireEvent.click(screen.getByTestId('raid-reregister'))

    expect(await screen.findByTestId('raid-register-form')).toBeTruthy()
    // raidRegisteredAtは消えていない（ローカルstateでフォームを再表示しているだけ）
    expect((await db.settings.get(RAID_REGISTERED_AT_KEY))?.value).toBe(1000)
  })
})

describe('RaidScreen: 討伐済み・期限切れの無効化（レビューF1(d)）', () => {
  it('status=defeatedのとき「参加する」が無効化され、終了メッセージが出る', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = { ...ACTIVE_BOSS, status: 'defeated', hp: 0 }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect((screen.getByText('参加する') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('今週のレイドは終了しました')).toBeTruthy()
  })

  it('endAtを過ぎたボスでは「レイドに挑む」が無効化される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-W20',
      profileJson: JSON.stringify({ name: '期限切れボス' }),
      hp: 1000,
      maxHp: 5000,
      myDamage: 100,
      joined: true,
      startAt: 0,
      endAt: Date.now() - DAY_MS,
      lastSyncedAt: Date.now(),
    })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = { ...ACTIVE_BOSS, endAt: Date.now() - DAY_MS }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect((screen.getByText('レイドに挑む') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('今週のレイドは終了しました')).toBeTruthy()
  })
})

describe('RaidScreen: ホームへ戻る導線（レビューF1(e)）', () => {
  it('未登録フォームにホームへ戻るボタンがある', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.click(screen.getByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('登録済みビューにホームへ戻るボタンがある', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })
})

describe('RaidScreen: 残り日数・HP数値（レビューF1(f)）', () => {
  it('登録済みビューに残り日数とHP%数値が表示される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = {
      ...ACTIVE_BOSS,
      hp: 2500,
      maxHp: 5000,
      endAt: Date.now() + 3 * DAY_MS - 1000,
    }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    const boss = await screen.findByTestId('raid-boss')

    expect(screen.getByTestId('raid-remaining-days').textContent).toBe('残り3日')
    expect(boss.textContent).toContain('HP残り 50%')
    // HP数値はdisplay-num（数字ディスプレイ書体）で描画される
    const hpNum = Array.from(boss.querySelectorAll('.display-num')).find(
      (el) => el.textContent === '50',
    )
    expect(hpNum).toBeTruthy()
  })
})

describe('RaidScreen: 登録フォームの入力チェック・エラー出し分け（レビューF1(g)）', () => {
  it('招待コード未入力なら送信せずエラーを表示する', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.click(screen.getByText('登録する'))

    expect(await screen.findByText('招待コードを入力してください')).toBeTruthy()
    expect(raidApi.register).not.toHaveBeenCalled()
  })

  it('表示名未入力なら送信せずエラーを表示する', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.change(screen.getByLabelText('招待コード'), { target: { value: 'invite-1' } })
    fireEvent.change(screen.getByLabelText('表示名'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('登録する'))

    expect(await screen.findByText('表示名を入力してください')).toBeTruthy()
    expect(raidApi.register).not.toHaveBeenCalled()
  })

  it('401以外の400系エラーは「入力内容を確認してください」を表示する', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()
    raidApi.registerShouldFail = 'badRequest'

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    fireEvent.change(screen.getByLabelText('招待コード'), { target: { value: 'invite-1' } })
    fireEvent.click(screen.getByText('登録する'))

    expect(await screen.findByText('入力内容を確認してください')).toBeTruthy()
  })

  it('「1日の目安」の説明文が表示される', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    expect(
      screen.getByText(
        '1日に解く問題数の目安です。参加者全員の申告からボスのHPが決まります（少なめ=約5問・普通=約15問・多め=約30問）',
      ),
    ).toBeTruthy()
  })

  it('登録フォーム冒頭に機能説明が表示される（T-116(9)）', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    expect(
      screen.getByText(
        'チームで週次ボスのHPを削る協力イベントです。招待コードは主催者から受け取ってください。',
      ),
    ).toBeTruthy()
  })
})

describe('RaidScreen: 貢献者ラベル（T-116(9)）', () => {
  it('「参加者 N人」ではなく「貢献者 N人」と表示される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    const boss = await screen.findByTestId('raid-boss')

    expect(boss.textContent).toContain(`貢献者 ${ACTIVE_BOSS.participantCount}人`)
    expect(screen.queryByText(`参加者 ${ACTIVE_BOSS.participantCount}人`)).toBeNull()
  })
})

describe('RaidScreen: 貢献一覧・注記の表記（レビューF1(i)(j)）', () => {
  it('貢献一覧に「貢献ダメージ」見出しが付き、ダメージ数値はdisplay-numで描画される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    const boss = await screen.findByTestId('raid-boss')

    expect(screen.getByText('貢献ダメージ')).toBeTruthy()
    // V-15（docs/25 4.6節）でリストの構造を順位表（V-9）と同じ`.standings*`へ変更したため、
    // 参照先を`ul.raid-list`から貢献リストのdata-testidへ機械的に追従させた（表示情報は同じ）
    const list = boss.querySelector('[data-testid="raid-contributions-list"]')
    expect(list).toBeTruthy()
    expect(list!.querySelector('.standings__points.display-num')?.textContent).toBe('100')
  })

  it('貢献リストは順位・相対バー・自分の行の識別を持ち、正答率は表示しない（V-15・プライバシー境界）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = {
      ...ACTIVE_BOSS,
      participantCount: 2,
      contributions: [
        { displayName: '花子', damage: 400 },
        // putProfileの表示名と一致する行が自分の行になる
        { displayName: '太郎', damage: 100 },
      ],
    }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    const rows = Array.from(
      screen.getByTestId('raid-contributions-list').querySelectorAll('.standings__row'),
    )
    expect(rows.length).toBe(2)
    // 順位は数字バッジ（形）＋色の二重符号化。1〜3位だけdata-rankが付く
    expect(rows.map((li) => li.getAttribute('data-rank'))).toEqual(['1', '2'])
    expect(rows.map((li) => li.querySelector('.standings__badge')!.textContent)).toEqual(['1', '2'])
    // バーは最大ダメージ基準の相対長。数値は必ず併記される
    expect(
      rows.map((li) => li.querySelector<HTMLElement>('.standings__bar-fill')!.style.width),
    ).toEqual(['100%', '25%'])
    expect(rows.map((li) => li.getAttribute('data-self'))).toEqual([null, 'true'])
    expect(screen.getByText('YOU')).toBeTruthy()
    // 正答率（%表記）は貢献リストに出さない
    expect(screen.getByTestId('raid-contributions').textContent).not.toContain('%')
  })

  it('貢献者0人でも見出しだけが浮かず、次の行動が分かる空状態が出る（V-15。docs/25 4.6節）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = { ...ACTIVE_BOSS, participantCount: 0, myDamage: 0, contributions: [] }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.getByText('貢献ダメージ')).toBeTruthy()
    expect(screen.queryByTestId('raid-contributions-list')).toBeNull()
    const empty = screen.getByTestId('raid-contributions-empty')
    expect(empty.textContent).toContain('まだ誰も挑戦していません')
    expect(empty.textContent).toContain('最初の一撃')
  })

  it('討伐確定の注記が「同期時にサーバーで確定」の表現になっている', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(
      screen.getByText('討伐の成立は同期時にサーバーで確定します（表示は最終同期時点のものです）'),
    ).toBeTruthy()
    expect(screen.queryByText('討伐の確定はサーバー側の判定が正です')).toBeNull()
  })
})

describe('RaidScreen: 時刻追従（T-105）', () => {
  it('60秒tickでraidEnded判定・残り日数・最終同期表示が更新される', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    // endAtを70分後に設定し、tickで現在時刻が進むとraidEndedがtrueへ切り替わるようにする
    raidApi.currentBoss = { ...ACTIVE_BOSS, endAt: Date.now() + 70 * 60_000 }

    // setInterval/clearInterval・Dateのみフェイク化する（setTimeout・Promiseはリアルタイムのまま
    // 動かし、findByTestId等のRTLの待機処理とのデッドロックを避ける）
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')
    expect(screen.queryByTestId('raid-ended')).toBeNull()

    await vi.advanceTimersByTimeAsync(80 * 60_000) // 80分進める（endAtを超える）

    await waitFor(() => expect(screen.getByTestId('raid-ended')).toBeTruthy())
  })

  it('isConfigured=falseならtickは起動しない（例外も出ない）', async () => {
    const db = newDb()
    const raidApi = new FakeRaidApi()
    raidApi.configured = false

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByText('レイド機能は現在利用できません')

    expect(() => vi.advanceTimersByTime(5 * 60_000)).not.toThrow()
  })
})

describe('RaidScreen: ボス役セッション（M4・T-128。docs/22 3.5節）', () => {
  async function registeredSetup(pool: Question[] = GHOST_BOSS_READY_POOL) {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    return { db, raidApi, pool }
  }

  it('登録済みビューに「ボス役に立候補」ボタンが表示される', async () => {
    const { db, raidApi, pool } = await registeredSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')

    expect(screen.getByTestId('ghost-boss-candidate')).toBeTruthy()
  })

  it('未登録（登録フォーム表示中）では立候補ボタンが出ない', async () => {
    const db = newDb()
    await putProfile(db)
    const raidApi = new FakeRaidApi()

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-register-form')

    expect(screen.queryByTestId('ghost-boss-candidate')).toBeNull()
  })

  it('立候補ボタンを押すと同意画面が表示され、共有される内容3点が明示される', async () => {
    const { db, raidApi, pool } = await registeredSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')

    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))

    const consent = await screen.findByTestId('ghost-boss-consent')
    expect(consent.textContent).toContain('堅い/弱点')
    expect(consent.textContent).toContain('ボス名として全員に見えます')
    expect(consent.textContent).toContain('撤回すると記録はサーバーから即時削除')
  })

  it('同意チェック無しでは「同意して開始」がdisabledで、開始できない（構造的強制のUI側担保）', async () => {
    const { db, raidApi, pool } = await registeredSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')
    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))
    await screen.findByTestId('ghost-boss-consent')

    const startButton = screen.getByText('同意して開始') as HTMLButtonElement
    expect(startButton.disabled).toBe(true)

    fireEvent.click(startButton)
    expect(useAppStore.getState().screen).not.toBe('drill')
  })

  it('同意チェックの上で開始すると、全itemがmode="battle"のセッションでdrill画面へ遷移する', async () => {
    const { db, raidApi, pool } = await registeredSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')
    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))
    await screen.findByTestId('ghost-boss-consent')

    fireEvent.click(screen.getByTestId('ghost-boss-consent-checkbox'))
    fireEvent.click(screen.getByText('同意して開始'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    const snapshot = useSessionStore.getState().snapshot
    expect(snapshot).not.toBeNull()
    expect(snapshot!.items.every((item) => item.mode === 'battle')).toBe(true)
    expect(useSessionStore.getState().isGhostBossSession).toBe(true)
  })

  it('difficulty>=3まで含めても在庫が10問未満なら開始せずエラーを表示する（停止条件）', async () => {
    const { db, raidApi, pool } = await registeredSetup(GHOST_BOSS_INSUFFICIENT_POOL)

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')
    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))
    await screen.findByTestId('ghost-boss-consent')

    fireEvent.click(screen.getByTestId('ghost-boss-consent-checkbox'))
    fireEvent.click(screen.getByText('同意して開始'))

    expect(await screen.findByText(/在庫が不足しています/)).toBeTruthy()
    expect(useAppStore.getState().screen).not.toBe('drill')
  })

  // 回帰防止: startSession失敗時にcatchが無いと、void呼び出しのため例外が握り潰され
  // 画面が無反応になる（在庫不足以外の失敗が利用者に一切伝わらない）
  it('セッション開始に失敗した場合はエラーを表示し、drillへ遷移しない', async () => {
    const { db, raidApi, pool } = await registeredSetup()
    const putSpy = vi
      .spyOn(db.settings, 'put')
      .mockRejectedValueOnce(new Error('セッション保存に失敗'))

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')
    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))
    await screen.findByTestId('ghost-boss-consent')

    fireEvent.click(screen.getByTestId('ghost-boss-consent-checkbox'))
    fireEvent.click(screen.getByText('同意して開始'))

    expect(await screen.findByText(/セッションを開始できませんでした/)).toBeTruthy()
    expect(useAppStore.getState().screen).not.toBe('drill')
    putSpy.mockRestore()
  })

  it('「やめる」で同意画面を離れ、通常のレイド画面へ戻る', async () => {
    const { db, raidApi, pool } = await registeredSetup()

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')
    fireEvent.click(screen.getByTestId('ghost-boss-candidate'))
    await screen.findByTestId('ghost-boss-consent')

    fireEvent.click(screen.getByText('やめる'))

    expect(await screen.findByTestId('raid-boss')).toBeTruthy()
  })

  it('送信済み記録がある場合は「ボス役記録を撤回する」ボタンが立候補ボタンの代わりに出て、撤回するとdeleteOwnGhostRecordが呼ばれる', async () => {
    const { db, raidApi, pool } = await registeredSetup()
    const { GHOST_BOSS_SUBMITTED_AT_KEY } = await import('../services/settingsKeys')
    await db.settings.put({ key: GHOST_BOSS_SUBMITTED_AT_KEY, value: Date.now() })

    render(<RaidScreen db={db} raidApi={raidApi} questionPool={pool} resumeSnapshot={null} />)
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('ghost-boss-candidate')).toBeNull()
    const withdrawButton = await screen.findByTestId('ghost-boss-withdraw')

    fireEvent.click(withdrawButton)

    await waitFor(() => expect(raidApi.deleteOwnGhostRecord).toHaveBeenCalledTimes(1))
    await waitFor(async () => {
      expect(await db.settings.get(GHOST_BOSS_SUBMITTED_AT_KEY)).toBeUndefined()
    })
    expect(await screen.findByTestId('ghost-boss-candidate')).toBeTruthy()
  })
})

describe('RaidScreen: ゴースト週の弱点マップ・名誉表示（M4・T-129。docs/22 3.4節）', () => {
  const GHOST_BOSS: RaidBossState = {
    ...ACTIVE_BOSS,
    bossId: 'boss-2026-w31',
    name: 'ゴースト・上級者A',
    bossType: 'ghost',
    defense: [
      { questionId: 'q-0', multiplier: 2.0 },
      { questionId: 'q-1', multiplier: 2.0 },
      { questionId: 'q-2', multiplier: 0.5 },
    ],
    ghost: { displayName: '上級者A', defeatedCount: 3 },
  }

  it('弱点マップがPart・タグ単位で表示され、questionIdは表示に出ない（正答の狙い撃ち防止）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = GHOST_BOSS

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const weaknessMap = await screen.findByTestId('ghost-weakness-map')
    // QUESTION_POOLのtextBlankQuestionは全てpart:5・tags:['品詞']（q-0/q-1がmultiplier2.0=弱点）。
    // V-15（docs/25 4.6節）でチップ＋横棒の構造にしたため、1文の一致から要素単位の一致へ
    // 機械的に追従させた（表示する情報＝Part・タグ・倍率・問数は同じ）
    expect(weaknessMap.textContent).toContain('Part5 品詞')
    expect(weaknessMap.textContent).toContain('×2')
    expect(weaknessMap.textContent).toContain('2問')
    // 倍率は色だけでなく数値と語の両方で示す（07の原則4）
    expect(weaknessMap.textContent).toContain('弱点')
    expect(weaknessMap.querySelector('.ghost-weakness__row')?.getAttribute('data-strength')).toBe(
      'weak',
    )
    expect(weaknessMap.textContent).not.toContain('q-0')
    expect(weaknessMap.textContent).not.toContain('q-1')
    expect(weaknessMap.textContent).not.toContain('q-2') // 堅い（0.5）は挑戦前に見せない
  })

  it('「討伐された回数」が名誉表示として出る（公開処刑にしない演出方針=02の5.3節）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = GHOST_BOSS

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const defeatedCount = await screen.findByTestId('ghost-defeated-count')
    expect(defeatedCount.textContent).toContain('討伐された回数: 3回')
    // V-15: 数字を誇示せず小さな金のバッジ形に留める（4.6節）。--ng/--warn系のクラスは使わない
    expect(defeatedCount.className).toBe('raid-honor')
  })

  it('弱点が0件でも見出しだけが浮かず、空状態が出る（V-15。docs/25 4.6節）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    // パック未取得等でdefenseが解決できない状態（集計0件）を模す
    raidApi.currentBoss = { ...GHOST_BOSS, defense: [] }

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )

    const weaknessMap = await screen.findByTestId('ghost-weakness-map')
    expect(weaknessMap.querySelector('.ghost-weakness__list')).toBeNull()
    const empty = screen.getByTestId('ghost-weakness-map-empty')
    expect(empty.textContent).toContain('弱点の傾向はまだ表示できません')
    expect(empty.textContent).toContain('問題パックを取得すると')
  })

  it('synthetic週（bossType省略。従来のRaidBossState）では弱点マップ・討伐回数のいずれも表示されない（回帰）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    // ACTIVE_BOSSはbossType/defense/ghostを持たない（M3までの既存レスポンス相当）

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    await screen.findByTestId('raid-boss')

    expect(screen.queryByTestId('ghost-weakness-map')).toBeNull()
    expect(screen.queryByTestId('ghost-defeated-count')).toBeNull()
  })

  it('参加すると、raidStateキャッシュにbossType・defenseJson・ghostJsonが保存される（answerPipelineの倍率適用の入力）', async () => {
    const db = newDb()
    await putProfile(db)
    await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
    const raidApi = new FakeRaidApi()
    raidApi.currentBoss = GHOST_BOSS

    render(
      <RaidScreen db={db} raidApi={raidApi} questionPool={QUESTION_POOL} resumeSnapshot={null} />,
    )
    fireEvent.click(await screen.findByText('参加する'))

    await waitFor(async () => {
      const raidState = await db.raidState.get(RAID_STATE_ID)
      expect(raidState?.bossType).toBe('ghost')
      expect(JSON.parse(raidState!.defenseJson!)).toEqual({ 'q-0': 2.0, 'q-1': 2.0, 'q-2': 0.5 })
      expect(JSON.parse(raidState!.ghostJson!)).toEqual({
        displayName: '上級者A',
        defeatedCount: 3,
      })
    })
  })
})
