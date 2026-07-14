// audio_set（Part3/4）のセット正解判定（M2・T-49。正本: docs/13 3.6節）。
// 「セット正解」= 同一セットで2/3問以上正解。criteriaJsonのsetAccuracy判定
// （engine/curriculum.ts）はDB上のattemptsから同じ基準で再集計するが、
// こちらはセッション進行中にリアルタイムで判定するための軽量版

import type { SetResult } from './types'

export function computeSetResult(setId: string, correctness: readonly boolean[]): SetResult {
  const totalQuestions = correctness.length
  const correctCount = correctness.filter(Boolean).length
  return {
    setId,
    totalQuestions,
    correctCount,
    isSetCorrect: totalQuestions > 0 && correctCount / totalQuestions >= 2 / 3,
  }
}
