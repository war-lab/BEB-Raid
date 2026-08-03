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
      // T-169（docs/27 のS-19）: 類題在庫ゼロで発生元の問題そのものが再出題される場合は
      // ラベルを分ける。従来はどちらも「復習: {word} を使う問題」で、答えを覚えている問題が
      // 「類題」として出てくるように見えていた（同じ問題だと分かれば「またこれか」ではなく
      // 「もう一度確かめる」として受け取れる）。
      // 類題在庫そのものの不足はコンテンツ側の課題で、14の3.4と15が扱う
      return reason.isSameQuestion
        ? `復習: 前回間違えた問題（${reason.word}）`
        : `復習: ${reason.word} を使う問題`
    case 'weakTag':
      return `弱点: ${reason.tag}`
    case 'allocation':
      return '今日のドリル'
  }
}
