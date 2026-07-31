// T-71 完了条件のテスト:
// - skipオプションの各組み合わせが、既存4関数の挙動（DrillScreenのfinalizeAnswer/
//   finalizeSubQuestionAnswer/finalizeDictationAnswer/handleVocabGrade、VocabScreenの
//   handleGrade）を再現できることを検証する
// - DB書き込み失敗の伝播（呼び出し側がcatchできること）
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { RAID_STATE_ID, type RaidStateRecord } from '../db/schema'
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

describe('recordAnswerPipeline: mode="battle"（M4・T-128ボス役セッション）', () => {
  it('attemptsには記録されるが、skip.rating:trueと組み合わせるとratingsは変化しない', async () => {
    const db = newDb()
    const q = question('q-1', { part: 5, difficulty: 4 })

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'battle',
      skip: { rating: true },
    })

    expect(result.ratingUpdate).toBeUndefined()
    expect(await db.ratings.get('R')).toBeUndefined()
    const attempts = await db.attempts.where('questionId').equals('q-1').toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]!.mode).toBe('battle')
    expect(attempts[0]!.isCorrect).toBe(true)
  })

  it('レイドに参加中（raidSyncEnabled=ON・joined）でも、mode="battle"はpendingSyncへ積まれない（damageConfig.jsonでbattleは係数未定義=0のため）', async () => {
    const db = newDb()
    const q = question('q-1', { part: 5, difficulty: 4 })
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-test',
      profileJson: '{}',
      hp: 100,
      maxHp: 100,
      myDamage: 0,
      joined: true,
      startAt: 0,
      endAt: Date.now() + 86_400_000,
      lastSyncedAt: 0,
    })

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'battle',
      skip: { rating: true },
    })

    expect(await db.pendingSync.count()).toBe(0)
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
  /**
   * 参加中のraidStateを仕込む。endAtは既定で未来（今週のボスが開催中）にする
   * （answeredAtはDate.now()で記録されるため、過去のendAtだと期間外ガードの方で
   * 弾かれてしまい、各テストが本来検証したいゲートを通らなくなる）
   */
  async function seedJoinedRaidState(db: BebRaidDatabase, endAt: number = Date.now() + 86_400_000) {
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w29',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt,
      lastSyncedAt: 1000,
    })
  }

  it('raidSyncEnabled未設定（既定OFF）では、レイド参加中でもpendingSyncへ一切書き込まない', async () => {
    const db = newDb()
    await seedJoinedRaidState(db)
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
    await seedJoinedRaidState(db)
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
      ['answeredAt', 'attemptId', 'bossId', 'damage', 'questionCount'].sort(),
    )
    expect(payload.bossId).toBe('boss-2026-w29')
    expect(payload.damage).toBeGreaterThan(0)
    expect(typeof payload.answeredAt).toBe('number')
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
    await seedJoinedRaidState(db)
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

  it('端末キャッシュのボス期間（endAt）を過ぎた解答はエンキューしない（週替わり後のオフラインセッション）', async () => {
    // 旧bossId宛の期間外payloadを積むと、サーバー（J-49）が非加算のままacceptedIds扱いに
    // するためキューから消え、再送機会を失って無言でダメージが消失するバグの回帰テスト
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedJoinedRaidState(db, Date.now() - 1000) // 先週のボス（endAtが過去）
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

  it('ボス期間内（endAt前）の解答は従来どおりエンキューされる', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedJoinedRaidState(db, Date.now() + 86_400_000)
    const q = question('q-1')

    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(await db.pendingSync.count()).toBe(1)
  })
})

describe('recordAnswerPipeline: ゴーストボスの倍率適用（M4・T-129。正本: docs/22 3.4節）', () => {
  async function seedGhostRaidState(
    db: BebRaidDatabase,
    defense: Record<string, number>,
    overrides: Partial<RaidStateRecord> = {},
  ) {
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w30',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt: Date.now() + 86_400_000,
      lastSyncedAt: 1000,
      bossType: 'ghost',
      defenseJson: JSON.stringify(defense),
      ghostJson: JSON.stringify({ displayName: 'ゴースト・上級者A', defeatedCount: 0 }),
      ...overrides,
    })
  }

  it('弱点（×2.0）のquestionIdは、倍率適用後のダメージがpendingSyncへ積まれ、multiplierが返る', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedGhostRaidState(db, { 'q-1': 2.0 })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage?.ghostDefenseMultiplier).toBe(2.0)
    const queued = await db.pendingSync.toArray()
    expect(queued).toHaveLength(1)
    const payload = JSON.parse(queued[0]!.payloadJson) as { damage: number }
    // raidモード係数1.0 × 基礎点 × 弱点倍率2.0 = 無印(raid係数のみ)の2倍
    expect(payload.damage).toBe(result.raidDamage!.damage)
    expect(payload.damage).toBeGreaterThan(0)
  })

  it('堅い（×0.5）のquestionIdは、倍率適用後のダメージが半減する（solo/raid両モードで乗算=3.4節）', async () => {
    for (const mode of ['solo', 'raid'] as const) {
      const db = newDb()
      await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
      await seedGhostRaidState(db, { 'q-1': 0.5 })
      const q = question('q-1')

      // 倍率なし（synthetic相当）の基準ダメージを別DBで計測する
      const baselineDb = newDb()
      await baselineDb.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
      await baselineDb.raidState.put({
        id: RAID_STATE_ID,
        bossId: 'boss-2026-w30',
        profileJson: '{}',
        hp: 8000,
        maxHp: 10000,
        myDamage: 0,
        joined: true,
        startAt: 1000,
        endAt: Date.now() + 86_400_000,
        lastSyncedAt: 1000,
      })
      const baselineResult = await recordAnswerPipeline(baselineDb, {
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 1000,
        mode,
      })

      const result = await recordAnswerPipeline(db, {
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 1000,
        mode,
      })

      expect(result.raidDamage?.ghostDefenseMultiplier).toBe(0.5)
      expect(result.raidDamage!.damage).toBeCloseTo(baselineResult.raidDamage!.damage * 0.5)
    }
  })

  it('defenseに含まれないquestionIdは倍率1.0（無変化）で、ghostDefenseMultiplierはundefined', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedGhostRaidState(db, { 'other-question': 2.0 })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage?.ghostDefenseMultiplier).toBeUndefined()
  })

  it('bossType="ghost"でも誤答（ダメージ0）ならpendingSyncへ書き込まない（0×倍率は常に0）', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedGhostRaidState(db, { 'q-1': 2.0 })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: false,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage).toBeUndefined()
    expect(await db.pendingSync.count()).toBe(0)
  })

  it('defenseJsonが破損していても例外にせず倍率1.0にフォールダックする（外部編集バックアップ耐性）', async () => {
    const db = newDb()
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await seedGhostRaidState(db, {}, { defenseJson: '{not-json' })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage?.ghostDefenseMultiplier).toBeUndefined()
    expect(await db.pendingSync.count()).toBe(1)
  })
})

describe('recordAnswerPipeline: synthetic週・API無効時の回帰（M4・T-129。docs/22 3.4節）', () => {
  it('raidStateにbossType/defenseJsonが無い（synthetic週・M3までの既存キャッシュ）場合、倍率は常に1.0でM3と同一のダメージになる', async () => {
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
      endAt: Date.now() + 86_400_000,
      lastSyncedAt: 1000,
      // bossType/defenseJson/ghostJsonを意図的に付けない（synthetic週・旧キャッシュ）
    })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage?.ghostDefenseMultiplier).toBeUndefined()
    const queued = await db.pendingSync.toArray()
    const payload = JSON.parse(queued[0]!.payloadJson) as { damage: number }
    expect(payload.damage).toBe(result.raidDamage!.damage)
  })

  it('raidSyncEnabled=OFF（API無効・未設定と同じ縮退経路）はbossType="ghost"が仮に立っていてもpendingSyncへ一切書き込まない', async () => {
    const db = newDb()
    await db.raidState.put({
      id: RAID_STATE_ID,
      bossId: 'boss-2026-w30',
      profileJson: '{}',
      hp: 8000,
      maxHp: 10000,
      myDamage: 0,
      joined: true,
      startAt: 1000,
      endAt: Date.now() + 86_400_000,
      lastSyncedAt: 1000,
      bossType: 'ghost',
      defenseJson: JSON.stringify({ 'q-1': 2.0 }),
    })
    const q = question('q-1')

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 1000,
      mode: 'raid',
    })

    expect(result.raidDamage).toBeUndefined()
    expect(await db.pendingSync.count()).toBe(0)
  })
})

describe('recordAnswerPipeline: 部分書き込みを残さない（レビュー指摘・ADR 0010）', () => {
  // 何を防ぐか: attempt だけ書かれてレート・SRSが未更新の状態が残ること。
  // T-176でUIに「保存を再試行する」を出したため、この状態が残ると再実行で
  // (a) attemptが二重に増える（snapshot無し経路）
  // (b) snapshotが進んでいて StaleSnapshotError になり後段が永久に補完されない（snapshot経路）
  // のどちらかが起きる。単一トランザクション化により「失敗＝何も書かれない」を保証する。

  /** ratings への書き込みを1回だけ失敗させる（④applyRatingUpdate の失敗を模擬） */
  function failRatingsOnce(db: BebRaidDatabase) {
    const original = db.ratings.put.bind(db.ratings)
    let failed = false
    // Dexieの戻り値はPromiseExtendedなので、モックはoriginalの戻り値をそのまま返す形にする
    // （async関数にするとPromise<T>になり型が合わない）
    const spy = vi.spyOn(db.ratings, 'put').mockImplementation(((...args: unknown[]) => {
      if (!failed) {
        failed = true
        return Promise.reject(new Error('ratings書き込み失敗（模擬）'))
      }
      return original(...(args as Parameters<typeof original>))
    }) as typeof db.ratings.put)
    return spy
  }

  it('snapshot無し経路（読解・audio_setサブ設問）: 後段の失敗でattemptも巻き戻る', async () => {
    const db = newDb()
    const q = question('q-1')
    const spy = failRatingsOnce(db)

    await expect(
      recordAnswerPipeline(db, {
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 5000,
        mode: 'solo',
      }),
    ).rejects.toThrow(/ratings書き込み失敗/)

    // ①のattemptが残っていない（従来はここが1件残り、再試行で2件になっていた）
    expect(await db.attempts.count()).toBe(0)
    expect(await db.tagStats.count()).toBe(0)

    // 同じ入力で再試行すると、ちょうど1件だけ記録される
    await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 5000,
      mode: 'solo',
    })

    expect(await db.attempts.count()).toBe(1)
    expect(await db.ratings.get('R')).toBeDefined()
    spy.mockRestore()
  })

  it('snapshot経路（ドリル）: 後段の失敗でsnapshotも進まないため、同じsnapshotで再試行できる', async () => {
    const db = newDb()
    const q = question('q-1')
    const snapshot = await startSession(db, { items: [{ questionId: q.id, mode: 'solo' }] })
    const spy = failRatingsOnce(db)

    await expect(
      recordAnswerPipeline(db, {
        snapshot,
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 5000,
        mode: 'solo',
      }),
    ).rejects.toThrow(/ratings書き込み失敗/)

    expect(await db.attempts.count()).toBe(0)

    // 同じsnapshotで再試行できる（DB上のsnapshotが進んでいないので StaleSnapshotError にならない）
    const result = await recordAnswerPipeline(db, {
      snapshot,
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 5000,
      mode: 'solo',
    })

    expect(result.nextSnapshot?.answeredCount).toBe(1)
    expect(await db.attempts.count()).toBe(1)
    spy.mockRestore()
  })

  it('SRS更新の失敗でもattemptが残らない（⑤の失敗）', async () => {
    const db = newDb()
    const q = question('vocab-q')
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 1,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const original = db.srsCards.put.bind(db.srsCards)
    let failed = false
    const spy = vi.spyOn(db.srsCards, 'put').mockImplementation(((...args: unknown[]) => {
      if (!failed) {
        failed = true
        return Promise.reject(new Error('srsCards書き込み失敗（模擬）'))
      }
      return original(...(args as Parameters<typeof original>))
    }) as typeof db.srsCards.put)

    await expect(
      recordAnswerPipeline(db, {
        questionId: q.id,
        question: q,
        lookup: lookupOf(q),
        isCorrect: true,
        responseMs: 5000,
        mode: 'srs',
        srsCardId: 'vocab:submit',
        skip: { rating: true, tagStats: true, wrongAnswer: true },
      }),
    ).rejects.toThrow(/srsCards書き込み失敗/)

    expect(await db.attempts.count()).toBe(0)
    // カードのstageも変わっていない
    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(1)
    spy.mockRestore()
  })

  // 何を防ぐか: 共有API向けの副作用（pendingSync）の失敗で学習記録が巻き戻ること。
  // 縮退設計（共有APIが全損してもソロ学習は無傷）に反するため、⑥はトランザクション外で
  // 失敗を飲み込む
  it('pendingSyncのエンキュー失敗では解答が成立する（縮退設計）', async () => {
    const db = newDb()
    const q = question('q-1')
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: true })
    await db.raidState.put({
      id: RAID_STATE_ID,
      joined: true,
      bossId: 'boss-2026-W31',
      bossType: 'synthetic',
      defenseJson: null,
      hp: 1000,
      maxHp: 1000,
      startAt: Date.now() - 1000,
      endAt: Date.now() + 86_400_000,
      myDamage: 0,
      lastSyncedAt: Date.now(),
      profileJson: null,
    } as never)
    const spy = vi
      .spyOn(db.pendingSync, 'add')
      .mockRejectedValue(new Error('pendingSync失敗（模擬）'))

    const result = await recordAnswerPipeline(db, {
      questionId: q.id,
      question: q,
      lookup: lookupOf(q),
      isCorrect: true,
      responseMs: 5000,
      mode: 'solo',
    })

    // 例外にならず、学習記録は残る
    expect(await db.attempts.count()).toBe(1)
    expect(result.raidDamage).toBeUndefined()
    spy.mockRestore()
  })
})
