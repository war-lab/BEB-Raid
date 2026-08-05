// T-12: タグ統計・弱点判定のテスト（03の7節）。
// 完了条件: 解答を流し込むと移動窓が正しく更新され、正答率60%未満のタグが
// 弱点として抽出される。tagStats が attempts から再構築可能
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import {
  computeTagWindow,
  getTagAccuracies,
  getWeakTags,
  GUESS_WEIGHT,
  recomputeTagStats,
  TAG_ATTEMPTS_READ_LIMIT,
  TAG_WINDOW_SIZE,
  toTagAccuracy,
  updateTagStatsForAnswer,
} from './tagStats'
import type { QuestionLookup } from './types'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`tagstats-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** テスト用の最小限の問題定義 */
function question(id: string, tags: string[]): Question {
  return { id, part: 5, format: 'text_blank', difficulty: 3, tags, keyVocab: [] }
}

function lookupOf(...questions: Question[]): QuestionLookup {
  return new Map(questions.map((q) => [q.id, q]))
}

let attemptSeq = 0
function attempt(questionId: string, partial: Partial<AttemptRecord> = {}): AttemptRecord {
  attemptSeq += 1
  return {
    id: `a-${attemptSeq}`,
    questionId,
    mode: 'solo',
    isCorrect: true,
    responseMs: 5000,
    isTimeout: false,
    isGuess: false,
    answeredAt: attemptSeq * 1000,
    ...partial,
  }
}

describe('computeTagWindow: 移動窓の集計', () => {
  const lookup = lookupOf(question('q-1', ['品詞']), question('q-2', ['品詞', '動詞の形']))

  it('正解 +1/+1、通常誤答 +0/+1、当て勘誤答 +0/+0.5', () => {
    const attempts = [
      attempt('q-1'), // 正解
      attempt('q-1', { isCorrect: false }), // 通常誤答
      attempt('q-2', { isCorrect: false, isGuess: true }), // 当て勘誤答
    ]
    expect(computeTagWindow(attempts, '品詞', lookup)).toEqual({
      windowCorrect: 1,
      windowTotal: 2 + GUESS_WEIGHT,
    })
    // タグを持たない問題・別タグは混ざらない
    expect(computeTagWindow(attempts, '動詞の形', lookup)).toEqual({
      windowCorrect: 0,
      windowTotal: GUESS_WEIGHT,
    })
  })

  it('時間切れ（速度不足）と SRS復習は窓に入らない', () => {
    const attempts = [
      attempt('q-1', { isCorrect: false, isTimeout: true }),
      attempt('q-1', { mode: 'srs', isCorrect: false }),
      attempt('q-1'),
    ]
    expect(computeTagWindow(attempts, '品詞', lookup)).toEqual({
      windowCorrect: 1,
      windowTotal: 1,
    })
  })

  it('直近100問だけが窓に残る（古い誤答が窓から抜けると正答率が回復する）', () => {
    // 古い誤答10問 → その後正解を100問
    const attempts = [
      ...Array.from({ length: 10 }, () => attempt('q-1', { isCorrect: false })),
      ...Array.from({ length: TAG_WINDOW_SIZE }, () => attempt('q-1')),
    ]
    expect(computeTagWindow(attempts, '品詞', lookup)).toEqual({
      windowCorrect: TAG_WINDOW_SIZE,
      windowTotal: TAG_WINDOW_SIZE,
    })
  })

  it('解決表に無い questionId の解答は無視される', () => {
    expect(computeTagWindow([attempt('unknown')], '品詞', lookup)).toEqual({
      windowCorrect: 0,
      windowTotal: 0,
    })
  })
})

describe('弱点判定（60%未満・最小標本5）', () => {
  it('正答率60%未満のタグだけが弱点として抽出される', () => {
    expect(toTagAccuracy({ tag: 'a', windowCorrect: 5, windowTotal: 10 }).isWeak).toBe(true) // 50%
    expect(toTagAccuracy({ tag: 'b', windowCorrect: 6, windowTotal: 10 }).isWeak).toBe(false) // 60%ちょうどは弱点でない
    expect(toTagAccuracy({ tag: 'c', windowCorrect: 7, windowTotal: 10 }).isWeak).toBe(false)
  })

  it('標本が5未満のタグは弱点にしない（数問の誤答で全タグが弱点化するのを防ぐ）', () => {
    expect(toTagAccuracy({ tag: 'a', windowCorrect: 0, windowTotal: 4 }).isWeak).toBe(false)
    expect(toTagAccuracy({ tag: 'a', windowCorrect: 0, windowTotal: 5 }).isWeak).toBe(true)
  })

  it('当て勘誤答の重み減で、当て勘まみれのタグは弱点になりにくい', () => {
    // 正解3 + 通常誤答3: 3/6 = 50% → 弱点
    expect(toTagAccuracy({ tag: 'a', windowCorrect: 3, windowTotal: 6 }).isWeak).toBe(true)
    // 正解3 + 当て勘誤答3: 3/4.5 ≒ 67% → 弱点でない
    expect(toTagAccuracy({ tag: 'a', windowCorrect: 3, windowTotal: 4.5 }).isWeak).toBe(false)
  })
})

describe('DB統合: 解答の流し込み→更新→再構築', () => {
  const lookup = lookupOf(
    question('q-part-of-speech', ['品詞']),
    question('q-both', ['品詞', '動詞の形']),
  )

  it('解答を流し込むと対象タグの統計が更新され、弱点が抽出される', async () => {
    const db = newDb()
    // 品詞: 正解2・誤答4 → 33% の弱点。動詞の形: 誤答3のみ → 0%（ただし標本3<5）
    await db.attempts.bulkAdd([
      attempt('q-part-of-speech'),
      attempt('q-part-of-speech'),
      attempt('q-part-of-speech', { isCorrect: false }),
      attempt('q-both', { isCorrect: false }),
      attempt('q-both', { isCorrect: false }),
      attempt('q-both', { isCorrect: false }),
    ])
    await updateTagStatsForAnswer(db, 'q-both', lookup)

    expect(await db.tagStats.get('品詞')).toMatchObject({ windowCorrect: 2, windowTotal: 6 })
    // 動詞の形（0%）は標本3（<5）なので弱点にならない
    expect(await getWeakTags(db)).toEqual(['品詞'])

    // 弱い順ソート（ダッシュボード入力）
    const accuracies = await getTagAccuracies(db)
    expect(accuracies.map((a) => a.tag)).toEqual(['動詞の形', '品詞']) // 0% < 33%
  })

  it('tagStats を消しても attempts から再構築できる（再計算関数）', async () => {
    const db = newDb()
    await db.attempts.bulkAdd([
      attempt('q-part-of-speech'),
      attempt('q-part-of-speech', { isCorrect: false, isGuess: true }),
      attempt('q-both', { isCorrect: false }),
    ])
    await recomputeTagStats(db, lookup)
    const before = await db.tagStats.toArray()

    await db.tagStats.clear()
    await recomputeTagStats(db, lookup)
    expect(await db.tagStats.toArray()).toEqual(before)
    expect(await db.tagStats.get('品詞')).toMatchObject({
      windowCorrect: 1,
      windowTotal: 2.5,
    })
  })

  // T-189（Q-99）: recomputeTagStatsは解答パイプラインの単一トランザクション（ADR 0010）の
  // 内側で毎解答時に走るため、db.attempts.toArray()（全件読み）は1年運用相当のデータ量で
  // 数百ms級に劣化する。phase.tsのT-74と同じ、answeredAt降順の打ち切り読みへ揃える
  it('T-189: attempts全件走査（Table.toArray）を行わず、打ち切り読みで済ませる', async () => {
    const db = newDb()
    // Table.toArray（全件読み）とCollection.toArray（打ち切り読み後のtoArray）は別関数のため、
    // Table側だけをスパイすれば「全件読みが無くなったこと」を直接検証できる
    const tableToArraySpy = vi.spyOn(db.attempts, 'toArray')
    await db.attempts.bulkAdd([attempt('q-part-of-speech')])

    await recomputeTagStats(db, lookup)

    expect(tableToArraySpy).not.toHaveBeenCalled()
  })

  it('T-189: 打ち切り件数を超えるattemptsがあっても、直近の窓は正しく計算される', async () => {
    const db = newDb()
    // TAG_ATTEMPTS_READ_LIMITより古い誤答を大量に積んでから、直近にTAG_WINDOW_SIZE分の
    // 正解を積む。全件読みなら古い誤答も混ざりうるが、打ち切り読みでも直近の窓が
    // TAG_WINDOW_SIZE件の正解だけで構成されることを確認する（本来やるべき正確な打ち切り境界）
    const oldWrongCount = TAG_ATTEMPTS_READ_LIMIT + 50
    await db.attempts.bulkAdd(
      Array.from({ length: oldWrongCount }, () =>
        attempt('q-part-of-speech', { isCorrect: false }),
      ),
    )
    await db.attempts.bulkAdd(
      Array.from({ length: TAG_WINDOW_SIZE }, () => attempt('q-part-of-speech')),
    )

    await recomputeTagStats(db, lookup)

    expect(await db.tagStats.get('品詞')).toMatchObject({
      windowCorrect: TAG_WINDOW_SIZE,
      windowTotal: TAG_WINDOW_SIZE,
    })
  })
})
