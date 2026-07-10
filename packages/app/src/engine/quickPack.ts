// クイックパック生成（T-13。正本: docs/03 1.3、docs/02 2.1・2.3）。
//
// 「今日のクエスト」の中身を優先度順に自動構成する:
//   ① SRS期限超過カード（上限15枚/パック。溢れは次パックへ）
//   ②（枠が残れば）SRS新規カードの導入（T-09 の新規上限・滞留停止を適用済みのキュー）
//   ③（7分/15分のみ）固定配分（J-2: 語彙50/Part2 25/Part5 25）の弱点ドリル。
//      弱点タグ・復習対象key単語を持つ問題は重み1.5倍（03の1.3）
// ③のレイド問題は M3 のため実装しない。
//
// 配分・パック容量は quickPackConfig.json に外出し（J-2。コード変更なしで調整可能）。

import type { Question } from '@beb-raid/shared-schema'

import type { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord } from '../db/schema'
import { getActiveReviewWords, similarOrFallback } from './keyVocab'
import rawConfig from './quickPackConfig.json'
import { getSrsQueue } from './srs'
import { getWeakTags } from './tagStats'
import type { QuickPack, QuickPackItem, QuickPackReason, QuickPackRequest } from './types'

/** ドリルの配分カテゴリ（J-2 の固定配分の単位） */
export type DrillCategory = 'vocab' | 'part2' | 'part5'

interface DurationConfig {
  totalItems: number
  includeDrills: boolean
}

/** quickPackConfig.json の型（設定値の正本は JSON 側） */
export interface QuickPackConfig {
  allocation: Record<DrillCategory, number>
  durations: Record<'3' | '7' | '15', DurationConfig>
  srsCapPerPack: number
  /** ドリルあり時間帯で新規カードに割いてよいパック容量の割合 */
  newCardShare: number
  /** 弱点タグ・key単語の出題重み（03の1.3） */
  priorityWeight: number
}

export const QUICK_PACK_CONFIG: QuickPackConfig = rawConfig

/** ドリル候補1件（重みと出題理由付き）。テストから重み付けを直接検証できるよう公開する */
export interface DrillCandidate {
  question: Question
  category: DrillCategory
  weight: number
  reason: QuickPackReason
}

/** 問題→配分カテゴリ。M1のコンテンツ（語彙/Part2/Part5）以外はドリル対象外 */
export function drillCategoryOf(question: Question): DrillCategory | null {
  if (question.format === 'vocab_card') return 'vocab'
  if (question.part === 2) return 'part2'
  if (question.part === 5) return 'part5'
  return null
}

/**
 * ドリル枠 slots を固定配分（語彙50/Part2 25/Part5 25）で分ける。
 * 最大剰余法で端数を配る（合計が必ず slots になる）
 */
export function computeAllocationCounts(
  slots: number,
  allocation: Record<DrillCategory, number> = QUICK_PACK_CONFIG.allocation,
): Record<DrillCategory, number> {
  const categories = Object.keys(allocation) as DrillCategory[]
  const exact = categories.map((c) => ({ category: c, exact: slots * allocation[c] }))
  const counts = Object.fromEntries(exact.map((e) => [e.category, Math.floor(e.exact)])) as Record<
    DrillCategory,
    number
  >
  let rest = slots - categories.reduce((sum, c) => sum + counts[c], 0)
  // 端数の大きい順（同値は allocation の記載順）に1ずつ配る
  const byFraction = [...exact].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  )
  for (const e of byFraction) {
    if (rest <= 0) break
    counts[e.category] += 1
    rest -= 1
  }
  return counts
}

/**
 * ドリル候補を構築する（重み付け＝T-11/T-12 の接続点）。
 * - 復習対象key単語の類題（在庫ゼロ時は発生元問題そのもの）: 重み1.5・理由 keyVocabReview
 * - 弱点タグを持つ問題: 重み1.5・理由 weakTag
 * - それ以外: 重み1・理由 allocation
 * 重みは重複適用しない（key単語 > 弱点タグ の順で理由を採る）
 */
export async function buildDrillCandidates(
  db: BebRaidDatabase,
  questions: readonly Question[],
  excludeQuestionIds: ReadonlySet<string>,
): Promise<DrillCandidate[]> {
  const weakTags = new Set(await getWeakTags(db))
  const reviewWords = await getActiveReviewWords(db)

  // key単語ごとに優先出題する問題を確定（類題優先・在庫ゼロのみ同一問題。03の3.2）
  const keyBoost = new Map<string, { word: string; isSameQuestion: boolean }>()
  for (const [word, card] of reviewWords) {
    const { candidates, isSameQuestion } = similarOrFallback(
      questions,
      word,
      card.sourceQuestionId ?? null,
    )
    for (const q of candidates) {
      if (!keyBoost.has(q.id)) keyBoost.set(q.id, { word, isSameQuestion })
    }
  }

  const result: DrillCandidate[] = []
  for (const question of questions) {
    if (excludeQuestionIds.has(question.id)) continue
    const category = drillCategoryOf(question)
    if (category === null) continue

    const boost = keyBoost.get(question.id)
    const weakTag = question.tags.find((t) => weakTags.has(t))
    let reason: QuickPackReason
    if (boost) {
      reason = { type: 'keyVocabReview', word: boost.word, isSameQuestion: boost.isSameQuestion }
    } else if (weakTag !== undefined) {
      reason = { type: 'weakTag', tag: weakTag }
    } else {
      reason = { type: 'allocation' }
    }
    result.push({
      question,
      category,
      weight: reason.type === 'allocation' ? 1 : QUICK_PACK_CONFIG.priorityWeight,
      reason,
    })
  }
  return result
}

/** 重み付き非復元抽出（テストでは rng を固定して決定的にする） */
export function weightedSample<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  count: number,
  rng: () => number,
): T[] {
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((sum, item) => sum + weightOf(item), 0)
    let r = rng() * total
    let index = pool.length - 1
    for (let i = 0; i < pool.length; i++) {
      r -= weightOf(pool[i] as T)
      if (r < 0) {
        index = i
        break
      }
    }
    picked.push(...pool.splice(index, 1))
  }
  return picked
}

/** SRSカード → パック項目 */
function srsItem(
  card: SrsCardRecord,
  questions: readonly Question[],
  reason: QuickPackReason,
): QuickPackItem {
  if (card.refType === 'question') {
    return { kind: 'srsQuestion', mode: 'srs', questionId: card.refId, srsCardId: card.id, reason }
  }
  // 語彙カード: 対応する vocab_card 問題があれば紐づける（無ければ refId=単語 だけで表示）
  const vocabQuestion = questions.find((q) => q.format === 'vocab_card' && q.front === card.refId)
  return {
    kind: 'srsVocab',
    mode: 'srs',
    questionId: vocabQuestion?.id ?? null,
    srsCardId: card.id,
    reason,
  }
}

/**
 * クイックパックを生成する（02の2.1: 3分=SRSのみ / 7分=SRS+弱点ドリル / 15分=増量）。
 * - SRS期限超過は 15枚/パック で打ち切り、溢れは srsOverflow として次パックに残す
 * - 問題SRSカードは出題候補（request.questions）に問題が無ければスキップする
 *   （パック未キャッシュ等。カードは消さず次回に持ち越し）
 */
export async function generateQuickPack(
  db: BebRaidDatabase,
  request: QuickPackRequest,
): Promise<QuickPack> {
  const now = request.now ?? Date.now()
  const rng = request.rng ?? Math.random
  const config = QUICK_PACK_CONFIG
  const durationConfig = config.durations[String(request.duration) as '3' | '7' | '15']

  const queue = await getSrsQueue(db, now)
  const items: QuickPackItem[] = []

  // ① SRS期限超過（上限 = min(15, パック容量)。溢れは次パックへ）
  const servableDue = queue.dueReviews.filter(
    (c) => c.refType === 'vocab' || request.questions.some((q) => q.id === c.refId),
  )
  const srsCap = Math.min(config.srsCapPerPack, durationConfig.totalItems)
  const dueTaken = servableDue.slice(0, srsCap)
  const srsOverflow = servableDue.length - dueTaken.length
  for (const card of dueTaken) {
    items.push(srsItem(card, request.questions, { type: 'srsDue' }))
  }

  // ② 新規カードの導入（ドリルあり時間帯は newCardShare まで、SRSのみ時間帯は残り全部）
  let remaining = durationConfig.totalItems - items.length
  const newCap = durationConfig.includeDrills
    ? Math.min(remaining, Math.floor(durationConfig.totalItems * config.newCardShare))
    : remaining
  const servableNew = queue.newCards.filter(
    (c) => c.refType === 'vocab' || request.questions.some((q) => q.id === c.refId),
  )
  for (const card of servableNew.slice(0, newCap)) {
    items.push(srsItem(card, request.questions, { type: 'srsNew' }))
  }

  // ③ 弱点ドリル（固定配分＋重み1.5倍の抽選）
  remaining = durationConfig.totalItems - items.length
  if (durationConfig.includeDrills && remaining > 0) {
    const excludeIds = new Set(
      items.flatMap((item) => (item.questionId !== null ? [item.questionId] : [])),
    )
    const candidates = await buildDrillCandidates(db, request.questions, excludeIds)
    const counts = computeAllocationCounts(remaining, config.allocation)

    const pickedByCategory: DrillCandidate[] = []
    const leftover: DrillCandidate[] = []
    for (const category of Object.keys(counts) as DrillCategory[]) {
      const pool = candidates.filter((c) => c.category === category)
      const picked = weightedSample(pool, (c) => c.weight, counts[category], rng)
      pickedByCategory.push(...picked)
      leftover.push(...pool.filter((c) => !picked.includes(c)))
    }
    // 在庫不足のカテゴリの穴は他カテゴリで埋める（配分は目標値であり在庫が優先）
    const shortage = remaining - pickedByCategory.length
    if (shortage > 0) {
      pickedByCategory.push(...weightedSample(leftover, (c) => c.weight, shortage, rng))
    }

    for (const candidate of pickedByCategory) {
      items.push({
        kind: 'drill',
        mode: 'solo',
        questionId: candidate.question.id,
        srsCardId: null,
        reason: candidate.reason,
      })
    }
  }

  return { duration: request.duration, items, srsOverflow }
}
