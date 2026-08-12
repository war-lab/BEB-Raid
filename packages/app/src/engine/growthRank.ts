// 成長ランク（M4・T-130。正本: docs/22 3.7節、docs/21 T-130行、docs/02 7節）。
//
// 継続装置の一つ。絶対スコアではなく「レート上昇量＋学習量」で段位を決める
// （300点でも900点でも同じ土俵=02の7節）。**端末内導出のみでサーバー送信はしない**
// （J-68。プライバシー境界に新しい送信を作らない）。
//
// rankPoints = max(0, 現在の総合レート − 初期レート) + 学習日数
//   初期レート = ratingHistory（section='total'）の最古スナップショット値
//              （履歴が無い新規ユーザーは currentRating を初期値とみなし差分0とする）
//   学習日数   = attempts が1件以上存在する日の数（ストリーク/ヒートマップと同じ
//              暦日基準=engine/date.ts の toDateString）。ヒートマップの表示窓
//              （直近15週）とは異なり、ここでは全期間の attempts を対象にする
//              （累積の継続装置であり表示ウィンドウを切る対象ではないため）。

import type { BebRaidDatabase } from '../db/database'
import {
  GROWTH_RANK_LEARNING_DAYS_CACHE_KEY,
  GROWTH_RANK_MAX_POINTS_KEY,
} from '../services/settingsKeys'
import { toDateString } from './date'
import rawConfig from './growthRankConfig.json'
import { DEFAULT_INITIAL_RATING } from './rating'

/** 成長ランク1段の定義（growthRankConfig.json の1エントリ） */
export interface GrowthRankDef {
  id: string
  name: string
  /** このランクに達するために必要な rankPoints（下限。昇順必須） */
  minPoints: number
}

export interface GrowthRankConfig {
  ranks: GrowthRankDef[]
}

/**
 * growthRankConfig.json の整合性検証（レビューフォローアップ3.8節の
 * validateQuickPackConfig の前例に倣う）。
 * minPoints が昇順でないと「上位ランクなのに閾値が低い」等の矛盾した設定が
 * 読み込み時に検出されず、静かに誤った判定をし続けるため即座に検出する。
 */
export function validateGrowthRankConfig(config: GrowthRankConfig): void {
  if (config.ranks.length === 0) {
    throw new Error('growthRankConfig の ranks が空')
  }
  for (let i = 1; i < config.ranks.length; i++) {
    const prev = config.ranks[i - 1]!
    const cur = config.ranks[i]!
    if (cur.minPoints <= prev.minPoints) {
      throw new Error(
        `growthRankConfig の ranks は minPoints 昇順である必要がある（不正: ${prev.id}(${prev.minPoints}) → ${cur.id}(${cur.minPoints})）`,
      )
    }
  }
}

export const GROWTH_RANK_CONFIG: GrowthRankConfig = rawConfig
validateGrowthRankConfig(GROWTH_RANK_CONFIG)

/** 成長ランクの判定結果 */
export interface GrowthRankResult {
  rankPoints: number
  rank: GrowthRankDef
  /** 次ランク（最上位ランクに達している場合は null） */
  nextRank: GrowthRankDef | null
  /** 次ランクまでの残りポイント（nextRank が null のときは null） */
  pointsToNext: number | null
}

/** rankPoints の算定式（22の3.7節が正文） */
export function computeRankPoints(params: {
  currentRating: number
  initialRating: number
  learningDays: number
}): number {
  return Math.max(0, params.currentRating - params.initialRating) + params.learningDays
}

/** rankPoints からランク・次ランクまでの残りを判定する（純粋関数） */
export function resolveGrowthRank(
  rankPoints: number,
  config: GrowthRankConfig = GROWTH_RANK_CONFIG,
): GrowthRankResult {
  const ranks = config.ranks
  let current = ranks[0]!
  let next: GrowthRankDef | null = ranks[1] ?? null
  for (let i = 0; i < ranks.length; i++) {
    if (rankPoints >= ranks[i]!.minPoints) {
      current = ranks[i]!
      next = ranks[i + 1] ?? null
    } else {
      break
    }
  }
  return {
    rankPoints,
    rank: current,
    nextRank: next,
    pointsToNext: next ? next.minPoints - rankPoints : null,
  }
}

/** countLearningDaysの差分加算キャッシュの保存形（T-301・K-29） */
interface LearningDaysCache {
  /** これまでに1件以上attemptsがあった暦日の集合（toDateString形式） */
  dates: string[]
  /** 処理済みのうち最大のanswered At（この値以下のattemptsは次回スキップする） */
  watermark: number
}

/**
 * 学習日数: 正誤判定を伴う解答が1件以上存在する暦日の数（全期間。ストリーク/ヒートマップと
 * 同じ日付基準=toDateStringで暦日キー化してから distinct を取る）。
 *
 * T-307（K-36）: シャドーイングは `shadow:` プレフィックスのquestionIdで記録されるが、
 * `isCorrect` は固定値（客観的な正誤判定を伴わない再生ログ）。フィルタが無いと
 * 1日1件の再生を続けるだけで学習日数が積み上がり、レートが不変でも230日で
 * 最上位ランクに到達しうる（questionStats・カリキュラム判定は既にshadow:を除外している
 * のと同じ理由で、こちらも除外する）
 *
 * T-301（K-29）: 従来はevery呼び出しでattempts全件をフルスキャンしており、
 * ホーム・ダッシュボード表示のたびに件数に比例したコストがかかっていた。
 * attemptsは追記のみ（削除されない）ため、前回のwatermarkより新しい分だけを
 * 差分で読めば足りる。同じ日を2回集合に加えても副作用が無いため、
 * watermark境界の重複走査があっても結果は狂わない
 */
export async function countLearningDays(db: BebRaidDatabase): Promise<number> {
  const stored = (await db.settings.get(GROWTH_RANK_LEARNING_DAYS_CACHE_KEY))?.value as
    LearningDaysCache | undefined
  const cache: LearningDaysCache = stored ?? { dates: [], watermark: 0 }
  const dates = new Set(cache.dates)
  let watermark = cache.watermark
  await db.attempts
    .where('answeredAt')
    .above(cache.watermark)
    .each((a) => {
      if (!a.questionId.startsWith('shadow:')) dates.add(toDateString(a.answeredAt))
      if (a.answeredAt > watermark) watermark = a.answeredAt
    })
  if (watermark !== cache.watermark || dates.size !== cache.dates.length) {
    // キャッシュ更新の失敗（DBクローズ済み等）は握る。呼び出し元の画面が
    // アンマウント後もこの関数の完了を待たずに進む構成のため、ここから例外が
    // 漏れると未処理rejectionになる。更新に失敗しても次回呼び出し時に
    // watermark=前回値からやり直すだけで、返り値（今回のdates.size）自体は正しい
    try {
      await db.settings.put({
        key: GROWTH_RANK_LEARNING_DAYS_CACHE_KEY,
        value: { dates: [...dates], watermark } satisfies LearningDaysCache,
      })
    } catch (err) {
      console.error('[growthRank] 学習日数キャッシュの更新に失敗', err)
    }
  }
  return dates.size
}

/**
 * 成長ランクをDBから導出する（端末内のみ。サーバー送信は一切行わない=J-68）。
 * ratingHistory が無い新規ユーザーは currentRating を初期レートとみなし
 * 差分0（学習日数のみ加点。学習前なら0）として扱う。
 *
 * T-305（K-33）: rankPointsはratingHistoryの最古行をinitialRatingとして算定するため、
 * 過去日付でスナップショットが書かれて最古行が入れ替わると、初期値が現在レートへ移動して
 * rankPointsが下落しうる（実測でマスター→ゴールドへ退行）。「累積の継続装置」という
 * 位置づけ（docs/22 3.7節）に反するため、到達済みの最大値をsettingsへ永続化し、
 * 今回の算定値がそれ未満なら永続化済みの最大値を使う（単調性の保証。時刻の正当性検証は
 * しない=J-124と同じ方針で、値そのものの単調性だけを守る）
 */
export async function getGrowthRank(
  db: BebRaidDatabase,
  config: GrowthRankConfig = GROWTH_RANK_CONFIG,
): Promise<GrowthRankResult> {
  const [totalRating, history, learningDays, maxPointsSetting] = await Promise.all([
    db.ratings.get('total'),
    db.ratingHistory.where('section').equals('total').sortBy('date'),
    countLearningDays(db),
    db.settings.get(GROWTH_RANK_MAX_POINTS_KEY),
  ])
  const currentRating = totalRating?.rating ?? DEFAULT_INITIAL_RATING
  const initialRating = history.length > 0 ? history[0]!.rating : currentRating
  const computedPoints = computeRankPoints({ currentRating, initialRating, learningDays })
  const previousMax = (maxPointsSetting?.value as number | undefined) ?? 0
  const rankPoints = Math.max(computedPoints, previousMax)
  if (rankPoints > previousMax) {
    await db.settings.put({ key: GROWTH_RANK_MAX_POINTS_KEY, value: rankPoints })
  }
  return resolveGrowthRank(rankPoints, config)
}
