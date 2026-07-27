// 昼バトル（S8ホスト画面）の出題セット抽選（M4・T-126。正本: docs/22_M4実装計画.md 3.2節・3.6節、
// docs/21_M4タスク分解.md J-65正文）。
// ホスト画面がルーム作成時に、キャッシュ済み配信パックからPart2・Part5の問題を
// 12問（Part2:Part5=6:6）無作為抽選する。在庫不足時はある方で補填する

import type { Question } from '@beb-raid/shared-schema'

import { shuffle } from './shuffle'

/** 出題セットの総数（J-65正文＝docs/22 3.2節） */
export const BATTLE_QUESTION_COUNT = 12
/** Part2・Part5それぞれの目標問数（在庫不足時は他方で補填する） */
export const BATTLE_PART_TARGET = 6

/**
 * questionPoolからPart2:Part5=6:6（計12問）を無作為抽選する。
 * 在庫不足時はある方で補填し、両方合わせても12問に満たない場合はある分だけを返す
 * （T-128のdifficulty>=4の30問抽選と異なり、本抽選には停止条件を設けない=22の6節T-126シート）。
 * rng省略時はMath.random。決定的な検証が必要なテストではrngに疑似乱数を注入する
 */
export function drawBattleQuestionSet(
  pool: readonly Question[],
  rng: () => number = Math.random,
): Question[] {
  const part2 = shuffle(
    pool.filter((q) => q.part === 2),
    rng,
  )
  const part5 = shuffle(
    pool.filter((q) => q.part === 5),
    rng,
  )

  let n2 = Math.min(BATTLE_PART_TARGET, part2.length)
  let n5 = Math.min(BATTLE_PART_TARGET, part5.length)
  let need = BATTLE_QUESTION_COUNT - n2 - n5

  if (need > 0) {
    const extra5 = Math.min(need, part5.length - n5)
    n5 += extra5
    need -= extra5
  }
  if (need > 0) {
    const extra2 = Math.min(need, part2.length - n2)
    n2 += extra2
  }

  return shuffle([...part2.slice(0, n2), ...part5.slice(0, n5)], rng)
}
