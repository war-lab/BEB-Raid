// 出題理由ラベル（T-11。正本: docs/03 3.2「なぜこの問題が出たかを明示する」）。
//
// 学習者に因果が見えると復習の納得感が出る。UI（S2ドリル画面）は
// QuickPackItem.reason をこの関数で文字列化して表示する。

import type { QuickPackReason } from './types'

/** 出題理由 → 表示ラベル */
export function formatQuickPackReason(reason: QuickPackReason): string {
  switch (reason.type) {
    case 'srsDue':
      return '復習: 期限が来たカード'
    case 'srsNew':
      return '新規: 今日の新しいカード'
    case 'keyVocabReview':
      // 類題在庫ゼロの同一問題再出題でもラベルは同じ（isSameQuestion は内部区別）
      return `復習: ${reason.word} を使う問題`
    case 'weakTag':
      return `弱点: ${reason.tag}`
    case 'allocation':
      return '今日のドリル'
  }
}
