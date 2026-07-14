// シャドーイングのカラオケハイライト・区間リピート補助関数（T-48。正本: docs/13 3.5節）。
// UIコンポーネント（KaraokeScript）・画面（ShadowingScreen）の双方から使う純粋関数のみを置く。

/** 区間リピート（文単位）1件分。startMs/durationMsはそのままPlayOptionsに渡せる形にする */
export interface ShadowingSentence {
  text: string
  startMs: number
  durationMs: number
}

const SENTENCE_END_RE = /[.?!]$/

/** timing が無い場合の文開始msフォールバック（語数の比率でdurationMsを按分。文単位ハイライトへの縮退=3.5節） */
function estimateStartByWordCount(
  wordIndex: number,
  totalWords: number,
  durationMs: number,
): number {
  return totalWords === 0 ? 0 : Math.round((wordIndex / totalWords) * durationMs)
}

/**
 * script を文境界（. ? !）で分割し、各文の開始ms・長さmsを算出する（3.5節: 区間リピート）。
 * timing があれば単語開始msから取得、無ければ語数比でdurationMsを按分した近似値を使う。
 */
export function buildShadowingSentences(
  script: string,
  timing: number[] | null,
  durationMs: number,
): ShadowingSentence[] {
  const words = script.split(/\s+/).filter((w) => w.length > 0)
  if (words.length === 0) return []

  const startMsOf = (wordIndex: number): number =>
    timing
      ? (timing[wordIndex] ?? durationMs)
      : estimateStartByWordCount(wordIndex, words.length, durationMs)

  const sentences: ShadowingSentence[] = []
  let start = 0
  for (let i = 0; i < words.length; i++) {
    const isLastWord = i === words.length - 1
    if (!SENTENCE_END_RE.test(words[i]!) && !isLastWord) continue

    const text = words.slice(start, i + 1).join(' ')
    const startMs = startMsOf(start)
    const nextStartWordIdx = i + 1
    const endMs = nextStartWordIdx < words.length ? startMsOf(nextStartWordIdx) : durationMs
    sentences.push({ text, startMs, durationMs: Math.max(endMs - startMs, 0) })
    start = i + 1
  }
  return sentences
}

/** timingと現在位置(ms)から、現在発話中の単語indexを返す（無ければnull。カラオケハイライトの核） */
export function currentWordIndex(timing: number[] | null, positionMs: number): number | null {
  if (!timing || timing.length === 0) return null
  let idx = 0
  for (let i = 0; i < timing.length; i++) {
    if (timing[i]! <= positionMs) idx = i
    else break
  }
  return idx
}

/** 文一覧と現在位置(ms)から、現在発話中の文indexを返す（timing無し=文単位ハイライトへの縮退用） */
export function currentSentenceIndex(
  sentences: ShadowingSentence[],
  positionMs: number,
): number | null {
  if (sentences.length === 0) return null
  let idx = 0
  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i]!.startMs <= positionMs) idx = i
    else break
  }
  return idx
}
