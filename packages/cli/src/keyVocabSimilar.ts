// key単語類題生成（T-29。正本: docs/03 3.2節、docs/04 5節、docs/10 T-29行）。
//
// 「誤答→key単語がSRSへ→同key単語を持つ類題の出題重みUP→定着後に元問題を再出題」
// （03の3.2）の「類題」在庫を事前生成する。engine/keyVocab.tsのfindSimilarQuestionsは
// 単に「同じkeyVocab.wordを持つ別問題」を集めるだけでformatを問わないため、ここでは
// 新規text_blank問題として類題を用意する（T-26/27/28と同じくランタイムAPI不使用）。
//
// 【設計判断（docs未記載）】対象語は「レビュー済みPart2/Part5のkeyVocab出現頻度上位」を
// 文字どおり解釈し、T-27/T-28の両方に出現した19語（Part2 50問・Part5 50問はいずれも
// 相異なる50語のkeyVocabを持つため、両方に出た語がこの時点での最頻出語にあたる）を対象に、
// 1語につき3問生成した。T-28が文法形（品詞/動詞の形）中心だったのに対し、ここは語彙選択
// （コロケーション・言い換え）中心にして出題観点を分けている。
// 【M2・T-63追記】追加60問（keyVocabSimilarS2.ts）はT-60/T-61/T-62でPart横断・形式横断に
// 出現した頻出20語が対象で、S/A/B語彙カード（600語）横断でkeyVocabのsense/freqRankを
// 解決する（vocabEntryForWord。part2Question.ts等のT-60実装と同方式。既存19語=Sランクの
// 挙動は変えない）。

import { SCHEMA_VERSION, validatePack, type FreqRank, type Question } from '@beb-raid/shared-schema'
import { rotationAmount } from './choiceRotation.js'
import { KEY_VOCAB_SIMILAR_ENTRIES, type KeyVocabSimilarEntry } from './data/keyVocabSimilarS.js'
import { KEY_VOCAB_SIMILAR_ENTRIES_S2 } from './data/keyVocabSimilarS2.js'
import {
  KEY_VOCAB_SIMILAR_S3_RAW,
  type KeyVocabSimilarS3RawEntry,
} from './data/keyVocabSimilarS3.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { KEY_VOCAB_SIMILAR_ENTRIES, KEY_VOCAB_SIMILAR_ENTRIES_S2 }

/**
 * keyVocabのsense/freqRankをS/A/B語彙カード（600語）から引く
 * （part2Question.ts等のvocabEntryForWordと同方式。M2・T-63でA/B語彙も対象に拡大）
 */
function vocabEntryForWord(word: string): { sense: string; freqRank: FreqRank } {
  const s = VOCAB_CARDS_S.find((v) => v.word === word)
  if (s) return { sense: s.back, freqRank: 'S' }
  const a = VOCAB_CARDS_A.find((v) => v.word === word)
  if (a) return { sense: a.back, freqRank: 'A' }
  const b = VOCAB_CARDS_B.find((v) => v.word === word)
  if (b) return { sense: b.back, freqRank: 'B' }
  throw new Error(`word "${word}" がS/A/B語彙カード（600語）に見つからない`)
}

/** エントリ→Question（text_blank）への変換。idは対象語＋連番で一意化する */
export function keyVocabSimilarQuestion(
  entry: KeyVocabSimilarEntry,
  indexInWord: number,
): Question {
  const { sense, freqRank } = vocabEntryForWord(entry.word)
  return {
    id: `similar-${entry.word}-${indexInWord + 1}`,
    part: 5,
    format: 'text_blank',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [{ word: entry.word, sense, freqRank }],
    question: entry.question,
    choices: entry.choices,
    answer: entry.answer,
    explanation: entry.explanation,
    translation: entry.translation,
  }
}

/** エントリ一覧→Question配列（同一word内での連番はエントリの出現順で振る） */
export function buildKeyVocabSimilarQuestions(
  entries: readonly KeyVocabSimilarEntry[] = KEY_VOCAB_SIMILAR_ENTRIES,
): Question[] {
  const seenCountByWord = new Map<string, number>()
  return entries.map((entry) => {
    const index = seenCountByWord.get(entry.word) ?? 0
    seenCountByWord.set(entry.word, index + 1)
    return keyVocabSimilarQuestion(entry, index)
  })
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildKeyVocabSimilarDrafts(
  entries: readonly KeyVocabSimilarEntry[] = KEY_VOCAB_SIMILAR_ENTRIES,
): GeneratedItemDraft[] {
  const questions = buildKeyVocabSimilarQuestions(entries)
  return entries.map((entry, i) => ({
    id: questions[i]!.id,
    kind: 'text_blank',
    preview: `[${entry.word}] ${entry.question} / 正解:${entry.answer}`,
    payload: questions[i]!,
  }))
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。vocabCard.ts等と同様、
 * 検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validateKeyVocabSimilarQuestions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-key-vocab-similar',
      title: 'key単語類題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-29 エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}

/**
 * 実装指示の「対象単語の包含チェック」: 各エントリのkeyVocab（=entry.word）が
 * 実際にそのentryのquestion/choicesへ文字列として含まれることを明示的に検証する
 * （validatePackの汎用チェックと同じ内容だが、T-29固有の完了条件として独立に持つ）
 */
export function validateTargetWordCoverage(entries: readonly KeyVocabSimilarEntry[]): string[] {
  const problems: string[] = []
  for (const entry of entries) {
    const target = `${entry.question} ${entry.choices.map((c) => c.text).join(' ')}`.toLowerCase()
    if (!target.includes(entry.word.toLowerCase())) {
      problems.push(`対象語「${entry.word}」がquestion/choicesに含まれない: ${entry.question}`)
    }
  }
  return problems
}

/**
 * T-83（J-44）: q1語（類題ゼロ）120語×1問の正答キーローテーション。
 * rawエントリは常にcorrectTextを「正解」・distractors（3件）を「誤答」として書く。
 * 【T-342（K-80再検証で発覚）】ローテーション量はwordのハッシュから導出する
 * （配列内のindexは使わない）。indexをそのまま使うと、part5Question.tsのrotatePart5Choicesが
 * T-266で修正したのと同じ理由で、rawエントリの並び順が変わらない限り正答キーが一定差分で
 * 循環してしまう（実測: pack-p5-similar-s-003で120問中119件が差分3の完全な決定的循環に
 * なっていた）。本ファイルは1語1問（S/S2の1語3問と異なり重複しない）のため、wordをそのまま
 * エントリ固有のシードとして使える
 */
export function rotateKeyVocabSimilarS3Choices(
  raw: KeyVocabSimilarS3RawEntry,
): Pick<KeyVocabSimilarEntry, 'choices' | 'answer'> {
  const texts = [raw.correctText, raw.distractors[0], raw.distractors[1], raw.distractors[2]]
  const rotation = rotationAmount(raw.word, 4)
  const rotatedTexts = [...texts.slice(rotation), ...texts.slice(0, rotation)]
  const keys = ['A', 'B', 'C', 'D']
  const choices = rotatedTexts.map((text, i) => ({ key: keys[i]!, text }))
  const answer = keys[rotatedTexts.indexOf(raw.correctText)]!
  return { choices, answer }
}

/** rawエントリ（correctText/distractors形式）→KeyVocabSimilarEntry（choices/answer確定済み）への変換 */
export function keyVocabSimilarS3EntryFromRaw(
  raw: KeyVocabSimilarS3RawEntry,
): KeyVocabSimilarEntry {
  const { choices, answer } = rotateKeyVocabSimilarS3Choices(raw)
  return {
    word: raw.word,
    tags: raw.tags,
    question: raw.question,
    choices,
    answer,
    explanation: raw.explanation,
    translation: raw.translation,
    difficulty: raw.difficulty,
  }
}

/** T-83追加分（120語×1問）をKeyVocabSimilarEntry形式に組み立てる */
export function buildKeyVocabSimilarS3Entries(
  raw: readonly KeyVocabSimilarS3RawEntry[] = KEY_VOCAB_SIMILAR_S3_RAW,
): KeyVocabSimilarEntry[] {
  return raw.map((r) => keyVocabSimilarS3EntryFromRaw(r))
}
