// wpm（words per minute）計測（T-81・J-37）。TTS話速校正（length_scale）の検証に使う。
// ダイアログ形式（Part2等）はターン間にJ-37の無音ギャップが挿入されるため、
// 実測durationMsから無音分を差し引いた「発話部分だけの時間」でwpmを算出しないと、
// 無音の分だけ話速が遅く見積もられてしまう

/** 空白区切りの簡易語数カウント */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * wpmを算出する。gapCount×gapMsを実測durationMsから差し引いた発話時間を分母にする
 * （gapCount省略時は0=単発話。ダイアログはturns数-1件のギャップを渡す）
 */
export function computeWpm(
  wordCount: number,
  durationMs: number,
  gapCount = 0,
  gapMs = 400,
): number {
  const speechMs = durationMs - gapCount * gapMs
  if (speechMs <= 0) return 0
  return wordCount / (speechMs / 60_000)
}

/** wpmが目標レンジ（既定150〜170。J-37）に収まっているか */
export function isWithinWpmRange(wpm: number, min = 150, max = 170): boolean {
  return wpm >= min && wpm <= max
}
