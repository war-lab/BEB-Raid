// レイドHP算出の定数（正本: docs/17_M3実装計画.md 3.4節。暫定値・ドッグフード実測で調整する）

import type { DailyGoal } from '@beb-raid/shared-schema'

/**
 * 1問あたりの想定ダメージ（raid係数1.0適用後）。
 * 導出: `engine/rating.ts`の`basePoints(rating, d)`を難易度3・初期レート帯
 * （`DEFAULT_INITIAL_RATING`=400, `difficultyToRatingSpace(3)`=660）で実行し、
 * 128という値を実測した（一時テストで確認・削除済み。docs/STATUS.md T-94行に記録）。
 * raid係数は1.0（J-47）なのでそのまま採用する
 */
export const DAMAGE_PER_QUESTION = 128

/**
 * ボスHPの討伐率係数。新値を作らず、docs/03 6.2で既に確定済みの値をそのまま使う
 * （docs/17起草時に0.8という誤記があったが、03が上流正本のため0.85に統一した）
 */
export const BOSS_HP_FACTOR = 0.85

/** 自己申告区分→想定消化問題数/日の換算表（J-48） */
export const DAILY_GOAL_QUESTIONS: Record<DailyGoal, number> = {
  light: 5,
  normal: 15,
  heavy: 30,
}

/** 週次レイドの日数（月曜〜金曜の5日。docs/03 6.2） */
export const RAID_DAYS = 5

/**
 * HP下限（登録0人・極端に少ない週の異常値防止）。
 * normal（1人分）の想定日次ダメージ×5日×係数を下限とする
 */
export const MIN_BOSS_HP = Math.round(
  DAILY_GOAL_QUESTIONS.normal * DAMAGE_PER_QUESTION * RAID_DAYS * BOSS_HP_FACTOR,
)

/** EMA補正の重み（前週実績と旧emaDailyDamageを半々にブレンドする。J-48） */
export const EMA_WEIGHT = 0.5

/**
 * ゴースト週のHP係数（docs/22 3.3節・docs/03 6.3節）。
 * 通常式で算出したmaxHpにそのまま乗算する。初期値1.0（暫定・勝率60–70%目標で実測調整する）
 */
export const GHOST_HP_FACTOR = 1.0

/** ゴーストボスの防御倍率「堅い」（ボス役が正解した問題。docs/03 6.3節の確定値） */
export const GHOST_MULTIPLIER_SOLID = 0.5

/** ゴーストボスの防御倍率「弱点」（ボス役が誤答した問題。docs/03 6.3節の確定値） */
export const GHOST_MULTIPLIER_WEAK = 2.0
