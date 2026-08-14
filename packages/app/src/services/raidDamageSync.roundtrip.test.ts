// T-274（K-1）回帰テスト。正本: docs/32 3節J-115・docs/31 4節K-1。
//
// soloモードのダメージは基礎点（[40,130]の整数）にモード係数0.5を掛けるため、
// 基礎点が奇数のとき小数になる。api側の isRaidSyncRequest は Number.isInteger を
// 要求するため、この小数がバッチ全体を400で拒否させ、pendingSyncを恒久停止させていた。
//
// レート200〜900（25刻み・29通り）×難易度1〜5（5通り）の全145通りで、
// app側の実際の計算（basePoints→computeDamage）から作った送信payloadが
// api側の実際の検証器（isRaidSyncRequest）を通ることを確認する。
import { buildDamageSyncPayload } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import { isRaidSyncRequest } from '../../../api/src/raidValidation'
import { computeDamage } from '../engine/damage'
import { basePoints, difficultyToRatingSpace } from '../engine/rating'
import { roundDamageForSync } from './answerPipeline'

const RATINGS = Array.from({ length: 29 }, (_, i) => 200 + i * 25) // 200..900
const DIFFICULTIES = [1, 2, 3, 4, 5]

describe('レイドダメージ送信値の往復（T-274・K-1）', () => {
  it('rate200〜900×difficulty1〜5の全145通りで、丸め後のsolo/raidダメージがisRaidSyncRequestを通る', () => {
    let checked = 0
    for (const rating of RATINGS) {
      for (const difficulty of DIFFICULTIES) {
        for (const mode of ['solo', 'raid'] as const) {
          const bp = basePoints(rating, difficultyToRatingSpace(difficulty))
          const rawDamage = computeDamage(bp, mode)
          const payload = buildDamageSyncPayload({
            attemptId: `a-${rating}-${difficulty}-${mode}`,
            bossId: 'boss-2026-W01',
            damage: roundDamageForSync(rawDamage),
            questionCount: 1,
            answeredAt: 1_700_000_000_000,
          })

          expect(
            isRaidSyncRequest({ payloads: [payload] }),
            `rate=${rating} difficulty=${difficulty} mode=${mode} rawDamage=${rawDamage}`,
          ).toBe(true)
          checked += 1
        }
      }
    }
    expect(checked).toBe(RATINGS.length * DIFFICULTIES.length * 2)
  })
})
