// TTS一括生成のオーケストレーション（T-31。正本: docs/04 5節・6節、docs/10 T-31行）。
//
// generateコマンドが出力したドラフトJSONL（vocab_card/audio_qa/text_blank混在）を読み、
// 音声が必要なformat（vocab_card=phraseAudio、audio_qa=audio）だけをTtsProviderで
// 実際に合成する。text_blank（Part5・key単語類題）は音声を持たないためスキップする。
// TtsProviderを注入できる設計にすることで、実バイナリ（piper/ffmpeg）無しでも
// オーケストレーションロジック自体はテストできる（実バイナリでの動作は手動確認 or
// 実行環境でのみ検証。CIには無いため自動テストの対象にしない）。
// 【M2・T-64追記】audio_set（Part3/4）・dictationにも対応。audio_setはPart3の
// "A: ... B: ..."形式ならNターンの会話としてsynthesizeMultiTurnDialogueへ、
// Part4（話者ラベル無し）は単独話者synthesizeへ振り分ける（parseDialogueTurns）。

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Question } from '@beb-raid/shared-schema'
import type { GeneratedItemDraft } from './review.js'
import { rotateAccent, type DialogueTurn, type TtsProvider } from './tts.js'
import { estimateWordTimings } from './timing.js'

/** Part2のscript（"設問？ — 応答。"形式）を設問部分と応答部分に分割する */
export function splitDialogueScript(script: string): [string, string] {
  const idx = script.indexOf('—')
  if (idx === -1) {
    throw new Error(`scriptに区切り文字(—)が無い（"設問 — 応答"形式である必要がある）: ${script}`)
  }
  return [script.slice(0, idx).trim(), script.slice(idx + 1).trim()]
}

/** 話者ラベル（"A: ... B: ..."）の直前で区切る境界検出（ラベル文字自体は含めない） */
const SPEAKER_LABEL_RE = /(?=(?:^|\s)[AB]:\s)/

/**
 * Part3/4のaudio_set script を発話ターン配列に分解する（M2・T-64）。
 * "A: ... B: ... A: ..."形式（Part3の会話）はA=primary/B=secondaryの交互ターンに分解する。
 * 話者ラベルが無い場合（Part4の単独トーク）はscript全体を1ターン（primary）として扱う。
 */
export function parseDialogueTurns(script: string): DialogueTurn[] {
  const trimmed = script.trim()
  const chunks = trimmed.split(SPEAKER_LABEL_RE).filter((c) => c.trim() !== '')
  const labeled = chunks.filter((c) => /^[AB]:\s/.test(c.trim()))
  if (labeled.length === 0) {
    return [{ text: trimmed, role: 'primary' }]
  }
  return labeled.map((chunk) => {
    const trimmedChunk = chunk.trim()
    const role = trimmedChunk.startsWith('A:') ? 'primary' : 'secondary'
    return { text: trimmedChunk.slice(2).trim(), role }
  })
}

export interface TtsBatchResult {
  updatedDrafts: GeneratedItemDraft[]
  /** 音声を生成した件数 */
  synthesized: number
  /** 音声不要のformat（text_blank等）でスキップした件数 */
  skipped: number
}

/**
 * ドラフト一覧の音声を一括生成する。
 * - vocab_card: phraseを1話者（primary）で合成し、payload.phraseAudioの指すパスに書き出す
 *   （パス自体は生成時=T-26の予約パスのまま変更しない。phraseAudioにはaudioMetaが無いため
 *   更新対象フィールドも無い）
 * - audio_qa: scriptを設問/応答に分割し、2話者（primary/secondary）で合成して1本のmp3に
 *   連結する。payload.audioMetaのvoice/durationMsを実測値に更新する
 * - audio_set: scriptを parseDialogueTurns で発話ターンに分解する。Part3（複数ターン）は
 *   synthesizeMultiTurnDialogueでNターン交互話者合成、Part4（単独トーク=1ターン）は
 *   synthesizeで単独話者合成する。payload.audioMetaを実測値に更新する（M2・T-64）
 * - dictation: scriptを1話者（primary）で合成する（0.85x再生はランタイム側rateのため
 *   音声自体は等倍のみ。3.4節）。payload.audioMetaを実測値に更新する（M2・T-64）
 * - shadowing: scriptを1話者（primary）で合成する。payload.audioMetaを実測値に更新し、
 *   さらにpayload.timing（単語開始ms配列）をT-46のestimateWordTimingsで実測durationMsから
 *   算出して書き戻す（カラオケハイライト用。13の3.5節）
 * - それ以外（text_blank等）: 音声を持たないためスキップ（そのまま通す）
 *
 * アクセントは配列index（=元のドラフト内での出現順）でローテーションする
 */
export async function synthesizeDraftsAudio(
  drafts: readonly GeneratedItemDraft[],
  provider: TtsProvider,
  audioRoot: string,
): Promise<TtsBatchResult> {
  const updatedDrafts: GeneratedItemDraft[] = []
  let synthesized = 0
  let skipped = 0

  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i]!
    const payload = draft.payload as Question
    const accent = rotateAccent(i)

    if (payload.format === 'vocab_card' && payload.phraseAudio && payload.phrase) {
      const outputPath = join(audioRoot, payload.phraseAudio)
      await mkdir(dirname(outputPath), { recursive: true })
      await provider.synthesize({
        text: payload.phrase,
        accent,
        role: 'primary',
        outputPath,
      })
      synthesized++
      updatedDrafts.push(draft)
      continue
    }

    if (payload.format === 'audio_qa' && payload.audio && payload.script) {
      const [questionText, answerText] = splitDialogueScript(payload.script)
      const outputPath = join(audioRoot, payload.audio)
      await mkdir(dirname(outputPath), { recursive: true })
      const result = await provider.synthesizeDialogue({
        questionText,
        answerText,
        accent,
        outputPath,
      })
      synthesized++
      updatedDrafts.push({
        ...draft,
        payload: {
          ...payload,
          // accentは生成時点のプレースホルダ値（AU等、Piperが対応しない値の可能性がある）を
          // 破棄し、実際に合成へ使ったaccentで上書きする（メタデータと実音声の食い違い防止）
          audioMeta: {
            ...payload.audioMeta,
            accent,
            voice: result.voice,
            durationMs: result.durationMs,
            // 質問部終端（正答リーク対策）。synthesizeDialogueが実測して返す
            questionEndMs: result.questionEndMs,
          },
        },
      })
      continue
    }

    if (payload.format === 'audio_set' && payload.audio && payload.script) {
      const turns = parseDialogueTurns(payload.script)
      const outputPath = join(audioRoot, payload.audio)
      await mkdir(dirname(outputPath), { recursive: true })
      const result =
        turns.length > 1
          ? await provider.synthesizeMultiTurnDialogue({ turns, accent, outputPath })
          : await provider.synthesize({
              text: turns[0]!.text,
              accent,
              role: 'primary',
              outputPath,
            })
      synthesized++
      updatedDrafts.push({
        ...draft,
        payload: {
          ...payload,
          audioMeta: {
            ...payload.audioMeta,
            accent,
            voice: result.voice,
            durationMs: result.durationMs,
          },
        },
      })
      continue
    }

    if (payload.format === 'dictation' && payload.audio && payload.script) {
      const outputPath = join(audioRoot, payload.audio)
      await mkdir(dirname(outputPath), { recursive: true })
      const result = await provider.synthesize({
        text: payload.script,
        accent,
        role: 'primary',
        outputPath,
      })
      synthesized++
      updatedDrafts.push({
        ...draft,
        payload: {
          ...payload,
          audioMeta: {
            ...payload.audioMeta,
            accent,
            voice: result.voice,
            durationMs: result.durationMs,
          },
        },
      })
      continue
    }

    if (payload.format === 'shadowing' && payload.audio && payload.script) {
      const outputPath = join(audioRoot, payload.audio)
      await mkdir(dirname(outputPath), { recursive: true })
      const result = await provider.synthesize({
        text: payload.script,
        accent,
        role: 'primary',
        outputPath,
      })
      synthesized++
      updatedDrafts.push({
        ...draft,
        payload: {
          ...payload,
          audioMeta: {
            ...payload.audioMeta,
            accent,
            voice: result.voice,
            durationMs: result.durationMs,
          },
          // timing（単語開始ms配列）はT-46の推定方式。実測durationMsから按分する
          timing: estimateWordTimings(payload.script, result.durationMs),
        },
      })
      continue
    }

    skipped++
    updatedDrafts.push(draft)
  }

  return { updatedDrafts, synthesized, skipped }
}
