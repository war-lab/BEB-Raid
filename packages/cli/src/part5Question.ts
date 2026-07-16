// Part5問題生成（T-28。正本: docs/04 2節・5節、docs/03 7.1節、docs/10 T-27/T-28行）。
//
// 【設計判断（docs未記載。T-25〜T-27と同方針をユーザー指示により踏襲）】ランタイムでLLM APIを
// 呼ぶ実装はしない。問題本文・選択肢・解説・和訳（本来LLMに生成させる部分）はエージェントが
// ./data/part5QuestionsS.ts に直接記述した。各問のkeyVocabはSランク200語（vocabCardsS.ts）
// から選び、T-27と同じく「単語帳で覚える→問題で使う」循環を成立させている。
// 空所記法は"___"に統一（実装指示3。バリデータとの整合）。
// text_blankはaudio不要のためT-31（TTS）への予約パスは存在しない。
// 【M2・T-61追記】追加100問（part5QuestionsS2.ts）はS/A/B語彙カード（600語）横断でkeyVocabを
// 解決し（vocabEntryForWord。part2Question.tsのT-60実装と同方式）、正答キーはrotatePart5Choices
// による決定的ローテーション（4択A〜D・index%4）で分散する（M1レビュー⑦の方式）。

import { SCHEMA_VERSION, validatePack, type FreqRank, type Question } from '@beb-raid/shared-schema'
import { PART5_ENTRIES_S, type Part5Entry } from './data/part5QuestionsS.js'
import { PART5_ENTRIES_S2_RAW, type Part5RawEntry } from './data/part5QuestionsS2.js'
import { PART5_ENTRIES_S3_RAW } from './data/part5QuestionsS3.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART5_ENTRIES_S, PART5_ENTRIES_S2_RAW, PART5_ENTRIES_S3_RAW }

/**
 * keyVocabWordの和訳（sense）とfreqRankをS/A/B語彙カード（600語）から引く
 * （M2・T-61でA/B語彙も対象に拡大。part2Question.tsのvocabEntryForWordと同方式）
 */
function vocabEntryForWord(word: string): { sense: string; freqRank: FreqRank } {
  const s = VOCAB_CARDS_S.find((v) => v.word === word)
  if (s) return { sense: s.back, freqRank: 'S' }
  const a = VOCAB_CARDS_A.find((v) => v.word === word)
  if (a) return { sense: a.back, freqRank: 'A' }
  const b = VOCAB_CARDS_B.find((v) => v.word === word)
  if (b) return { sense: b.back, freqRank: 'B' }
  throw new Error(`keyVocabWord "${word}" がS/A/B語彙カード（600語）に見つからない`)
}

/** エントリ→Question（text_blank）への変換 */
export function part5Question(entry: Part5Entry): Question {
  const { sense, freqRank } = vocabEntryForWord(entry.keyVocabWord)
  return {
    id: `part5-${entry.keyVocabWord}`,
    part: 5,
    format: 'text_blank',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [{ word: entry.keyVocabWord, sense, freqRank }],
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
 * 正答キーの決定的ローテーション分散（M1レビュー⑦の方式。M2・T-61）。
 * rawエントリは常に correctText を「正解」・distractors を「誤答3件」として書き、
 * index%4の回転で選択肢の並び順・正答キーを機械的に決める（part2Question.tsの
 * rotatePart2Choicesと同方式。4択A〜D）
 */
export function rotatePart5Choices(
  raw: Part5RawEntry,
  index: number,
): Pick<Part5Entry, 'choices' | 'answer'> {
  const texts = [raw.correctText, raw.distractors[0], raw.distractors[1], raw.distractors[2]]
  const rotation = index % 4
  const rotatedTexts = [...texts.slice(rotation), ...texts.slice(0, rotation)]
  const keys = ['A', 'B', 'C', 'D']
  const choices = rotatedTexts.map((text, i) => ({ key: keys[i]!, text }))
  const answer = keys[rotatedTexts.indexOf(raw.correctText)]!
  return { choices, answer }
}

/** rawエントリ（correctText/distractors形式）→Part5Entry（choices/answer確定済み）への変換 */
export function part5EntryFromRaw(raw: Part5RawEntry, index: number): Part5Entry {
  const { choices, answer } = rotatePart5Choices(raw, index)
  return {
    keyVocabWord: raw.keyVocabWord,
    tags: raw.tags,
    question: raw.question,
    choices,
    answer,
    explanation: raw.explanation,
    translation: raw.translation,
    difficulty: raw.difficulty,
  }
}

/** Part5追加分（M2・T-61・S2）100問をPart5Entry形式に組み立てる */
export function buildPart5EntriesS2(
  raw: readonly Part5RawEntry[] = PART5_ENTRIES_S2_RAW,
): Part5Entry[] {
  return raw.map((r, i) => part5EntryFromRaw(r, i))
}

/** Part5追加分（T-85・d4帯・S3）50問をPart5Entry形式に組み立てる */
export function buildPart5EntriesS3(
  raw: readonly Part5RawEntry[] = PART5_ENTRIES_S3_RAW,
): Part5Entry[] {
  return raw.map((r, i) => part5EntryFromRaw(r, i))
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
