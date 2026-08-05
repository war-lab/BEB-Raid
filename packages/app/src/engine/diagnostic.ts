// P0診断（初回チュートリアル）のアダプティブ選題とレート計算
// （T-20。正本: docs/03 1.2節・5.1、docs/10 T-20行）。
//
// 診断そのものを K=32 のレート更新として実装する（03の5.4「最初の50問はK=32」の
// 初期区間をそのまま使う）。L15問・R15問を交互に出題し、毎問「現在レートに写像距離
// |d-R| が最も近い未出題問題」を選ぶ。30問終了時点のレートがP0結果（initializeRatings
// にそのまま渡す）。診断中は tagStats・SRS・processWrongAnswer 等の副作用は起こさない
// （レート決定に専念する、独立したフロー）。

import type { Question } from '@beb-raid/shared-schema'
import { RATING_K_EARLY, difficultyToRatingSpace, expectedAccuracy } from './rating'

/** L/Rそれぞれの出題数（03の1.2: アダプティブ30問=L15/R15） */
export const DIAGNOSTIC_ITEMS_PER_SECTION = 15
export const DIAGNOSTIC_TOTAL_ITEMS = DIAGNOSTIC_ITEMS_PER_SECTION * 2

/** 自己申告TOEICスコアの許容範囲（公式スコアの最小・最大）。T-187（Q-36） */
export const TOEIC_SCORE_MIN = 10
export const TOEIC_SCORE_MAX = 990

/**
 * 自己申告TOEICスコア→初期R（03の5.1: `R = TOEIC×1000/990`）。未申告時は既定値をそのまま返す。
 * T-187（Q-36）: 入力側（DiagnosticScreen）で範囲外は拒否するが、保存済み途中経過の復元など
 * 入力検証を経由しない値が渡ってもレート計算が壊れないよう、engine層でも10〜990にクランプする
 * （多層防御）。桁誤り（65や6500）が初期レートへそのまま伝播すると、以降の全出題難易度・
 * クイックパック構成・予測スコアに波及し、修正手段が診断のやり直ししか無くなるため
 */
export function initialRatingFromToeic(toeic: number | null, fallbackRating: number): number {
  if (toeic === null) return fallbackRating
  const clamped = Math.min(TOEIC_SCORE_MAX, Math.max(TOEIC_SCORE_MIN, toeic))
  return (clamped * 1000) / 990
}

/**
 * 現在レートに写像距離 |d-R| が最も近い未出題問題を選ぶ（同距離は pool の並び順で先勝ち）。
 * 出題候補が全て出題済みの場合のみ出題済みを許容する（M1ダミーコンテンツは点数が少なく
 * 在庫切れしうるための保険。実パック=T-25以降は十分な量を用意する前提）
 */
export function selectNextQuestion(
  pool: readonly Question[],
  askedIds: ReadonlySet<string>,
  rating: number,
): Question | null {
  if (pool.length === 0) return null
  const unasked = pool.filter((q) => !askedIds.has(q.id))
  const candidates = unasked.length > 0 ? unasked : pool

  let best: Question | null = null
  let bestDist = Infinity
  for (const q of candidates) {
    const dist = Math.abs(difficultyToRatingSpace(q.difficulty) - rating)
    if (dist < bestDist) {
      bestDist = dist
      best = q
    }
  }
  return best
}

/** 診断中の1問分のレート更新（K=32固定。式自体は applyRatingUpdate と同一） */
export function updateDiagnosticRating(
  rating: number,
  difficulty: number,
  isCorrect: boolean,
): number {
  const d = difficultyToRatingSpace(difficulty)
  const p = expectedAccuracy(rating, d)
  return rating + RATING_K_EARLY * ((isCorrect ? 1 : 0) - p)
}

/** turn（0始まり）→ 出題セクション。L/R交互でそれぞれ15問（03の1.2） */
export function sectionForTurn(turn: number): 'L' | 'R' {
  return turn % 2 === 0 ? 'L' : 'R'
}
