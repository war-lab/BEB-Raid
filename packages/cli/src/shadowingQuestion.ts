// シャドーイング問題生成（M2・T-62。正本: docs/13 T-62行・3.5節、docs/04 2節）。
//
// 新規執筆はしない（3.10節: Part3/4スクリプトから20本＋既存Part2の応答文から10本を流用。
// 素材選定はdata/shadowingS.tsで完結し、ここは Question 組み立てのみを担う）。
// timingはプレースホルダ（このモジュールのestimateDurationMsで仮のdurationMsを見積もり、
// timing.tsのestimateWordTimingsで整合するtiming配列を生成する。T-64のTTS実測時に
// ttsBatch.tsのshadowing分岐が実測durationMsから再計算して上書きする＝T-46と同じ扱い）。
// keyVocabのsense/freqRankはS/A/B語彙カード（600語）横断で解決する（vocabEntryForWord。
// part2Question.ts等と同方式）。

import {
  SCHEMA_VERSION,
  validatePack,
  type AudioAccent,
  type FreqRank,
  type Question,
} from '@beb-raid/shared-schema'
import { SHADOWING_ENTRIES_S, type ShadowingRawEntry } from './data/shadowingS.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'
import { estimateWordTimings } from './timing.js'

export { SHADOWING_ENTRIES_S }

/** 話者アクセントのローテーション（part2Question.tsと同じ2値。Piperの対応状況に合わせる） */
const ACCENT_ROTATION: readonly AudioAccent[] = ['US', 'UK']

/** 音声の予約パス規約（T-64で実ファイルに差し替える） */
export function reservedAudioPath(id: string): string {
  return `audio/shadowing/${id}.mp3`
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

/** エントリ→Question（shadowing）への変換 */
export function shadowingQuestion(entry: ShadowingRawEntry, index: number): Question {
  const { sense, freqRank } = vocabEntryForWord(entry.keyVocabWord)
  const durationMs = estimateDurationMs(entry.script)
  return {
    id: entry.id,
    part: entry.part,
    format: 'shadowing',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [{ word: entry.keyVocabWord, sense, freqRank }],
    audio: reservedAudioPath(entry.id),
    audioMeta: {
      accent: ACCENT_ROTATION[index % ACCENT_ROTATION.length]!,
      tts: true,
      voice: 'pending-tts',
      durationMs,
    },
    script: entry.script,
    translation: entry.translation,
    timing: estimateWordTimings(entry.script, durationMs),
  }
}

/** エントリ一覧→Question配列 */
export function buildShadowingQuestions(
  entries: readonly ShadowingRawEntry[] = SHADOWING_ENTRIES_S,
): Question[] {
  return entries.map((entry, index) => shadowingQuestion(entry, index))
}

/** T-30のレビュー往復フォーマット（GeneratedItemDraft）に包んだ一覧を組み立てる */
export function buildShadowingDrafts(
  entries: readonly ShadowingRawEntry[] = SHADOWING_ENTRIES_S,
): GeneratedItemDraft[] {
  return entries.map((entry, index) => {
    const question = shadowingQuestion(entry, index)
    return {
      id: question.id,
      kind: 'shadowing',
      preview: entry.script,
      payload: question,
    }
  })
}

/**
 * バリデータ（T-05のvalidatePack）にQuestion配列を通す。他のQuestion生成モジュールと
 * 同様、検証専用の仮パック外枠（license/origin等はダミー値）で包む
 */
export function validateShadowingQuestions(questions: Question[]): string[] {
  const result = validatePack({
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'draft-shadowing-s',
      title: 'シャドーイング問題 ドラフト検証用（実配布パックではない）',
      license: 'internal-original',
      origin: 'T-62 既存素材（Part3/4スクリプト・Part2応答文）の流用。新規執筆なし',
      targetLevel: [600, 600],
    },
    questions,
  })
  if (result.ok) return []
  return result.errors.map((e) => `${e.path}: ${e.message}`)
}
