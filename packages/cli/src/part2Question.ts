// Part2瞬発モード問題生成（T-27。正本: docs/04 2節・5節、docs/02 3.1節、docs/03 7.1節、docs/10 T-27行）。
//
// 【設計判断（docs未記載。T-25/T-26と同方針をユーザー指示により踏襲）】ランタイムでLLM APIを
// 呼ぶ実装はしない。問題本文・選択肢・解説・和訳（本来LLMに生成させる部分）はエージェントが
// ./data/part2QuestionsS.ts に直接記述した。各問のkeyVocabはSランク200語（vocabCardsS.ts）
// から選び、「単語帳で覚える→問題で使う」循環（03の3.2節の設計意図）を成立させている
// （freqRankは'S'固定で、実際にvocabCardsSに存在する語であることを機械検証する）。
// audio/audioMetaはT-31（TTS）で実音声に差し替えるまでの予約値（voice='pending-tts'）。
// 【2026-07-13追記】T-31でPiper（採用したTTSプロバイダ）にen_AUボイスが無いことが判明し、
// 実際の音声合成は米/英2アクセントのみに縮退した（tts.tsのSUPPORTED_ACCENTS）。以下の
// ACCENT_ROTATIONは生成段階の暫定値であり、実合成時（ttsBatch.ts）に実際のaccentで
// 上書きされるため、'AU'が含まれていても実害はない（ただし紛らわしいため2値に揃えた）。

import {
  SCHEMA_VERSION,
  validatePack,
  type AudioAccent,
  type FreqRank,
  type Question,
} from '@beb-raid/shared-schema'
import { fnv1a, rotationAmount } from './choiceRotation.js'
import { PART2_ENTRIES_S, type Part2Entry } from './data/part2QuestionsS.js'
import { PART2_ENTRIES_S2_RAW, type Part2RawEntry } from './data/part2QuestionsS2.js'
import { PART2_ENTRIES_S3_RAW } from './data/part2QuestionsS3.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART2_ENTRIES_S, PART2_ENTRIES_S2_RAW }

/**
 * 話者アクセントのローテーション（生成段階の暫定値。実合成時にttsBatch.tsが実際のaccentで
 * 上書きする）。Piperの対応状況（tts.tsのSUPPORTED_ACCENTS）に合わせ米/英の2値。
 */
const ACCENT_ROTATION: readonly AudioAccent[] = ['US', 'UK']

/** 音声の予約パス規約（T-31で実ファイルに差し替える） */
export function reservedAudioPath(word: string): string {
  return `audio/part2/${word}.mp3`
}

/** 発話速度の目安（1語あたり350ms）から仮のdurationMsを見積もる（T-31で実測値に差し替え） */
export function estimateDurationMs(script: string): number {
  const wordCount = script.split(/\s+/).filter((s) => s.length > 0).length
  return Math.max(1500, Math.round(wordCount * 350))
}

/**
 * keyVocabWordの和訳（sense）とfreqRankをS/A/B語彙カード（600語）から引く
 * （M2・T-60でA/B語彙も対象に拡大。存在しなければエラーで実データとの整合を強制）
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

/** エントリ→Question（audio_qa）への変換 */
export function part2Question(entry: Part2Entry, index: number): Question {
  const { sense, freqRank } = vocabEntryForWord(entry.keyVocabWord)
  return {
    id: `part2-${entry.keyVocabWord}`,
    part: 2,
    format: 'audio_qa',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [{ word: entry.keyVocabWord, sense, freqRank }],
    audio: reservedAudioPath(entry.keyVocabWord),
    audioMeta: {
      accent: ACCENT_ROTATION[index % ACCENT_ROTATION.length]!,
      tts: true,
      voice: 'pending-tts',
      durationMs: estimateDurationMs(entry.script),
    },
    script: entry.script,
    translation: entry.translation,
    choices: entry.choices,
    answer: entry.answer,
    explanation: entry.explanation,
  }
}

/** エントリ一覧→Question配列 */
export function buildPart2Questions(entries: readonly Part2Entry[] = PART2_ENTRIES_S): Question[] {
  return entries.map((entry, index) => part2Question(entry, index))
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildPart2Drafts(
  entries: readonly Part2Entry[] = PART2_ENTRIES_S,
): GeneratedItemDraft[] {
  return entries.map((entry, index) => {
    const question = part2Question(entry, index)
    return {
      id: question.id,
      kind: 'audio_qa',
      preview: `${entry.script} / 正解:${entry.answer}`,
      payload: question,
    }
  })
}

/**
 * 正答キーの決定的ローテーション分散（M1レビュー⑦の方式。M2・T-60）。
 * rawエントリは常に correctText を「正解」・distractors を「誤答2件」として書き、
 * 選択肢の並び順・正答キーを機械的に決める（著者が手作業でA/B/Cの出現頻度を気にする
 * 必要をなくし、常に同じ記号が正答になる構造欠陥を防ぐ）。
 * 【T-266】ローテーション量はkeyVocabWordのハッシュから導出する（配列内のindexは使わない。
 * part5Question.tsのrotatePart5Choicesと同じ理由。indexをそのまま使うと一定差分の
 * 決定的循環を生む＝29のQ-79・contentLint.tsのcheckFlatAnswerKeyCycleが検出する構造欠陥）
 */
export function rotatePart2Choices(raw: Part2RawEntry): Pick<Part2Entry, 'choices' | 'answer'> {
  const texts = [raw.correctText, raw.distractors[0], raw.distractors[1]]
  const rotation = rotationAmount(raw.keyVocabWord, 3)
  const rotatedTexts = [...texts.slice(rotation), ...texts.slice(0, rotation)]
  const keys = ['A', 'B', 'C']
  const choices = rotatedTexts.map((text, i) => ({ key: keys[i]!, text }))
  const answer = keys[rotatedTexts.indexOf(raw.correctText)]!
  return { choices, answer }
}

/** rawエントリ（correctText/distractors形式）→Part2Entry（choices/answer確定済み）への変換 */
export function part2EntryFromRaw(raw: Part2RawEntry): Part2Entry {
  const { choices, answer } = rotatePart2Choices(raw)
  return {
    keyVocabWord: raw.keyVocabWord,
    tags: raw.tags,
    script: raw.script,
    choices,
    answer,
    explanation: raw.explanation,
    translation: raw.translation,
    difficulty: raw.difficulty,
  }
}

/**
 * M1のPart2 50問（PART2_ENTRIES_S）の出題順を決定的に並べ替える。
 *
 * Part2は「設問＋応答A〜C」を1音声ファイルに連結しており、responseOffsetsMsが選択肢の
 * key昇順＝読み上げ順に対応する（part2Responses.ts）。そのため選択肢の並び替えでは
 * 循環を解消できず、出題順の並べ替えしか手段がない
 * （shuffle-cyclic-choices.mjs のorderモードと同じ考え方）。
 *
 * S2・S3はcorrectText/distractors形式でrotatePart2Choicesがkeyを分散させるが、Sだけは
 * choices/answerを手書きした旧形式で、正答キー列が一定差分2の決定的循環になっていた。
 * T-237のorderモードはドラフトJSONLを直接並べ替える一回限りの処置だったため、
 * `beb generate` の再生成で失われる。正本のTS側で並べ替えないと再発する。
 *
 * 元の配列順に依存しないよう、まずkeyVocabWordの辞書順へ正規化してから、
 * 各エントリのハッシュをソートキーにして並べ替える（何度実行しても同じ順に収束する）。
 */
export function orderPart2EntriesS(entries: readonly Part2Entry[] = PART2_ENTRIES_S): Part2Entry[] {
  return [...entries]
    .sort((a, b) =>
      a.keyVocabWord < b.keyVocabWord ? -1 : a.keyVocabWord > b.keyVocabWord ? 1 : 0,
    )
    .map((entry) => ({ entry, seed: fnv1a(`part2-s|${entry.keyVocabWord}`) }))
    .sort((a, b) => a.seed - b.seed)
    .map((x) => x.entry)
}

/** Part2追加分（M2・T-60・S2）100問をPart2Entry形式に組み立てる */
export function buildPart2EntriesS2(
  raw: readonly Part2RawEntry[] = PART2_ENTRIES_S2_RAW,
): Part2Entry[] {
  return raw.map((r) => part2EntryFromRaw(r))
}

/** Part2追加分（T-349・S3。平叙文・付加疑問・選択疑問）をPart2Entry形式に組み立てる */
export function buildPart2EntriesS3(
  raw: readonly Part2RawEntry[] = PART2_ENTRIES_S3_RAW,
): Part2Entry[] {
  return raw.map((r) => part2EntryFromRaw(r))
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。vocabCard.tsと同様、
 * 検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validatePart2Questions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-part2-s',
      title: 'Part2問題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-27 エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}
