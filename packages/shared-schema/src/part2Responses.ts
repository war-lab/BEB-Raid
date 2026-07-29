// Part2（audio_qa）の応答音声と選択肢の対応を守るためのダイジェスト（T-151。正本: docs/04 2節）。
//
// 音声のみモードでは「設問＋応答A＋応答B＋応答C」を1ファイルに連結し、各応答の開始msを
// audioMeta.responseOffsetsMs に持つ。読み上げ順は choices の key 昇順で焼き込まれるため、
// TTS後に選択肢のテキストを編集・並び替えすると音声と key の対応が崩れ、answer が実質
// 誤りになる（音声では B が正答なのに answer が A のまま等）。これは画面上は正常に見える
// 無音の正誤バグなので、生成時のダイジェストを持たせてビルド時に照合する。
//
// app（ブラウザ）・cli（Node）・review-ui が同一実装を使う必要があるため、node:crypto は
// 使わず依存ゼロの FNV-1a 32bit で実装する（暗号強度は要件ではない。人手編集の検出が目的）。

import type { Choice } from './types.js'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193

// 区切りは本文に出現しない制御文字を使う。空白区切りにすると
// key="A"/text="B x" と key="A B"/text="x" が同じ入力列になってしまう。
/** key と text の区切り（U+0000） */
const FIELD_SEPARATOR = String.fromCharCode(0)
/** 選択肢どうしの区切り（U+0001） */
const RECORD_SEPARATOR = String.fromCharCode(1)

/** UTF-16コードユニット列に対する FNV-1a 32bit。戻り値は8桁の小文字hex */
function fnv1a32(input: string): string {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // Math.imul で32bit幅の乗算に収める（* では倍精度に逃げて桁落ちする）
    hash = Math.imul(hash, FNV_PRIME)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Part2 の選択肢（key+text）のダイジェスト。
 * key 昇順に正規化するので choices の配列順を入れ替えても値は変わらない
 * （表示順のランタイムシャッフル＝T-79 とは独立させるため）。
 * key・text のいずれかが変わると値が変わる。
 */
export function part2ResponsesDigest(choices: readonly Choice[]): string {
  const normalized = [...choices]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((c) => `${c.key}${FIELD_SEPARATOR}${c.text}`)
    .join(RECORD_SEPARATOR)
  return fnv1a32(normalized)
}
