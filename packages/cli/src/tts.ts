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
  return (
    text
      .replace(/\s*[–—]\s*/g, ', ')
      // カーリークォート等の非ASCII約物をASCIIへ正規化する。
      // 【判明した不具合（2026-07-22。発起人FB「chineseなんとかを二回繰り返す」起点）】
      // U+2019（'）等を含むテキストをpiperのstdinへ渡すと、パイプ境界のエンコーディング
      // 不整合でCJK文字に化け、espeak-ngが「Chinese letter …」と読み上げる。
      // Part2の30問・語彙9語の committed 音声で実発生をwhisper転写により確認した
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/…/g, '...')
      .replace(/\u00A0/g, ' ')
  )
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
  /**
   * audioMeta.questionEndMs に記録する値（audio_qa=synthesizeDialogueのみ）。
   * 質問部WAVの実測長＋ターン間無音の半分。解答前の再生をここで止めることで
   * 応答（=正答）の読み上げリークを防ぐ
   */
  questionEndMs?: number
  /**
   * audioMeta.responseOffsetsMs に記録する値（audio_qa の音声のみモード用＝
   * synthesizePart2WithResponses のみ）。各応答の開始ms（読み上げ順）。
   * 実測は連結前の各WAVから積算するため、mp3のencoder paddingぶんの誤差が乗りうる
   * （scripts/verify-part2-response-offsets.mjs が silencedetect で全件照合する）
   */
  responseOffsetsMs?: number[]
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

/**
 * Part2の音声のみモード用（T-152。正本: ADR 0008・docs/04 2節）。
 * 「設問＋応答A＋応答B＋応答C」を1本のmp3に連結し、各応答の開始msを返す
 */
export interface SynthesizePart2WithResponsesInput {
  /** 設問部分（primary話者で読む） */
  questionText: string
  /**
   * 応答テキスト。**choices の key 昇順**で渡す（音声の読み上げ順と key の対応が
   * responseOffsetsMs の意味そのものなので、呼び出し側で並びを保証する）。
   * 全応答を secondary 話者で読む（本試験も3応答は同一話者）
   */
  responseTexts: readonly string[]
  accent: SupportedAccent
  /** 出力先mp3パス */
  outputPath: string
}

export interface TtsProvider {
  synthesize(input: SynthesizeInput): Promise<SynthesizeResult>
  /** Part2用: 設問と応答を別話者で読み上げ、1本のmp3に連結する（実装指示2） */
  synthesizeDialogue(input: SynthesizeDialogueInput): Promise<SynthesizeResult>
  /** Part2音声のみモード用: 設問＋3応答すべてを連結し応答の開始msを返す（T-152） */
  synthesizePart2WithResponses(input: SynthesizePart2WithResponsesInput): Promise<SynthesizeResult>
  /** Part3用: 2話者以上・N ターンの会話を発話順どおりに連結する（M2・T-64） */
  synthesizeMultiTurnDialogue(input: SynthesizeMultiTurnInput): Promise<SynthesizeResult>
}

/** 外部プロセス実行の抽象（テストではモックに差し替える。標準出力を返す） */
export type ProcessRunner = (
  command: string,
  args: string[],
  options?: { input?: string },
) => Promise<{ stdout: string }>

function spawnOnce(
  command: string,
  args: string[],
  options?: { input?: string },
): Promise<{ stdout: string }> {
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

/** リトライ間隔（ms）。Windows実行時、ウイルス対策ソフトの実時間スキャンが
 * 直後のffmpeg出力ファイルオープンと競合し「Invalid argument」で失敗することがある
 * （T-81の全量再生成で複数回実際に発生・再試行で解消することを確認済み） */
const RETRY_DELAY_MS = 300
const MAX_ATTEMPTS = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 実プロセス実行（spawn）。stdin入力対応、非0終了はエラー。
 * 同一コマンド・同一引数での再実行は冪等（piper/ffmpegはいずれも同じ入力から
 * 同じ出力を作る）ため、一過性の失敗（ファイルロック等）に備え最大3回まで再試行する
 */
export const runProcess: ProcessRunner = async (command, args, options) => {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await spawnOnce(command, args, options)
    } catch (err) {
      lastError = err
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS)
    }
  }
  throw lastError
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
  /**
   * Piperのlength_scale（話速。値が大きいほど遅い。T-81・J-37）。
   * 全音声再生成時の実測wpmが150〜170wpmレンジに収まるよう校正した初期値=1.15
   */
  lengthScale?: number
}

function resolve(value: string | undefined, envName: string, fallback: string): string {
  return value ?? process.env[envName] ?? fallback
}

/** J-37の既定値（docs/15 T-81行）。全形式共通の初期値とし、レンジ外の形式は個別に再調整する */
export const DEFAULT_LENGTH_SCALE = 1.15
/** ターン間の無音長（秒）。J-37: ダイアログ/マルチターン連結時に挿入する400ms */
export const TURN_GAP_SECONDS = 0.4
/** 連結WAVのサンプルレート・チャンネル（Piperの'medium'品質ボイス各種の実測値に合わせる） */
const CONCAT_SAMPLE_RATE = 22050

/** Piperベースの TtsProvider 実装。piper（WAV生成）→ffmpeg（mp3変換）→ffprobe（duration実測）の順で呼ぶ */
export class PiperTtsProvider implements TtsProvider {
  private readonly piperBin: string
  private readonly voicesDir: string
  private readonly ffmpegBin: string
  private readonly ffprobeBin: string
  private readonly run: ProcessRunner
  private readonly lengthScale: number

  constructor(options: PiperTtsProviderOptions = {}) {
    this.piperBin = resolve(options.piperBin, 'PIPER_BIN', 'piper')
    this.voicesDir = resolve(options.voicesDir, 'PIPER_VOICES_DIR', '.')
    this.ffmpegBin = resolve(options.ffmpegBin, 'FFMPEG_BIN', 'ffmpeg')
    this.ffprobeBin = resolve(options.ffprobeBin, 'FFPROBE_BIN', 'ffprobe')
    this.run = options.runProcess ?? runProcess
    this.lengthScale = options.lengthScale ?? DEFAULT_LENGTH_SCALE
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
    await this.run(
      this.piperBin,
      ['-m', modelPath, '-f', wavPath, '--length_scale', String(this.lengthScale)],
      { input: sanitizeForTts(text) },
    )
    return voice
  }

  /** ターン間400ms無音（J-37）を挟むための無音WAVを1本生成する */
  private async createSilenceWav(path: string): Promise<void> {
    await this.run(this.ffmpegBin, [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=${CONCAT_SAMPLE_RATE}:cl=mono`,
      '-t',
      String(TURN_GAP_SECONDS),
      path,
    ])
  }

  /**
   * N本のWAV（ターンごとの発話）を、ターン間にTURN_GAP_SECONDSの無音を挟んで1本のmp3に
   * 連結する（J-37）。各入力はaformatでサンプルレート・チャンネルを揃えてからconcatする
   * （ボイスモデルによってサンプルレートが異なる可能性への安全策）
   */
  private async concatTurnsWithGaps(
    turnWavPaths: readonly string[],
    outputPath: string,
  ): Promise<number> {
    const silenceWavPath = `${outputPath}.gap.tmp.wav`
    await this.createSilenceWav(silenceWavPath)

    // 発話0, 無音, 発話1, 無音, ... の順で入力を並べる（同じ無音ファイルを複数回-iで開く）
    const inputPaths: string[] = []
    turnWavPaths.forEach((p, i) => {
      if (i > 0) inputPaths.push(silenceWavPath)
      inputPaths.push(p)
    })
    const inputArgs = inputPaths.flatMap((p) => ['-i', p])
    const normalized = inputPaths.map(
      (_, i) =>
        `[${i}:0]aformat=sample_fmts=s16:sample_rates=${CONCAT_SAMPLE_RATE}:channel_layouts=mono[a${i}]`,
    )
    const concatRefs = inputPaths.map((_, i) => `[a${i}]`).join('')
    const filterComplex = `${normalized.join(';')};${concatRefs}concat=n=${inputPaths.length}:v=0:a=1[out]`

    await this.run(this.ffmpegBin, [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterComplex,
      '-map',
      '[out]',
      '-ac',
      '1',
      '-b:a',
      '80k',
      outputPath,
    ])
    const durationMs = await this.probeDurationMs(outputPath)
    await rm(silenceWavPath, { force: true })
    return durationMs
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

    // 質問部の実測長（連結前に測る）。questionEndMs は質問終端＋無音の半分（200ms）に置き、
    // クリップ再生時に質問の尻切れを防ぎつつ応答の頭を含めない
    const questionDurationMs = await this.probeDurationMs(tmpQuestionWav)

    // 2本のWAVをターン間400ms無音を挟んで1本のmp3に連結する（J-37）
    const durationMs = await this.concatTurnsWithGaps(
      [tmpQuestionWav, tmpAnswerWav],
      input.outputPath,
    )
    await rm(tmpQuestionWav, { force: true })
    await rm(tmpAnswerWav, { force: true })

    return {
      voice: `${questionVoice.voiceName}+${answerVoice.voiceName}`,
      durationMs,
      questionEndMs: Math.min(questionDurationMs + (TURN_GAP_SECONDS * 1000) / 2, durationMs - 1),
    }
  }

  async synthesizePart2WithResponses(
    input: SynthesizePart2WithResponsesInput,
  ): Promise<SynthesizeResult> {
    if (input.responseTexts.length === 0) {
      throw new Error('synthesizePart2WithResponsesにはresponseTextsが1件以上必要')
    }
    const tmpQuestionWav = `${input.outputPath}.q.tmp.wav`
    const tmpResponseWavs = input.responseTexts.map((_, i) => `${input.outputPath}.r${i}.tmp.wav`)

    const questionVoice = await this.synthesizeToWav(
      input.questionText,
      input.accent,
      'primary',
      tmpQuestionWav,
    )
    // 3応答はすべて応答話者（secondary）で読む。voice文字列を従来形式
    // （primary+secondary）に保つことで、既存パックの voice と一致し続ける
    const responseVoices: VoiceSpec[] = []
    for (let i = 0; i < input.responseTexts.length; i++) {
      responseVoices.push(
        await this.synthesizeToWav(
          input.responseTexts[i]!,
          input.accent,
          'secondary',
          tmpResponseWavs[i]!,
        ),
      )
    }

    // 連結前に各セグメントの実測長を取る（オフセットの積算に使う）
    const questionDurationMs = await this.probeDurationMs(tmpQuestionWav)
    const responseDurationsMs: number[] = []
    for (const path of tmpResponseWavs) {
      responseDurationsMs.push(await this.probeDurationMs(path))
    }

    const durationMs = await this.concatTurnsWithGaps(
      [tmpQuestionWav, ...tmpResponseWavs],
      input.outputPath,
    )
    await rm(tmpQuestionWav, { force: true })
    await Promise.all(tmpResponseWavs.map((p) => rm(p, { force: true })))

    const gapMs = TURN_GAP_SECONDS * 1000
    const offsets: number[] = []
    let cursor = questionDurationMs + gapMs
    for (const responseDurationMs of responseDurationsMs) {
      offsets.push(Math.round(cursor))
      cursor += responseDurationMs + gapMs
    }
    // mp3のencoder paddingで実長がWAV積算より短くなることがある。バリデータの
    // 「厳密単調増加」「末尾 < durationMs」を満たすよう末尾側から詰める
    for (let i = offsets.length - 1; i >= 0; i--) {
      const upperBound = durationMs - (offsets.length - i)
      if (offsets[i]! > upperBound) offsets[i] = upperBound
      if (i > 0 && offsets[i - 1]! >= offsets[i]!) offsets[i - 1] = offsets[i]! - 1
    }

    return {
      voice: `${questionVoice.voiceName}+${responseVoices[0]!.voiceName}`,
      durationMs,
      questionEndMs: Math.min(questionDurationMs + gapMs / 2, durationMs - 1),
      responseOffsetsMs: offsets,
    }
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

    // N本のWAVを発話順どおり、ターン間400ms無音を挟んで1本のmp3へ連結する（J-37）
    const durationMs = await this.concatTurnsWithGaps(tmpWavPaths, input.outputPath)
    await Promise.all(tmpWavPaths.map((p) => rm(p, { force: true })))

    const uniqueVoiceNames = [...new Set(voices.map((v) => v.voiceName))]
    return { voice: uniqueVoiceNames.join('+'), durationMs }
  }
}
