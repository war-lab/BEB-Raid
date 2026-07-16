// 汎用Fisher-Yatesシャッフル（T-79。dictation.ts/vocabQuiz.tsに重複していた実装をここへ集約）。
// rng省略時はMath.random。決定的な検証が必要なテストではrngに疑似乱数を注入する
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}
