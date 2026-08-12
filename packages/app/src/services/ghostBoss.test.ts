// 同意の構造的強制テスト（docs/22 3.5節・T-128完了条件）:
// 「同意なしでは記録送信の経路が存在しない（送信関数へ到達しない）」ことを検証する
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BebRaidDatabase } from '../db/database'
import type { RaidApi } from '../platform'
import {
  clearPendingGhostBossResult,
  loadPendingGhostBossResult,
  savePendingGhostBossResult,
  sendGhostBossRecord,
  withdrawGhostBossRecord,
} from './ghostBoss'
import { GHOST_BOSS_PENDING_RESULT_KEY } from './settingsKeys'

function fakeRaidApi(): RaidApi {
  return {
    isConfigured: () => true,
    register: vi.fn(),
    fetchCurrentBoss: vi.fn(),
    syncDamage: vi.fn(),
    sendQuestionStats: vi.fn(),
    sendReport: vi.fn(),
    sendGhostRecord: vi.fn(async () => {}),
    deleteOwnGhostRecord: vi.fn(async () => {}),
  } as unknown as RaidApi
}

describe('sendGhostBossRecord（同意の構造的強制）', () => {
  it('consented=falseでは例外を投げ、raidApi.sendGhostRecordは一度も呼ばれない', async () => {
    const raidApi = fakeRaidApi()

    await expect(
      sendGhostBossRecord(raidApi, false, {
        displayName: '太郎',
        records: [{ questionId: 'q-1', correct: true }],
      }),
    ).rejects.toThrow()

    expect(raidApi.sendGhostRecord).not.toHaveBeenCalled()
  })

  it(
    'consented未指定（デフォルトfalse相当の呼び出しはできないため型で強制済み）でも、' +
      '明示的にfalseを渡した場合と同じく送信されない',
    async () => {
      const raidApi = fakeRaidApi()
      // consented を明示的に渡さない誤用は TypeScript の必須引数チェックで防がれる
      // （sendGhostBossRecord(raidApi, input) はコンパイルエラーになる）。
      // ここでは「false相当の値では送信されない」ことのみを実行時に再確認する
      await expect(
        sendGhostBossRecord(raidApi, false, { displayName: '太郎', records: [] }),
      ).rejects.toThrow()
      expect(raidApi.sendGhostRecord).not.toHaveBeenCalled()
    },
  )

  it('consented=trueなら構築済みpayloadでraidApi.sendGhostRecordを呼ぶ', async () => {
    const raidApi = fakeRaidApi()
    const records = [
      { questionId: 'q-1', correct: true },
      { questionId: 'q-2', correct: false },
    ]

    await sendGhostBossRecord(raidApi, true, { displayName: '太郎', records })

    expect(raidApi.sendGhostRecord).toHaveBeenCalledTimes(1)
    expect(raidApi.sendGhostRecord).toHaveBeenCalledWith({
      consent: true,
      displayName: '太郎',
      records,
    })
  })
})

describe('withdrawGhostBossRecord', () => {
  it('raidApi.deleteOwnGhostRecordを呼ぶ', async () => {
    const raidApi = fakeRaidApi()
    await withdrawGhostBossRecord(raidApi)
    expect(raidApi.deleteOwnGhostRecord).toHaveBeenCalledTimes(1)
  })
})

// T-294（K-21）: 未送信のボス役結果の一時保存3関数（T-272）に専用テストが無かった。
// 送信成功前にアプリを終了・再読み込みしても結果が失われないための唯一の保全経路であり、
// ここが壊れると「解き切った結果」が無音で消える
describe('savePendingGhostBossResult / loadPendingGhostBossResult / clearPendingGhostBossResult（T-272）', () => {
  let seq = 0
  const dbs: BebRaidDatabase[] = []

  function newDb(): BebRaidDatabase {
    const db = new BebRaidDatabase(`ghost-boss-pending-test-${++seq}`)
    dbs.push(db)
    return db
  }

  afterEach(async () => {
    await Promise.all(dbs.splice(0).map((db) => db.delete()))
  })

  it('未保存の状態ではloadがnullを返す', async () => {
    const db = newDb()
    expect(await loadPendingGhostBossResult(db)).toBeNull()
  })

  it('save→loadで保存した内容がそのまま読み戻せる', async () => {
    const db = newDb()
    const records = [
      { questionId: 'q-1', correct: true },
      { questionId: 'q-2', correct: false },
    ]

    await savePendingGhostBossResult(db, records)
    const loaded = await loadPendingGhostBossResult(db)

    expect(loaded?.records).toEqual(records)
    expect(typeof loaded?.savedAt).toBe('number')
  })

  it('saveは既存の保存を上書きする（settings.putの冪等性）', async () => {
    const db = newDb()
    await savePendingGhostBossResult(db, [{ questionId: 'q-1', correct: true }])
    await savePendingGhostBossResult(db, [{ questionId: 'q-2', correct: false }])

    const loaded = await loadPendingGhostBossResult(db)
    expect(loaded?.records).toEqual([{ questionId: 'q-2', correct: false }])
    expect(await db.settings.where('key').equals(GHOST_BOSS_PENDING_RESULT_KEY).count()).toBe(1)
  })

  it('clearで保存を削除するとloadがnullに戻る', async () => {
    const db = newDb()
    await savePendingGhostBossResult(db, [{ questionId: 'q-1', correct: true }])

    await clearPendingGhostBossResult(db)

    expect(await loadPendingGhostBossResult(db)).toBeNull()
  })

  it('clearは保存が無い状態で呼んでも例外にならない（冪等）', async () => {
    const db = newDb()
    await expect(clearPendingGhostBossResult(db)).resolves.not.toThrow()
  })
})
