// 汎用Fisher-Yatesシャッフル（T-79。dictation.ts/vocabQuiz.tsに重複していた実装をここへ集約）。
// rng省略時はMath.random。決定的な検証が必要なテストではrngに疑似乱数を注入する
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    // T-312（K-43）: rng()===1（不正なrng実装。Math.random自体は1を返さない）だと
    // j=i+1で範囲外になり、arr[j]がundefinedで配列が壊れる。有効範囲[0,i]にクランプする
    const j = Math.min(Math.floor(rng() * (i + 1)), i)
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}
