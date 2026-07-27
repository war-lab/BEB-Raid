// T-11: key単語システムのテスト（03の3節）。
// 完了条件のうち「誤答→srsCardsにkey語彙が入る」「類題在庫ゼロのフォールバック」
// 「定着後の元問題再投入」をここで検証する。
// 「次回パックで同key単語の類題が優先出題される」の一連はクイックパック生成
// （T-13。quickPack.test.ts）で通しで検証する
import 'fake-indexeddb/auto'
import type { KeyVocab, Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  findSimilarQuestions,
  getActiveReviewWords,
  processWrongAnswer,
  similarOrFallback,
} from './keyVocab'
import { formatQuickPackReason } from './reason'
import { reviewSrsCard } from './srs'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`keyvocab-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function kv(word: string): KeyVocab {
  return { word, sense: `${word} の意味`, freqRank: 'S' }
}

function question(id: string, keyVocab: string[]): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 3,
    tags: ['品詞'],
    keyVocab: keyVocab.map(kv),
  }
}

/** 読解（Part7単一）の親Question。本文まるごと再出題しない例外の対象（T-106） */
function passageQuestion(id: string, keyVocab: string[]): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 3,
    tags: ['パラフレーズ照合'],
    keyVocab: keyVocab.map(kv),
    passages: [{ id: `${id}-p1`, kind: 'email', text: 'dummy' }],
    subQuestions: [{ id: `${id}-q0`, question: 'q', choices: [], answer: 'A' }],
  }
}

describe('processWrongAnswer: 誤答→SRS登録', () => {
  it('誤答問題カードと key語彙カード（発生元問題ID付き）が srsCards に入る', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    const result = await processWrongAnswer(db, question('q-1', ['submit', 'deadline']), now)

    expect(result.questionCard?.id).toBe('question:q-1')
    expect(result.vocabCards.map((c) => c.id)).toEqual(['vocab:submit', 'vocab:deadline'])
    expect((await db.srsCards.get('vocab:submit'))?.sourceQuestionId).toBe('q-1')
    expect(await db.srsCards.count()).toBe(3)
  })

  it('同じ問題を二度誤答しても進行中カードはリセットされない（冪等）', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    await processWrongAnswer(db, question('q-1', ['submit']), now)
    // 語彙カードを1段階進めてから再誤答
    await reviewSrsCard(db, 'vocab:submit', 'good', now)
    await processWrongAnswer(db, question('q-1', ['submit']), now + 1000)

    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(0) // 初回復習でstage0（1日）
    expect((await db.srsCards.get('vocab:submit'))?.introducedDate).not.toBeNull()
    expect(await db.srsCards.count()).toBe(2)
  })
})

describe('getActiveReviewWords: 復習対象key単語', () => {
  it('未卒業の語彙カードだけが対象になる', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    await processWrongAnswer(db, question('q-1', ['submit', 'deadline']), now)
    // submit を卒業させる（60日段階に上げてからOK）
    await db.srsCards.update('vocab:submit', { stage: 5, introducedDate: '2026-07-01' })
    await reviewSrsCard(db, 'vocab:submit', 'good', now)

    const words = await getActiveReviewWords(db)
    expect(Array.from(words.keys())).toEqual(['deadline'])
  })
})

describe('key単語定着後の元問題再投入（03の3.2）', () => {
  it('key語彙カードの卒業で、発生元問題が問題SRSカードとして入り直す', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    await processWrongAnswer(db, question('q-1', ['submit']), now)
    // 元問題カードは定着確認済みとして卒業済みにしておく
    await db.srsCards.update('question:q-1', {
      stage: 5,
      introducedDate: '2026-05-01',
      graduatedAt: new Date(2026, 5, 1).getTime(),
    })

    await db.srsCards.update('vocab:submit', { stage: 5, introducedDate: '2026-07-01' })
    const result = await reviewSrsCard(db, 'vocab:submit', 'good', now)
    expect(result.graduated).toBe(true)

    // 卒業済みだった元問題カードが学習し直し（未導入の新規）として復活する
    const requeued = await db.srsCards.get('question:q-1')
    expect(requeued?.graduatedAt).toBeNull()
    expect(requeued?.introducedDate).toBeNull()
    expect(requeued?.stage).toBe(0)
  })

  it('元問題カードがSRS進行中なら進捗は保持される', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    await processWrongAnswer(db, question('q-1', ['submit']), now)
    await db.srsCards.update('question:q-1', { stage: 2, introducedDate: '2026-07-05' })

    await db.srsCards.update('vocab:submit', { stage: 5, introducedDate: '2026-07-01' })
    await reviewSrsCard(db, 'vocab:submit', 'good', now)
    expect((await db.srsCards.get('question:q-1'))?.stage).toBe(2)
  })
})

describe('processWrongAnswer: 読解（text_passage）は本文まるごとの再出題をしない（T-106・ADR 0006 判断6・docs/24 3.4節）', () => {
  it('誤答問題カード（questionCard）を作らず、key語彙カードにもsourceQuestionIdを乗せない', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    const result = await processWrongAnswer(db, passageQuestion('p7-1', ['invoice']), now)

    expect(result.questionCard).toBeNull()
    expect(await db.srsCards.get('question:p7-1')).toBeUndefined()
    const vocabCard = await db.srsCards.get('vocab:invoice')
    expect(vocabCard).toBeDefined()
    expect(vocabCard?.sourceQuestionId ?? null).toBeNull()
    // srsCardsに増えるのは語彙カードのみ（questionCard分が増えない）
    expect(await db.srsCards.count()).toBe(1)
  })

  it('key語彙カードが卒業しても、発生元パッセージ（本文）はSRSに再投入されない', async () => {
    const db = newDb()
    const now = new Date(2026, 6, 9).getTime()
    await processWrongAnswer(db, passageQuestion('p7-2', ['invoice']), now)
    await db.srsCards.update('vocab:invoice', { stage: 5, introducedDate: '2026-07-01' })

    const result = await reviewSrsCard(db, 'vocab:invoice', 'good', now)
    expect(result.graduated).toBe(true)

    // 03の3.2の通常循環なら'question:p7-2'が復活するが、読解では本文まるごと再出題を
    // しないためsourceQuestionIdが無く、questionカードは一度も作られない
    expect(await db.srsCards.get('question:p7-2')).toBeUndefined()
    expect(await db.srsCards.count()).toBe(1)
  })
})

describe('類題選択（同一問題より類題を優先。03の3.2）', () => {
  const pool = [
    question('q-src', ['submit']),
    question('q-sim1', ['submit', 'deadline']),
    question('q-sim2', ['submit']),
    question('q-other', ['deadline']),
  ]

  it('同じkey単語を持つ類題を発生元問題を除いて列挙する', () => {
    expect(findSimilarQuestions(pool, 'submit', 'q-src').map((q) => q.id)).toEqual([
      'q-sim1',
      'q-sim2',
    ])
  })

  it('類題があれば類題、在庫ゼロの場合のみ同一問題フォールバック', () => {
    const withStock = similarOrFallback(pool, 'submit', 'q-src')
    expect(withStock.isSameQuestion).toBe(false)
    expect(withStock.candidates.map((q) => q.id)).toEqual(['q-sim1', 'q-sim2'])

    // deadline の類題は q-sim1・q-other… を除外した在庫ゼロ状況を作る
    const scarce = [question('q-src2', ['rare-word'])]
    const fallback = similarOrFallback(scarce, 'rare-word', 'q-src2')
    expect(fallback.isSameQuestion).toBe(true)
    expect(fallback.candidates.map((q) => q.id)).toEqual(['q-src2'])

    // 発生元問題すら手元に無ければ空（出題できない）
    expect(similarOrFallback([], 'rare-word', 'q-src2').candidates).toEqual([])
  })
})

describe('出題理由ラベル', () => {
  it('「復習: submit を使う問題」形式のラベルを返す', () => {
    expect(
      formatQuickPackReason({ type: 'keyVocabReview', word: 'submit', isSameQuestion: false }),
    ).toBe('復習: submit を使う問題')
    expect(formatQuickPackReason({ type: 'weakTag', tag: '品詞' })).toBe('弱点: 品詞')
    expect(formatQuickPackReason({ type: 'srsDue' })).toBe('復習: 期限が来たカード')
  })
})
