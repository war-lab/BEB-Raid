// ゴーストボスの弱点可視化（M4・T-129。正本: docs/22 3.4節、docs/02 5.3節、docs/03 6.3節）。
//
// 挑戦前に見せてよいのはPart・タグ単位の集計のみ（例:「弱点: Part5 前置詞 ×2.0が3問」）で、
// 個別questionIdは事前に開示しない（正答の狙い撃ちを防ぐ）。このため「堅い」（multiplier<=1）は
// 集計対象外とする（弱点マップは攻略の手がかりであり、堅い問題を先に教える必要は無い＝3.4節の
// 例示も弱点のみ）。1問が複数タグを持つ場合はタグごとに1件としてカウントする
// （tagStats.tsの弱点集計と同じ「タグ単位の独立カウント」の考え方）
import type { GhostDefenseEntry, Question } from '@beb-raid/shared-schema'
import { withSubQuestionLookup } from './subQuestionLookup'
import type { QuestionLookup } from './types'

export interface GhostWeaknessMapEntry {
  part: number
  tag: string
  /** 倍率。3.3節の確定値により常に2.0（弱点）のみが対象 */
  multiplier: number
  count: number
}

/**
 * defense配列（questionId別倍率）から、Part・タグ単位の弱点集計を作る。
 * lookupに解決できないquestionId（パック未取得等）は黙ってスキップする
 * （S5の弱点マップは補助情報であり、欠落でセッション進行を止める必要は無い）
 */
export function buildGhostWeaknessMap(
  defense: readonly GhostDefenseEntry[] | null | undefined,
  lookup: QuestionLookup,
): GhostWeaknessMapEntry[] {
  if (!defense) return []
  const counts = new Map<string, GhostWeaknessMapEntry>()
  for (const entry of defense) {
    // 3.3節: 弱点=2.0・堅い=0.5の2値のみ。挑戦前に開示するのは弱点のみ
    if (entry.multiplier <= 1) continue
    const question = lookup.get(entry.questionId)
    if (!question) continue
    for (const tag of question.tags) {
      const key = `${question.part}:${tag}:${entry.multiplier}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { part: question.part, tag, multiplier: entry.multiplier, count: 1 })
      }
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)
}

/**
 * 全問題プール（audio_set・text_passageのサブ設問を含む）からQuestionLookupを組み立てる。
 * S5はセッション中の1問だけのlookupではなく、defenseに含まれる任意のquestionId
 * （ゴーストボス役が解いた30問。audio_set/text_passageはサブ設問id）を解決する必要があるため、
 * questionPool全件にwithSubQuestionLookup（DrillScreen/ReadingScreenと同じユーティリティ）を
 * 適用して組み立てる
 */
export function buildFullQuestionLookup(pool: readonly Question[]): QuestionLookup {
  let lookup: QuestionLookup = new Map(pool.map((q) => [q.id, q]))
  for (const q of pool) {
    if (q.subQuestions && q.subQuestions.length > 0) {
      lookup = withSubQuestionLookup(q, lookup)
    }
  }
  return lookup
}
