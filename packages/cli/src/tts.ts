// TTS生成（T-31。正本: docs/04 5節・6節、docs/05 8節、docs/10 T-31行）。
//
// 【設計判断（B-2解消。docs未記載）】プロバイダはPiper（ローカルTTS、MITライセンス）を採用
// （発起人の最優先事項「無料の徹底」。詳細はdocs/STATUS.md参照）。ランタイムAPI課金が
// 存在しないため、生成は開発者ローカルで`piper`バイナリ＋`ffmpeg`（WAV→mp3変換）を
// 呼び出して行う。どちらも npm 依存ではなく外部インストール前提（T-17の
// generate-dummy-audio.mjs と同じ扱い）。
//
// 【設計判断】Piperの公式ボイスカタログ（huggingface.co/rhasspy/piper-voices）には
// en_AU（豪アクセント）が存在しない（en_GB/en_USのみ。2026-07-13確認）。そのため
// 話者ローテーションは米/英の2アクセントに縮退する（04の5節で加=CAを使わない前例と
// 同じ「プロバイダの実際の対応状況に合わせて縮退する」判断。スキーマのAudioAccentは
// 'AU'/'CA'を有効値のまま残し、対応プロバイダが見つかれば復活してよい）。

import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import type { AudioAccent } from '@beb-raid/shared-schema'

/** Piperが実際に音声を持つアクセント（en_AUが存在しないため2種に縮退） */
export const SUPPORTED_ACCENTS = ['US', 'UK'] as const
export type SupportedAccent = (typeof SUPPORTED_ACCENTS)[number]

/** Part2は設問と応答で別話者（実装指示2）。語彙フレーズは常にprimary */
export type SpeakerRole = 'primary' | 'secondary'

interface VoiceSpec {
  /** voices ディレクトリ内のonnxモデルファイル名 */
  modelFile: string
  /** audioMeta.voice に記録する名前 */
  voiceName: string
}

/** アクセント×話者役割 → 使用するPiperボイス（各アクセントに男女1名ずつ） */
const VOICES: Record<SupportedAccent, Record<SpeakerRole, VoiceSpec>> = {
  US: {
    primary: { modelFile: 'en_US-lessac-medium.onnx', voiceName: 'piper:en_US-lessac-medium' },
    secondary: { modelFile: 'en_US-ryan-medium.onnx', voiceName: 'piper:en_US-ryan-medium' },
  },
  UK: {
    primary: {
      modelFile: 'en_GB-jenny_dioco-medium.onnx',
      voiceName: 'piper:en_GB-jenny_dioco-medium',
    },
    secondary: { modelFile: 'en_GB-alan-medium.onnx', voiceName: 'piper:en_GB-alan-medium' },
  },
}

export function voiceFor(accent: SupportedAccent, role: SpeakerRole): VoiceSpec {
  return VOICES[accent][role]
}

/** turn（0始まり）→ 使用アクセント。米/英の2アクセントを交互にローテーションする */
export function rotateAccent(index: number): SupportedAccent {
  return SUPPORTED_ACCENTS[index % SUPPORTED_ACCENTS.length]!
}

/** スキーマ上のAudioAccentのうちPiperが対応する値かを判定する */
export function isSupportedAccent(accent: AudioAccent): accent is SupportedAccent {
  return (SUPPORTED_ACCENTS as readonly string[]).includes(accent)
}

/**
 * Piper（espeak-ngベースのフォニマイザ）へ渡す前にテキストを正規化する（M2・T-64）。
 * 【判明した不具合】em/enダッシュ（—/–）を含むテキストをPiperのstdinへ渡すと、
 * このサンドボックス環境ではUnicodeEncodeError（サロゲート文字によるエンコード失敗）で
 * piperプロセスが異常終了し、空のWAVが生成される（part34SetsS.tsのPart3会話文中の
 * "That should work — most of the team..."で再現確認済み）。既存のPart2 script
 * （"設問 — 応答"形式）はsplitDialogueScriptがダッシュ自体を除去してから渡すため
 * この問題を踏んでいなかった。ダッシュを読点相当のカンマに置換して回避する
 */
export function sanitizeForTts(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ', ')
}

export interface SynthesizeInput {
  text: string
  accent: SupportedAccent
  role: SpeakerRole
  /** 出力先mp3パス */
  outputPath: string
}

export interface SynthesizeResult {
  /** audioMeta.voice に記録する値 */
  voice: string
  /** audioMeta.durationMs に記録する値（実測） */
  durationMs: number
}

export interface SynthesizeDialogueInput {
  /** 設問部分（primary話者で読む） */
  questionText: string
  /** 応答部分（secondary話者で読む） */
  answerText: string
  accent: SupportedAccent
  /** 出力先mp3パス */
  outputPath: string
}

/** 1発話ターン分（M2・T-64。Part3の複数ターン会話用） */
export interface DialogueTurn {
  text: string
  role: SpeakerRole
}

export interface SynthesizeMultiTurnInput {
  /** 発話順の配列（2件以上。各要素の話者roleで交互に読み上げる） */
  turns: readonly DialogueTurn[]
  accent: SupportedAccent
  /** 出力先mp3パス */
  outputPath: string
}

export interface TtsProvider {
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>
  /** Part2用: 設問と応答を別話者で読み上げ、1本のmp3に連結する（実装指示2） */
  synthesizeDialogue(input: SynthesizeDialogueInput): Promise<SynthesizeResult>
  /** Part3用: 2話者以上・N ターンの会話を発話順どおりに連結する（M2・T-64） */
  synthesizeMultiTurnDialogue(input: SynthesizeMultiTurnInput): Promise<SynthesizeResult>
}

/** 外部プロセス実行の抽象（テストではモックに差し替える。標準出力を返す） */
export type ProcessRunner = (
  command: string,
  args: string[],
  options?: { input?: string },
) => Promise<{ stdout: string }>

/** 実プロセス実行（spawn）。stdin入力対応、非0終了はエラー */
export const runProcess: ProcessRunner = (command, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [options?.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'inherit'],
    })
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout })
      else reject(new Error(`${command} がコード${code}で終了した（args: ${args.join(' ')}）`))
    })
    if (options?.input !== undefined) {
      child.stdin?.write(options.input)
      child.stdin?.end()
    }
  })
}

export interface PiperTtsProviderOptions {
  /** piper実行ファイルのパス（省略時は環境変数 PIPER_BIN、さらに省略時は 'piper'） */
  piperBin?: string
  /** ボイスモデル（.onnx）を置いたディレクトリ（省略時は環境変数 PIPER_VOICES_DIR） */
  voicesDir?: string
  /** ffmpeg実行ファイルのパス（省略時は環境変数 FFMPEG_BIN、さらに省略時は 'ffmpeg'） */
  ffmpegBin?: string
  /** ffprobe実行ファイルのパス（省略時は環境変数 FFPROBE_BIN、さらに省略時は 'ffprobe'） */
  ffprobeBin?: string
  /** プロセス実行の差し替え（テスト用） */
  runProcess?: ProcessRunner
  /** 一時WAVファイルの置き場所（省略時はos.tmpdir()） */
  tmpDir?: string
}

function resolve(value: string | undefined, envName: string, fallback: string): string {
  return value ?? process.env[envName] ?? fallback
}

/** Piperベースの TtsProvider 実装。piper（WAV生成）→ffmpeg（mp3変換）→ffprobe（duration実測）の順で呼ぶ */
export class PiperTtsProvider implements TtsProvider {
  private readonly piperBin: string
  private readonly voicesDir: string
  private readonly ffmpegBin: string
  private readonly ffprobeBin: string
  private readonly run: ProcessRunner

  constructor(options: PiperTtsProviderOptions = {}) {
    this.piperBin = resolve(options.piperBin, 'PIPER_BIN', 'piper')
    this.voicesDir = resolve(options.voicesDir, 'PIPER_VOICES_DIR', '.')
    this.ffmpegBin = resolve(options.ffmpegBin, 'FFMPEG_BIN', 'ffmpeg')
    this.ffprobeBin = resolve(options.ffprobeBin, 'FFPROBE_BIN', 'ffprobe')
    this.run = options.runProcess ?? runProcess
  }

  /** テキスト1件をpiperでWAVに変換する（内部ヘルパ。synthesize/synthesizeDialogue共用） */
  private async synthesizeToWav(
    text: string,
    accent: SupportedAccent,
    role: SpeakerRole,
    wavPath: string,
  ): Promise<VoiceSpec> {
    const voice = voiceFor(accent, role)
    const modelPath = `${this.voicesDir}/${voice.modelFile}`
    await this.run(this.piperBin, ['-m', modelPath, '-f', wavPath], {
      input: sanitizeForTts(text),
    })
    return voice
  }

  private async probeDurationMs(path: string): Promise<number> {
    const { stdout } = await this.run(this.ffprobeBin, [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ])
    return Math.round(Number.parseFloat(stdout.trim()) * 1000)
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    const tmpWavPath = `${input.outputPath}.tmp.wav`
    const voice = await this.synthesizeToWav(input.text, input.accent, input.role, tmpWavPath)
    await this.run(this.ffmpegBin, [
      '-y',
      '-i',
      tmpWavPath,
      '-ac',
      '1',
      '-b:a',
      '80k',
      input.outputPath,
    ])
    const durationMs = await this.probeDurationMs(input.outputPath)
    await rm(tmpWavPath, { force: true })

    return { voice: voice.voiceName, durationMs }
  }

  async synthesizeDialogue(input: SynthesizeDialogueInput): Promise<SynthesizeResult> {
    const tmpQuestionWav = `${input.outputPath}.q.tmp.wav`
    const tmpAnswerWav = `${input.outputPath}.a.tmp.wav`

    const questionVoice = await this.synthesizeToWav(
      input.questionText,
      input.accent,
      'primary',
      tmpQuestionWav,
    )
    const answerVoice = await this.synthesizeToWav(
      input.answerText,
      input.accent,
      'secondary',
      tmpAnswerWav,
    )

    // 2本のWAVを1本のmp3に連結する（ffmpeg concatフィルタ。中間mp3を作らず直接連結）
    await this.run(this.ffmpegBin, [
      '-y',
      '-i',
      tmpQuestionWav,
      '-i',
      tmpAnswerWav,
      '-filter_complex',
      '[0:0][1:0]concat=n=2:v=0:a=1[out]',
      '-map',
      '[out]',
      '-ac',
      '1',
      '-b:a',
      '80k',
      input.outputPath,
    ])
    const durationMs = await this.probeDurationMs(input.outputPath)
    await rm(tmpQuestionWav, { force: true })
    await rm(tmpAnswerWav, { force: true })

    return { voice: `${questionVoice.voiceName}+${answerVoice.voiceName}`, durationMs }
  }

  async synthesizeMultiTurnDialogue(input: SynthesizeMultiTurnInput): Promise<SynthesizeResult> {
    if (input.turns.length === 0) {
      throw new Error('synthesizeMultiTurnDialogueにはturnsが1件以上必要')
    }

    const tmpWavPaths = input.turns.map((_, i) => `${input.outputPath}.turn${i}.tmp.wav`)
    const voices: VoiceSpec[] = []
    for (let i = 0; i < input.turns.length; i++) {
      const turn = input.turns[i]!
      voices.push(await this.synthesizeToWav(turn.text, input.accent, turn.role, tmpWavPaths[i]!))
    }

    // N本のWAVを発話順どおりに1本のmp3へ連結する（synthesizeDialogueの2本連結をN本に一般化）
    const inputArgs = tmpWavPaths.flatMap((p) => ['-i', p])
    const concatInputs = tmpWavPaths.map((_, i) => `[${i}:0]`).join('')
    await this.run(this.ffmpegBin, [
      '-y',
      ...inputArgs,
      '-filter_complex',
      `${concatInputs}concat=n=${tmpWavPaths.length}:v=0:a=1[out]`,
      '-map',
      '[out]',
      '-ac',
      '1',
      '-b:a',
      '80k',
      input.outputPath,
    ])
    const durationMs = await this.probeDurationMs(input.outputPath)
    await Promise.all(tmpWavPaths.map((p) => rm(p, { force: true })))

    const uniqueVoiceNames = [...new Set(voices.map((v) => v.voiceName))]
    return { voice: uniqueVoiceNames.join('+'), durationMs }
  }
}
