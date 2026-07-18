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
import type { ListeningStage, SrsCardRecord } from '../db/schema'
import { templateForSeason } from './curriculum'
import { getActiveReviewWords, similarOrFallback } from './keyVocab'
import rawConfig from './quickPackConfig.json'
import { getSrsQueue } from './srs'
import { getWeakTags } from './tagStats'
import type {
  CurriculumTemplate,
  QuickPack,
  QuickPackItem,
  QuickPackReason,
  QuickPackRequest,
} from './types'

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

/**
 * quickPackConfig.json の整合性検証（レビューフォローアップ 3.8節）。
 * allocation の合計が 1±0.01 からずれると、不正な設定でパックが黙って
 * 目減りする（配分の穴が埋まらない）ため、読み込み時に即座に検出する。
 */
export function validateQuickPackConfig(config: QuickPackConfig): void {
  const sum = Object.values(config.allocation).reduce((acc, v) => acc + v, 0)
  if (Math.abs(sum - 1) > 0.01) {
    throw new Error(
      `quickPackConfig の allocation 合計が不正（1±0.01 から外れている。実際: ${sum}）`,
    )
  }
}

export const QUICK_PACK_CONFIG: QuickPackConfig = rawConfig
validateQuickPackConfig(QUICK_PACK_CONFIG)

/**
 * ドリル候補1件（重みと出題理由付き）。テストから重み付けを直接検証できるよう公開する。
 * category は M1=DrillCategory（3種）、M2=フェーズ配分・リスニング内訳のキー（文字列。13の3.2節）
 */
export interface DrillCandidate {
  question: Question
  category: string
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
 * 枠 slots を固定配分（キーは任意の文字列。M1=語彙50/Part2 25/Part5 25、M2=フェーズ配分・
 * リスニング内訳にも流用する=13の3.2節）で分ける。最大剰余法で端数を配る（合計が必ず slots になる）
 */
export function computeAllocationCounts(
  slots: number,
  allocation: Record<string, number> = QUICK_PACK_CONFIG.allocation,
): Record<string, number> {
  const categories = Object.keys(allocation)
  const exact = categories.map((c) => ({ category: c, exact: slots * (allocation[c] ?? 0) }))
  const counts = Object.fromEntries(exact.map((e) => [e.category, Math.floor(e.exact)])) as Record<
    string,
    number
  >
  let rest = slots - categories.reduce((sum, c) => sum + (counts[c] ?? 0), 0)
  // 端数の大きい順（同値は allocation の記載順）に1ずつ配る
  const byFraction = [...exact].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  )
  for (const e of byFraction) {
    if (rest <= 0) break
    counts[e.category] = (counts[e.category] ?? 0) + 1
    rest -= 1
  }
  return counts
}

/**
 * ドリル候補を構築する（重み付け＝T-11/T-12 の接続点）。
 * - 復習対象key単語の類題（在庫ゼロ時は発生元問題そのもの）: 重み1.5・理由 keyVocabReview
 * - 弱点タグを持つ問題: 重み1.5・理由 weakTag
 * - それ以外: 重み1・理由 allocation
 * 重みは重複適用しない（key単語 > 弱点タグ の順で理由を採る）。
 * categoryResolver 省略時は M1 既定（drillCategoryOf）。M2（フェーズ駆動）は
 * 弱形状態（weakTags）も見て分類する専用リゾルバを渡す（13の3.2節）
 */
export async function buildDrillCandidates(
  db: BebRaidDatabase,
  questions: readonly Question[],
  excludeQuestionIds: ReadonlySet<string>,
  categoryResolver: (question: Question, weakTags: ReadonlySet<string>) => string | null = (q) =>
    drillCategoryOf(q),
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
    const category = categoryResolver(question, weakTags)
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

/** DrillCandidate群 → QuickPackItem群への変換（drillの共通変換。M1/M2両方から使う） */
function toDrillItems(candidates: readonly DrillCandidate[]): QuickPackItem[] {
  return candidates.map((candidate) => ({
    kind: 'drill',
    mode: 'solo',
    questionId: candidate.question.id,
    srsCardId: null,
    reason: candidate.reason,
  }))
}

/** M1（quickPackConfig.json固定配分）のドリル抽出。既存ロジックを無改修のまま関数化しただけ */
async function buildM1DrillItems(
  db: BebRaidDatabase,
  questions: readonly Question[],
  excludeIds: ReadonlySet<string>,
  slots: number,
  rng: () => number,
): Promise<QuickPackItem[]> {
  const candidates = await buildDrillCandidates(db, questions, excludeIds)
  const counts = computeAllocationCounts(slots, QUICK_PACK_CONFIG.allocation)

  const pickedByCategory: DrillCandidate[] = []
  const leftover: DrillCandidate[] = []
  for (const category of Object.keys(counts)) {
    const pool = candidates.filter((c) => c.category === category)
    const picked = weightedSample(pool, (c) => c.weight, counts[category] ?? 0, rng)
    pickedByCategory.push(...picked)
    leftover.push(...pool.filter((c) => !picked.includes(c)))
  }
  const shortage = slots - pickedByCategory.length
  if (shortage > 0) {
    pickedByCategory.push(...weightedSample(leftover, (c) => c.weight, shortage, rng))
  }
  return toDrillItems(pickedByCategory)
}

/** リスニング枠内の内訳カテゴリ（03の8節: dictation/shadowing/part2/audioSet=13の3.2節） */
function resolveListeningSubCategory(
  question: Question,
): 'dictation' | 'shadowing' | 'part2' | 'audioSet' | null {
  if (question.format === 'dictation') return 'dictation'
  if (question.format === 'shadowing') return 'shadowing'
  if (question.format === 'audio_set') return 'audioSet'
  if (question.format === 'audio_qa' && question.part === 2) return 'part2'
  return null
}

/**
 * M2: 問題→フェーズ配分カテゴリの解決（13の3.2節）。
 * - vocab_card は template に 'vocab' キーがある場合のみ対象（P3にはvocabバケットが無い）
 * - 弱点タグ保有かつ template に 'weakness' キーがある場合（P3）はそちらを優先
 * - リスニング系（dictation/shadowing/audio_set/Part2音声）は 'listening' バケットへ
 * - Part5（text_blank）は 'part5' バケットへ
 */
function resolveM2Category(
  question: Question,
  weakTags: ReadonlySet<string>,
  template: CurriculumTemplate,
): string | null {
  // shadowing はドリルセッションの割当対象から除外する（実機再現バグ対応）。
  // シャドーイングは「再生して口頭で復唱する」専用画面（ShadowingScreen）で扱う機能であり、
  // DrillScreen の解答フロー（選択肢・穴埋め）に合わない＝混入すると解答手段の無い item に
  // なり進行不能になるため。13の3.2節のL1内訳（shadowing 30%）の枠は、既存の在庫不足補填
  // （buildPhaseDrivenDrillItems の subShortage 再配分）によりリスニング枠内の他形式へ流れる
  // （配分は目標値であり在庫が優先、というM1からの方針どおり）。
  // weakness 判定より先に除外する（P3で弱点タグ付きshadowingがweaknessバケットに入るのも同罪のため）
  if (question.format === 'shadowing') return null
  if (question.format === 'vocab_card') {
    return 'vocab' in template.allocation ? 'vocab' : null
  }
  const isWeak = question.tags.some((t) => weakTags.has(t))
  if (isWeak && 'weakness' in template.allocation) return 'weakness'

  if (resolveListeningSubCategory(question) !== null) {
    return 'listening' in template.allocation ? 'listening' : null
  }
  if (question.part === 5) {
    return 'part5' in template.allocation ? 'part5' : null
  }
  return null
}

/**
 * M2: フェーズ配分・リスニング内訳に基づくドリル抽出（13の3.2節）。
 * ①トップレベル配分（vocab/listening/part5/weakness）で slots を分ける
 * ②'listening' 枠はさらに listeningBreakdown[listeningStage] で細分する
 * ③在庫不足の穴は同じ階層内の余りで埋める（配分は目標値であり在庫が優先＝M1と同じ方針）
 */
async function buildPhaseDrivenDrillItems(
  db: BebRaidDatabase,
  questions: readonly Question[],
  excludeIds: ReadonlySet<string>,
  template: CurriculumTemplate,
  listeningStage: ListeningStage,
  slots: number,
  rng: () => number,
): Promise<QuickPackItem[]> {
  const candidates = await buildDrillCandidates(db, questions, excludeIds, (q, weakTags) =>
    resolveM2Category(q, weakTags, template),
  )
  const topCounts = computeAllocationCounts(slots, template.allocation)

  const picked: DrillCandidate[] = []
  const leftover: DrillCandidate[] = []
  for (const topCategory of Object.keys(topCounts)) {
    const pool = candidates.filter((c) => c.category === topCategory)
    const count = topCounts[topCategory] ?? 0
    if (topCategory === 'listening') {
      const subCounts = computeAllocationCounts(
        count,
        template.listeningBreakdown[listeningStage] as Record<string, number>,
      )
      const subPicked: DrillCandidate[] = []
      const subLeftover: DrillCandidate[] = []
      for (const subCategory of Object.keys(subCounts)) {
        const subPool = pool.filter((c) => resolveListeningSubCategory(c.question) === subCategory)
        const selected = weightedSample(subPool, (c) => c.weight, subCounts[subCategory] ?? 0, rng)
        subPicked.push(...selected)
        subLeftover.push(...subPool.filter((c) => !selected.includes(c)))
      }
      const subShortage = count - subPicked.length
      if (subShortage > 0) {
        subPicked.push(...weightedSample(subLeftover, (c) => c.weight, subShortage, rng))
      }
      picked.push(...subPicked)
      leftover.push(...pool.filter((c) => !subPicked.includes(c)))
    } else {
      const selected = weightedSample(pool, (c) => c.weight, count, rng)
      picked.push(...selected)
      leftover.push(...pool.filter((c) => !selected.includes(c)))
    }
  }
  const shortage = slots - picked.length
  if (shortage > 0) {
    picked.push(...weightedSample(leftover, (c) => c.weight, shortage, rng))
  }
  return toDrillItems(picked)
}

/**
 * SRSカードが今回の出題候補プールで実際に出題可能か（対応するQuestionが実在するか）。
 * 語彙カードも question と同様に実在確認する（発見バグ: 以前は refType==='vocab' を
 * 無条件でservable扱いしており、対応する vocab_card が未読込パックにある場合に
 * questionId:null の出題item が生成されDrillScreenが復帰不能になっていた）。
 * VocabScreen の復習キュー構築も同じ理由（語が引けないカードで詰む）でこれを使うため export する
 */
export function isServable(card: SrsCardRecord, questions: readonly Question[]): boolean {
  if (card.refType === 'vocab') {
    return questions.some((q) => q.format === 'vocab_card' && q.front === card.refId)
  }
  return questions.some((q) => q.id === card.refId)
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
  const servableDue = queue.dueReviews.filter((c) => isServable(c, request.questions))
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
  const servableNew = queue.newCards.filter((c) => isServable(c, request.questions))
  for (const card of servableNew.slice(0, newCap)) {
    items.push(srsItem(card, request.questions, { type: 'srsNew' }))
  }

  // ③ 弱点ドリル（固定配分＋重み1.5倍の抽選）。
  // request.phase 指定時は M2 のフェーズ配分・リスニング内訳を使う（13の3.2節）。
  // 未指定なら M1 の quickPackConfig.json 挙動（既存ロジック無改修）にフォールバックする
  remaining = durationConfig.totalItems - items.length
  if (durationConfig.includeDrills && remaining > 0) {
    const excludeIds = new Set(
      items.flatMap((item) => (item.questionId !== null ? [item.questionId] : [])),
    )
    const pickedItems = request.phase
      ? await buildPhaseDrivenDrillItems(
          db,
          request.questions,
          excludeIds,
          templateForSeason(request.phase),
          request.listeningStage ?? 1,
          remaining,
          rng,
        )
      : await buildM1DrillItems(db, request.questions, excludeIds, remaining, rng)
    items.push(...pickedItems)
  }

  return { duration: request.duration, items, srsOverflow }
}
