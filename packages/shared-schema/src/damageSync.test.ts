// T-89完了条件②のテスト（14の4.4節）: レイドダメージ送信ペイロードのホワイトリスト照合。
// questionId・isCorrect・レート実値・responseMs等の個人単位の正誤詳細が
// 誤って混入したら失敗させる（プライバシー境界のコードレベル強制）
import { describe, expect, it } from 'vitest'

import { buildDamageSyncPayload, DAMAGE_SYNC_PAYLOAD_KEYS } from './damageSync.js'

describe('buildDamageSyncPayload: ホワイトリスト照合', () => {
  // T-290（K-17）: 期待値をDAMAGE_SYNC_PAYLOAD_KEYS自身と比較すると自己参照になり、
  // ホワイトリストと出力の双方に同じフィールドを誤って増やしても検出できない。
  // テストファイル内のリテラル配列で固定する（併せてタイトルの「4つ」の誤り=
  // answeredAt漏れを「5つ」へ訂正する）
  it('出力のキーがattemptId/bossId/damage/questionCount/answeredAtの5つだけになる', () => {
    const payload = buildDamageSyncPayload({
      attemptId: 'a-1',
      bossId: 'boss-2026-w29',
      damage: 40,
      questionCount: 1,
      answeredAt: 1_700_000_000_000,
    })

    expect(Object.keys(payload).sort()).toEqual(
      ['attemptId', 'bossId', 'damage', 'questionCount', 'answeredAt'].sort(),
    )
  })

  it('入力に個人単位の正誤詳細（questionId・isCorrect・rating・responseMs）が混在していても出力に含まれない', () => {
    // 呼び出し側の実装ミスでattempts由来の余計なフィールドを渡してしまうケースを模擬
    const contaminatedInput = {
      attemptId: 'a-1',
      bossId: 'boss-2026-w29',
      damage: 40,
      questionCount: 1,
      answeredAt: 1_700_000_000_000,
      questionId: 'q-1',
      isCorrect: true,
      rating: 650,
      responseMs: 1200,
    }

    const payload = buildDamageSyncPayload(contaminatedInput)
    const leaked = Object.keys(payload).filter(
      (k) => !DAMAGE_SYNC_PAYLOAD_KEYS.includes(k as never),
    )

    expect(leaked).toEqual([])
    expect(payload).not.toHaveProperty('questionId')
    expect(payload).not.toHaveProperty('isCorrect')
    expect(payload).not.toHaveProperty('rating')
    expect(payload).not.toHaveProperty('responseMs')
  })
})
