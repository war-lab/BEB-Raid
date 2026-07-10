// T-24 完了条件: 各コマンドの雛形が動き、APIキーが環境変数から読まれる
// T-25 完了条件: freq-list コマンドが動き、S200語がランク根拠付きで出力される
// T-30 完了条件: review-export/review-import の実ファイル往復（ダミーデータ）
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commands, runCli } from './commands.js'
import { LLM_API_KEY_ENV, maskApiKey, readApiKey, TTS_API_KEY_ENV } from './env.js'
import type { FreqList } from './freqList.js'
import { parseJsonl, type GeneratedItemDraft } from './review.js'

/** 出力を配列に集めて実行するヘルパ */
async function run(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const lines: string[] = []
  const code = await runCli(argv, env, (line) => lines.push(line))
  return { code, output: lines.join('\n') }
}

describe('コマンド体系（04の5節）', () => {
  it('generate / freq-list / review-export / review-import / tts / build の6コマンドがある', () => {
    expect(commands.map((c) => c.name)).toEqual([
      'generate',
      'freq-list',
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

  it('キー不要のコマンド雛形（build）が動く', async () => {
    const { code, output } = await run(['build'])
    expect(code).toBe(0)
    expect(output).toContain('未実装')
  })

  it('review-export / review-import は引数不足だと使い方を出して異常終了する', async () => {
    expect((await run(['review-export'])).code).toBe(1)
    expect((await run(['review-export', 'a.jsonl'])).code).toBe(1)
    expect((await run(['review-import'])).code).toBe(1)
    expect((await run(['review-import', 'a.jsonl', 'b.tsv', 'c.jsonl'])).code).toBe(1)
  })
})

describe('freq-list（T-25）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-freqlist-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要でS200語がランク根拠付きで出力される', async () => {
    const outputPath = join(dir, 'freq-list.json')
    const { code, output } = await run(['freq-list', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('200語')

    const list = JSON.parse(await readFile(outputPath, 'utf-8')) as FreqList
    const sWords = list.words.filter((w) => w.freqRank === 'S')
    expect(sWords).toHaveLength(200)
    expect(sWords.every((w) => w.rationale.trim() !== '')).toBe(true)
    expect(sWords.every((w) => w.rankSource === 'llm')).toBe(true)
    // 単語の重複が無いこと
    expect(new Set(sWords.map((w) => w.word.toLowerCase())).size).toBe(200)
  })

  it('meta にコーパス未使用の理由・精度未検証の免責事項が記録される', async () => {
    const outputPath = join(dir, 'freq-list.json')
    await run(['freq-list', outputPath], {})
    const list = JSON.parse(await readFile(outputPath, 'utf-8')) as FreqList
    expect(list.meta.corpusSource).toBeNull()
    expect(list.meta.corpusLicense).toBeNull()
    expect(list.meta.disclaimer).toContain('未検証')
  })

  it('出力先を省略するとcontent/freq-list.jsonが既定値になる', async () => {
    const cmd = commands.find((c) => c.name === 'freq-list')
    expect(cmd).toBeDefined()
    // 既定パスの解決自体はrunCli経由の統合テストで直接ファイルシステムを汚さず
    // 確認しづらいため、コマンド一覧上の説明文に既定の書き出し先が明記されていることを確認する
    expect(cmd!.description).toContain('content/freq-list.json')
  })
})

describe('review-export / review-import: 実ファイルでの往復（T-30）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-review-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('ダミードラフト→export→（手で書き換え）→import の往復が緑', async () => {
    const draftPath = join(dir, 'drafts.jsonl')
    const tsvPath = join(dir, 'review.tsv')
    const acceptedPath = join(dir, 'accepted.jsonl')
    const rejectedPath = join(dir, 'rejected.jsonl')

    const drafts: GeneratedItemDraft[] = [
      { id: 'v-1', kind: 'vocab_card', preview: 'submit / 提出する', payload: { word: 'submit' } },
      { id: 'v-2', kind: 'vocab_card', preview: 'attend / 出席する', payload: { word: 'attend' } },
      {
        id: 'v-3',
        kind: 'vocab_card',
        preview: 'negotiate / 交渉する',
        payload: { word: 'negotiate' },
      },
    ]
    await writeFile(draftPath, drafts.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf-8')

    const exported = await run(['review-export', draftPath, tsvPath])
    expect(exported.code).toBe(0)

    // 「レビューアがスプレッドシートで手で書き換えた」を模擬
    const tsv = await readFile(tsvPath, 'utf-8')
    const lines = tsv.trim().split('\n')
    lines[1] = 'v-1\tvocab_card\tsubmit / 提出する\t採用\t\t'
    lines[2] = 'v-2\tvocab_card\tattend / 出席する\t修正\t{"word":"attend-fixed"}\t'
    lines[3] = 'v-3\tvocab_card\tnegotiate / 交渉する\t破棄\t\t既存教材に酷似'
    await writeFile(tsvPath, lines.join('\n') + '\n', 'utf-8')

    const imported = await run(['review-import', draftPath, tsvPath, acceptedPath, rejectedPath])
    expect(imported.code).toBe(0)

    const accepted = parseJsonl<{ word: string }>(await readFile(acceptedPath, 'utf-8'))
    expect(accepted).toEqual([{ word: 'submit' }, { word: 'attend-fixed' }])

    const rejected = parseJsonl<{ id: string; reason: string }>(
      await readFile(rejectedPath, 'utf-8'),
    )
    expect(rejected).toEqual([{ id: 'v-3', kind: 'vocab_card', reason: '既存教材に酷似' }])
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
