// M3共有APIの契約型のシリアライズ/デシリアライズ確認（T-91完了条件。正本: docs/17 3.1節）。
// JSON.stringify→parseの往復で全フィールドが保持されることを検証する
import { describe, expect, it } from 'vitest'

import type {
  ApiError,
  QuestionReportPayload,
  QuestionStatsRequest,
  RaidBossState,
  RaidSyncRequest,
  RaidSyncResponse,
  RegisterRequest,
} from './types.js'

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('M3共有API契約型のJSON往復', () => {
  it('RegisterRequest', () => {
    const req: RegisterRequest = {
      inviteCode: 'invite-xyz',
      deviceToken: 'device-abc',
      displayName: '太郎',
      dailyGoal: 'normal',
    }
    expect(roundTrip(req)).toEqual(req)
  })

  it('RaidBossState（contributions込み）', () => {
    const boss: RaidBossState = {
      bossId: 'boss-2026-W30',
      name: 'アカウンタブル・アカウンタント',
      hp: 12000,
      maxHp: 42000,
      startAt: 1_700_000_000_000,
      endAt: 1_700_400_000_000,
      status: 'active',
      participantCount: 4,
      myDamage: 320,
      contributions: [
        { displayName: '太郎', damage: 320 },
        { displayName: '花子', damage: 480 },
      ],
    }
    expect(roundTrip(boss)).toEqual(boss)
  })

  it('RaidSyncRequest（DamageSyncPayload[]込み）', () => {
    const req: RaidSyncRequest = {
      payloads: [
        {
          attemptId: 'a-1',
          bossId: 'boss-2026-W30',
          damage: 40,
          questionCount: 1,
          answeredAt: 1_700_000_100_000,
        },
      ],
    }
    expect(roundTrip(req)).toEqual(req)
  })

  it('RaidSyncResponse', () => {
    const res: RaidSyncResponse = {
      acceptedIds: ['a-1', 'a-2'],
      boss: {
        bossId: 'boss-2026-W30',
        name: 'アカウンタブル・アカウンタント',
        hp: 11960,
        maxHp: 42000,
        startAt: 1_700_000_000_000,
        endAt: 1_700_400_000_000,
        status: 'active',
        participantCount: 4,
        myDamage: 360,
        contributions: [],
      },
    }
    expect(roundTrip(res)).toEqual(res)
  })

  it('QuestionStatsRequest', () => {
    const req: QuestionStatsRequest = {
      stats: [{ questionId: 'q-1', correct: 10, wrong: 2, timeout: 1 }],
    }
    expect(roundTrip(req)).toEqual(req)
  })

  it('QuestionReportPayload', () => {
    const report: QuestionReportPayload = { questionId: 'q-1', reason: 'unnatural' }
    expect(roundTrip(report)).toEqual(report)
  })

  it('ApiError', () => {
    const err: ApiError = { error: { code: 'unregistered', message: '未登録のdeviceTokenです' } }
    expect(roundTrip(err)).toEqual(err)
  })
})
