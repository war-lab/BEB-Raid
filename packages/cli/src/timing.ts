// シャドーイング用 timing（単語開始ms配列）の推定生成（T-46。正本: docs/13 3.5節、docs/04 2節）。
//
// 【B-4検証結果（2026-07-14）】手元にPiperバイナリ未導入のためCLIヘルプは未実機確認。
// ただしPiper後継（OHF-Voice/piper1-gpl v1.4.2）のCLI/Python API公式ドキュメント（GitHub）を
// 確認した限り、単語/音素レベルのタイムスタンプを出力する手段は無い。pip extrasに
// "alignment"（onnx>=1,<2のみを追加インストール）が存在するが、これは学習時の
// モノトニックアライメント探索（MAS）用の依存であり、合成時に呼び出し側へタイミングを
// 返すAPIではない。したがって3.5節の前提（Piperは単語タイムスタンプを出力しない）は
// 正しく、本ファイルの推定方式をtimingの正とする。

/** 単語ごとの推定重みに加える固定オーバーヘッド（子音・語頭準備等、母音数だけでは捉えない時間） */
const SYLLABLE_OVERHEAD = 0.5

/** 文末句読点（. ? !）で終わる単語に加算する一時停止分の重み */
const PAUSE_WEIGHT = 1.5

const SENTENCE_END_RE = /[.?!]$/

/** 母音クラスタ数（音節数の近似）。連続する母音字を1音節とみなす */
function vowelClusterCount(word: string): number {
  const clusters = word.toLowerCase().match(/[aeiouy]+/g)
  return clusters ? clusters.length : 0
}

function wordWeight(word: string): number {
  const syllables = Math.max(vowelClusterCount(word), 1)
  const weight = syllables + SYLLABLE_OVERHEAD
  return SENTENCE_END_RE.test(word) ? weight + PAUSE_WEIGHT : weight
}

/** 検証条件（単調増加・先頭0付近・末尾≦duration）を満たさない場合は例外にする（3.5節の自己チェック） */
function assertValidTimings(timings: number[], durationMs: number): void {
  if (timings.length === 0) return
  if (timings[0]! < 0 || timings[0]! > durationMs * 0.1) {
    throw new Error(`timingの先頭が0付近ではない: ${timings[0]}`)
  }
  for (let i = 1; i < timings.length; i++) {
    if (timings[i]! < timings[i - 1]!) {
      throw new Error(`timingが単調増加ではない: [${timings.join(', ')}]`)
    }
  }
  const last = timings[timings.length - 1]!
  if (last > durationMs) {
    throw new Error(`timingの末尾がdurationMsを超えている: ${last} > ${durationMs}`)
  }
}

/**
 * script（空白区切りの単語列）と実測durationMsから、単語ごとの開始ms配列を推定する。
 * 重み按分方式: 音節数近似＋固定オーバーヘッドを単語の重みとし、文末句読点の単語には
 * 一時停止分を加算したうえで、durationMsを重み比で按分する（3.5節）。
 * 戻り値の要素数は script をトークナイズした語数と一致する（validate.tsのtokenizeScriptと
 * 同じ空白区切り。バリデータの要素数一致チェックに合わせるため句読点の除去はしない）。
 */
export function estimateWordTimings(script: string, durationMs: number): number[] {
  const words = script.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return []

  const weights = words.map(wordWeight)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)

  const timings: number[] = []
  let cumulative = 0
  for (const weight of weights) {
    timings.push(Math.round((cumulative / totalWeight) * durationMs))
    cumulative += weight
  }

  assertValidTimings(timings, durationMs)
  return timings
}
