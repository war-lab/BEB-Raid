// 解答パイプライン集約（T-71。正本: docs/15 3節・J-35）。
//
// DrillScreen が持っていた4つのほぼ重複した解答確定関数
// （finalizeAnswer・finalizeSubQuestionAnswer・finalizeDictationAnswer・handleVocabGrade）と、
// VocabScreen の handleGrade を、この1関数の skip オプションの組み合わせで表現する。
// T-89でpendingSyncエンキュー（4.1節の挿入点）を追加した。
//
// 【トランザクション境界】attempts+snapshotの原子性は answerCurrentQuestion 内で
// 確保済み。②〜⑤を含めた全ステップの単一トランザクション化はDexieのストア跨ぎコストと
// T-07設計を尊重して見送る（現状維持）。途中で例外が起きたら呼び出し側（UI）が
// catchしてトースト表示＋スナップショット再読込を行う（T-70と同じ復旧方針）。

import { buildDamageSyncPayload, type Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode } from '../db/schema'
import { RAID_STATE_ID } from '../db/schema'
import { computeDamage } from '../engine/damage'
import { processWrongAnswer } from '../engine/keyVocab'
import { applyRatingUpdate } from '../engine/rating'
import { reviewSrsCard } from '../engine/srs'
import { updateTagStatsForAnswer } from '../engine/tagStats'
import type { QuestionLookup, RatingUpdate, SrsGrade } from '../engine/types'
import { recordAttempt } from './attempts'
import { answerCurrentQuestion, type SessionSnapshot } from './session'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

export interface AnswerPipelineSkip {
  /** J-29: ディクテーションはレート更新の対象外 */
  rating?: boolean
  /** vocab_card等、tags=[]で実質no-opなことが分かっている場合の明示スキップ */
  tagStats?: boolean
  /** vocab_cardは誤答してもkey語彙の復習デッキに落とさない（自己評価が別途あるため） */
  wrongAnswer?: boolean
  /** audio_setのサブ設問はセット完了時に1回だけreviewSrsCardを呼ぶため、設問ごとはスキップする */
  srs?: boolean
}

export interface AnswerPipelineInput {
  /** セッション進行中の解答。無ければ recordAttempt で直接記録する（audio_setサブ設問・VocabScreen） */
  snapshot?: SessionSnapshot
  /** attempts記録・tagStats集計のキーとなるID（audio_setサブ設問はsubQuestion.id） */
  questionId: string
  /**
   * processWrongAnswer・applyRatingUpdate（part/difficulty）に使う問題実体。
   * audio_setサブ設問の場合はkeyVocab等を持つ親のQuestionを渡す
   */
  question: Question
  /** updateTagStatsForAnswerに渡すルックアップ表（audio_setサブ設問は疑似エントリを含むMapを渡す） */
  lookup: QuestionLookup
  isCorrect: boolean
  responseMs: number
  isTimeout?: boolean
  mode: AttemptMode
  /** SRS由来itemのみ。指定時はreviewSrsCardを呼ぶ（skip.srsで抑制可） */
  srsCardId?: string
  /** 自己評価3段階（vocab_card）。省略時は客観正誤から good/again を決める */
  srsGrade?: SrsGrade
  skip?: AnswerPipelineSkip
}

export interface AnswerPipelineResult {
  /** snapshot指定時のみ。次に出題するitemへ進んだ後のスナップショット */
  nextSnapshot?: SessionSnapshot
  /** skip.rating指定時、またはSRS復習・語彙カード等レート対象外の解答ではundefined/null */
  ratingUpdate?: RatingUpdate | null
}

/**
 * レイドダメージをpendingSyncへエンキューする（T-89。M3基盤・端末内完結ステップ）。
 * `raidSyncEnabled`設定が既定OFFのため、OFF時はこの読み取り1回のみで追加の書き込みは
 * 一切発生しない（縮退設計の常時保証）。参加中のレイドが無い・ダメージが0の場合も送らない
 */
async function enqueueRaidSyncIfEnabled(
  db: BebRaidDatabase,
  params: {
    attemptId: string
    answeredAt: number
    mode: AttemptMode
    isCorrect: boolean
    basePoints: number
  },
): Promise<void> {
  const setting = await db.settings.get(RAID_SYNC_ENABLED_KEY)
  if (setting?.value !== true) return

  const raidState = await db.raidState.get(RAID_STATE_ID)
  if (!raidState?.joined) return

  // 端末キャッシュのボス期間（endAt）を過ぎた解答はエンキューしない。
  // 端末は今週のボス情報を持っていない状態であり、旧bossId宛の期間外payloadを積んでも
  // サーバー（J-49: answeredAtが[startAt, endAt]区間内のみ加算=docs/16）は非加算のまま
  // acceptedIds扱いにするため、キューから消えて再送機会を失うだけになる
  if (params.answeredAt > raidState.endAt) return

  const points = params.isCorrect ? params.basePoints : 0
  const damage = computeDamage(points, params.mode)
  if (damage <= 0) return

  const payload = buildDamageSyncPayload({
    attemptId: params.attemptId,
    bossId: raidState.bossId,
    damage,
    questionCount: 1,
    answeredAt: params.answeredAt,
  })
  await db.pendingSync.add({
    kind: 'raidDamage',
    payloadJson: JSON.stringify(payload),
    createdAt: Date.now(),
  })
}

/**
 * 1問の解答を確定し、attempts・srsCards（誤答復習デッキ）・tagStats・ratings・
 * SRSカード（自己評価）を必要な範囲だけ更新する。
 */
export async function recordAnswerPipeline(
  db: BebRaidDatabase,
  input: AnswerPipelineInput,
): Promise<AnswerPipelineResult> {
  const {
    snapshot,
    questionId,
    question,
    lookup,
    isCorrect,
    responseMs,
    isTimeout = false,
    mode,
    srsCardId,
    srsGrade,
    skip,
  } = input

  let nextSnapshot: SessionSnapshot | undefined
  let attemptId: string
  let answeredAt: number
  if (snapshot) {
    nextSnapshot = await answerCurrentQuestion(db, snapshot, { isCorrect, responseMs, isTimeout })
    attemptId = nextSnapshot.attemptIds.at(-1)!
    // answerCurrentQuestion は updatedAt に今回記録した attempt の answeredAt をそのまま入れる（session.ts参照）
    answeredAt = nextSnapshot.updatedAt
  } else {
    const attempt = await recordAttempt(db, { questionId, mode, isCorrect, responseMs, isTimeout })
    attemptId = attempt.id
    answeredAt = attempt.answeredAt
  }

  if (!isCorrect && !skip?.wrongAnswer) {
    await processWrongAnswer(db, question)
  }

  if (!skip?.tagStats) {
    await updateTagStatsForAnswer(db, questionId, lookup)
  }

  let ratingUpdate: RatingUpdate | null | undefined
  if (!skip?.rating) {
    ratingUpdate = await applyRatingUpdate(db, {
      part: question.part,
      difficulty: question.difficulty,
      isCorrect,
      mode,
    })
  }

  if (srsCardId && !skip?.srs) {
    await reviewSrsCard(db, srsCardId, srsGrade ?? (isCorrect ? 'good' : 'again'))
  }

  await enqueueRaidSyncIfEnabled(db, {
    attemptId,
    answeredAt,
    mode,
    isCorrect,
    basePoints: ratingUpdate?.basePoints ?? 0,
  })

  return { nextSnapshot, ratingUpdate }
}
