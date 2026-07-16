// 解答パイプライン集約（T-71。正本: docs/15 3節・J-35）。
//
// DrillScreen が持っていた4つのほぼ重複した解答確定関数
// （finalizeAnswer・finalizeSubQuestionAnswer・finalizeDictationAnswer・handleVocabGrade）と、
// VocabScreen の handleGrade を、この1関数の skip オプションの組み合わせで表現する。
// M3ではこの関数に pendingSync エンキューを追加する予定（4.1節の挿入点）。
//
// 【トランザクション境界】attempts+snapshotの原子性は answerCurrentQuestion 内で
// 確保済み。②〜⑤を含めた全ステップの単一トランザクション化はDexieのストア跨ぎコストと
// T-07設計を尊重して見送る（現状維持）。途中で例外が起きたら呼び出し側（UI）が
// catchしてトースト表示＋スナップショット再読込を行う（T-70と同じ復旧方針）。

import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode } from '../db/schema'
import { processWrongAnswer } from '../engine/keyVocab'
import { applyRatingUpdate } from '../engine/rating'
import { reviewSrsCard } from '../engine/srs'
import { updateTagStatsForAnswer } from '../engine/tagStats'
import type { QuestionLookup, RatingUpdate, SrsGrade } from '../engine/types'
import { recordAttempt } from './attempts'
import { answerCurrentQuestion, type SessionSnapshot } from './session'

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
  if (snapshot) {
    nextSnapshot = await answerCurrentQuestion(db, snapshot, { isCorrect, responseMs, isTimeout })
  } else {
    await recordAttempt(db, { questionId, mode, isCorrect, responseMs, isTimeout })
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

  return { nextSnapshot, ratingUpdate }
}
