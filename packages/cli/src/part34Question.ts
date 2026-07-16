// Part3/4問題生成（audio_set。M2・T-62。正本: docs/13 T-62行・3.6節、docs/04 2節）。
//
// 音声1本（会話または単独トーク）に設問3問がぶら下がる形式。設問はcorrectText/distractors
// の形で書き、rotateSubQuestionChoicesが4択A〜Dへの決定的ローテーションを適用する
// （M1レビュー⑦の方式。part2Question.ts/part5Question.tsと同じ考え方）。
// keyVocabのsense/freqRankはS/A/B語彙カード（600語）横断で解決する（vocabEntryForWord。
// part2Question.ts/part5Question.tsのT-60/T-61実装と同方式）。
// audio/audioMetaはT-64（TTS全量生成）で実音声に差し替えるまでの予約値（voice='pending-tts'）。
// Part3のscriptは"A: ... B: ..."の話者表記（T-64でttsBatch.tsが交互にprimary/secondary話者へ
// 割り当てる想定。synthesizeDialogueの拡張）。Part4は単独話者のため話者表記なし。

import {
  SCHEMA_VERSION,
  validatePack,
  type AudioAccent,
  type Choice,
  type FreqRank,
  type Question,
  type SubQuestion,
} from '@beb-raid/shared-schema'
import {
  PART34_ENTRIES_S,
  type Part34RawEntry,
  type Part34RawSubQuestion,
} from './data/part34SetsS.js'
import { PART34_ENTRIES_S2 } from './data/part34SetsS2.js'
import { PART34_ENTRIES_S3 } from './data/part34SetsS3.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART34_ENTRIES_S, PART34_ENTRIES_S2, PART34_ENTRIES_S3 }

/** 話者アクセントのローテーション（part2Question.tsと同じ2値。Piperの対応状況に合わせる） */
const ACCENT_ROTATION: readonly AudioAccent[] = ['US', 'UK']

/** 音声の予約パス規約（T-64で実ファイルに差し替える） */
export function reservedAudioPath(setId: string): string {
  return `audio/part34/${setId}.mp3`
}

/** 発話速度の目安（1語あたり350ms）から仮のdurationMsを見積もる（T-64で実測値に差し替え） */
export function estimateDurationMs(script: string): number {
  const wordCount = script.split(/\s+/).filter((s) => s.length > 0).length
  return Math.max(1500, Math.round(wordCount * 350))
}

/**
 * keyVocabWordの和訳（sense）とfreqRankをS/A/B語彙カード（600語）から引く
 * （part2Question.ts/part5Question.tsのvocabEntryForWordと同方式）
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
 * 正答キーの決定的ローテーション分散（M1レビュー⑦の方式）。
 * rawの設問は常に correctText を「正解」・distractors を「誤答3件」として書き、
 * globalIndex%4の回転で選択肢の並び順・正答キーを機械的に決める（4択A〜D。
 * globalIndexは全60設問を通した連番で、rotatePart5Choicesと同じ考え方）
 */
export function rotateSubQuestionChoices(
  raw: Part34RawSubQuestion,
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

/**
 * エントリ→Question（audio_set）への変換。globalSubQuestionStartIndexはこのセットの
 * 1問目が全体の何番目の設問かを示す（rotateSubQuestionChoicesの分散用）
 */
export function part34Question(
  entry: Part34RawEntry,
  globalSubQuestionStartIndex: number,
  setIndex: number,
): Question {
  const subQuestions: SubQuestion[] = entry.subQuestions.map((raw, i) => {
    const { choices, answer } = rotateSubQuestionChoices(raw, globalSubQuestionStartIndex + i)
    return {
      id: `p34-${entry.setId}-q${i + 1}`,
      question: raw.question,
      choices,
      answer,
      explanation: raw.explanation,
      translation: raw.translation,
    }
  })
  return {
    id: `p34-${entry.setId}`,
    part: entry.part,
    format: 'audio_set',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: entry.keyVocabWords.map((word) => {
      const { sense, freqRank } = vocabEntryForWord(word)
      return { word, sense, freqRank }
    }),
    audio: reservedAudioPath(entry.setId),
    audioMeta: {
      accent: ACCENT_ROTATION[setIndex % ACCENT_ROTATION.length]!,
      tts: true,
      voice: 'pending-tts',
      durationMs: estimateDurationMs(entry.script),
    },
    script: entry.script,
    subQuestions,
  }
}

/** エントリ一覧→Question配列。globalSubQuestionStartIndexはセットの出現順に3ずつ進める */
export function buildPart34Questions(
  entries: readonly Part34RawEntry[] = PART34_ENTRIES_S,
): Question[] {
  return entries.map((entry, setIndex) => part34Question(entry, setIndex * 3, setIndex))
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildPart34Drafts(
  entries: readonly Part34RawEntry[] = PART34_ENTRIES_S,
): GeneratedItemDraft[] {
  return entries.map((entry, setIndex) => {
    const question = part34Question(entry, setIndex * 3, setIndex)
    return {
      id: question.id,
      kind: 'audio_set',
      preview: `[Part${entry.part}] ${entry.script.slice(0, 60)}...`,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。他のQuestion生成モジュールと
 * 同様、検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validatePart34Questions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-part34-s',
      title: 'Part3/4問題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-62 エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}
