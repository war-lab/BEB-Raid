// T-24 完了条件: 各コマンドの雛形が動き、APIキーが環境変数から読まれる
import { describe, expect, it } from 'vitest'

import { commands, runCli } from './commands.js'
import { LLM_API_KEY_ENV, maskApiKey, readApiKey, TTS_API_KEY_ENV } from './env.js'

/** 出力を配列に集めて実行するヘルパ */
async function run(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const lines: string[] = []
  const code = await runCli(argv, env, (line) => lines.push(line))
  return { code, output: lines.join('\n') }
}

describe('コマンド体系（04の5節）', () => {
  it('generate / review-export / review-import / tts / build の5コマンドがある', () => {
    expect(commands.map((c) => c.name)).toEqual([
      'generate',
      'review-export',
      'review-import',
      'tts',
      'build',
    ])
  })

  it('--help で全コマンドの一覧が出る', async () => {
    const { code, output } = await run(['--help'])
    expect(code).toBe(0)
    for (const c of commands) {
      expect(output).toContain(c.name)
    }
  })

  it('引数なしは usage を出して異常終了', async () => {
    const { code } = await run([])
    expect(code).toBe(1)
  })

  it('不明なコマンドは異常終了', async () => {
    const { code, output } = await run(['deploy'])
    expect(code).toBe(1)
    expect(output).toContain('不明なコマンド')
  })

  it('キー不要のコマンド雛形（review-export / review-import / build）が動く', async () => {
    for (const name of ['review-export', 'review-import', 'build']) {
      const { code, output } = await run([name])
      expect(code, `${name} が失敗`).toBe(0)
      expect(output).toContain('未実装')
    }
  })
})

describe('APIキーの環境変数読み込み', () => {
  it('generate: キー未設定なら環境変数名の案内付きで異常終了', async () => {
    const { code, output } = await run(['generate'], {})
    expect(code).toBe(1)
    expect(output).toContain(LLM_API_KEY_ENV)
  })

  it('generate: 環境変数からキーが読まれ、値そのものは出力されない', async () => {
    const secret = 'sk-test-abcdef1234567890'
    const { code, output } = await run(['generate'], { [LLM_API_KEY_ENV]: secret })
    expect(code).toBe(0)
    expect(output).toContain(LLM_API_KEY_ENV)
    expect(output).not.toContain(secret)
  })

  it('tts: キー未設定なら異常終了、設定済みなら動く', async () => {
    expect((await run(['tts'], {})).code).toBe(1)
    expect((await run(['tts'], { [TTS_API_KEY_ENV]: 'tts-key-123456' })).code).toBe(0)
  })

  it('readApiKey は空文字列を未設定扱いにする', () => {
    expect(readApiKey('X', { X: '' })).toBeNull()
    expect(readApiKey('X', { X: '  ' })).toBeNull()
    expect(readApiKey('X', { X: 'value' })).toBe('value')
  })

  it('maskApiKey はキー全体を含まない', () => {
    const secret = 'sk-test-abcdef1234567890'
    expect(maskApiKey(secret)).not.toContain(secret)
  })
})
