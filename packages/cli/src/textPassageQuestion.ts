// 読解（text_passage: Part6・Part7単一）問題生成（T-107。正本: docs/24 3.1節・3.6節、ADR 0006）。
//
// Part6は1パッセージ＋空所マーカー[[1]]〜[[4]]4個＋設問4問（grammar/vocab/connector/insertion）。
// Part7単一は1パッセージ＋設問2〜4問（読解の内容一致・語彙推測・推論等）。いずれも
// audio_set（part34Question.ts）と同じ「rawエントリのcorrectText/distractors→4択A〜Dへの
// 決定的ローテーション」方式（M1レビュー⑦）。keyVocabの和訳・freqRankはS/A/B語彙カード
// （600語）から解決する（vocabEntryForWord。part2Question.ts等と同方式）。
//
// 【人手レビューゲート（ADR 0006 判断5・docs/24 3.6節）】本モジュールが生成したドラフトは
// 必ず beb review-export → 人手レビュー（TSV） → review-import を経て初めて build.ts の
// PACK_DEFINITIONS へ追加してよい。生成したてのドラフトをそのまま PACK_DEFINITIONS に入れて
// manifest に載せてはならない（既存パックの一部に残る「AIクロスレビューのみで配信」の運用は
// 読解では踏襲しない。T-107時点ではPACK_DEFINITIONS未追加＝配信対象外。docs/STATUS.md参照）。
//
// 「Part7の参照整合（複数パッセージで参照先が実在するか）」（docs/24 3.6節）はPart7複数
// パッセージ（T-109・R-2フェーズ）専用のチェックで、本モジュールが扱うPart7単一には
// 参照先パッセージが存在しないため対象外（validatePassages/validatePart6Markersが
// 単一パッセージの整合はshared-schema側で検証済み）。

import {
  SCHEMA_VERSION,
  validatePack,
  type Choice,
  type FreqRank,
  type Passage,
  type Question,
  type SubQuestion,
} from '@beb-raid/shared-schema'
import {
  PART6_ENTRIES_S,
  type Part6RawEntry,
  type Part6RawSubQuestion,
} from './data/part6PassagesS.js'
import { PART7_SINGLE_ENTRIES_S, type Part7SingleRawEntry } from './data/part7SinglePassagesS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART6_ENTRIES_S, PART7_SINGLE_ENTRIES_S }

/**
 * keyVocabWordの和訳（sense）とfreqRankをS/A/B語彙カード（600語）から引く
 * （part2Question.ts/part34Question.ts/part5Question.tsのvocabEntryForWordと同方式）
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

/**
 * 正答キーの決定的ローテーション分散（M1レビュー⑦の方式。part34Question.tsの
 * rotateSubQuestionChoicesと同方式）。rawの設問は常にcorrectTextを「正解」・distractorsを
 * 「誤答3件」として書き、globalIndex%4の回転で選択肢の並び順・正答キーを機械的に決める
 */
export function rotateTextPassageChoices(
  raw: { correctText: string; distractors: readonly [string, string, string] },
  globalIndex: number,
): { choices: Choice[]; answer: string } {
  const texts = [raw.correctText, raw.distractors[0], raw.distractors[1], raw.distractors[2]]
  const rotation = globalIndex % 4
  const rotatedTexts = [...texts.slice(rotation), ...texts.slice(0, rotation)]
  const keys = ['A', 'B', 'C', 'D']
  const choices = rotatedTexts.map((text, i) => ({ key: keys[i]!, text }))
  const answer = keys[rotatedTexts.indexOf(raw.correctText)]!
  return { choices, answer }
}

/** Part6の設問kind→設問文（英語。本文中の空所番号nを参照する定型の指示文）。文挿入のみ別文言 */
function part6QuestionPrompt(kind: Part6RawSubQuestion['kind'], blankNumber: number): string {
  if (kind === 'insertion') {
    return `Select the sentence that best completes the passage at blank (${blankNumber}).`
  }
  return `Select the word or phrase that best completes blank (${blankNumber}).`
}

/**
 * Part6エントリ→Question（text_passage・part6）への変換。globalSubQuestionStartIndexは
 * このセットの1問目が全体の何番目の設問かを示す（rotateTextPassageChoicesの分散用）
 */
export function part6Question(entry: Part6RawEntry, globalSubQuestionStartIndex: number): Question {
  const subQuestions: SubQuestion[] = entry.subQuestions.map((raw, i) => {
    const { choices, answer } = rotateTextPassageChoices(raw, globalSubQuestionStartIndex + i)
    return {
      id: `${entry.setId}-q${i + 1}`,
      question: part6QuestionPrompt(raw.kind, i + 1),
      choices,
      answer,
      explanation: raw.explanation,
      translation: raw.translation,
    }
  })
  const passage: Passage = {
    id: `${entry.setId}-doc1`,
    kind: entry.passageKind,
    text: entry.passageText,
  }
  return {
    id: entry.setId,
    part: 6,
    format: 'text_passage',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: entry.keyVocabWords.map((word) => {
      const { sense, freqRank } = vocabEntryForWord(word)
      return { word, sense, freqRank }
    }),
    passages: [passage],
    subQuestions,
  }
}

/** エントリ一覧→Question配列（Part6）。globalSubQuestionStartIndexはセットの出現順に累積で進める */
export function buildPart6Questions(
  entries: readonly Part6RawEntry[] = PART6_ENTRIES_S,
): Question[] {
  let globalIndex = 0
  return entries.map((entry) => {
    const q = part6Question(entry, globalIndex)
    globalIndex += entry.subQuestions.length
    return q
  })
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる（Part6） */
export function buildPart6Drafts(
  entries: readonly Part6RawEntry[] = PART6_ENTRIES_S,
): GeneratedItemDraft[] {
  let globalIndex = 0
  return entries.map((entry) => {
    const question = part6Question(entry, globalIndex)
    globalIndex += entry.subQuestions.length
    const firstLine = entry.passageText.split('\n').find((line) => line.trim() !== '') ?? ''
    return {
      id: question.id,
      kind: 'text_passage',
      preview: `[Part6/${entry.passageKind}] ${firstLine.slice(0, 60)}...`,
      payload: question,
    }
  })
}

/**
 * Part7単一エントリ→Question（text_passage・part7）への変換。subQuestionsは2〜4問
 * （docs/24 3.1節「Part7単一」）。件数チェックはvalidatePart7SingleQuestionsで行う
 */
export function part7SingleQuestion(
  entry: Part7SingleRawEntry,
  globalSubQuestionStartIndex: number,
): Question {
  const subQuestions: SubQuestion[] = entry.subQuestions.map((raw, i) => {
    const { choices, answer } = rotateTextPassageChoices(raw, globalSubQuestionStartIndex + i)
    return {
      id: `${entry.setId}-q${i + 1}`,
      question: raw.question,
      choices,
      answer,
      explanation: raw.explanation,
      translation: raw.translation,
    }
  })
  const passage: Passage = {
    id: `${entry.setId}-doc1`,
    kind: entry.passageKind,
    text: entry.passageText,
  }
  return {
    id: entry.setId,
    part: 7,
    format: 'text_passage',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: entry.keyVocabWords.map((word) => {
      const { sense, freqRank } = vocabEntryForWord(word)
      return { word, sense, freqRank }
    }),
    passages: [passage],
    subQuestions,
  }
}

/** エントリ一覧→Question配列（Part7単一）。globalSubQuestionStartIndexはセットの出現順に累積で進める */
export function buildPart7SingleQuestions(
  entries: readonly Part7SingleRawEntry[] = PART7_SINGLE_ENTRIES_S,
): Question[] {
  let globalIndex = 0
  return entries.map((entry) => {
    const q = part7SingleQuestion(entry, globalIndex)
    globalIndex += entry.subQuestions.length
    return q
  })
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる（Part7単一） */
export function buildPart7SingleDrafts(
  entries: readonly Part7SingleRawEntry[] = PART7_SINGLE_ENTRIES_S,
): GeneratedItemDraft[] {
  let globalIndex = 0
  return entries.map((entry) => {
    const question = part7SingleQuestion(entry, globalIndex)
    globalIndex += entry.subQuestions.length
    const firstLine = entry.passageText.split('\n').find((line) => line.trim() !== '') ?? ''
    return {
      id: question.id,
      kind: 'text_passage',
      preview: `[Part7単一/${entry.passageKind}] ${firstLine.slice(0, 60)}...`,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack。T-103でtext_passage対応済み）にQuestion配列を通す。
 * 他のQuestion生成モジュールと同様、検証専用の仮パック外枠（license/origin等はダミー値）で包む。
 * Part6の空所マーカー数とsubQuestions件数の整合はvalidatePack内部（validatePart6Markers）が検証する。
 */
export function validatePart6Questions(questions: Question[]): string[] {
  const structuralProblems = questions.flatMap((q) => {
    if (q.subQuestions?.length !== 4) {
      return [`${q.id}: Part6のsubQuestionsは4問固定（実際: ${q.subQuestions?.length ?? 0}問）`]
    }
    return []
  })
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-text-passage-p6-s',
      title: 'Part6読解 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-107 エージェント直接執筆ドラフト（LLM API不使用・人手レビュー未実施）',
      targetLevel: [600, 600],
    },
    questions,
  })
  const validateProblems = result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`)
  return [...structuralProblems, ...validateProblems]
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す（Part7単一）。加えて
 * docs/24 3.1節「Part7単一: subQuestions 2〜4問」の業務ルールをCLI側で追加検証する
 * （shared-schemaの一般的な1〜5件制約より狭いPart7単一固有の制約のため、契約変更ではなく
 * ここでのみ検査する）。
 */
export function validatePart7SingleQuestions(questions: Question[]): string[] {
  const structuralProblems = questions.flatMap((q) => {
    const count = q.subQuestions?.length ?? 0
    if (count < 2 || count > 4) {
      return [`${q.id}: Part7単一のsubQuestionsは2〜4問（実際: ${count}問）`]
    }
    return []
  })
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-text-passage-p7-single-s',
      title: 'Part7単一読解 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-107 エージェント直接執筆ドラフト（LLM API不使用・人手レビュー未実施）',
      targetLevel: [600, 600],
    },
    questions,
  })
  const validateProblems = result.ok ? [] : result.errors.map((e) => `${e.path}: ${e.message}`)
  return [...structuralProblems, ...validateProblems]
}
