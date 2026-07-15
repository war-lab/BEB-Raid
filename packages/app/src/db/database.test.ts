// T-06 完了条件: 全ストアのCRUDがユニットテストで通る。
// attempts は削除APIを作らない（追記のみ）＋実行時遮断も確認する。
//
// jsdom は IndexedDB を実装しないため fake-indexeddb を使う
// （純JS実装・Dexie公式ドキュメントでもテスト用として案内されている）。
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from './database'
import { PROFILE_ID, STREAK_ID } from './schema'

let seq = 0
const dbs: BebRaidDatabase[] = []

/** テスト毎に独立したDBを作る（fake-indexeddb はプロセス内でグローバルなため名前で分離） */
function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`beb-raid-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('BebRaidDatabase: ストア定義', () => {
  it('04の3節の全11ストア＋examScores（T-42=C-2改訂）が定義されている（J-7）', () => {
    const db = newDb()
    const names = db.tables.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        'profile',
        'attempts',
        'srsCards',
        'ratings',
        'ratingHistory',
        'tagStats',
        'phase',
        'streak',
        'badges',
        'pendingSync',
        'settings',
        'examScores',
      ].sort(),
    )
  })
})

describe('profile: CRUD', () => {
  it('作成・読取・更新ができる', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'テスト',
      initialToeic: 550,
      createdAt: 1000,
      deviceToken: 'token-1',
    })
    expect((await db.profile.get(PROFILE_ID))?.displayName).toBe('テスト')

    await db.profile.update(PROFILE_ID, { displayName: '改名後' })
    expect((await db.profile.get(PROFILE_ID))?.displayName).toBe('改名後')
  })
})

describe('attempts: 追記のみ', () => {
  const attempt = {
    id: 'a-0001',
    questionId: 'q-0001',
    mode: 'solo' as const,
    isCorrect: true,
    responseMs: 4200,
    isTimeout: false,
    isGuess: false,
    answeredAt: 1000,
  }

  it('追記と読取（インデックス経由の絞り込み）ができる', async () => {
    const db = newDb()
    await db.attempts.add(attempt)
    await db.attempts.add({ ...attempt, id: 'a-0002', questionId: 'q-0002', answeredAt: 2000 })

    expect(await db.attempts.count()).toBe(2)
    expect(await db.attempts.where('questionId').equals('q-0001').count()).toBe(1)
    expect(await db.attempts.where('answeredAt').above(1500).count()).toBe(1)
  })

  it('delete が実行時に遮断される', async () => {
    const db = newDb()
    await db.attempts.add(attempt)
    await expect(db.attempts.delete('a-0001')).rejects.toThrow(/追記のみ/)
    expect(await db.attempts.count()).toBe(1)
  })

  it('clear も実行時に遮断される', async () => {
    const db = newDb()
    await db.attempts.add(attempt)
    await expect(db.attempts.clear()).rejects.toThrow(/追記のみ/)
    expect(await db.attempts.count()).toBe(1)
  })

  it('同一IDの再追加は拒否される（冪等キーの一意性）', async () => {
    const db = newDb()
    await db.attempts.add(attempt)
    await expect(db.attempts.add({ ...attempt })).rejects.toThrow()
  })

  it('update / put による既存ログの書き換えが実行時に遮断される', async () => {
    const db = newDb()
    await db.attempts.add(attempt)
    await expect(db.attempts.update('a-0001', { isCorrect: false })).rejects.toThrow(/追記のみ/)
    await expect(db.attempts.put({ ...attempt, isCorrect: false })).rejects.toThrow(/追記のみ/)
    expect((await db.attempts.get('a-0001'))?.isCorrect).toBe(true)
  })
})

describe('srsCards: CRUD', () => {
  it('作成・期限クエリ・更新・削除ができる', async () => {
    const db = newDb()
    await db.srsCards.bulkAdd([
      { id: 'vocab:submit', refType: 'vocab', refId: 'submit', stage: 0, dueAt: 1000, lapses: 0 },
      {
        id: 'question:q-0001',
        refType: 'question',
        refId: 'q-0001',
        stage: 2,
        dueAt: 5000,
        lapses: 1,
      },
    ])

    // 期限到来カードの抽出（クイックパック生成=T-13 の主クエリ）
    expect(await db.srsCards.where('dueAt').belowOrEqual(1000).count()).toBe(1)

    await db.srsCards.update('vocab:submit', { stage: 1, dueAt: 9000 })
    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(1)

    await db.srsCards.delete('question:q-0001')
    expect(await db.srsCards.count()).toBe(1)
  })
})

describe('ratings / ratingHistory: CRUD', () => {
  it('L/R/total の現在値と日次スナップショットを保存できる', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 420, updatedAt: 1000 },
      { section: 'R', rating: 480, updatedAt: 1000 },
      { section: 'total', rating: 450, updatedAt: 1000 },
    ])
    expect((await db.ratings.get('L'))?.rating).toBe(420)

    // 同日同セクションの上書き（複合主キー [date+section]）
    await db.ratingHistory.put({ date: '2026-07-07', section: 'L', rating: 420 })
    await db.ratingHistory.put({ date: '2026-07-07', section: 'L', rating: 425 })
    await db.ratingHistory.put({ date: '2026-07-07', section: 'R', rating: 480 })
    expect(await db.ratingHistory.count()).toBe(2)
    expect(await db.ratingHistory.where('date').equals('2026-07-07').count()).toBe(2)
  })
})

describe('tagStats: CRUD', () => {
  it('タグ別サマリの作成・更新・削除（再構築時）ができる', async () => {
    const db = newDb()
    await db.tagStats.put({ tag: '疑問詞聞き取り', windowCorrect: 6, windowTotal: 10 })
    await db.tagStats.update('疑問詞聞き取り', { windowCorrect: 7, windowTotal: 11 })
    expect((await db.tagStats.get('疑問詞聞き取り'))?.windowCorrect).toBe(7)

    // attempts から再構築可能なサマリのため clear は許容される
    await db.tagStats.clear()
    expect(await db.tagStats.count()).toBe(0)
  })
})

describe('phase / streak / badges / pendingSync: CRUD（M1は定義のみのストア含む）', () => {
  it('phase の作成・読取ができる', async () => {
    const db = newDb()
    await db.phase.put({ season: 'P1', criteriaJson: '{}', achievedAt: null })
    expect((await db.phase.get('P1'))?.achievedAt).toBeNull()
  })

  it('streak の作成・更新ができる', async () => {
    const db = newDb()
    await db.streak.put({
      id: STREAK_ID,
      currentDays: 1,
      bestDays: 5,
      lastActiveDate: '2026-07-07',
      protectionUsedAt: null,
    })
    await db.streak.update(STREAK_ID, { currentDays: 2 })
    expect((await db.streak.get(STREAK_ID))?.currentDays).toBe(2)
  })

  it('badges の作成・読取ができる', async () => {
    const db = newDb()
    await db.badges.put({ badgeId: 'first-session', earnedAt: 1000 })
    expect(await db.badges.count()).toBe(1)
  })

  it('pendingSync の自動採番・追加・削除（送信済み消込）ができる', async () => {
    const db = newDb()
    const id1 = await db.pendingSync.add({
      kind: 'raidDamage',
      payloadJson: '{"attemptId":"a-1"}',
      createdAt: 1000,
    })
    const id2 = await db.pendingSync.add({
      kind: 'raidDamage',
      payloadJson: '{"attemptId":"a-2"}',
      createdAt: 2000,
    })
    expect(id2).toBeGreaterThan(id1 as number)

    await db.pendingSync.delete(id1)
    expect(await db.pendingSync.count()).toBe(1)
  })
})

describe('settings: CRUD', () => {
  it('キーバリューの保存・更新・削除ができる', async () => {
    const db = newDb()
    await db.settings.put({ key: 'noEarphoneMode', value: true })
    await db.settings.put({ key: 'noEarphoneMode', value: false })
    expect((await db.settings.get('noEarphoneMode'))?.value).toBe(false)

    await db.settings.delete('noEarphoneMode')
    expect(await db.settings.get('noEarphoneMode')).toBeUndefined()
  })
})

describe('マイグレーション: version(1)→version(2)（T-42=C-2改訂）', () => {
  it('version(1)スキーマで作成済みのデータがversion(2)でも読める', async () => {
    const name = `beb-raid-migration-test-${++seq}`

    // 旧アプリ相当: version(1)のみを宣言した素のDexieインスタンスでデータを作る
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      profile: 'id',
      attempts: 'id, questionId, mode, answeredAt',
      srsCards: 'id, refType, refId, dueAt',
      ratings: 'section',
      ratingHistory: '[date+section], date, section',
      tagStats: 'tag',
      phase: 'season',
      streak: 'id',
      badges: 'badgeId',
      pendingSync: '++id, createdAt',
      settings: 'key',
    })
    await legacy.open()
    await legacy.table('profile').put({
      id: PROFILE_ID,
      displayName: '旧データ',
      initialToeic: null,
      createdAt: 1000,
      deviceToken: 'legacy-token',
    })
    legacy.close()

    // 新アプリ相当: version(1)+version(2)を宣言するBebRaidDatabaseで同名DBを開く
    const upgraded = new BebRaidDatabase(name)
    dbs.push(upgraded)
    await upgraded.open()

    // 既存データ（version(1)時代に書いたもの）が消えずに読める
    const profile = await upgraded.profile.get(PROFILE_ID)
    expect(profile?.displayName).toBe('旧データ')

    // 新設ストア（examScores）が読み書きできる
    expect(await upgraded.examScores.toArray()).toEqual([])
    await upgraded.examScores.put({
      id: 'e-1',
      date: '2026-07-14',
      listening: 400,
      reading: 400,
      total: 800,
      source: 'IP',
    })
    expect(await upgraded.examScores.count()).toBe(1)
  })
})
