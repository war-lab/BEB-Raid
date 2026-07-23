// レート連動の難易度調整（ドッグフィードバック 2026-07-22「問題が難しすぎる」への対応）。
// 「やさしいモード」トグルではなく、P0診断/自己申告で得た L/R レートを基準に、ユーザーの
// 実力より過度に難しいドリル問題を、同型のより実力相応な問題へ自動で差し替える。
// generateQuickPack（C-4契約）は変更せず、生成後フィルタとして実装（noEarphoneFilterと同方針）。
//
// SRS由来item（srsQuestion/srsVocab=復習の同一性が本質）と語彙カード（part 0=レート対象外）は
// 不変。効くのは非語彙ドリル（Part2/5・ディクテーション等）。難易度写像・セクション判定は
// rating.ts（03の5節）をそのまま使い、診断P0のEloマッチングと基準を揃える。

import type { Question } from '@beb-raid/shared-schema'
import type { QuickPack, QuickPackItem } from './types'
import { shuffle } from './shuffle'
import { difficultyToRatingSpace, sectionForPart } from './rating'

/**
 * レート空間でこの値を超えて上振れした問題を「過度に難しい」とみなす閾値。
 * 170 は難易度1段（d = 150 + 170×D）に相当し、実力より1段以上難しい問題を差し替え対象にする。
 */
export const RATING_DIFFICULTY_MARGIN = 170

export interface SectionRatings {
  L: number
  R: number
}

/** 問題の属するセクションのレートを返す（part 0 等のレート対象外は null） */
function ratingForQuestion(question: Question, ratings: SectionRatings): number | null {
  const section = sectionForPart(question.part)
  if (section === null) return null
  return ratings[section]
}

/** その問題がユーザーの実力より過度に難しいか（レート空間で MARGIN 超の上振れ） */
function isTooHard(question: Question | undefined, ratings: SectionRatings): boolean {
  if (question === undefined) return false
  const r = ratingForQuestion(question, ratings)
  if (r === null) return false
  return difficultyToRatingSpace(question.difficulty) - r > RATING_DIFFICULTY_MARGIN
}

/** 差し替え候補プールのキー。format＋partが一致するもの同士でのみ差し替える */
function poolKey(question: Question): string {
  return `${question.format}#${question.part}`
}

/**
 * kind:'drill' の過度に難しい問題を、同型（format＋part一致）・未使用・元より易しい候補のうち
 * 「ユーザーのレートに最も近い d」を持つものへ差し替える。代替が無ければ元のまま残す
 * （イヤホンフィルタと違い難問でも解答は可能なので取り除かず、セッション長を保つ）。
 */
export function applyRatingDifficultyFilter(
  pack: QuickPack,
  questions: ReadonlyMap<string, Question>,
  ratings: SectionRatings,
): QuickPack {
  const usedIds = new Set(
    pack.items.flatMap((item) => (item.questionId !== null ? [item.questionId] : [])),
  )
  const items: QuickPackItem[] = []
  for (const item of pack.items) {
    const question = item.questionId !== null ? questions.get(item.questionId) : undefined
    if (item.kind === 'drill' && question && isTooHard(question, ratings)) {
      const r = ratingForQuestion(question, ratings)!
      const currentD = difficultyToRatingSpace(question.difficulty)
      const key = poolKey(question)
      let best: Question | undefined
      let bestDist = Infinity
      for (const cand of questions.values()) {
        if (usedIds.has(cand.id) || poolKey(cand) !== key) continue
        const candD = difficultyToRatingSpace(cand.difficulty)
        if (candD >= currentD) continue // 元より易しいものだけを候補にする
        const dist = Math.abs(candD - r)
        if (dist < bestDist) {
          best = cand
          bestDist = dist
        }
      }
      if (best) {
        usedIds.add(best.id)
        items.push({ ...item, questionId: best.id })
        continue
      }
    }
    items.push(item)
  }
  return { ...pack, items }
}

/**
 * 単独モード（Part2瞬発・Part5）用の並べ替え。実力相応/以下の問題を先に、過度に難しい問題を
 * 後ろに置く（各層内はシャッフル）。単一formatのプールを渡す前提。
 */
export function orderByRating(
  pool: readonly Question[],
  ratings: SectionRatings,
  rng: () => number = Math.random,
): Question[] {
  const appropriate = pool.filter((q) => !isTooHard(q, ratings))
  const tooHard = pool.filter((q) => isTooHard(q, ratings))
  return [...shuffle(appropriate, rng), ...shuffle(tooHard, rng)]
}
