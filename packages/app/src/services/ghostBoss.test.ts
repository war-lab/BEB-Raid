// 同意の構造的強制テスト（docs/22 3.5節・T-128完了条件）:
// 「同意なしでは記録送信の経路が存在しない（送信関数へ到達しない）」ことを検証する
import { describe, expect, it, vi } from 'vitest'
import type { RaidApi } from '../platform'
import { sendGhostBossRecord, withdrawGhostBossRecord } from './ghostBoss'

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
