// 語彙SRSカードの多肢選択リコールテスト（docs未記載。ユーザー指摘による設計変更 2026-07-13）。
//
// 従来は「タップで意味を見る」→自己申告（もう一回/OK/余裕）のみで、正誤判定が無く
// 本人の申告任せだった（「本当に問題になっているか」という指摘）。この弱点を解消するため、
// 意味を見る前に4択（正解＋他の語彙カードのbackから選んだダミー3つ）を選ばせ、
// 客観的な正誤をattempts.isCorrectに記録してから、既存の間隔評価（もう一回/OK/余裕。
// SRSのスケジューリング用で、こちらは引き続き自己申告のまま残す）に進む。

import type { Question } from '@beb-raid/shared-schema'

export interface VocabQuizChoice {
  key: string
  text: string
  isCorrect: boolean
}

const CHOICE_KEYS = ['A', 'B', 'C', 'D']

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * 対象語のback（正解）と、他の語彙カードのbackから選んだダミー最大3件で4択を組み立てる。
 * プール不足時は取得できた分だけの選択肢数になる（M1ダミーコンテンツ等、語彙が少ない
 * 場合の保険。正解は必ず含まれるため最低1択にはなる）
 */
export function buildVocabQuizChoices(
  target: Question,
  pool: readonly Question[],
  rng: () => number = Math.random,
): VocabQuizChoice[] {
  const correctBack = target.back ?? ''
  const seenBacks = new Set<string>([correctBack])
  const candidates = shuffle(
    pool.filter((q) => q.format === 'vocab_card' && q.front !== target.front && q.back),
    rng,
  )
  const distractors: string[] = []
  for (const q of candidates) {
    if (distractors.length >= 3) break
    if (seenBacks.has(q.back!)) continue
    seenBacks.add(q.back!)
    distractors.push(q.back!)
  }

  const options = shuffle([correctBack, ...distractors], rng)
  return options.map((text, i) => ({
    key: CHOICE_KEYS[i]!,
    text,
    isCorrect: text === correctBack,
  }))
}
