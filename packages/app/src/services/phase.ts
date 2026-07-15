// フェーズ（カリキュラム進行）の読み書きサービス（M2・T-51。正本: docs/04 3節、docs/13 3.2節）。
//
// phase ストアの主キーは `season`（db/schema.ts）のため、シーズン遷移時は
// レコードそのものを作り直す必要がある。「常に1行だけ存在する」不変条件を
// このモジュールが担保する（毎回 toArray()[0] を読み、書き込みは clear→put）。

import type { QuestionLookup } from '../engine/types'
import {
  criteriaForSeason,
  evaluatePhaseTransition,
  initialSeasonForRating,
  type CriterionContext,
  type PhaseTransitionOutcome,
} from '../engine/curriculum'
import type { PhaseCriteria, PhaseState } from '../engine/types'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import type { BebRaidDatabase } from '../db/database'
import type { ListeningStage, PhaseRecord } from '../db/schema'

function recordToState(record: PhaseRecord): PhaseState {
  const criteria = JSON.parse(record.criteriaJson) as PhaseCriteria
  return {
    season: record.season,
    listeningStage: record.listeningStage ?? 1,
    criteria,
    achievedAt: record.achievedAt,
  }
}

function stateToRecord(state: PhaseState): PhaseRecord {
  return {
    season: state.season,
    criteriaJson: JSON.stringify(state.criteria),
    achievedAt: state.achievedAt,
    listeningStage: state.listeningStage,
  }
}

/** 現在のフェーズ状態を保存する（既存レコードを置き換える。1行のみの不変条件を維持） */
export async function savePhaseState(db: BebRaidDatabase, state: PhaseState): Promise<void> {
  await db.transaction('rw', db.phase, async () => {
    await db.phase.clear()
    await db.phase.put(stateToRecord(state))
  })
}

/**
 * フェーズ状態を取得する。レコードが無ければ初期割当（J-18）を行い作成する。
 * 初期割当は ratings（L/Rレート）から総合レートを算出し、initialSeasonForRating で判定する
 */
export async function getOrInitPhaseState(db: BebRaidDatabase): Promise<PhaseState> {
  const existing = await db.phase.toArray()
  if (existing[0]) return recordToState(existing[0])

  const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
  const lRating = l?.rating ?? DEFAULT_INITIAL_RATING
  const rRating = r?.rating ?? DEFAULT_INITIAL_RATING
  const season = initialSeasonForRating((lRating + rRating) / 2)
  const state: PhaseState = {
    season,
    listeningStage: 1,
    criteria: criteriaForSeason(season),
    achievedAt: null,
  }
  await savePhaseState(db, state)
  return state
}

/** フェーズ判定に使うコンテキストをDBから組み立てる（vocab:/shadow:除外はcurriculum.ts側で行う） */
export async function buildCriterionContext(
  db: BebRaidDatabase,
  questionLookup: QuestionLookup,
): Promise<CriterionContext> {
  const [attempts, srsCards, examScores] = await Promise.all([
    db.attempts.toArray(),
    db.srsCards.toArray(),
    db.examScores.toArray(),
  ])
  return {
    attempts: attempts.map((a) => ({
      questionId: a.questionId,
      isCorrect: a.isCorrect,
      answeredAt: a.answeredAt,
    })),
    srsCards,
    examScores: examScores.map((e) => ({ total: e.total })),
    questionLookup,
  }
}

/**
 * フェーズ移行判定を実行し、成立していれば永続化する（セッション完了時に呼ぶ想定=13の3.2節）。
 * 移行先の criteria は新しいシーズンの「次へ進む条件」に差し替える（進捗バー表示用）
 */
export async function evaluateAndPersistPhaseTransition(
  db: BebRaidDatabase,
  questionLookup: QuestionLookup,
  now: number = Date.now(),
): Promise<PhaseTransitionOutcome> {
  const current = await getOrInitPhaseState(db)
  const ctx = await buildCriterionContext(db, questionLookup)
  const outcome = evaluatePhaseTransition(current.season, current.listeningStage, ctx)

  if (outcome.seasonTransitioned || outcome.listeningTransitioned || outcome.seasonCleared) {
    const nextState: PhaseState = {
      season: outcome.season,
      listeningStage: outcome.listeningStage as ListeningStage,
      criteria: criteriaForSeason(outcome.season),
      achievedAt: outcome.seasonTransitioned || outcome.seasonCleared ? now : current.achievedAt,
    }
    await savePhaseState(db, nextState)
  }
  return outcome
}
