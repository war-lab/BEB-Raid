// Part5問題生成（T-28。正本: docs/04 2節・5節、docs/03 7.1節、docs/10 T-27/T-28行）。
//
// 【設計判断（docs未記載。T-25〜T-27と同方針をユーザー指示により踏襲）】ランタイムでLLM APIを
// 呼ぶ実装はしない。問題本文・選択肢・解説・和訳（本来LLMに生成させる部分）はエージェントが
// ./data/part5QuestionsS.ts に直接記述した。各問のkeyVocabはSランク200語（vocabCardsS.ts）
// から選び、T-27と同じく「単語帳で覚える→問題で使う」循環を成立させている。
// 空所記法は"___"に統一（実装指示3。バリデータとの整合）。
// text_blankはaudio不要のためT-31（TTS）への予約パスは存在しない。

import { SCHEMA_VERSION, validatePack, type Question } from '@beb-raid/shared-schema'
import { PART5_ENTRIES_S, type Part5Entry } from './data/part5QuestionsS.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART5_ENTRIES_S }

/** keyVocabWordの和訳（sense）をvocabCardsS.tsから引く（Sランク200語であることの実データ照合） */
function senseForWord(word: string): string {
  const entry = VOCAB_CARDS_S.find((v) => v.word === word)
  if (!entry) {
    throw new Error(`keyVocabWord "${word}" が vocabCardsS.ts（Sランク200語）に見つからない`)
  }
  return entry.back
}

/** エントリ→Question（text_blank）への変換 */
export function part5Question(entry: Part5Entry): Question {
  return {
    id: `part5-${entry.keyVocabWord}`,
    part: 5,
    format: 'text_blank',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [
      { word: entry.keyVocabWord, sense: senseForWord(entry.keyVocabWord), freqRank: 'S' },
    ],
    question: entry.question,
    choices: entry.choices,
    answer: entry.answer,
    explanation: entry.explanation,
    translation: entry.translation,
  }
}

/** エントリ一覧→Question配列 */
export function buildPart5Questions(entries: readonly Part5Entry[] = PART5_ENTRIES_S): Question[] {
  return entries.map(part5Question)
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildPart5Drafts(
  entries: readonly Part5Entry[] = PART5_ENTRIES_S,
): GeneratedItemDraft[] {
  return entries.map((entry) => {
    const question = part5Question(entry)
    return {
      id: question.id,
      kind: 'text_blank',
      preview: `${entry.question} / 正解:${entry.answer}`,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。vocabCard.ts/part2Question.tsと
 * 同様、検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validatePart5Questions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-part5-s',
      title: 'Part5問題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-28 エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}
