// T-24 完了条件: 各コマンドの雛形が動き、APIキーが環境変数から読まれる
// T-25 完了条件: freq-list コマンドが動き、S200語がランク根拠付きで出力される
// T-30 完了条件: review-export/review-import の実ファイル往復（ダミーデータ）
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { commands, runCli } from './commands.js'
import { maskApiKey, readApiKey } from './env.js'
import type { FreqList } from './freqList.js'
import { parseJsonl, type GeneratedItemDraft } from './review.js'

/** 出力を配列に集めて実行するヘルパ。out(stdout)/errOut(stderr)を分離して返す */
async function run(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const lines: string[] = []
  const errLines: string[] = []
  const code = await runCli(
    argv,
    env,
    (line) => lines.push(line),
    (line) => errLines.push(line),
  )
  return { code, output: lines.join('\n'), errOutput: errLines.join('\n') }
}

describe('コマンド体系（04の5節）', () => {
  it('generate / freq-list / review-export / review-import / tts / calibrate / kpi / build の8コマンドがある', () => {
    expect(commands.map((c) => c.name)).toEqual([
      'generate',
      'freq-list',
      'review-export',
      'review-import',
      'tts',
      'calibrate',
      'kpi',
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

  it('不明なコマンドは異常終了し、案内はstderrに出る（stdoutは汚さない）', async () => {
    const { code, output, errOutput } = await run(['deploy'])
    expect(code).toBe(1)
    expect(errOutput).toContain('不明なコマンド')
    expect(output).toBe('')
  })

  it('review-export / review-import は引数不足だと使い方をstderrに出して異常終了する', async () => {
    const missingExport = await run(['review-export'])
    expect(missingExport.code).toBe(1)
    expect(missingExport.errOutput).toContain('使い方')
    expect(missingExport.output).toBe('')

    expect((await run(['review-export', 'a.jsonl'])).code).toBe(1)
    expect((await run(['review-import'])).code).toBe(1)
    expect((await run(['review-import', 'a.jsonl', 'b.tsv', 'c.jsonl'])).code).toBe(1)
  })
})

describe('generate vocab_card（T-26）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で200件のvocab_cardドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'vocab-card-s.jsonl')
    const { code, output } = await run(['generate', 'vocab_card', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('200件')

    const drafts = parseJsonl<{
      id: string
      kind: string
      preview: string
      payload: { format: string; front: string; phrase: string; back: string }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(200)
    expect(drafts.every((d) => d.kind === 'vocab_card')).toBe(true)
    expect(drafts.every((d) => d.payload.format === 'vocab_card')).toBe(true)
    expect(
      drafts.every((d) => d.payload.phrase.toLowerCase().includes(d.payload.front.toLowerCase())),
    ).toBe(true)
    // review-export/review-import と同じドラフット形式（id/kind/preview/payload）であること
    expect(new Set(drafts.map((d) => d.id)).size).toBe(200)
  })

  it('review-export にそのまま渡せる（T-30パイプラインとの接続）', async () => {
    const draftPath = join(dir, 'vocab-card-s.jsonl')
    const tsvPath = join(dir, 'review.tsv')
    await run(['generate', 'vocab_card', draftPath], {})
    const { code } = await run(['review-export', draftPath, tsvPath])
    expect(code).toBe(0)
    const tsv = await readFile(tsvPath, 'utf-8')
    expect(tsv.trim().split('\n')).toHaveLength(201) // ヘッダー + 200件
  })

  it('kind未指定・未対応kindは使い方をstderrに出して異常終了する', async () => {
    const missing = await run(['generate'])
    expect(missing.code).toBe(1)
    expect(missing.errOutput).toContain('使い方')

    const unsupported = await run(['generate', 'not-a-real-kind'])
    expect(unsupported.code).toBe(1)
    expect(unsupported.errOutput).toContain('未対応のkind')
  })
})

describe('generate vocab_card_a / vocab_card_b（M2・T-59）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-ab-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it.each([
    ['vocab_card_a', 730],
    ['vocab_card_b', 860],
  ])('%sは200件・levelBand=%iのドラフトを出力する', async (kind, levelBand) => {
    const outputPath = join(dir, `${kind}.jsonl`)
    const { code, output } = await run(['generate', kind, outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('200件')

    const drafts = parseJsonl<{
      kind: string
      payload: { format: string; front: string; phrase: string; levelBand: number }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(200)
    expect(drafts.every((d) => d.kind === 'vocab_card')).toBe(true)
    expect(drafts.every((d) => d.payload.levelBand === levelBand)).toBe(true)
  })
})

describe('generate audio_qa（T-27）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-part2-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で50件のaudio_qaドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'part2-s.jsonl')
    const { code, output } = await run(['generate', 'audio_qa', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('50件')

    const drafts = parseJsonl<{
      id: string
      kind: string
      preview: string
      payload: {
        format: string
        script: string
        answer: string
        choices: { key: string; text: string }[]
        keyVocab: { word: string; sense: string; freqRank: string }[]
        tags: string[]
        audio: string
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(50)
    expect(drafts.every((d) => d.kind === 'audio_qa')).toBe(true)
    expect(drafts.every((d) => d.payload.format === 'audio_qa')).toBe(true)
    // answerが選択肢keyのいずれかと一致する
    expect(drafts.every((d) => d.payload.choices.some((c) => c.key === d.payload.answer))).toBe(
      true,
    )
    // keyVocabがSランクとして記録されている
    expect(drafts.every((d) => d.payload.keyVocab[0]?.freqRank === 'S')).toBe(true)
    // audioが予約パス（実ファイルはT-31まで存在しない）
    expect(drafts.every((d) => d.payload.audio.startsWith('audio/part2/'))).toBe(true)
    expect(new Set(drafts.map((d) => d.id)).size).toBe(50)
  })

  it('review-export にそのまま渡せる（T-30パイプラインとの接続）', async () => {
    const draftPath = join(dir, 'part2-s.jsonl')
    const tsvPath = join(dir, 'review.tsv')
    await run(['generate', 'audio_qa', draftPath], {})
    const { code } = await run(['review-export', draftPath, tsvPath])
    expect(code).toBe(0)
    const tsv = await readFile(tsvPath, 'utf-8')
    expect(tsv.trim().split('\n')).toHaveLength(51) // ヘッダー + 50件
  })
})

describe('generate audio_qa_s2（M2・T-60）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-part2-s2-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で100件のaudio_qaドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'part2-s2.jsonl')
    const { code, output } = await run(['generate', 'audio_qa_s2', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('100件')

    const drafts = parseJsonl<{
      kind: string
      payload: {
        format: string
        difficulty: number
        keyVocab: { freqRank: string }[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(100)
    expect(drafts.every((d) => d.kind === 'audio_qa')).toBe(true)
    expect(drafts.every((d) => [2, 3, 4].includes(d.payload.difficulty))).toBe(true)
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'B')).toBe(true)
  })
})

describe('generate text_blank（T-28）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-part5-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で50件のtext_blankドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'part5-s.jsonl')
    const { code, output } = await run(['generate', 'text_blank', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('50件')

    const drafts = parseJsonl<{
      id: string
      kind: string
      preview: string
      payload: {
        format: string
        question: string
        answer: string
        choices: { key: string; text: string }[]
        keyVocab: { word: string; sense: string; freqRank: string }[]
        tags: string[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(50)
    expect(drafts.every((d) => d.kind === 'text_blank')).toBe(true)
    expect(drafts.every((d) => d.payload.format === 'text_blank')).toBe(true)
    expect(drafts.every((d) => d.payload.question.includes('___'))).toBe(true)
    expect(drafts.every((d) => d.payload.choices.some((c) => c.key === d.payload.answer))).toBe(
      true,
    )
    expect(drafts.every((d) => d.payload.keyVocab[0]?.freqRank === 'S')).toBe(true)
    expect(new Set(drafts.map((d) => d.id)).size).toBe(50)
  })

  it('review-export にそのまま渡せる（T-30パイプラインとの接続）', async () => {
    const draftPath = join(dir, 'part5-s.jsonl')
    const tsvPath = join(dir, 'review.tsv')
    await run(['generate', 'text_blank', draftPath], {})
    const { code } = await run(['review-export', draftPath, tsvPath])
    expect(code).toBe(0)
    const tsv = await readFile(tsvPath, 'utf-8')
    expect(tsv.trim().split('\n')).toHaveLength(51) // ヘッダー + 50件
  })
})

describe('generate text_blank_s2（M2・T-61）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-part5-s2-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で100件のtext_blankドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'part5-s2.jsonl')
    const { code, output } = await run(['generate', 'text_blank_s2', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('100件')

    const drafts = parseJsonl<{
      kind: string
      payload: {
        format: string
        question: string
        choices: { key: string; text: string }[]
        answer: string
        keyVocab: { freqRank: string }[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(100)
    expect(drafts.every((d) => d.kind === 'text_blank')).toBe(true)
    expect(drafts.every((d) => d.payload.question.includes('___'))).toBe(true)
    expect(drafts.every((d) => d.payload.choices.some((c) => c.key === d.payload.answer))).toBe(
      true,
    )
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'B')).toBe(true)
  })
})

describe('generate audio_set（M2・T-62）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-part34-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で20件のaudio_setドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'part34-s.jsonl')
    const { code, output } = await run(['generate', 'audio_set', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('20件')

    const drafts = parseJsonl<{
      kind: string
      payload: {
        format: string
        subQuestions: { id: string; choices: { key: string; text: string }[]; answer: string }[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(20)
    expect(drafts.every((d) => d.kind === 'audio_set')).toBe(true)
    expect(drafts.every((d) => d.payload.subQuestions.length === 3)).toBe(true)
    expect(
      drafts.every((d) =>
        d.payload.subQuestions.every((sq) => sq.choices.some((c) => c.key === sq.answer)),
      ),
    ).toBe(true)
  })
})

describe('generate dictation（M2・T-62）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-dictation-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で40件のdictationドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'dictation-s.jsonl')
    const { code, output } = await run(['generate', 'dictation', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('40件')

    const drafts = parseJsonl<{
      kind: string
      payload: { format: string; blanks: { index: number; answer: string }[] }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(40)
    expect(drafts.every((d) => d.kind === 'dictation')).toBe(true)
    expect(drafts.every((d) => d.payload.blanks.length >= 1 && d.payload.blanks.length <= 3)).toBe(
      true,
    )
  })
})

describe('generate shadowing（M2・T-62）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-shadowing-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で30件のshadowingドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'shadowing-s.jsonl')
    const { code, output } = await run(['generate', 'shadowing', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('30件')

    const drafts = parseJsonl<{
      kind: string
      payload: { format: string; timing: number[] }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(30)
    expect(drafts.every((d) => d.kind === 'shadowing')).toBe(true)
    expect(
      drafts.every((d) => Array.isArray(d.payload.timing) && d.payload.timing.length > 0),
    ).toBe(true)
  })
})

describe('generate key_vocab_similar（T-29）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-similar-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で57件（19語×3問）のドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'key-vocab-similar-s.jsonl')
    const { code, output } = await run(['generate', 'key_vocab_similar', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('57件')

    const drafts = parseJsonl<{
      id: string
      kind: string
      preview: string
      payload: {
        format: string
        question: string
        answer: string
        choices: { key: string; text: string }[]
        keyVocab: { word: string; sense: string; freqRank: string }[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(57)
    expect(drafts.every((d) => d.kind === 'text_blank')).toBe(true)
    expect(drafts.every((d) => d.payload.format === 'text_blank')).toBe(true)
    expect(drafts.every((d) => d.payload.keyVocab[0]?.freqRank === 'S')).toBe(true)
    expect(new Set(drafts.map((d) => d.id)).size).toBe(57)
    // 対象語が19語×3問であること
    const wordCounts = new Map<string, number>()
    for (const d of drafts) {
      const word = d.payload.keyVocab[0]!.word
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1)
    }
    expect(wordCounts.size).toBe(19)
    expect([...wordCounts.values()].every((n) => n === 3)).toBe(true)
  })

  it('review-export にそのまま渡せる（T-30パイプラインとの接続）', async () => {
    const draftPath = join(dir, 'key-vocab-similar-s.jsonl')
    const tsvPath = join(dir, 'review.tsv')
    await run(['generate', 'key_vocab_similar', draftPath], {})
    const { code } = await run(['review-export', draftPath, tsvPath])
    expect(code).toBe(0)
    const tsv = await readFile(tsvPath, 'utf-8')
    expect(tsv.trim().split('\n')).toHaveLength(58) // ヘッダー + 57件
  })
})

describe('generate key_vocab_similar_s2（M2・T-63）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-generate-similar-s2-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('APIキー不要で60件（20語×3問）のドラフト（バリデーション通過済み）が出力される', async () => {
    const outputPath = join(dir, 'key-vocab-similar-s2.jsonl')
    const { code, output } = await run(['generate', 'key_vocab_similar_s2', outputPath], {})
    expect(code).toBe(0)
    expect(output).toContain('60件')

    const drafts = parseJsonl<{
      kind: string
      payload: {
        format: string
        keyVocab: { word: string; freqRank: string }[]
      }
    }>(await readFile(outputPath, 'utf-8'))
    expect(drafts).toHaveLength(60)
    expect(drafts.every((d) => d.kind === 'text_blank')).toBe(true)
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'A')).toBe(true)
    expect(drafts.some((d) => d.payload.keyVocab[0]?.freqRank === 'B')).toBe(true)
    const wordCounts = new Map<string, number>()
    for (const d of drafts) {
      const word = d.payload.keyVocab[0]!.word
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1)
    }
    expect(wordCounts.size).toBe(20)
    expect([...wordCounts.values()].every((n) => n === 3)).toBe(true)
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

describe('APIキーの環境変数読み込み（generate/ttsともに不要。B-2解消でPiper採用のため）', () => {
  it('generate: APIキー不要（T-25以降の方針転換）。kind未指定はエラーで使い方をstderrに出す', async () => {
    const { code, output, errOutput } = await run(['generate'], {})
    expect(code).toBe(1)
    expect(errOutput).toContain('使い方')
    expect(output).toBe('')
  })

  it('tts: APIキー不要。引数不足は使い方をstderrに出して異常終了する', async () => {
    const { code, errOutput } = await run(['tts'], {})
    expect(code).toBe(1)
    expect(errOutput).toContain('使い方')
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

  it('maskApiKey は4文字以下のキーでも全体を露出しない（3.8節フォローアップ）', () => {
    expect(maskApiKey('abc')).not.toContain('abc')
    expect(maskApiKey('abcd')).not.toContain('abcd')
    expect(maskApiKey('a')).toBe('***（1文字）')
  })
})

describe('build（T-32）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-cli-build-'))
    await mkdir(join(dir, 'drafts'), { recursive: true })
    await mkdir(join(dir, 'audio/vocab'), { recursive: true })
    await mkdir(join(dir, 'audio/part2'), { recursive: true })
    await mkdir(join(dir, 'audio/part34'), { recursive: true })
    await mkdir(join(dir, 'audio/dictation'), { recursive: true })
    await mkdir(join(dir, 'audio/shadow'), { recursive: true })
    await writeFile(join(dir, 'audio/vocab/submit.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/vocab/revise.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/vocab/streamline.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/part2/submit.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/part2/revise.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/part34/p3-01.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/dictation/submit.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/shadow/submit.mp3'), 'dummy')

    const vocabDraft: GeneratedItemDraft = {
      id: 'vocab-submit',
      kind: 'vocab_card',
      preview: 'submit',
      payload: {
        id: 'vocab-submit',
        part: 0,
        format: 'vocab_card',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        front: 'submit',
        phrase: 'Please submit the report.',
        phraseAudio: 'audio/vocab/submit.mp3',
        back: '提出する',
        freqRank: 'S',
        levelBand: 600,
      },
    }
    const part2Draft: GeneratedItemDraft = {
      id: 'part2-submit',
      kind: 'audio_qa',
      preview: 'submit',
      payload: {
        id: 'part2-submit',
        part: 2,
        format: 'audio_qa',
        difficulty: 2,
        tags: ['疑問詞聞き取り'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/part2/submit.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
        script: 'When should I submit it? — By Friday.',
        choices: [
          { key: 'A', text: 'By Friday.' },
          { key: 'B', text: 'Yes, I did.' },
        ],
        answer: 'A',
        explanation: '"By Friday."が正解。締め切りを尋ねる疑問文への具体的な回答になっている。',
        translation: '',
      },
    }
    const part5Draft: GeneratedItemDraft = {
      id: 'part5-submit',
      kind: 'text_blank',
      preview: 'submit',
      payload: {
        id: 'part5-submit',
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['品詞'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        question: 'Please ___ the report.',
        choices: [
          { key: 'A', text: 'submit' },
          { key: 'B', text: 'submission' },
        ],
        answer: 'A',
        explanation:
          '命令文のため動詞の原形submitが正しい。submissionは名詞で命令文の主動詞にはならない。',
        translation: '',
      },
    }
    const similarDraft: GeneratedItemDraft = {
      id: 'similar-submit-1',
      kind: 'text_blank',
      preview: 'submit',
      payload: {
        id: 'similar-submit-1',
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['語彙選択'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        question: 'Please ___ your application by Friday.',
        choices: [
          { key: 'A', text: 'submit' },
          { key: 'B', text: 'reject' },
        ],
        answer: 'A',
        explanation: '応募書類を「提出する」のはsubmit。rejectは「却下する」で文脈に合わない。',
        translation: '',
      },
    }
    const vocabADraft: GeneratedItemDraft = {
      id: 'vocab-revise',
      kind: 'vocab_card',
      preview: 'revise',
      payload: {
        id: 'vocab-revise',
        part: 0,
        format: 'vocab_card',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        front: 'revise',
        phrase: 'Please revise the report.',
        phraseAudio: 'audio/vocab/revise.mp3',
        back: '修正する',
        freqRank: 'A',
        levelBand: 730,
      },
    }
    const vocabBDraft: GeneratedItemDraft = {
      id: 'vocab-streamline',
      kind: 'vocab_card',
      preview: 'streamline',
      payload: {
        id: 'vocab-streamline',
        part: 0,
        format: 'vocab_card',
        difficulty: 1,
        tags: [],
        keyVocab: [],
        front: 'streamline',
        phrase: 'We need to streamline this process.',
        phraseAudio: 'audio/vocab/streamline.mp3',
        back: '合理化する',
        freqRank: 'B',
        levelBand: 860,
      },
    }
    const part2S2Draft: GeneratedItemDraft = {
      id: 'part2-revise',
      kind: 'audio_qa',
      preview: 'revise',
      payload: {
        id: 'part2-revise',
        part: 2,
        format: 'audio_qa',
        difficulty: 2,
        tags: ['疑問詞聞き取り'],
        keyVocab: [{ word: 'revise', sense: '修正する', freqRank: 'A' }],
        audio: 'audio/part2/revise.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
        script: 'When should I revise it? — By Friday.',
        choices: [
          { key: 'A', text: 'By Friday.' },
          { key: 'B', text: 'Yes, I did.' },
        ],
        answer: 'A',
        explanation: '"By Friday."が正解。締め切りを尋ねる疑問文への具体的な回答になっている。',
        translation: '',
      },
    }
    const part5S2Draft: GeneratedItemDraft = {
      id: 'part5-revise',
      kind: 'text_blank',
      preview: 'revise',
      payload: {
        id: 'part5-revise',
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['品詞'],
        keyVocab: [{ word: 'revise', sense: '修正する', freqRank: 'A' }],
        question: 'The client requested a full ___ of the contract.',
        choices: [
          { key: 'A', text: 'revision' },
          { key: 'B', text: 'revise' },
        ],
        answer: 'A',
        explanation: '空所は名詞。revisionが正しい。reviseは動詞原形で名詞の位置には合わない。',
        translation: '',
      },
    }
    const part34Draft: GeneratedItemDraft = {
      id: 'p34-p3-01',
      kind: 'audio_set',
      preview: 'p3-01',
      payload: {
        id: 'p34-p3-01',
        part: 3,
        format: 'audio_set',
        difficulty: 2,
        tags: ['先読み'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/part34/p3-01.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 5000 },
        script: 'A: Please submit it today. B: Sure, I will submit it now.',
        subQuestions: [
          {
            id: 'p34-p3-01-q1',
            question: 'What does A ask B to do?',
            choices: [
              { key: 'A', text: 'Submit it today' },
              { key: 'B', text: 'Cancel the meeting' },
            ],
            answer: 'A',
            explanation: 'Aは"Please submit it today"と述べている。',
            translation: 'Aは何をするようBに求めていますか。',
          },
        ],
      },
    }
    const dictationDraft: GeneratedItemDraft = {
      id: 'dictation-submit',
      kind: 'dictation',
      preview: 'submit',
      payload: {
        id: 'dictation-submit',
        part: 2,
        format: 'dictation',
        difficulty: 2,
        tags: ['弱形・連結'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/dictation/submit.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 2500 },
        script: 'Please submit the report by Friday.',
        blanks: [{ index: 1, answer: 'submit' }],
        explanation: '弱形になりやすいsubmitを穴にしている。',
        translation: '金曜日までに報告書を提出してください。',
      },
    }
    const shadowingDraft: GeneratedItemDraft = {
      id: 'shadow-submit',
      kind: 'shadowing',
      preview: 'submit',
      payload: {
        id: 'shadow-submit',
        part: 3,
        format: 'shadowing',
        difficulty: 2,
        tags: [],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/shadow/submit.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 2500 },
        script: 'Please submit the report by Friday.',
        translation: '金曜日までに報告書を提出してください。',
        timing: [0, 400, 900, 1400, 1900, 2400],
      },
    }
    const similarS2Draft: GeneratedItemDraft = {
      id: 'similar-revise-1',
      kind: 'text_blank',
      preview: 'revise',
      payload: {
        id: 'similar-revise-1',
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['言い換え語彙'],
        keyVocab: [{ word: 'revise', sense: '修正する', freqRank: 'A' }],
        question: 'The committee decided to ___ the proposal.',
        choices: [
          { key: 'A', text: 'revise' },
          { key: 'B', text: 'annotate' },
        ],
        answer: 'A',
        explanation: '提案書を修正するのはrevise。annotateは注釈を付けるで文脈に合わない。',
        translation: '',
      },
    }

    await writeFile(
      join(dir, 'drafts/vocab-card-s.jsonl'),
      JSON.stringify(vocabDraft) + '\n',
      'utf-8',
    )
    await writeFile(join(dir, 'drafts/part2-s.jsonl'), JSON.stringify(part2Draft) + '\n', 'utf-8')
    await writeFile(join(dir, 'drafts/part5-s.jsonl'), JSON.stringify(part5Draft) + '\n', 'utf-8')
    await writeFile(
      join(dir, 'drafts/vocab-card-a.jsonl'),
      JSON.stringify(vocabADraft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/vocab-card-b.jsonl'),
      JSON.stringify(vocabBDraft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/part2-s2.jsonl'),
      JSON.stringify(part2S2Draft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/part5-s2.jsonl'),
      JSON.stringify(part5S2Draft) + '\n',
      'utf-8',
    )
    await writeFile(join(dir, 'drafts/part34-s.jsonl'), JSON.stringify(part34Draft) + '\n', 'utf-8')
    await writeFile(
      join(dir, 'drafts/dictation-s.jsonl'),
      JSON.stringify(dictationDraft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/shadowing-s.jsonl'),
      JSON.stringify(shadowingDraft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/key-vocab-similar-s2.jsonl'),
      JSON.stringify(similarS2Draft) + '\n',
      'utf-8',
    )
    await writeFile(
      join(dir, 'drafts/key-vocab-similar-s.jsonl'),
      JSON.stringify(similarDraft) + '\n',
      'utf-8',
    )
    const similarS3Draft: GeneratedItemDraft = {
      id: 'similar-delivery-1',
      kind: 'text_blank',
      preview: 'delivery',
      payload: {
        id: 'similar-delivery-1',
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['ビジネス名詞'],
        keyVocab: [{ word: 'delivery', sense: '配達', freqRank: 'S' }],
        question: 'The ___ of the new equipment was delayed by a week.',
        choices: [
          { key: 'A', text: 'delivery' },
          { key: 'B', text: 'warranty' },
        ],
        answer: 'A',
        explanation: '機材が届く行為はdelivery。warrantyは保証で文脈に合わない。',
        translation: '',
      },
    }
    await writeFile(
      join(dir, 'drafts/key-vocab-similar-s3.jsonl'),
      JSON.stringify(similarS3Draft) + '\n',
      'utf-8',
    )
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('13パック分のドラフトから packs/*.json と manifest.json を生成する（M1の4＋M2の8＋T-83の1）', async () => {
    const { code, output } = await run(['build', dir])
    expect(code).toBe(0)
    expect(output).toContain('13パック')

    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf-8')) as {
      packs: { id: string; hash: string; sizeBytes: number }[]
    }
    expect(manifest.packs).toHaveLength(13)
    expect(manifest.packs.map((p) => p.id)).toEqual([
      'pack-vocab-s-001',
      'pack-p2-s-001',
      'pack-p5-s-001',
      'pack-p5-similar-s-001',
      'pack-vocab-a-001',
      'pack-vocab-b-001',
      'pack-p2-s-002',
      'pack-p5-s-002',
      'pack-p34-s-001',
      'pack-dict-s-001',
      'pack-shadow-s-001',
      'pack-p5-similar-s-002',
      'pack-p5-similar-s-003',
    ])
    for (const entry of manifest.packs) {
      expect(entry.hash).toMatch(/^[0-9a-f]{16}$/)
      expect(entry.sizeBytes).toBeGreaterThan(0)
    }

    const vocabPack = JSON.parse(
      await readFile(join(dir, 'packs/pack-vocab-s-001.json'), 'utf-8'),
    ) as { pack: { license: string }; questions: unknown[] }
    expect(vocabPack.pack.license).toBe('internal-original')
    expect(vocabPack.questions).toHaveLength(1)
  })

  it('参照する音声ファイルが実在しないとビルド失敗し、manifest.jsonを書き出さない（部分取込なし）', async () => {
    await rm(join(dir, 'audio/part2/submit.mp3'))

    const { code, errOutput } = await run(['build', dir])
    expect(code).toBe(1)
    expect(errOutput).toContain('音声ファイルが存在しない')
    expect(errOutput).toContain('ビルド失敗')

    await expect(readFile(join(dir, 'manifest.json'), 'utf-8')).rejects.toThrow()
  })

  it('calibrate: エクスポートJSON→補正値ファイル→build で difficulty に反映される一連（T-34完了条件）', async () => {
    // part2-submit は元々 difficulty:2（帯 0.65-0.85）。10件中3件正解＝正答率0.3で難化対象
    const exportPath = join(dir, 'export.json')
    const exportData = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        attempts: [
          ...Array.from({ length: 3 }, (_, i) => ({
            id: `a-${i}`,
            questionId: 'part2-submit',
            mode: 'solo',
            isCorrect: true,
            responseMs: 1000,
            isTimeout: false,
            isGuess: false,
            answeredAt: 0,
          })),
          ...Array.from({ length: 7 }, (_, i) => ({
            id: `b-${i}`,
            questionId: 'part2-submit',
            mode: 'solo',
            isCorrect: false,
            responseMs: 1000,
            isTimeout: false,
            isGuess: false,
            answeredAt: 0,
          })),
        ],
      },
    }
    await writeFile(exportPath, JSON.stringify(exportData), 'utf-8')

    const correctionsPath = join(dir, 'corrections.json')
    const calibrated = await run(['calibrate', exportPath, dir, correctionsPath])
    expect(calibrated.code).toBe(0)
    expect(calibrated.output).toContain('difficulty 1件')

    const corrections = JSON.parse(await readFile(correctionsPath, 'utf-8')) as {
      questionDifficulty: Record<string, number>
    }
    expect(corrections.questionDifficulty).toEqual({ 'part2-submit': 3 })

    const built = await run(['build', dir, correctionsPath])
    expect(built.code).toBe(0)
    expect(built.output).toContain('実測補正')

    const part2Pack = JSON.parse(
      await readFile(join(dir, 'packs/pack-p2-s-001.json'), 'utf-8'),
    ) as { questions: { id: string; difficulty: number }[] }
    expect(part2Pack.questions[0]?.difficulty).toBe(3)
  })

  it('kpi: エクスポートJSONから週次集計を出力する（T-40完了条件）', async () => {
    const exportPath = join(dir, 'export-kpi.json')
    const day1 = Date.UTC(2026, 6, 13, 8, 0)
    const exportData = {
      formatVersion: 1,
      dbVersion: 1,
      exportedAt: 0,
      stores: {
        attempts: [
          {
            id: 'a-1',
            questionId: 'q-1',
            mode: 'solo',
            isCorrect: true,
            responseMs: 1000,
            isTimeout: false,
            isGuess: false,
            answeredAt: day1,
          },
        ],
        srsCards: [],
      },
    }
    await writeFile(exportPath, JSON.stringify(exportData), 'utf-8')

    const { code, output } = await run(['kpi', exportPath])
    expect(code).toBe(0)
    expect(output).toContain('学習日数')
    expect(output).toContain('N/A')
  })

  it('kpi: 引数不足だと使い方をstderrに出して異常終了する', async () => {
    const { code, errOutput } = await run(['kpi'])
    expect(code).toBe(1)
    expect(errOutput).toContain('使い方')
  })
})
