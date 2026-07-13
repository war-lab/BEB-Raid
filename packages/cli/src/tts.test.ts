// T-31 完了条件のテスト（純粋ロジック層）:
// - 話者ローテーション（米/英2アクセント。en_AU不在のため縮退）
// - モックプロバイダでの生成フロー・メタ記録（voice/durationMs）
import { describe, expect, it, vi } from 'vitest'
import {
  isSupportedAccent,
  PiperTtsProvider,
  rotateAccent,
  SUPPORTED_ACCENTS,
  voiceFor,
  type ProcessRunner,
} from './tts.js'

describe('rotateAccent / voiceFor', () => {
  it('米/英の2アクセントのみをローテーションする（en_AU不在のため縮退）', () => {
    expect(SUPPORTED_ACCENTS).toEqual(['US', 'UK'])
    expect(rotateAccent(0)).toBe('US')
    expect(rotateAccent(1)).toBe('UK')
    expect(rotateAccent(2)).toBe('US')
    expect(rotateAccent(3)).toBe('UK')
  })

  it('isSupportedAccentはUS/UKのみtrue、AU/CAはfalse', () => {
    expect(isSupportedAccent('US')).toBe(true)
    expect(isSupportedAccent('UK')).toBe(true)
    expect(isSupportedAccent('AU')).toBe(false)
    expect(isSupportedAccent('CA')).toBe(false)
  })

  it('アクセント×役割ごとに別ボイス（Part2の設問/応答で別話者=実装指示2）', () => {
    const usPrimary = voiceFor('US', 'primary')
    const usSecondary = voiceFor('US', 'secondary')
    const ukPrimary = voiceFor('UK', 'primary')
    expect(usPrimary.modelFile).not.toBe(usSecondary.modelFile)
    expect(usPrimary.modelFile).not.toBe(ukPrimary.modelFile)
    expect(usPrimary.voiceName).toContain('piper:')
  })
})

describe('PiperTtsProvider（モックプロセスでの生成フロー）', () => {
  function fakeRunProcess(): { run: ProcessRunner; calls: { command: string; args: string[] }[] } {
    const calls: { command: string; args: string[] }[] = []
    const run: ProcessRunner = vi.fn(async (command, args) => {
      calls.push({ command, args })
      if (command === 'ffprobe') {
        return { stdout: '3.395918\n' }
      }
      return { stdout: '' }
    })
    return { run, calls }
  }

  it('piper→ffmpeg→ffprobeの順で呼び、voice/durationMsを返す', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({
      piperBin: 'piper',
      voicesDir: '/voices',
      ffmpegBin: 'ffmpeg',
      ffprobeBin: 'ffprobe',
      runProcess: run,
    })

    const result = await provider.synthesize({
      text: 'Please submit the report.',
      accent: 'US',
      role: 'primary',
      outputPath: '/out/vocab-submit.mp3',
    })

    expect(calls.map((c) => c.command)).toEqual(['piper', 'ffmpeg', 'ffprobe'])
    expect(calls[0]?.args).toContain('/voices/en_US-lessac-medium.onnx')
    expect(calls[1]?.args).toContain('/out/vocab-submit.mp3')
    expect(result.voice).toBe('piper:en_US-lessac-medium')
    expect(result.durationMs).toBe(3396)
  })

  it('accent/roleに応じて異なるモデルファイルを指定する', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })

    await provider.synthesize({
      text: 'Who will attend?',
      accent: 'UK',
      role: 'secondary',
      outputPath: '/out/part2-attend.mp3',
    })

    expect(calls[0]?.args).toContain('/voices/en_GB-alan-medium.onnx')
  })

  it('環境変数からbinパスを解決する（省略時）', async () => {
    const { run, calls } = fakeRunProcess()
    const prevBin = process.env.PIPER_BIN
    const prevVoices = process.env.PIPER_VOICES_DIR
    process.env.PIPER_BIN = '/custom/piper'
    process.env.PIPER_VOICES_DIR = '/custom/voices'
    try {
      const provider = new PiperTtsProvider({ runProcess: run })
      await provider.synthesize({
        text: 'test',
        accent: 'US',
        role: 'primary',
        outputPath: '/out/x.mp3',
      })
      expect(calls[0]?.command).toBe('/custom/piper')
      expect(calls[0]?.args).toContain('/custom/voices/en_US-lessac-medium.onnx')
    } finally {
      if (prevBin === undefined) delete process.env.PIPER_BIN
      else process.env.PIPER_BIN = prevBin
      if (prevVoices === undefined) delete process.env.PIPER_VOICES_DIR
      else process.env.PIPER_VOICES_DIR = prevVoices
    }
  })

  it('piperの標準入力にtextを渡す', async () => {
    const inputs: (string | undefined)[] = []
    const run: ProcessRunner = vi.fn(async (command, _args, options) => {
      if (command === 'piper') inputs.push(options?.input)
      if (command === 'ffprobe') return { stdout: '1.0' }
      return { stdout: '' }
    })
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })
    await provider.synthesize({
      text: 'Hello world',
      accent: 'US',
      role: 'primary',
      outputPath: '/out/x.mp3',
    })
    expect(inputs).toEqual(['Hello world'])
  })
})

describe('PiperTtsProvider.synthesizeDialogue（Part2: 設問と応答で別話者）', () => {
  function fakeRunProcess(): { run: ProcessRunner; calls: { command: string; args: string[] }[] } {
    const calls: { command: string; args: string[] }[] = []
    const run: ProcessRunner = vi.fn(async (command, args) => {
      calls.push({ command, args })
      if (command === 'ffprobe') return { stdout: '3.579' }
      return { stdout: '' }
    })
    return { run, calls }
  }

  it('piper(質問)→piper(応答)→ffmpeg(連結)→ffprobeの順で呼ぶ', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })

    const result = await provider.synthesizeDialogue({
      questionText: 'When should I submit the report?',
      answerText: 'By Friday.',
      accent: 'US',
      outputPath: '/out/part2-submit.mp3',
    })

    expect(calls.map((c) => c.command)).toEqual(['piper', 'piper', 'ffmpeg', 'ffprobe'])
    // 設問はprimary、応答はsecondaryの声で読む
    expect(calls[0]?.args).toContain('/voices/en_US-lessac-medium.onnx')
    expect(calls[1]?.args).toContain('/voices/en_US-ryan-medium.onnx')
    // ffmpegはconcatフィルタで2本のWAVを1本にする
    expect(calls[2]?.args).toContain('[0:0][1:0]concat=n=2:v=0:a=1[out]')
    expect(result.voice).toBe('piper:en_US-lessac-medium+piper:en_US-ryan-medium')
    expect(result.durationMs).toBe(3579)
  })

  it('設問と応答をそれぞれの話者のstdinに渡す', async () => {
    const inputsByVoice: Record<string, string | undefined> = {}
    const run: ProcessRunner = vi.fn(async (command, args, options) => {
      if (command === 'piper') {
        const modelArg = args[args.indexOf('-m') + 1]
        inputsByVoice[modelArg!] = options?.input
      }
      if (command === 'ffprobe') return { stdout: '1.0' }
      return { stdout: '' }
    })
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })
    await provider.synthesizeDialogue({
      questionText: 'Who will attend?',
      answerText: 'Ms. Tanaka will.',
      accent: 'UK',
      outputPath: '/out/x.mp3',
    })
    expect(inputsByVoice['/voices/en_GB-jenny_dioco-medium.onnx']).toBe('Who will attend?')
    expect(inputsByVoice['/voices/en_GB-alan-medium.onnx']).toBe('Ms. Tanaka will.')
  })
})
