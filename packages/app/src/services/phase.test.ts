// T-51 完了条件のテスト（services/phase.ts。fake-indexeddb実データ）:
// - 初期割当（phase不在・ratings有りの3レート帯）
// - 移行判定がphaseストアに永続化され、再起動後も保持される
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  ATTEMPTS_READ_LIMIT,
  buildCriterionContext,
  evaluateAndPersistPhaseTransition,
  getOrInitPhaseState,
  savePhaseState,
} from './phase'

/** P1→P2条件をすべて満たすquestionLookup＋srsCardsを仕込む（複数テストで共有） */
async function seedP1ToP2Fixture(db: BebRaidDatabase) {
  const questionLookup = new Map<string, import('@beb-raid/shared-schema').Question>()
  const words = Array.from({ length: 20 }, (_, i) => `w${i}`)
  for (const w of words) {
    questionLookup.set(`vocab-${w}`, {
      id: `vocab-${w}`,
      part: 0,
      format: 'vocab_card',
      difficulty: 1,
      tags: [],
      keyVocab: [],
      front: w,
      phrase: `use ${w}`,
      phraseAudio: `audio/${w}.mp3`,
      back: '意味',
      freqRank: 'S',
      levelBand: 600,
    })
  }
  await db.srsCards.bulkPut(
    words.map((w) => ({
      id: `vocab:${w}`,
      refType: 'vocab' as const,
      refId: w,
      stage: 3,
      dueAt: 0,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })),
  )
  questionLookup.set('p2-1', {
    id: 'p2-1',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: [],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: '/audio/p2-1.mp3',
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'When did you submit it?',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'By email.' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  })
  return questionLookup
}

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`phase-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('getOrInitPhaseState: 初期割当（J-18）', () => {
  it('phase不在・ratings不在ならP1（既定レート400想定）から始まる', async () => {
    const db = newDb()
    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P1')
    expect(state.listeningStage).toBe(1)
    expect(state.achievedAt).toBeNull()
  })

  it('総合レート550未満ならP1', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 480, updatedAt: 0 },
      { section: 'R', rating: 500, updatedAt: 0 },
    ])
    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P1')
  })

  it('総合レート550〜649ならP2', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 600, updatedAt: 0 },
      { section: 'R', rating: 600, updatedAt: 0 },
    ])
    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P2')
  })

  it('総合レート650以上ならP3', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 700, updatedAt: 0 },
      { section: 'R', rating: 680, updatedAt: 0 },
    ])
    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P3')
  })

  it('criteriaJsonが破損したレコードはthrowせず、初期割当パスで作り直す（フェーズ機能の無反応化を防ぐ）', async () => {
    // 不正なバックアップのインポート等でcriteriaJsonが壊れた状況を模擬
    const db = newDb()
    await db.phase.put({ season: 'P2', criteriaJson: '{broken json', achievedAt: 123 })

    const state = await getOrInitPhaseState(db)
    // ratings不在なので初期割当はP1（破損したP2レコードを引きずらない）
    expect(state.season).toBe('P1')
    expect(state.listeningStage).toBe(1)

    // レコードは正常な形で作り直され、次回以降は通常経路で読める
    const records = await db.phase.toArray()
    expect(records).toHaveLength(1)
    expect(() => JSON.parse(records[0]!.criteriaJson)).not.toThrow()
    const reloaded = await getOrInitPhaseState(db)
    expect(reloaded.season).toBe('P1')
  })

  it('既存のphaseレコードがあればそれを返す（再割当しない）', async () => {
    const db = newDb()
    await db.ratings.bulkPut([
      { section: 'L', rating: 700, updatedAt: 0 },
      { section: 'R', rating: 700, updatedAt: 0 },
    ])
    await savePhaseState(db, {
      season: 'P1',
      listeningStage: 2,
      criteria: { all: [] },
      achievedAt: null,
    })
    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P1') // レートはP3相当だが既存レコードを優先
    expect(state.listeningStage).toBe(2)
  })
})

describe('evaluateAndPersistPhaseTransition: 永続化', () => {
  it('移行が成立するとphaseストアが更新され、再起動後も保持される', async () => {
    const db = newDb()
    const questionLookup = await seedP1ToP2Fixture(db)
    await db.attempts.bulkAdd(
      Array.from({ length: 100 }, (_, i) => ({
        id: `a-${i}`,
        questionId: 'p2-1',
        mode: 'solo' as const,
        isCorrect: i < 80,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: i,
      })),
    )

    const outcome = await evaluateAndPersistPhaseTransition(db, questionLookup)
    expect(outcome.season).toBe('P2')
    expect(outcome.seasonTransitioned).toBe(true)

    // 再起動相当: 新しいDBインスタンス（同名）で読み直す
    const reopened = new BebRaidDatabase(db.name)
    dbs.push(reopened)
    const reloaded = await getOrInitPhaseState(reopened)
    expect(reloaded.season).toBe('P2')
    expect(reloaded.achievedAt).not.toBeNull()
  })

  it('未達なら永続化されない（season/listeningStageが変わらない）', async () => {
    const db = newDb()
    const outcome = await evaluateAndPersistPhaseTransition(db, new Map())
    expect(outcome.season).toBe('P1')
    expect(outcome.seasonTransitioned).toBe(false)

    const state = await getOrInitPhaseState(db)
    expect(state.season).toBe('P1')
  })
})

describe('buildCriterionContext', () => {
  it('DBから4種のデータを組み立てる', async () => {
    const db = newDb()
    await db.attempts.add({
      id: 'a-1',
      questionId: 'q-1',
      mode: 'solo',
      isCorrect: true,
      responseMs: 1000,
      isTimeout: false,
      isGuess: false,
      answeredAt: 0,
    })
    await db.examScores.add({
      id: 'e-1',
      date: '2026-07-14',
      listening: 400,
      reading: 400,
      total: 800,
      source: 'IP',
    })
    const ctx = await buildCriterionContext(db, new Map())
    expect(ctx.attempts).toHaveLength(1)
    expect(ctx.examScores).toEqual([{ total: 800 }])
  })

  it('T-74: 1万件のattemptsがあっても読み取り件数はATTEMPTS_READ_LIMIT以下（性能改善）', async () => {
    const db = newDb()
    await db.attempts.bulkAdd(
      Array.from({ length: 10_000 }, (_, i) => ({
        id: `bulk-${i}`,
        questionId: 'q-x',
        mode: 'solo' as const,
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: i,
      })),
    )

    const ctx = await buildCriterionContext(db, new Map())
    // 10000 > ATTEMPTS_READ_LIMIT なので必ず上限ちょうどまで読まれる
    expect(ctx.attempts).toHaveLength(ATTEMPTS_READ_LIMIT)
  }, 20_000)

  it('T-74: 窓外の大量の古いattemptsが評価結果を汚染しない（打ち切り読みでも直近分は確実に読める）', async () => {
    const db = newDb()
    const questionLookup = await seedP1ToP2Fixture(db)
    // 実データ（直近・条件を満たす100件）は大きめのanswereAtにして「最も新しい」扱いにする
    await db.attempts.bulkAdd(
      Array.from({ length: 100 }, (_, i) => ({
        id: `a-${i}`,
        questionId: 'p2-1',
        mode: 'solo' as const,
        isCorrect: i < 80,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: 100_000 + i,
      })),
    )
    // 窓外の古いノイズ（ATTEMPTS_READ_LIMITを超える件数・全て不正解・実データよりずっと古い）。
    // もし打ち切り読みが直近分を取りこぼしたり、ノイズが紛れ込んだりすれば
    // 正答率が下がり不成立になるはず
    await db.attempts.bulkAdd(
      Array.from({ length: ATTEMPTS_READ_LIMIT + 1000 }, (_, i) => ({
        id: `noise-${i}`,
        questionId: 'p2-1',
        mode: 'solo' as const,
        isCorrect: false,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: i,
      })),
    )

    const outcome = await evaluateAndPersistPhaseTransition(db, questionLookup)
    expect(outcome.season).toBe('P2')
    expect(outcome.seasonTransitioned).toBe(true)
  }, 20_000)
})
