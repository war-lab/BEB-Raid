// T-51 完了条件のテスト（services/phase.ts。fake-indexeddb実データ）:
// - 初期割当（phase不在・ratings有りの3レート帯）
// - 移行判定がphaseストアに永続化され、再起動後も保持される
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  buildCriterionContext,
  evaluateAndPersistPhaseTransition,
  getOrInitPhaseState,
  savePhaseState,
} from './phase'

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
    // P1→P2の条件をすべて満たすデータを仕込む
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
})
