// T-08 完了条件: エクスポート→DB全消去→インポートで attempts・srsCards・
// ratings ほか全ストアが復元される往復テスト
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID, STREAK_ID } from '../db/schema'
import {
  exportAll,
  EXPORT_EXCLUDED_KEYS,
  importAll,
  validateBackup,
  type BackupFile,
} from './backup'
import { BYOK_API_KEY_KEY } from './settingsKeys'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`backup-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** 全13ストアにテストデータを投入する */
async function seedAllStores(db: BebRaidDatabase): Promise<void> {
  await db.profile.put({
    id: PROFILE_ID,
    displayName: 'テスト',
    initialToeic: 550,
    createdAt: 1000,
    deviceToken: 'token-1',
  })
  await db.attempts.bulkAdd([
    {
      id: 'a-1',
      questionId: 'q-1',
      mode: 'solo',
      isCorrect: true,
      responseMs: 3000,
      isTimeout: false,
      isGuess: false,
      answeredAt: 1000,
    },
    {
      id: 'a-2',
      questionId: 'q-2',
      mode: 'srs',
      isCorrect: false,
      responseMs: 1500,
      isTimeout: false,
      isGuess: true,
      answeredAt: 2000,
    },
  ])
  await db.srsCards.put({
    id: 'vocab:submit',
    refType: 'vocab',
    refId: 'submit',
    stage: 1,
    dueAt: 5000,
    lapses: 0,
  })
  await db.ratings.put({ section: 'L', rating: 420, updatedAt: 1000 })
  await db.ratingHistory.put({ date: '2026-07-07', section: 'L', rating: 420 })
  await db.tagStats.put({ tag: '疑問詞聞き取り', windowCorrect: 6, windowTotal: 10 })
  await db.phase.put({ season: 'P1', criteriaJson: '{}', achievedAt: null })
  await db.streak.put({
    id: STREAK_ID,
    currentDays: 3,
    bestDays: 7,
    lastActiveDate: '2026-07-07',
    protectionUsedAt: null,
  })
  await db.badges.put({ badgeId: 'first-session', earnedAt: 1000 })
  await db.pendingSync.add({
    kind: 'raidDamage',
    payloadJson: '{"attemptId":"a-1"}',
    createdAt: 1000,
  })
  await db.settings.put({ key: 'noEarphoneMode', value: true })
  await db.examScores.put({
    id: 'exam-1',
    date: '2026-07-14',
    listening: 380,
    reading: 400,
    total: 780,
    source: 'IP',
  })
  await db.raidState.put({
    id: 'current',
    bossId: 'boss-2026-w29',
    profileJson: '{}',
    hp: 8000,
    maxHp: 10000,
    myDamage: 120,
    joined: true,
    startAt: 1000,
    endAt: 2000,
    lastSyncedAt: 1500,
  })
}

describe('エクスポート→全消去→インポートの往復', () => {
  it('全ストアが復元される', async () => {
    const source = newDb()
    await seedAllStores(source)

    // JSONファイル経由を模擬（stringify → parse で往復できることも確認）
    const exported = JSON.parse(JSON.stringify(await exportAll(source))) as BackupFile

    // 「DB全消去」= 空の新規DBへの復元と等価（実運用では機種変・iOS退避後の端末）
    const restored = newDb()
    await importAll(restored, exported)

    for (const table of source.tables) {
      const before = await table.toArray()
      const after = await restored.table(table.name).toArray()
      expect(after, `ストア ${table.name} が復元されていない`).toEqual(before)
    }
  })

  it('インポートは冪等（2回実行しても同じ状態）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const restored = newDb()
    await importAll(restored, exported)
    await importAll(restored, exported)
    expect(await restored.attempts.count()).toBe(2)
    expect(await restored.settings.count()).toBe(1)
  })

  it('attempts はマージ追記で、バックアップに無い既存ログも消えない', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const target = newDb()
    // バックアップに含まれない解答ログが先に存在する
    await target.attempts.add({
      id: 'a-local',
      questionId: 'q-9',
      mode: 'solo',
      isCorrect: true,
      responseMs: 2500,
      isTimeout: false,
      isGuess: false,
      answeredAt: 9000,
    })
    await importAll(target, exported)

    expect(await target.attempts.count()).toBe(3) // a-1, a-2, a-local
    expect(await target.attempts.get('a-local')).toBeDefined()
  })

  it('attempts の既存IDは内容が異なるバックアップでも書き換わらない', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = JSON.parse(JSON.stringify(await exportAll(source))) as BackupFile

    // 改ざん・破損を模擬: 既存ログ a-1 の正誤を反転させたバックアップ
    const tampered = exported.stores.attempts.find((a) => a.id === 'a-1')
    if (!tampered) throw new Error('テストデータ不整合')
    tampered.isCorrect = false

    const target = newDb()
    await seedAllStores(target) // a-1（isCorrect: true）が既に存在する
    await importAll(target, exported)

    expect((await target.attempts.get('a-1'))?.isCorrect).toBe(true) // 上書きされない
    expect(await target.attempts.count()).toBe(2)
  })

  it('attempts 以外は置き換え復元（インポート前の残存データが混ざらない）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const target = newDb()
    await target.settings.put({ key: '不要な設定', value: 1 })
    await target.srsCards.put({
      id: 'vocab:old',
      refType: 'vocab',
      refId: 'old',
      stage: 5,
      dueAt: 1,
      lapses: 9,
    })
    await importAll(target, exported)

    expect(await target.settings.get('不要な設定')).toBeUndefined()
    expect(await target.srsCards.get('vocab:old')).toBeUndefined()
    expect(await target.srsCards.get('vocab:submit')).toBeDefined()
  })
})

describe('validateBackup / importAll: 不正データの拒否', () => {
  it('オブジェクトでない入力を拒否する', async () => {
    expect(validateBackup('x')).not.toHaveLength(0)
    await expect(importAll(newDb(), 'x')).rejects.toThrow(/不正/)
  })

  it('formatVersion 不一致を拒否する', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = (await exportAll(source)) as unknown as Record<string, unknown>
    exported.formatVersion = 99
    await expect(importAll(newDb(), exported)).rejects.toThrow(/formatVersion/)
  })

  it('ストア欠落を全件列挙で拒否し、DBに手を付けない', async () => {
    const broken = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: { profile: [], attempts: [] }, // 残り9ストアが欠落
    }
    const problems = validateBackup(broken)
    expect(problems).toHaveLength(9)

    const target = newDb()
    await target.settings.put({ key: 'keep', value: 1 })
    await expect(importAll(target, broken)).rejects.toThrow()
    expect(await target.settings.get('keep')).toBeDefined()
  })

  it('dbVersionが現在のDBより新しいバックアップを拒否し、DBに手を付けない（3.8節）', async () => {
    const target = newDb()
    await target.settings.put({ key: 'keep', value: 1 })
    const tooNew = {
      formatVersion: 1,
      dbVersion: target.verno + 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [],
        ratings: [],
        ratingHistory: [],
        tagStats: [],
        phase: [],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
        examScores: [],
        raidState: [],
      },
    }
    await expect(importAll(target, tooNew)).rejects.toThrow(/dbVersion/)
    expect(await target.settings.get('keep')).toBeDefined()
  })
})

describe('BYOKキーのエクスポート除外（T-42=C-2改訂。レビューフォローアップ必須項目）', () => {
  it('exportAll の出力に byokApiKey が含まれない', async () => {
    const source = newDb()
    await seedAllStores(source)
    await source.settings.put({ key: BYOK_API_KEY_KEY, value: 'sk-ant-secret' })

    const exported = await exportAll(source)
    const keys = exported.stores.settings.map((s) => s.key)
    expect(keys).not.toContain(BYOK_API_KEY_KEY)
    expect(keys).toContain('noEarphoneMode') // 他のsettingsは除外されない
  })

  it('importAll は外部編集でbyokApiKeyが混入したバックアップでも復元しない（多層防御）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)
    // 外部でJSONを手編集してbyokApiKeyを混入させた状況を模擬
    exported.stores.settings.push({ key: BYOK_API_KEY_KEY, value: 'sk-ant-injected' })

    const target = newDb()
    await importAll(target, exported)
    expect(await target.settings.get(BYOK_API_KEY_KEY)).toBeUndefined()
  })

  it('EXPORT_EXCLUDED_KEYS は byokApiKey を含む', () => {
    expect(EXPORT_EXCLUDED_KEYS).toContain(BYOK_API_KEY_KEY)
  })

  it('T-72: 端末に保存済みのbyokApiKeyは、バックアップ（キー無し）のインポート後も残る', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source) // byokApiKeyを含まないバックアップ

    const target = newDb()
    await target.settings.put({ key: BYOK_API_KEY_KEY, value: 'sk-ant-local-key' })
    await importAll(target, exported)

    // 以前はsettingsストアのclear()でこの値が消えたまま復元されないバグだった
    expect((await target.settings.get(BYOK_API_KEY_KEY))?.value).toBe('sk-ant-local-key')
    expect(await target.settings.get('noEarphoneMode')).toBeDefined() // 通常設定は復元される
  })

  it('T-72: byokApiKeyの保持は2回インポートしても重複せず1件のまま', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const target = newDb()
    await target.settings.put({ key: BYOK_API_KEY_KEY, value: 'sk-ant-local-key' })
    await importAll(target, exported)
    await importAll(target, exported)

    const keys = (await target.settings.toArray()).filter((s) => s.key === BYOK_API_KEY_KEY)
    expect(keys).toHaveLength(1)
    expect(keys[0]?.value).toBe('sk-ant-local-key')
  })
})

describe('examScores ストア（T-42=C-2改訂。M2新設）', () => {
  it('examScores もエクスポート/インポートの往復対象になる', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const restored = newDb()
    await importAll(restored, exported)
    expect(await restored.examScores.toArray()).toEqual(await source.examScores.toArray())
  })

  it('旧バージョン（dbVersion:1）のバックアップにexamScoresが無くても妥当と判定する', () => {
    const legacyBackup = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [],
        ratings: [],
        ratingHistory: [],
        tagStats: [],
        phase: [],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
        // examScores は無い（T-42以前のバックアップを模擬）
      },
    }
    expect(validateBackup(legacyBackup)).toEqual([])
  })

  it('旧バージョンのバックアップをインポートしてもexamScoresは空のまま', async () => {
    const legacyBackup = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [],
        ratings: [],
        ratingHistory: [],
        tagStats: [],
        phase: [],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
      },
    }
    const target = newDb()
    await target.examScores.put({
      id: 'existing',
      date: '2026-07-01',
      listening: 300,
      reading: 300,
      total: 600,
      source: 'その他',
    })
    await importAll(target, legacyBackup)
    // examScoresストア自体は「置き換え復元」の対象（attempts以外の規約どおり）
    expect(await target.examScores.toArray()).toEqual([])
  })
})
