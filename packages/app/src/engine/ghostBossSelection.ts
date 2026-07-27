// ボス役セッションの出題抽選（M4・T-128。正本: docs/22 3.5節、docs/21 T-128行）。
//
// レート対象のformatのみ（vocab_card・shadowing・dictationは除外）から、
// difficulty>=4を30問無作為抽選する。在庫が30問に満たない場合はdifficulty===3を
// 許容して補填し、それでも10問未満なら在庫不足として null を返す
// （呼び出し側=RaidScreenは在庫増産が必要な人間判断事項としてUIに案内を出す。
// 条件を勝手に緩めて水増ししない）。

import type { Question, QuestionFormat } from '@beb-raid/shared-schema'
import { shuffle } from './shuffle'

/** 1回のボス役セッションの出題数（3.5節の確定値） */
export const GHOST_BOSS_QUESTION_COUNT = 30

/** difficulty>=3まで許容してもこれ未満なら在庫不足として停止する（3.5節の停止条件） */
export const GHOST_BOSS_MIN_INVENTORY = 10

/** レート対象のformat（vocab_card・shadowing・dictationは除外=3.5節） */
const GHOST_BOSS_ELIGIBLE_FORMATS: ReadonlySet<QuestionFormat> = new Set([
  'audio_qa',
  'audio_photo',
  'audio_set',
  'text_blank',
  'text_passage',
])

export interface GhostBossSelectionResult {
  /** 抽選された問題（無作為抽出済み。最大GHOST_BOSS_QUESTION_COUNT件） */
  questions: Question[]
  /** difficulty===3の問題で補填したか（在庫不足の目安表示に使う） */
  backfilled: boolean
}

/**
 * ボス役セッションの出題を抽選する。
 * 在庫不足（difficulty>=3まで許容してもGHOST_BOSS_MIN_INVENTORY未満）の場合はnullを返す
 */
export function selectGhostBossQuestions(
  pool: readonly Question[],
  rng: () => number = Math.random,
): GhostBossSelectionResult | null {
  const eligible = pool.filter((q) => GHOST_BOSS_ELIGIBLE_FORMATS.has(q.format))
  const tierHigh = eligible.filter((q) => q.difficulty >= 4)
  const tierThree = eligible.filter((q) => q.difficulty === 3)

  if (tierHigh.length >= GHOST_BOSS_QUESTION_COUNT) {
    return {
      questions: shuffle(tierHigh, rng).slice(0, GHOST_BOSS_QUESTION_COUNT),
      backfilled: false,
    }
  }

  const shuffledThree = shuffle(tierThree, rng)
  const needed = GHOST_BOSS_QUESTION_COUNT - tierHigh.length
  const combined = [...tierHigh, ...shuffledThree.slice(0, needed)]

  if (combined.length < GHOST_BOSS_MIN_INVENTORY) return null

  return { questions: shuffle(combined, rng), backfilled: tierHigh.length < combined.length }
}
