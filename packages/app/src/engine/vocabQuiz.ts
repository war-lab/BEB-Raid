// 語彙SRSカードの多肢選択リコールテスト（docs未記載。ユーザー指摘による設計変更 2026-07-13）。
//
// 従来は「タップで意味を見る」→自己申告（もう一回/OK/余裕）のみで、正誤判定が無く
// 本人の申告任せだった（「本当に問題になっているか」という指摘）。この弱点を解消するため、
// 意味を見る前に4択（正解＋他の語彙カードのbackから選んだダミー3つ）を選ばせ、
// 客観的な正誤をattempts.isCorrectに記録してから、既存の間隔評価（もう一回/OK/余裕。
// SRSのスケジューリング用で、こちらは引き続き自己申告のまま残す）に進む。
//
// 【ダミーの同質化 2026-07-29】ダミーを全語彙プールから無条件ランダムに選ぶと、対象語と
// 難易度帯・頻出度がかけ離れた語が並び、意味を知らなくても消去法で当たる（例: 860帯の
// ビジネス語に対して600帯の基本語が3つ並ぶ）。正答率が実力を過大評価するため、
// 同じ freqRank・levelBand の語を優先して選ぶ階層（tier）を入れた。

import type { Question } from '@beb-raid/shared-schema'
import { shuffle } from './shuffle'

export interface VocabQuizChoice {
  key: string
  text: string
  isCorrect: boolean
}

const CHOICE_KEYS = ['A', 'B', 'C', 'D']

/**
 * ダミー候補を同質性の高い順にグループ化する。
 *
 * tier 0: freqRank も levelBand も一致（最も同質）
 * tier 1: levelBand が一致（freqRank は違う）
 * tier 2: levelBand が異なる。差の小さい帯から順に（差ごとに別グループ）
 * tier 3: levelBand が引けない（対象語・候補のいずれかが未設定）＝同質性を判定できない
 *
 * 上位 tier が薄ければ自然に下位へ落ちるので、候補が少ないパック構成でも4択は埋まる。
 *
 * なお実運用の語彙パックは1パック内で (freqRank, levelBand) が一様なので、tier 0 は
 * 実質「同じパックの語」になる（pack id は Question に無く、取るには pack 読み込みから
 * sessionStore までの配線が波及するため、この2フィールドで代替している）。将来パックが
 * 難易度帯を混在させた場合、tier 0 の粒度は変わるがフォールバックがあるので壊れない。
 */
function groupCandidatesByTier(target: Question, candidates: readonly Question[]): Question[][] {
  const targetBand = typeof target.levelBand === 'number' ? target.levelBand : null
  const targetRank = target.freqRank ?? null

  const sameRankAndBand: Question[] = []
  const sameBand: Question[] = []
  /** levelBand の差 → 候補 */
  const byBandDistance = new Map<number, Question[]>()
  const unknownBand: Question[] = []

  for (const q of candidates) {
    const band = typeof q.levelBand === 'number' ? q.levelBand : null
    if (targetBand === null || band === null) {
      unknownBand.push(q)
      continue
    }
    if (band === targetBand) {
      if (targetRank !== null && q.freqRank === targetRank) sameRankAndBand.push(q)
      else sameBand.push(q)
      continue
    }
    const distance = Math.abs(band - targetBand)
    const bucket = byBandDistance.get(distance)
    if (bucket) bucket.push(q)
    else byBandDistance.set(distance, [q])
  }

  const nearBands = [...byBandDistance.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group)

  return [sameRankAndBand, sameBand, ...nearBands, unknownBand].filter((g) => g.length > 0)
}

/**
 * 対象語のback（正解）と、他の語彙カードのbackから選んだダミー最大3件で4択を組み立てる。
 * ダミーは同質性の高いグループから順に取る（groupCandidatesByTier 参照）。
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
  const candidates = pool.filter(
    (q) => q.format === 'vocab_card' && q.front !== target.front && q.back,
  )
  const distractors: string[] = []
  // グループ内はシャッフルするが、グループ間の順序（同質性）は保つ
  for (const group of groupCandidatesByTier(target, candidates)) {
    if (distractors.length >= 3) break
    for (const q of shuffle(group, rng)) {
      if (distractors.length >= 3) break
      if (seenBacks.has(q.back!)) continue
      seenBacks.add(q.back!)
      distractors.push(q.back!)
    }
  }

  const options = shuffle([correctBack, ...distractors], rng)
  return options.map((text, i) => ({
    key: CHOICE_KEYS[i]!,
    text,
    isCorrect: text === correctBack,
  }))
}
