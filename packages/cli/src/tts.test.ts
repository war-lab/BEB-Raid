// T-31 完了条件のテスト（純粋ロジック層）:
// - 話者ローテーション（米/英2アクセント。en_AU不在のため縮退）
// - モックプロバイダでの生成フロー・メタ記録（voice/durationMs）
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  isSupportedAccent,
  PiperTtsProvider,
  rotateAccent,
  sanitizeForTts,
  SUPPORTED_ACCENTS,
  voiceFor,
  type ProcessRunner,
} from './tts.js'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

describe('runProcess: 一過性の失敗への再試行（T-81。Windowsのウイルス対策ソフトによる一時的なファイルロック対策）', () => {
  it('2回失敗しても3回目で成功すれば解決する', async () => {
    const { spawn } = await import('node:child_process')
    let callCount = 0
    vi.mocked(spawn).mockImplementation(() => {
      callCount++
      const child = new EventEmitter() as unknown as {
        stdout: EventEmitter
        stdin: { write: () => void; end: () => void }
        on: EventEmitter['on']
      }
      child.stdout = new EventEmitter()
      child.stdin = { write: () => {}, end: () => {} }
      const exitCode = callCount < 3 ? 1 : 0
      queueMicrotask(() => (child as unknown as EventEmitter).emit('close', exitCode))
      return child as never
    })

    const { runProcess } = await import('./tts.js')
    const result = await runProcess('ffmpeg', ['-y'])

    expect(callCount).toBe(3)
    expect(result.stdout).toBe('')
  })

  it('3回とも失敗したら最終的にエラーを投げる', async () => {
    const { spawn } = await import('node:child_process')
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as unknown as {
        stdout: EventEmitter
        stdin: { write: () => void; end: () => void }
        on: EventEmitter['on']
      }
      child.stdout = new EventEmitter()
      child.stdin = { write: () => {}, end: () => {} }
      queueMicrotask(() => (child as unknown as EventEmitter).emit('close', 1))
      return child as never
    })

    const { runProcess } = await import('./tts.js')
    await expect(runProcess('ffmpeg', ['-y'])).rejects.toThrow(/コード1/)
  })
})

describe('sanitizeForTts（M2・T-64。em/enダッシュがPiperのstdinでクラッシュする不具合の回避）', () => {
  it('em dashをカンマに置換する', () => {
    expect(sanitizeForTts('That should work — most of the team is free.')).toBe(
      'That should work, most of the team is free.',
    )
  })

  it('en dashも同様に置換する', () => {
    expect(sanitizeForTts('pages 10–20')).toBe('pages 10, 20')
  })

  it('ダッシュを含まないテキストはそのまま', () => {
    expect(sanitizeForTts('Please submit the report.')).toBe('Please submit the report.')
  })
})

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

  it('piperにlength_scale（既定1.15。T-81・J-37）を渡す', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })

    await provider.synthesize({
      text: 'Please submit the report.',
      accent: 'US',
      role: 'primary',
      outputPath: '/out/x.mp3',
    })

    const piperArgs = calls[0]!.args
    expect(piperArgs[piperArgs.indexOf('--length_scale') + 1]).toBe('1.15')
  })

  it('lengthScaleオプションで話速を上書きできる', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({
      voicesDir: '/voices',
      runProcess: run,
      lengthScale: 1.2,
    })

    await provider.synthesize({
      text: 'Please submit the report.',
      accent: 'US',
      role: 'primary',
      outputPath: '/out/x.mp3',
    })

    const piperArgs = calls[0]!.args
    expect(piperArgs[piperArgs.indexOf('--length_scale') + 1]).toBe('1.2')
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

    // piper(質問)→piper(応答)→ffprobe(質問部実測=questionEndMs用)→
    // ffmpeg(無音生成。J-37の400msギャップ)→ffmpeg(連結)→ffprobe(全長実測)
    expect(calls.map((c) => c.command)).toEqual([
      'piper',
      'piper',
      'ffprobe',
      'ffmpeg',
      'ffmpeg',
      'ffprobe',
    ])
    // 設問はprimary、応答はsecondaryの声で読む
    expect(calls[0]?.args).toContain('/voices/en_US-lessac-medium.onnx')
    expect(calls[1]?.args).toContain('/voices/en_US-ryan-medium.onnx')
    // 無音生成: 400ms・モノラル
    expect(calls[3]?.args).toContain('anullsrc=r=22050:cl=mono')
    expect(calls[3]?.args).toContain('0.4')
    // ffmpegはconcatフィルタで「設問・無音・応答」の3本を1本にする（aformatで正規化してから連結）
    expect(calls[4]?.args.join(' ')).toContain('concat=n=3:v=0:a=1[out]')
    expect(result.voice).toBe('piper:en_US-lessac-medium+piper:en_US-ryan-medium')
    expect(result.durationMs).toBe(3579)
    // questionEndMs = 質問部実測(3579ms。fakeは全ffprobeが3.579を返す)＋無音の半分(200ms)。
    // ただし全長-1msでクランプされる（fakeでは全長も3579msのため 3578 になる）
    expect(result.questionEndMs).toBe(3578)
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

describe('PiperTtsProvider.synthesizeMultiTurnDialogue（Part3: Nターンの会話。M2・T-64）', () => {
  function fakeRunProcess(): { run: ProcessRunner; calls: { command: string; args: string[] }[] } {
    const calls: { command: string; args: string[] }[] = []
    const run: ProcessRunner = vi.fn(async (command, args) => {
      calls.push({ command, args })
      if (command === 'ffprobe') return { stdout: '5.123' }
      return { stdout: '' }
    })
    return { run, calls }
  }

  it('piper×4（各ターン）→ffmpeg(N本連結)→ffprobeの順で呼ぶ', async () => {
    const { run, calls } = fakeRunProcess()
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })

    const result = await provider.synthesizeMultiTurnDialogue({
      turns: [
        { text: 'Do you have a minute?', role: 'primary' },
        { text: 'Sure, what is it?', role: 'secondary' },
        { text: 'Could we reschedule?', role: 'primary' },
        { text: 'That works for me.', role: 'secondary' },
      ],
      accent: 'US',
      outputPath: '/out/p34-p3-01.mp3',
    })

    expect(calls.map((c) => c.command)).toEqual([
      'piper',
      'piper',
      'piper',
      'piper',
      'ffmpeg',
      'ffmpeg',
      'ffprobe',
    ])
    // 話者はturnsのrole指定どおりに交互（primary/secondary）
    expect(calls[0]?.args).toContain('/voices/en_US-lessac-medium.onnx')
    expect(calls[1]?.args).toContain('/voices/en_US-ryan-medium.onnx')
    expect(calls[2]?.args).toContain('/voices/en_US-lessac-medium.onnx')
    expect(calls[3]?.args).toContain('/voices/en_US-ryan-medium.onnx')
    // 無音生成（J-37の400msギャップ。ターン数によらず1回だけ生成し使い回す）
    expect(calls[4]?.args).toContain('anullsrc=r=22050:cl=mono')
    // ffmpegはconcatフィルタで「発話・無音」を交互に7本（4発話+3ギャップ）連結する
    expect(calls[5]?.args.join(' ')).toContain('concat=n=7:v=0:a=1[out]')
    expect(result.voice).toBe('piper:en_US-lessac-medium+piper:en_US-ryan-medium')
    expect(result.durationMs).toBe(5123)
  })

  it('各ターンのテキストをそのターンの話者のstdinに渡す', async () => {
    const inputsInOrder: (string | undefined)[] = []
    const run: ProcessRunner = vi.fn(async (command, _args, options) => {
      if (command === 'piper') inputsInOrder.push(options?.input)
      if (command === 'ffprobe') return { stdout: '1.0' }
      return { stdout: '' }
    })
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })
    await provider.synthesizeMultiTurnDialogue({
      turns: [
        { text: 'First turn.', role: 'primary' },
        { text: 'Second turn.', role: 'secondary' },
        { text: 'Third turn.', role: 'primary' },
      ],
      accent: 'US',
      outputPath: '/out/x.mp3',
    })
    expect(inputsInOrder).toEqual(['First turn.', 'Second turn.', 'Third turn.'])
  })

  it('turnsが空だとエラーになる', async () => {
    const { run } = fakeRunProcess()
    const provider = new PiperTtsProvider({ voicesDir: '/voices', runProcess: run })
    await expect(
      provider.synthesizeMultiTurnDialogue({ turns: [], accent: 'US', outputPath: '/out/x.mp3' }),
    ).rejects.toThrow()
  })
})
