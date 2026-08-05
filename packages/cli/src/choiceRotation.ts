// 選択肢ローテーションの共通ヘルパー（T-266。正本: docs/30_改修計画_全量レビュー棚卸し.md 17節）。
//
// rotatePart5Choices（part5Question.ts）・rotateSubQuestionChoices（part34Question.ts）・
// rotatePart2Choices（part2Question.ts）は、いずれも「correctTextを配列0番目、distractorsを
// それに続ける」という共通の前提を持ち、これまでは呼び出し側が渡す配列内の連番（index）を
// そのままローテーション量として使っていた（index%N）。
//
// 連番をそのまま使うと、rawエントリの並び順が変わらない限り、正答キーが
// A→D→C→B→A→...のような一定差分の決定的循環になる（29のQ-79・T-237で既存パックを
// 手動シャッフルする対処をした根本原因。contentLint.tsのcheckAnswerKeyCycle/
// checkFlatAnswerKeyCycleが検出する構造欠陥そのもの）。
//
// 対策として、ローテーション量をエントリ固有の安定な文字列（keyVocabWord等。呼び出し側が
// 「そのエントリだけが持つ値」を渡す）のハッシュから導出する。配列内の位置に依存しないため、
// rawエントリの追加・並べ替えをしても既存エントリの結果が変わらず、かつエントリ間の値が
// 事実上ランダムに分散するため一定差分の循環が生じない。
// アルゴリズムはpackages/cli/scripts/shuffle-cyclic-choices.mjsのFNV-1a（文字列→32bit
// ハッシュ）と同じものを流用し、両者の「決定的だが分散する」という設計思想を揃える。

/** FNV-1a 32bitハッシュ（shuffle-cyclic-choices.mjsと同じ実装） */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/**
 * 安定なシード文字列からローテーション量（0〜modulus-1）を導出する。
 * 呼び出し側の配列内位置（index）に依存しないため、rawエントリの追加・並べ替えが
 * 既存エントリの正答位置に影響しない
 */
export function rotationAmount(seedKey: string, modulus: number): number {
  return fnv1a(seedKey) % modulus
}
