// M4共有API契約型のシリアライズ/デシリアライズ確認（T-123完了条件。正本: docs/22 3.1節）。
// JSON.stringify→parseの往復で全フィールドが保持されることを検証する。
// 既存M3契約型（RaidBossState含む）のroundtripテストは raidApiTypes.test.ts に既存のまま
// 残し、本ファイルはM4で追加した型のみを扱う（既存テスト無修正の要件=T-123完了条件）
import { describe, expect, it } from 'vitest'

import type { CreateBattleRoomResponse, OkResponse, RaidBossState, RaidSummary } from './types.js'

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('RaidBossState: M4拡張フィールド（bossType/defense/ghost）', () => {
  it('synthetic週はbossType等を省略してもM3同様に往復できる（既存互換の回帰）', () => {
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
      contributions: [{ displayName: '太郎', damage: 320 }],
    }
    expect(roundTrip(boss)).toEqual(boss)
    expect(boss.bossType).toBeUndefined()
    expect(boss.defense).toBeUndefined()
    expect(boss.ghost).toBeUndefined()
  })

  it('ghost週はbossType/defense/ghostを含めて往復できる', () => {
    const boss: RaidBossState = {
      bossId: 'boss-2026-W31',
      name: 'ゴースト・花子',
      hp: 8000,
      maxHp: 40000,
      startAt: 1_700_400_000_000,
      endAt: 1_700_800_000_000,
      status: 'active',
      participantCount: 5,
      myDamage: 120,
      contributions: [{ displayName: '太郎', damage: 120 }],
      bossType: 'ghost',
      defense: [
        { questionId: 'q-0102', multiplier: 0.5 },
        { questionId: 'q-0103', multiplier: 2.0 },
      ],
      ghost: { displayName: '花子', defeatedCount: 3 },
    }
    expect(roundTrip(boss)).toEqual(boss)
  })
})

describe('RaidSummary: JSON往復（GET /raid/summary）', () => {
  it('討伐済み（defeatedAt有り）', () => {
    const summary: RaidSummary = {
      bossId: 'boss-2026-W30',
      bossType: 'synthetic',
      maxHp: 42000,
      remainingHp: 0,
      defeated: true,
      defeatedAt: 1_700_300_000_000,
      participantCount: 6,
    }
    expect(roundTrip(summary)).toEqual(summary)
  })

  it('未討伐（defeatedAt=null）', () => {
    const summary: RaidSummary = {
      bossId: 'boss-2026-W31',
      bossType: 'ghost',
      maxHp: 40000,
      remainingHp: 15000,
      defeated: false,
      defeatedAt: null,
      participantCount: 5,
    }
    expect(roundTrip(summary)).toEqual(summary)
  })
})

describe('CreateBattleRoomResponse / OkResponse: JSON往復', () => {
  it('CreateBattleRoomResponse（POST /battle/rooms）', () => {
    const res: CreateBattleRoomResponse = { code: 'ABCD' }
    expect(roundTrip(res)).toEqual(res)
  })

  it('OkResponse（POST /ghosts・DELETE /ghosts/own）', () => {
    const res: OkResponse = { ok: true }
    expect(roundTrip(res)).toEqual(res)
  })
})
