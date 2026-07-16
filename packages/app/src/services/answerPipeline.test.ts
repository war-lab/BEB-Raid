// T-71 完了条件のテスト:
// - skipオプションの各組み合わせが、既存4関数の挙動（DrillScreenのfinalizeAnswer/
//   finalizeSubQuestionAnswer/finalizeDictationAnswer/handleVocabGrade、VocabScreenの
//   handleGrade）を再現できることを検証する
// - DB書き込み失敗の伝播（呼び出し側がcatchできること）
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID } from '../db/schema'
import type { QuestionLookup } from '../engine/types'
import { recordAnswerPipeline } from './answerPipeline'
import { startSession } from './session'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`answer-pipeline-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 3,
    tags: ['品詞'],
    keyVocab: [],
    ...overrides,
  }
}

function lookupOf(...questions: Question[]): QuestionLookup {
  return new Map(questions.map((q) => [q.id, q]))
}

describe('recordAnswerPipeline: attempt記録の経路', () => {
  it('snapshot指定時はanswerCurrentQuestion経路でスナップショットが進む', async () => {
    const db = newDb()
    const q = question('q-1')
    const snapshot = await startSession(db, { items: [{ questionId: q.id, mode: 'solo' }] })

    const result = await recordAnswerPipeline(db, {
      snapshot,
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    expect(result.nextSnapshot?.answeredCount).toBe(1)
    expect(await db.attempts.count()).toBe(1)
  })

  it('snapshot省略時はrecordAttemptで直接記録される（audio_setサブ設問・VocabScreen経路）', async () => {
    const db = newDb()
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: 'sub-1',
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    expect(result.nextSnapshot).toBeUndefined()
    const logs = await db.attempts.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.questionId).toBe('sub-1')
  })
})

describe('recordAnswerPipeline: 誤答復習デッキ（processWrongAnswer）', () => {
  it('誤答かつskip無しならsrsCardsに問題カードが追加される', async () => {
    const db = newDb()
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: false,
      responseMs: 1000,
      mode: 'solo',
    })

    const card = await db.srsCards.get('question:q-1')
    expect(card).toBeTruthy()
  })

  it('skip.wrongAnswer指定時は誤答でもsrsCardsが増えない（vocab_card経路）', async () => {
    const db = newDb()
    const q = question('vocab-1', { part: 0, format: 'vocab_card', tags: [] })

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: false,
      responseMs: 1000,
      mode: 'solo',
      skip: { wrongAnswer: true },
    })

    expect(await db.srsCards.count()).toBe(0)
  })

  it('正解時はskip無しでもprocessWrongAnswerが呼ばれない', async () => {
    const db = newDb()
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    expect(await db.srsCards.count()).toBe(0)
  })
})

describe('recordAnswerPipeline: tagStats', () => {
  it('skip無しならtagStatsが更新される', async () => {
    const db = newDb()
    const q = question('q-1', { tags: ['品詞'] })

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    const stat = await db.tagStats.get('品詞')
    expect(stat?.windowTotal).toBeGreaterThan(0)
  })

  it('skip.tagStats指定時はtagStatsが更新されない（VocabScreen経路）', async () => {
    const db = newDb()
    const q = question('vocab-1', { part: 0, format: 'vocab_card', tags: ['品詞'] })

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
      skip: { tagStats: true },
    })

    expect(await db.tagStats.get('品詞')).toBeUndefined()
  })
})

describe('recordAnswerPipeline: レート更新', () => {
  it('skip無しならratingUpdateが返りratingsが更新される', async () => {
    const db = newDb()
    const q = question('q-1', { part: 5, difficulty: 3 })

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    expect(result.ratingUpdate).not.toBeNull()
    expect(await db.ratings.get('R')).toBeTruthy()
  })

  it('skip.rating指定時はratingUpdateがundefinedでratingsも変化しない（dictation=J-29経路）', async () => {
    const db = newDb()
    const q = question('q-1', { part: 5, difficulty: 3 })

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
      skip: { rating: true },
    })

    expect(result.ratingUpdate).toBeUndefined()
    expect(await db.ratings.get('R')).toBeUndefined()
  })
})

describe('recordAnswerPipeline: SRSカードの自己評価（reviewSrsCard）', () => {
  async function seedSrsCard(db: BebRaidDatabase, id: string) {
    await db.srsCards.put({
      id,
      refType: 'vocab',
      refId: 'submit',
      stage: 1,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
  }

  it('srsGrade省略時は客観正誤からgood/againを決める（正解→good）', async () => {
    const db = newDb()
    await seedSrsCard(db, 'vocab:submit')
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'srs',
      srsCardId: 'vocab:submit',
    })

    const card = await db.srsCards.get('vocab:submit')
    expect(card?.stage).toBe(2) // good: stage 1 → 2
  })

  it('srsGrade明示時はisCorrectに関わらずその評価が使われる（vocab_card自己評価経路）', async () => {
    const db = newDb()
    await seedSrsCard(db, 'vocab:submit')
    const q = question('vocab-1', { part: 0, format: 'vocab_card', tags: [] })

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'srs',
      srsCardId: 'vocab:submit',
      srsGrade: 'again',
      skip: { wrongAnswer: true, tagStats: true, rating: true },
    })

    const card = await db.srsCards.get('vocab:submit')
    expect(card?.stage).toBe(0) // again: 導入済みカードはstage0へリセット
  })

  it('skip.srs指定時はsrsCardIdがあってもreviewSrsCardが呼ばれない（audio_setサブ設問経路）', async () => {
    const db = newDb()
    await seedSrsCard(db, 'question:set-1')
    const q = question('set-1', { format: 'audio_set' })

    await recordAnswerPipeline(db, {
      questionId: 'set-1-q0',
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
      srsCardId: 'question:set-1',
      skip: { srs: true },
    })

    const card = await db.srsCards.get('question:set-1')
    expect(card?.stage).toBe(1) // 変化しない（初期値のまま）
  })
})

describe('recordAnswerPipeline: 失敗伝播', () => {
  it('スナップショットが古い場合、answerCurrentQuestion由来の例外が呼び出し側に伝播する', async () => {
    const db = newDb()
    const q = question('q-1')
    const snapshot = await startSession(db, { items: [{ questionId: q.id, mode: 'solo' }] })
    // 先に別経路で1問進めて、渡す snapshot を stale にする
    await recordAnswerPipeline(db, {
      snapshot,
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'solo',
    })

    await expect(
      recordAnswerPipeline(db, {
        snapshot,
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 1000,
        mode: 'solo',
      }),
    ).rejects.toThrow(/古い/)
  })
})

describe('recordAnswerPipeline: レイドダメージのpendingSyncエンキュー（T-89。既定OFFの縮退設計）', () => {
  it('raidSyncEnabled未設定（既定OFF）では、レイド参加中でもpendingSyncへ一切書き込まない', async () => {
    const db = newDb()
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w29',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt: 2000,
      lastSyncedAt: 1000,
    })
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(await db.pendingSync.count()).toBe(0)
  })

  it('raidSyncEnabled=ON かつ 参加中 かつ 正解（ダメージ>0）のとき、個人情報を含まないpayloadでpendingSyncへ1件エンキューされる', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w29',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt: 2000,
      lastSyncedAt: 1000,
    })
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    const queued = await db.pendingSync.toArray()
    expect(queued).toHaveLength(1)
    expect(queued[0]!.kind).toBe('raidDamage')
    const payload = JSON.parse(queued[0]!.payloadJson) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(
      ['attemptId', 'bossId', 'damage', 'questionCount'].sort(),
    )
    expect(payload.bossId).toBe('boss-2026-w29')
    expect(payload.damage).toBeGreaterThan(0)
  })

  it('raidSyncEnabled=ON でも参加中のレイドが無ければpendingSyncへ書き込まない', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(await db.pendingSync.count()).toBe(0)
  })

  it('raidSyncEnabled=ON かつ参加中でも、誤答（ダメージ0）ならpendingSyncへ書き込まない', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w29',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt: 2000,
      lastSyncedAt: 1000,
    })
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: false,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(await db.pendingSync.count()).toBe(0)
  })
})
