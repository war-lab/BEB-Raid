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
  type Question,
} from '@beb-raid/shared-schema'
import { PART2_ENTRIES_S, type Part2Entry } from './data/part2QuestionsS.js'
import { VOCAB_CARDS_S } from './data/vocabCardsS.js'
import type { GeneratedItemDraft } from './review.js'

export { PART2_ENTRIES_S }

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

/** keyVocabWordの和訳（sense）をvocabCardsS.tsから引く（Sランク200語であることの実データ照合） */
function senseForWord(word: string): string {
  const entry = VOCAB_CARDS_S.find((v) => v.word === word)
  if (!entry) {
    throw new Error(`keyVocabWord "${word}" が vocabCardsS.ts（Sランク200語）に見つからない`)
  }
  return entry.back
}

/** エントリ→Question（audio_qa）への変換 */
export function part2Question(entry: Part2Entry, index: number): Question {
  return {
    id: `part2-${entry.keyVocabWord}`,
    part: 2,
    format: 'audio_qa',
    difficulty: entry.difficulty,
    tags: entry.tags,
    keyVocab: [
      { word: entry.keyVocabWord, sense: senseForWord(entry.keyVocabWord), freqRank: 'S' },
    ],
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
