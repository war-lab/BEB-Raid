// T-91完了条件: QuestionStatPayloadにdeviceTokenが構造的に存在しないことの型レベル検証
// （14の4.4-④節。buildDamageSyncPayloadのホワイトリスト照合と同じ方式）
import { describe, expect, it } from 'vitest'

import { buildQuestionStatPayload, QUESTION_STAT_PAYLOAD_KEYS } from './questionStats.js'

describe('buildQuestionStatPayload: ホワイトリスト照合', () => {
  it('出力のキーがquestionId/correct/wrong/timeoutの4つだけになる', () => {
    const payload = buildQuestionStatPayload({
      questionId: 'q-1',
      correct: 10,
      wrong: 2,
      timeout: 1,
    })

    expect(Object.keys(payload).sort()).toEqual([...QUESTION_STAT_PAYLOAD_KEYS].sort())
  })

  it('入力にdeviceTokenが混在していても出力に含まれない', () => {
    // 呼び出し側の実装ミスでdeviceTokenを渡してしまうケースを模擬
    const contaminatedInput = {
      questionId: 'q-1',
      correct: 10,
      wrong: 2,
      timeout: 1,
      deviceToken: 'device-abc',
    }

    const payload = buildQuestionStatPayload(contaminatedInput)
    const leaked = Object.keys(payload).filter(
      (k) => !QUESTION_STAT_PAYLOAD_KEYS.includes(k as never),
    )

    expect(leaked).toEqual([])
    expect(payload).not.toHaveProperty('deviceToken')
  })
})
