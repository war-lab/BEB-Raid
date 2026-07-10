// イヤホンなしモード（T-23。正本: docs/02 2.2節、docs/10 T-23行）。
// 「音を出せない環境への対応: リスニング問題はイヤホン前提だが、イヤホンなし時は
// 自動でリーディング系パックに差し替える」を、generateQuickPack（T-13。C-4契約）
// 自体は変更せず、生成後のフィルタ＋再充填として実装する。
//
// SRS由来item（srsQuestion/srsVocab。特定のカードの復習そのもの）は対象外とし、
// 固定配分ドリル（kind:'drill'）の中のリスニング問題のみ差し替える
// （復習は「そのカードを復習した」記録の同一性が本質のため、別問題への差し替えは不可）。

import type { Question } from '@beb-raid/shared-schema'
import type { QuickPack, QuickPackItem } from './types'

const LISTENING_FORMATS = new Set(['audio_qa', 'audio_photo', 'audio_set'])

function isListening(question: Question | undefined): boolean {
  return question !== undefined && LISTENING_FORMATS.has(question.format)
}

/**
 * kind:'drill' のリスニング問題を、パックに未使用のリーディング系問題（text_blank/text_passage）
 * に差し替える。代替候補が尽きた場合はそのitemを取り除く（パックが目減りするが、
 * M1ダミーコンテンツはリーディング問題の在庫が少ないため起こりうる既知の制約）
 */
export function applyNoEarphoneFilter(
  pack: QuickPack,
  questions: ReadonlyMap<string, Question>,
): QuickPack {
  const usedIds = new Set(
    pack.items.flatMap((item) => (item.questionId !== null ? [item.questionId] : [])),
  )
  const readingPool = [...questions.values()].filter(
    (q) => (q.format === 'text_blank' || q.format === 'text_passage') && !usedIds.has(q.id),
  )

  const items: QuickPackItem[] = []
  for (const item of pack.items) {
    const question = item.questionId !== null ? questions.get(item.questionId) : undefined
    if (item.kind === 'drill' && isListening(question)) {
      const replacement = readingPool.shift()
      if (!replacement) continue
      usedIds.add(replacement.id)
      items.push({ ...item, questionId: replacement.id })
      continue
    }
    items.push(item)
  }
  return { ...pack, items }
}
