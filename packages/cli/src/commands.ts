// コンテンツパイプラインのコマンド体系（T-24。正本: docs/04 5節）。
//
// パイプライン: generate（LLM生成）→ review-export/review-import（JSONL往復
// レビュー=T-30）→ tts（音声生成=T-31）→ build（バリデーション＋manifest=T-32）。
// 本ファイルは各コマンドの雛形まで。LLM/TTS 呼び出しの実装は T-26 以降。

import { SCHEMA_VERSION } from '@beb-raid/shared-schema'

import { LLM_API_KEY_ENV, maskApiKey, requireApiKey, TTS_API_KEY_ENV } from './env.js'

/** コマンド実行コンテキスト（テストから env / 出力を差し替えるための注入点） */
export interface CommandContext {
  /** コマンド名より後ろの引数 */
  args: string[]
  env: NodeJS.ProcessEnv
  out: (line: string) => void
}

export interface CliCommand {
  name: string
  description: string
  /** 終了コードを返す（0=成功） */
  run(ctx: CommandContext): Promise<number>
}

export const commands: CliCommand[] = [
  {
    name: 'generate',
    description: '問題・語彙カードのLLM生成（実装は T-26〜T-29）',
    run: async (ctx) => {
      // 雛形段階でもキーの取得経路（環境変数のみ）は確定させておく
      const key = requireApiKey(LLM_API_KEY_ENV, ctx.env)
      ctx.out(`LLM APIキーを環境変数 ${LLM_API_KEY_ENV} から読み込み: ${maskApiKey(key)}`)
      ctx.out('generate は未実装です（T-26〜T-29 で実装予定）')
      return 0
    },
  },
  {
    name: 'review-export',
    description: '生成結果をレビュー用JSONLに書き出し（実装は T-30）',
    run: async (ctx) => {
      ctx.out('review-export は未実装です（T-30 で実装予定）')
      return 0
    },
  },
  {
    name: 'review-import',
    description: 'レビュー済みJSONL（採用/修正/破棄）の取込（実装は T-30）',
    run: async (ctx) => {
      ctx.out('review-import は未実装です（T-30 で実装予定）')
      return 0
    },
  },
  {
    name: 'tts',
    description: 'TTS音声生成・audioMeta 記録（実装は T-31。調達は B-2 確定待ち）',
    run: async (ctx) => {
      const key = requireApiKey(TTS_API_KEY_ENV, ctx.env)
      ctx.out(`TTS APIキーを環境変数 ${TTS_API_KEY_ENV} から読み込み: ${maskApiKey(key)}`)
      ctx.out('tts は未実装です（T-31 で実装予定）')
      return 0
    },
  },
  {
    name: 'build',
    description: 'パック一括バリデーション＋manifest.json 生成（実装は T-32）',
    run: async (ctx) => {
      ctx.out(
        `スキーマ検証は shared-schema の validatePack（schemaVersion ${SCHEMA_VERSION}）を使用`,
      )
      ctx.out('build は未実装です（T-32 で実装予定）')
      return 0
    },
  },
]

export function findCommand(name: string): CliCommand | undefined {
  return commands.find((c) => c.name === name)
}

export function usage(): string {
  const lines = [
    'beb — BEB Raid コンテンツパイプライン CLI',
    '',
    '使い方: beb <command> [options]',
    '',
    'コマンド:',
    ...commands.map((c) => `  ${c.name.padEnd(15)} ${c.description}`),
    '',
    `APIキーは環境変数（${LLM_API_KEY_ENV} / ${TTS_API_KEY_ENV}）でのみ渡す。`,
    'リポジトリ・設定ファイルにキーを置かないこと。',
  ]
  return lines.join('\n')
}

/** CLI 本体。引数を解釈してコマンドを実行し、終了コードを返す */
export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  out: (line: string) => void = console.log,
): Promise<number> {
  const [name, ...rest] = argv
  if (!name || name === '--help' || name === '-h' || name === 'help') {
    out(usage())
    return name ? 0 : 1
  }
  const command = findCommand(name)
  if (!command) {
    out(`不明なコマンド: ${name}`)
    out('')
    out(usage())
    return 1
  }
  try {
    return await command.run({ args: rest, env, out })
  } catch (e) {
    out(`エラー: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}
