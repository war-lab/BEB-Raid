// T-09: SRSエンジンのテスト（03の2節）。
// 完了条件: 各評価遷移・卒業・新規停止条件が緑。dueAt 計算が日付境界で破綻しない
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord } from '../db/schema'
import { toDateString } from './date'
import {
  addSrsCard,
  applyGrade,
  DEFAULT_SRS_OPTIONS,
  getSrsQueue,
  reviewSrsCard,
  SRS_INTERVAL_DAYS,
  srsCardId,
} from './srs'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`srs-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** ローカル時刻の epoch ms（テストはローカルタイムゾーン基準で書く） */
function at(y: number, m: number, d: number, h = 12, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime()
}

function card(partial: Partial<SrsCardRecord>): SrsCardRecord {
  return {
    id: 'vocab:submit',
    refType: 'vocab',
    refId: 'submit',
    stage: 0,
    dueAt: 0,
    lapses: 0,
    introducedDate: '2026-07-01',
    graduatedAt: null,
    sourceQuestionId: null,
    ...partial,
  }
}

describe('applyGrade: 評価遷移', () => {
  const now = at(2026, 7, 9)

  it('未導入カードの初回復習: OK→stage0（1日）/ 余裕→stage1（3日）/ もう一回→stage0', () => {
    const fresh = card({ introducedDate: null })
    const good = applyGrade(fresh, 'good', now)
    expect(good.card.stage).toBe(0)
    expect(toDateString(good.card.dueAt)).toBe('2026-07-10')
    expect(good.card.introducedDate).toBe('2026-07-09')

    const easy = applyGrade(fresh, 'easy', now)
    expect(easy.card.stage).toBe(1)
    expect(toDateString(easy.card.dueAt)).toBe('2026-07-12')

    const again = applyGrade(fresh, 'again', now)
    expect(again.card.stage).toBe(0)
    expect(again.card.lapses).toBe(0) // 初回学習の「もう一回」はリセットに数えない
  })

  it('導入済みカード: OK は次段階、余裕は1段階スキップ', () => {
    const s2 = card({ stage: 2 })
    expect(applyGrade(s2, 'good', now).card.stage).toBe(3) // 7日→14日
    expect(toDateString(applyGrade(s2, 'good', now).card.dueAt)).toBe('2026-07-23')
    expect(applyGrade(s2, 'easy', now).card.stage).toBe(4) // 7日→30日
    expect(toDateString(applyGrade(s2, 'easy', now).card.dueAt)).toBe('2026-08-08')
  })

  it('もう一回: stage0 へリセットし lapses が増える', () => {
    const result = applyGrade(card({ stage: 4, lapses: 1 }), 'again', now)
    expect(result.card.stage).toBe(0)
    expect(result.card.lapses).toBe(2)
    expect(toDateString(result.card.dueAt)).toBe('2026-07-10')
    expect(result.graduated).toBe(false)
  })

  it('卒業: 60日段階のOK / 30日段階の余裕で間隔テーブルを突破する', () => {
    const fromLast = applyGrade(card({ stage: 5 }), 'good', now)
    expect(fromLast.graduated).toBe(true)
    expect(fromLast.card.graduatedAt).toBe(now)

    const skipOut = applyGrade(card({ stage: 4 }), 'easy', now)
    expect(skipOut.graduated).toBe(true)

    // 卒業直前で「もう一回」なら卒業しない
    expect(applyGrade(card({ stage: 5 }), 'again', now).graduated).toBe(false)
  })
})

describe('applyGrade: 日付境界（深夜跨ぎ）', () => {
  it('23:59 復習でも 00:01 復習でも期限は同じ「翌日0時」になる', () => {
    const lateNight = applyGrade(card({ introducedDate: null }), 'good', at(2026, 7, 9, 23, 59))
    const earlyMorning = applyGrade(card({ introducedDate: null }), 'good', at(2026, 7, 9, 0, 1))
    expect(lateNight.card.dueAt).toBe(earlyMorning.card.dueAt)
    expect(toDateString(lateNight.card.dueAt)).toBe('2026-07-10')
  })

  it('復習直後に同じ暦日内で再度期限が来ることはない', () => {
    const now = at(2026, 7, 9, 23, 59)
    const result = applyGrade(card({ stage: 3 }), 'again', now)
    expect(result.card.dueAt).toBeGreaterThan(now)
    expect(toDateString(result.card.dueAt)).not.toBe(toDateString(now))
  })

  it('間隔は経過時間でなく暦日基準（深夜0時直前の復習で間隔が1日縮まない）', () => {
    // 23:59 に「OK」→ 1日間隔。+24h なら翌日23:59 だが、暦日基準では翌日0時
    const result = applyGrade(card({ introducedDate: null }), 'good', at(2026, 7, 9, 23, 59))
    expect(result.card.dueAt).toBe(at(2026, 7, 10, 0, 0))
  })
})

describe('addSrsCard', () => {
  it('新規追加は未導入（introducedDate=null）で入り、既存の未卒業カードには冪等', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    const added = await addSrsCard(db, { refType: 'vocab', refId: 'submit', now })
    expect(added.id).toBe(srsCardId('vocab', 'submit'))
    expect(added.introducedDate).toBeNull()

    // 進行中カードに再追加しても進捗はリセットされない
    await db.srsCards.put({ ...added, stage: 3, introducedDate: '2026-07-01' })
    const again = await addSrsCard(db, { refType: 'vocab', refId: 'submit', now })
    expect(again.stage).toBe(3)
  })

  it('卒業済みカードへの再追加（定着したはずの語で再誤答）は学習し直しになる', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    await db.srsCards.put(
      card({ stage: 5, graduatedAt: at(2026, 6, 1), lapses: 2, introducedDate: '2026-05-01' }),
    )
    const readded = await addSrsCard(db, { refType: 'vocab', refId: 'submit', now })
    expect(readded.stage).toBe(0)
    expect(readded.introducedDate).toBeNull()
    expect(readded.graduatedAt).toBeNull()
    expect(readded.lapses).toBe(2) // リセット履歴は保持
  })
})

describe('reviewSrsCard', () => {
  it('評価を保存し、卒業済みカードの復習は拒否する', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    await db.srsCards.put(card({ stage: 5 }))
    const result = await reviewSrsCard(db, 'vocab:submit', 'good', now)
    expect(result.graduated).toBe(true)
    expect((await db.srsCards.get('vocab:submit'))?.graduatedAt).toBe(now)

    await expect(reviewSrsCard(db, 'vocab:submit', 'good', now)).rejects.toThrow(/卒業済み/)
  })
})

describe('getSrsQueue: 期限抽出と新規制御', () => {
  it('期限到来の導入済みカードが dueAt 昇順で並び、卒業カードは含まれない', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    await db.srsCards.bulkPut([
      card({ id: 'vocab:a', refId: 'a', dueAt: at(2026, 7, 8) }),
      card({ id: 'vocab:b', refId: 'b', dueAt: at(2026, 7, 7) }),
      card({ id: 'vocab:c', refId: 'c', dueAt: at(2026, 7, 10) }), // 未到来
      card({ id: 'vocab:d', refId: 'd', dueAt: at(2026, 7, 1), graduatedAt: at(2026, 7, 2) }),
    ])
    const queue = await getSrsQueue(db, now)
    expect(queue.dueReviews.map((c) => c.refId)).toEqual(['b', 'a'])
  })

  it('新規は1日20枚まで。当日すでに導入した分だけ枠が減り、翌日には枠が戻る', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    // 未導入25枚 + 今日導入済み5枚
    for (let i = 0; i < 25; i++) {
      await addSrsCard(db, { refType: 'vocab', refId: `new-${i}`, now: now + i })
    }
    for (let i = 0; i < 5; i++) {
      await db.srsCards.put(
        card({
          id: `vocab:done-${i}`,
          refId: `done-${i}`,
          introducedDate: '2026-07-09',
          dueAt: at(2026, 7, 10),
        }),
      )
    }
    const queue = await getSrsQueue(db, now)
    expect(queue.newCards).toHaveLength(15) // 20 - 導入済み5
    expect(queue.newStopped).toBe(false)
    // 追加順（先入れ先出し）
    expect(queue.newCards[0]?.refId).toBe('new-0')

    // 翌日: 導入済みカウントがリセットされ満枠に戻る
    const tomorrow = await getSrsQueue(db, at(2026, 7, 10))
    expect(tomorrow.newCards).toHaveLength(20)
  })

  it('復習滞留（期限超過16枚以上）の日は新規を自動停止する', async () => {
    const db = newDb()
    const now = at(2026, 7, 9)
    for (let i = 0; i < DEFAULT_SRS_OPTIONS.newStopBacklog; i++) {
      await db.srsCards.put(
        card({ id: `vocab:due-${i}`, refId: `due-${i}`, dueAt: at(2026, 7, 8) }),
      )
    }
    await addSrsCard(db, { refType: 'vocab', refId: 'fresh', now })
    const queue = await getSrsQueue(db, now)
    expect(queue.dueReviews).toHaveLength(16)
    expect(queue.newCards).toHaveLength(0)
    expect(queue.newStopped).toBe(true)

    // 滞留を1枚解消すると新規が再開する
    await reviewSrsCard(db, 'vocab:due-0', 'good', now)
    const after = await getSrsQueue(db, now)
    expect(after.newStopped).toBe(false)
    expect(after.newCards.map((c) => c.refId)).toEqual(['fresh'])
  })
})

describe('間隔テーブル', () => {
  it('1→3→7→14→30→60日の6段階', () => {
    expect(SRS_INTERVAL_DAYS).toEqual([1, 3, 7, 14, 30, 60])
  })
})
