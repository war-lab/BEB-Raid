// Part2 音声のみモード（本試験形式）の判定と区間計算（T-154。正本: ADR 0008・docs/02 3.1節）。
//
// 本試験のPart2は3つの応答すべてを音声で読み上げ、受験者は耳で比較する。従来の当アプリは
// 設問だけを音声で流し3応答をテキストで見せていたため、鍛えている能力がリスニングと
// 読解の混成になっていた（docs/14 3.6-3）。音声のみモードは「設問＋応答A＋応答B＋応答C」を
// 連結した音声（T-152で生成）を全長再生し、選択肢は記号だけを表示する。
//
// 既存のテキスト選択肢形式は残してトグルで併存させる（ADR 0008）。そのため
// 「この問題が音声のみモードで出題できるか」を問題単位で判定する必要がある。

import type { Question } from '@beb-raid/shared-schema'

/**
 * この問題が音声のみモードで出題できるか。
 * responseOffsetsMs が選択肢と対応し、値が音声の範囲内に収まっていることまで見る
 * （コンテンツ側はビルド時のバリデータが保証するが、アプリ側でも壊れたデータで
 * 進行不能にならないよう自衛する）。
 */
export function supportsAudioOnlyPart2(question: Question): boolean {
  if (question.format !== 'audio_qa') return false
  if (!question.audio) return false
  const meta = question.audioMeta
  const offsets = meta?.responseOffsetsMs
  if (!meta || !offsets || offsets.length === 0) return false
  if (offsets.length !== (question.choices?.length ?? 0)) return false
  for (let i = 0; i < offsets.length; i++) {
    const value = offsets[i]!
    if (!Number.isInteger(value) || value <= 0) return false
    if (i > 0 && value <= offsets[i - 1]!) return false
  }
  return offsets[offsets.length - 1]! < meta.durationMs
}

/**
 * 指定した選択肢キーの応答区間（解答後の個別リプレイ用）。
 * responseOffsetsMs は choices の key 昇順で並ぶので、キーの昇順位置で引く。
 * 最後の応答の終端は音声の全長。判定できない場合は null（呼び出し側はボタンを出さない）
 */
export function responseSegment(
  question: Question,
  choiceKey: string,
): { startMs: number; durationMs: number } | null {
  if (!supportsAudioOnlyPart2(question)) return null
  const offsets = question.audioMeta!.responseOffsetsMs!
  const sortedKeys = [...(question.choices ?? [])]
    .map((c) => c.key)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const index = sortedKeys.indexOf(choiceKey)
  if (index < 0) return null
  const startMs = offsets[index]!
  const endMs = offsets[index + 1] ?? question.audioMeta!.durationMs
  return { startMs, durationMs: endMs - startMs }
}

/**
 * 音声のみモードで表示する選択肢の並び（key 昇順）。
 * 表示順のランタイムシャッフル（T-79・J-36）は使えない: 読み上げ順が key 昇順で
 * 音声に焼き込まれているため、表示順を混ぜると記号と音声が食い違う。
 * 丸暗記対策はコンテンツ側の決定的ローテーション（rotatePart2Choices）が担っている
 */
export function audioOnlyChoiceOrder(question: Question): Question['choices'] {
  return [...(question.choices ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
