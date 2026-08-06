// T-08 完了条件: エクスポート→DB全消去→インポートで attempts・srsCards・
// ratings ほか全ストアが復元される往復テスト
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { ProfileRecord } from '../db/schema'
import { PROFILE_ID, STREAK_ID } from '../db/schema'
import {
  exportAll,
  EXPORT_EXCLUDED_KEYS,
  importAll,
  validateBackup,
  type BackupFile,
} from './backup'
import { ACTIVE_SESSION_KEY } from './session'
import { BYOK_API_KEY_KEY, QUESTION_STATS_LAST_SENT_AT_KEY } from './settingsKeys'

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
      if (table.name === 'profile') {
        // T-279（K-2）: deviceTokenは意図的に往復させない（復元先に既存トークンが無いため
        // 新規発行される）。他のフィールドは往復することを確認する
        expect(
          after.map((r: ProfileRecord) => ({ ...r, deviceToken: undefined })),
          'ストア profile が復元されていない',
        ).toEqual(before.map((r: ProfileRecord) => ({ ...r, deviceToken: undefined })))
        expect(after[0]?.deviceToken).toBeTruthy()
        continue
      }
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

// T-279（K-2）: profile.deviceTokenは共有APIのBearer資格情報だが、exportAllが
// profileストアを無加工で書き出すため、バックアップJSONに平文で含まれていた
describe('deviceTokenのエクスポート除外（T-279・K-2）', () => {
  it('exportAll の出力でprofile.deviceTokenが伏せられる（空文字になる）', async () => {
    const source = newDb()
    await seedAllStores(source)

    const exported = await exportAll(source)
    const profile = exported.stores.profile[0]
    expect(profile?.deviceToken).toBe('')
    expect(profile?.displayName).toBe('テスト') // 他のprofileフィールドは伏せられない
  })

  it('importAll は復元先に既存のdeviceTokenがあれば、それを優先して保持する', async () => {
    const source = newDb()
    await seedAllStores(source) // source.profile.deviceToken = 'token-1'
    const exported = await exportAll(source)

    const target = newDb()
    await target.profile.put({
      id: PROFILE_ID,
      displayName: '復元先の既存プロフィール',
      initialToeic: 400,
      createdAt: 500,
      deviceToken: 'token-target-existing',
    })
    await importAll(target, exported)

    const restored = await target.profile.get(PROFILE_ID)
    expect(restored?.deviceToken).toBe('token-target-existing')
    expect(restored?.displayName).toBe('テスト') // deviceToken以外はバックアップの内容で置き換わる
  })

  it('importAll は復元先にdeviceTokenが無い（新規端末）場合、新しいdeviceTokenを発行する（再登録の導線）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const target = newDb() // profile未作成の新規端末
    await importAll(target, exported)

    const restored = await target.profile.get(PROFILE_ID)
    expect(restored?.deviceToken).toBeTruthy()
    expect(restored?.deviceToken).not.toBe('') // 空のまま（再登録できない状態）にはしない
  })

  it('外部編集でdeviceTokenが混入したバックアップでも、復元先の既存トークンが優先される（多層防御）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)
    // 伏せられているはずのdeviceTokenを外部編集で復元した状況を模擬
    exported.stores.profile[0]!.deviceToken = 'token-injected'

    const target = newDb()
    await target.profile.put({
      id: PROFILE_ID,
      displayName: '既存',
      initialToeic: null,
      createdAt: 500,
      deviceToken: 'token-target-existing',
    })
    await importAll(target, exported)

    expect((await target.profile.get(PROFILE_ID))?.deviceToken).toBe('token-target-existing')
  })
})

describe('packSyncState のエクスポート除外（端末ローカルのキャッシュ状態を他端末へ持ち込まない）', () => {
  const PACK_SYNC_STATE_KEY = 'packSyncState'

  it('exportAll の出力に packSyncState が含まれない', async () => {
    // 含めてしまうと、復元先（キャッシュ空の端末）でpackHashesが現行manifestと一致し
    // 全パックがskip判定→キャッシュ空のままパックが永久にピン留めされないバグになる
    const source = newDb()
    await seedAllStores(source)
    await source.settings.put({
      key: PACK_SYNC_STATE_KEY,
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 1000 },
    })

    const exported = await exportAll(source)
    const keys = exported.stores.settings.map((s) => s.key)
    expect(keys).not.toContain(PACK_SYNC_STATE_KEY)
    expect(keys).toContain('noEarphoneMode') // 他のsettingsは除外されない
  })

  it('importAll は外部編集でpackSyncStateが混入したバックアップでも復元しない（多層防御）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)
    exported.stores.settings.push({
      key: PACK_SYNC_STATE_KEY,
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 1000 },
    })

    const target = newDb()
    await importAll(target, exported)
    expect(await target.settings.get(PACK_SYNC_STATE_KEY)).toBeUndefined()
  })

  it('復元先端末が自前で持つpackSyncStateはインポート後も残る（T-72の退避・書き戻し対象）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)

    const target = newDb()
    const localState = { packHashes: { local: 'h9' }, totalSizeBytes: 50, lastSyncedAt: 900 }
    await target.settings.put({ key: PACK_SYNC_STATE_KEY, value: localState })
    await importAll(target, exported)

    expect((await target.settings.get(PACK_SYNC_STATE_KEY))?.value).toEqual(localState)
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

// T-190（Q-100）: validateBackupは従来「storesが配列か」しか見ておらず、id欠落attempts・
// 型不正のsrsCards等がそのままbulkAdd/bulkPutされていた。レコード単位の型検証を追加する
describe('validateBackup / importAll: レコード単位の型検証（T-190・Q-100）', () => {
  it('id欠落のattemptsレコードを拒否し、DBに手を付けない', async () => {
    const target = newDb()
    await target.settings.put({ key: 'keep', value: 1 })
    const broken = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [
          {
            // id が欠落している
            questionId: 'q-1',
            mode: 'solo',
            isCorrect: true,
            responseMs: 1000,
            isTimeout: false,
            isGuess: false,
            answeredAt: 1000,
          },
        ],
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

    const problems = validateBackup(broken)
    expect(problems.some((p) => p.includes('attempts'))).toBe(true)
    await expect(importAll(target, broken)).rejects.toThrow(/不正/)
    expect(await target.settings.get('keep')).toBeDefined()
  })

  it('型不正なsrsCardsレコード（stageが文字列）を拒否し、DBに手を付けない', async () => {
    const target = newDb()
    await target.settings.put({ key: 'keep', value: 1 })
    const broken = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [
          {
            id: 'vocab:submit',
            refType: 'vocab',
            refId: 'submit',
            stage: '1', // 本来number
            dueAt: 5000,
            lapses: 0,
          },
        ],
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

    const problems = validateBackup(broken)
    expect(problems.some((p) => p.includes('srsCards'))).toBe(true)
    await expect(importAll(target, broken)).rejects.toThrow(/不正/)
    expect(await target.settings.get('keep')).toBeDefined()
  })

  it('正常なバックアップ（既存のシード）はレコード単位検証を通過する', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = JSON.parse(JSON.stringify(await exportAll(source))) as BackupFile
    expect(validateBackup(exported)).toEqual([])
  })
})

// T-190（Q-101）: 同一バックアップファイル内にattemptsのIDが重複していると、
// 従来はbulkAddのBulkErrorでトランザクション全体が中断し、原因の分かりにくい失敗になっていた
describe('importAll: バックアップ内のattempts重複IDに耐える（T-190・Q-101）', () => {
  it('同一ファイル内で同じIDのattemptsが重複していてもBulkErrorにならず1件に統合される', async () => {
    const target = newDb()
    const duplicated = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [
          {
            id: 'a-dup',
            questionId: 'q-1',
            mode: 'solo',
            isCorrect: true,
            responseMs: 1000,
            isTimeout: false,
            isGuess: false,
            answeredAt: 1000,
          },
          {
            id: 'a-dup', // 同一ID重複（改ざん・破損したバックアップを模擬）
            questionId: 'q-1',
            mode: 'solo',
            isCorrect: false,
            responseMs: 2000,
            isTimeout: false,
            isGuess: false,
            answeredAt: 2000,
          },
        ],
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

    await expect(importAll(target, duplicated)).resolves.not.toThrow()
    expect(await target.attempts.count()).toBe(1)
  })
})

// T-190（Q-111）: EXPORT_EXCLUDED_KEYSに進行中セッション・questionStats送信済み水位を追加する。
// 既存のバックアップファイルには当該キーが含まれうるため、インポート側でも無視する
// 多層防御が必要（既存のBYOK/packSyncStateと同じ仕組みに乗せる）
describe('EXPORT_EXCLUDED_KEYS への追加（T-190・Q-111）', () => {
  it('EXPORT_EXCLUDED_KEYSはACTIVE_SESSION_KEYとQUESTION_STATS_LAST_SENT_AT_KEYを含む', () => {
    expect(EXPORT_EXCLUDED_KEYS).toContain(ACTIVE_SESSION_KEY)
    expect(EXPORT_EXCLUDED_KEYS).toContain(QUESTION_STATS_LAST_SENT_AT_KEY)
  })

  it('exportAllの出力にactiveSession・questionStatsLastSentAtが含まれない', async () => {
    const source = newDb()
    await seedAllStores(source)
    await source.settings.put({ key: ACTIVE_SESSION_KEY, value: { sessionId: 's-1' } })
    await source.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: 12345 })

    const exported = await exportAll(source)
    const keys = exported.stores.settings.map((s) => s.key)
    expect(keys).not.toContain(ACTIVE_SESSION_KEY)
    expect(keys).not.toContain(QUESTION_STATS_LAST_SENT_AT_KEY)
  })

  it('importAllは外部編集でactiveSession・questionStatsLastSentAtが混入したバックアップでも復元せず、端末側の値を保持する（多層防御）', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)
    // 外部でJSONを手編集して混入させた状況、または除外前に取得した旧バックアップを模擬
    exported.stores.settings.push(
      { key: ACTIVE_SESSION_KEY, value: { sessionId: 'from-backup' } },
      { key: QUESTION_STATS_LAST_SENT_AT_KEY, value: 99999 },
    )

    const target = newDb()
    const localSession = { sessionId: 'local-active' }
    await target.settings.put({ key: ACTIVE_SESSION_KEY, value: localSession })
    await target.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: 500 })

    await importAll(target, exported)

    // バックアップ由来の値ではなく、端末に既にあった値がそのまま残る
    expect((await target.settings.get(ACTIVE_SESSION_KEY))?.value).toEqual(localSession)
    expect((await target.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value).toBe(500)
  })

  it('端末側に値が無ければ、バックアップに混入していてもインポート後も存在しない', async () => {
    const source = newDb()
    await seedAllStores(source)
    const exported = await exportAll(source)
    exported.stores.settings.push({ key: ACTIVE_SESSION_KEY, value: { sessionId: 'from-backup' } })

    const target = newDb()
    await importAll(target, exported)

    expect(await target.settings.get(ACTIVE_SESSION_KEY)).toBeUndefined()
  })
})

// T-190（Q-105関連の不変条件）: phase.tsは「常に1行だけ存在する」を不変条件とするが、
// importAllはclear+bulkPutのため、バックアップに複数行含まれていると不変条件が破れる
describe('importAll: phaseストアは常に1行に強制される（T-190）', () => {
  it('バックアップに複数のphase行が含まれていても、復元後は1行だけになる', async () => {
    const target = newDb()
    const broken = {
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
        phase: [
          { season: 'P1', criteriaJson: '{}', achievedAt: null },
          { season: 'P2', criteriaJson: '{}', achievedAt: 1000 }, // 改ざん・破損を模擬した2行目
        ],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
        examScores: [],
        raidState: [],
      },
    }

    await importAll(target, broken)

    expect(await target.phase.count()).toBe(1)
  })
})
