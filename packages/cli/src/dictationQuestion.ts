// ディクテーション問題生成（M2・T-62。正本: docs/13 T-62行・3.4節、docs/04 2節）。
//
// ワードバンク方式（正解語＋ダミー計6語）はランタイム側（engine/dictation.ts）が動的に
// 組み立てるため、コンテンツ側はscript/blanksのみを持つ。全問tags[0]='弱形・連結'固定。
// keyVocabのsense/freqRankはS/A/B語彙カード（600語）横断で解決する（vocabEntryForWord。
// part2Question.ts/part5Question.ts/part34Question.tsと同方式）。
// audio/audioMetaはT-64（TTS全量生成）で実音声に差し替えるまでの予約値（voice='pending-tts'）。
// dictationは0.85x再生をランタイム側（rate）で行うため、音声自体は等倍のみ生成する（3.4節）。

import {
  SCHEMA_VERSION,
  validatePack,
  type AudioAccent,
  type DictationBlank,
  type FreqRank,
  type Question,
} from '@beb-raid/shared-schema'
import { DICTATION_ENTRIES_S, type DictationRawEntry } from './data/dictationS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { DICTATION_ENTRIES_S }

/** 話者アクセントのローテーション（part2Question.tsと同じ2値。Piperの対応状況に合わせる） */
const ACCENT_ROTATION: readonly AudioAccent[] = ['US', 'UK']

/** 音声の予約パス規約（T-64で実ファイルに差し替える） */
export function reservedAudioPath(keyVocabWord: string): string {
  return `audio/dictation/${keyVocabWord}.mp3`
}

/** 発話速度の目安（1語あたり350ms）から仮のdurationMsを見積もる（T-64で実測値に差し替え） */
export function estimateDurationMs(script: string): number {
  const wordCount = script.split(/\s+/).filter((s) => s.length > 0).length
  return Math.max(1500, Math.round(wordCount * 350))
}

/**
 * keyVocabWordの和訳（sense）とfreqRankをS/A/B語彙カード（600語）から引く
 * （part2Question.ts等のvocabEntryForWordと同方式）
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

/** エントリ→Question（dictation）への変換。idは対象語で一意化する（重複禁止） */
export function dictationQuestion(entry: DictationRawEntry, index: number): Question {
  const { sense, freqRank } = vocabEntryForWord(entry.keyVocabWord)
  const blanks: DictationBlank[] = entry.blanks.map((b) => ({ index: b.index, answer: b.answer }))
  return {
    id: `dictation-${entry.keyVocabWord}`,
    part: 2,
    format: 'dictation',
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
    explanation: entry.explanation,
    blanks,
  }
}

/** エントリ一覧→Question配列 */
export function buildDictationQuestions(
  entries: readonly DictationRawEntry[] = DICTATION_ENTRIES_S,
): Question[] {
  return entries.map((entry, index) => dictationQuestion(entry, index))
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildDictationDrafts(
  entries: readonly DictationRawEntry[] = DICTATION_ENTRIES_S,
): GeneratedItemDraft[] {
  return entries.map((entry, index) => {
    const question = dictationQuestion(entry, index)
    return {
      id: question.id,
      kind: 'dictation',
      preview: `${entry.script} / blanks:${entry.blanks.map((b) => b.answer).join(',')}`,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。他のQuestion生成モジュールと
 * 同様、検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validateDictationQuestions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-dictation-s',
      title: 'ディクテーション問題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-62 エージェント直接生成ドラフト（LLM API不使用）',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}
