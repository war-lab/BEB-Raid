// StatsDO単体テスト（正本: docs/17_M3実装計画.md 3.8節、docs/16 T-100完了条件）
import { env, reset, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { STATS_DO_NAME } from './statsDo'
import type { StatsDO } from './statsDo'

function stub() {
  return env.STATS.get(env.STATS.idFromName(STATS_DO_NAME))
}

afterEach(async () => {
  await reset()
})

describe('StatsDO.addStats / getAllStats', () => {
  it('新規questionIdは初期値からそのまま登録される', async () => {
    await runInDurableObject(stub(), (instance: StatsDO) => {
      instance.addStats([{ questionId: 'q-1', correct: 3, wrong: 1, timeout: 0 }])
    })

    const stats = await runInDurableObject(stub(), (instance: StatsDO) => instance.getAllStats())
    expect(stats).toEqual([{ questionId: 'q-1', correct: 3, wrong: 1, timeout: 0 }])
  })

  it('同一questionIdの再送はUPSERTで既存件数に加算される', async () => {
    await runInDurableObject(stub(), (instance: StatsDO) => {
      instance.addStats([{ questionId: 'q-1', correct: 3, wrong: 1, timeout: 0 }])
      instance.addStats([{ questionId: 'q-1', correct: 2, wrong: 0, timeout: 1 }])
    })

    const stats = await runInDurableObject(stub(), (instance: StatsDO) => instance.getAllStats())
    expect(stats).toEqual([{ questionId: 'q-1', correct: 5, wrong: 1, timeout: 1 }])
  })

  it('複数questionIdはquestionId別に個別集計される', async () => {
    await runInDurableObject(stub(), (instance: StatsDO) => {
      instance.addStats([
        { questionId: 'q-2', correct: 1, wrong: 0, timeout: 0 },
        { questionId: 'q-1', correct: 0, wrong: 2, timeout: 0 },
      ])
    })

    const stats = await runInDurableObject(stub(), (instance: StatsDO) => instance.getAllStats())
    expect(stats).toEqual([
      { questionId: 'q-1', correct: 0, wrong: 2, timeout: 0 },
      { questionId: 'q-2', correct: 1, wrong: 0, timeout: 0 },
    ])
  })

  it('保存レコードにdeviceTokenフィールドが存在しない（型レベル＋実行時検証。14の4.4-④）', async () => {
    await runInDurableObject(stub(), (instance: StatsDO) => {
      instance.addStats([{ questionId: 'q-1', correct: 1, wrong: 0, timeout: 0 }])
    })

    const stats = await runInDurableObject(stub(), (instance: StatsDO) => instance.getAllStats())
    for (const row of stats) {
      // addStatsの引数型（QuestionStatPayload）自体がdeviceTokenを持たないため、
      // 呼び出し側の実装ミスで紛れ込むことも構造的にできない
      expect(Object.keys(row).sort()).toEqual(['correct', 'questionId', 'timeout', 'wrong'])
      expect(row).not.toHaveProperty('deviceToken')
    }
  })
})
