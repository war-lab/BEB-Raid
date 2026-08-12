// 語彙カード生成（T-26。正本: docs/04 2節(vocab_card)、docs/02 4節、docs/10 T-26行）。
//
// 【設計判断（docs未記載。T-25と同方針をユーザー指示により踏襲）】ランタイムでLLM APIを
// 呼ぶ実装はしない。フレーズ・和訳の作成（本来LLMに生成させる部分）はエージェントが
// このファイルのデータ（./data/vocabCardsS.ts）として直接記述した。
// 「既存教材のフレーズを再現しない・一般的なコロケーションで自作する」制約（実装指示2）は、
// 金のフレーズ等の市販教材を一切参照せず、TOEICのビジネスシーン（会議・経理・人事・
// 物流・IT等）で自然に使われる一般的な用例文として新規に書き下ろすことで満たした。
// phraseAudio は T-31（TTS）で実音声に差し替えるまでの予約パス（`audio/vocab/<word>.mp3`）。

import { SCHEMA_VERSION, validatePack, type FreqRank, type Question } from '@beb-raid/shared-schema'
import { VOCAB_CARDS_S, type VocabCardEntry } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { VOCAB_CARDS_S }

/** M1初期コンテンツの目標スコア帯（03の4節: P1ユーザーはSランク×600帯から） */
export const VOCAB_CARD_LEVEL_BAND = 600

/** freqRank→levelBandの対応（J-22。M2・T-59でA/B追加） */
export const LEVEL_BAND_FOR_RANK: Record<FreqRank, number> = {
  S: 600,
  A: 730,
  B: 860,
  C: 990,
}

/**
 * freqRank→difficultyの対応（T-345・K-86）。従来は語彙カード全650枚がdifficulty:1固定で、
 * S（易）とB（難）の実際のレベル差を反映していなかった。levelBandの並びと同じ順序で
 * 1〜5の中間帯に割り当てる
 */
export const DIFFICULTY_FOR_RANK: Record<FreqRank, number> = {
  S: 2,
  A: 3,
  B: 4,
  C: 5,
}

/** 語彙カードのphraseAudio予約パス規約（T-31で実ファイルに差し替える） */
export function reservedPhraseAudioPath(word: string): string {
  return `audio/vocab/${word}.mp3`
}

/** 語彙エントリ→Question（vocab_card）への変換（freqRank省略時はSランク600帯=既存動作を維持） */
export function vocabCardQuestion(
  entry: VocabCardEntry,
  freqRank: FreqRank = 'S',
  levelBand: number = LEVEL_BAND_FOR_RANK[freqRank],
): Question {
  return {
    id: `vocab-${entry.word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: DIFFICULTY_FOR_RANK[freqRank],
    tags: entry.tags,
    keyVocab: [],
    front: entry.word,
    phrase: entry.phrase,
    phraseAudio: reservedPhraseAudioPath(entry.word),
    back: entry.back,
    freqRank,
    levelBand,
  }
}

/** 語彙エントリ一覧→Question配列 */
export function buildVocabCardQuestions(
  entries: readonly VocabCardEntry[] = VOCAB_CARDS_S,
  freqRank: FreqRank = 'S',
  levelBand: number = LEVEL_BAND_FOR_RANK[freqRank],
): Question[] {
  return entries.map((entry) => vocabCardQuestion(entry, freqRank, levelBand))
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildVocabCardDrafts(
  entries: readonly VocabCardEntry[] = VOCAB_CARDS_S,
  freqRank: FreqRank = 'S',
  levelBand: number = LEVEL_BAND_FOR_RANK[freqRank],
): GeneratedItemDraft[] {
  return entries.map((entry) => {
    const question = vocabCardQuestion(entry, freqRank, levelBand)
    return {
      id: question.id,
      kind: 'vocab_card',
      preview: `${entry.word} / ${entry.back} — ${entry.phrase}`,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。
 * validatePackはpack単位のAPIのため、検証専用の仮パック外枠（license/origin等は
 * ダミー値）で包む。実配布パックのpackメタデータ組み立てはT-32（build）の責務
 */
export function validateVocabCardQuestions(
  questions: Question[],
  levelBand: number = VOCAB_CARD_LEVEL_BAND,
): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-vocab',
      title: '語彙カード ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [levelBand, levelBand],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}

/**
 * 用例文の文型が語だけ置換した単調な重複になっていないかを機械検証する（M2・T-59）。
 * 対象語を{}に置換した文字列（文型スケルトン）が完全一致する場合を「単調な重複」とみなす
 */
export function validatePhraseVariety(entries: readonly VocabCardEntry[]): string[] {
  const bySkeleton = new Map<string, string[]>()
  for (const entry of entries) {
    const escaped = entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const skeleton = entry.phrase.toLowerCase().replace(new RegExp(escaped, 'gi'), '{}')
    const words = bySkeleton.get(skeleton) ?? []
    words.push(entry.word)
    bySkeleton.set(skeleton, words)
  }
  const problems: string[] = []
  for (const [skeleton, words] of bySkeleton) {
    if (words.length > 1) {
      problems.push(`同一の文型（対象語だけ置換）が重複: ${words.join(', ')} → "${skeleton}"`)
    }
  }
  return problems
}
