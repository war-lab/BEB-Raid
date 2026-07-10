// コンテンツパイプラインのコマンド体系（T-24。正本: docs/04 5節）。
//
// パイプライン: freq-list（頻出度リスト=T-25・本実装済み）→
// generate（コンテンツ生成。vocab_card=T-26実装済み。part2/part5はT-27/T-28予定）→
// review-export/review-import（JSONL往復レビュー=T-30・本実装済み）→
// tts（音声生成=T-31）→ build（バリデーション＋manifest=T-32）。
//
// 【設計判断】T-25以降、ユーザー指示によりランタイムでLLM APIを呼ぶ実装はしない方針に
// 変更した（詳細はdocs/STATUS.mdのT-25/T-26行）。generateコマンドはAPIキーを要求しない
// （T-24時点の雛形はrequireApiKeyでゲートしていたが、この方針転換に伴い撤去した）。
// ttsコマンドのみ実際の音声合成が必要なため引き続きAPIキーを要求する（T-31実装時）。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { SCHEMA_VERSION } from '@beb-raid/shared-schema'

import { maskApiKey, requireApiKey, TTS_API_KEY_ENV } from './env.js'
import { buildFreqList, validateFreqList } from './freqList.js'
import {
  buildReviewTsv,
  parseJsonl,
  parseReviewTsv,
  toJsonl,
  type GeneratedItemDraft,
} from './review.js'
import {
  buildVocabCardDrafts,
  buildVocabCardQuestions,
  validateVocabCardQuestions,
} from './vocabCard.js'

const DEFAULT_FREQ_LIST_PATH = 'content/freq-list.json'
const DEFAULT_VOCAB_DRAFT_PATH = 'content/drafts/vocab-card-s.jsonl'

/**
 * コマンド実行コンテキスト（テストから env / 出力を差し替えるための注入点）。
 * 正常系メッセージは out（stdout）、エラー・使用方法案内は errOut（stderr）に分離する
 * （レビューフォローアップ3.8節。CIログでエラーだけを抽出できるようにするため）
 */
export interface CommandContext {
  /** コマンド名より後ろの引数 */
  args: string[]
  env: NodeJS.ProcessEnv
  out: (line: string) => void
  errOut: (line: string) => void
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
    description: 'コンテンツ生成（vocab_card=T-26実装済み。part2/part5はT-27/T-28予定）',
    run: async (ctx) => {
      const [kind, outputPath] = ctx.args
      if (kind === 'vocab_card') {
        const out = outputPath ?? DEFAULT_VOCAB_DRAFT_PATH
        const problems = validateVocabCardQuestions(buildVocabCardQuestions())
        if (problems.length > 0) {
          for (const p of problems) ctx.errOut(`エラー: ${p}`)
          return 1
        }
        const drafts = buildVocabCardDrafts()
        await mkdir(dirname(out), { recursive: true })
        await writeFile(out, toJsonl(drafts), 'utf-8')
        ctx.out(`vocab_card ${drafts.length}件のドラフトを ${out} に書き出しました`)
        ctx.out('バリデーション（shared-schema validatePack）通過済み')
        return 0
      }
      ctx.errOut(
        `使い方: beb generate vocab_card <出力.jsonl>（既定: ${DEFAULT_VOCAB_DRAFT_PATH}）`,
      )
      if (kind !== undefined) {
        ctx.errOut(`未対応のkind: ${kind}`)
      }
      ctx.errOut('part2 / part5 は T-27 / T-28 で実装予定です')
      return 1
    },
  },
  {
    name: 'freq-list',
    description: '自前頻出度リスト（Sランク200語）をcontent/freq-list.jsonへ出力（T-25）',
    run: async (ctx) => {
      const outputPath = ctx.args[0] ?? DEFAULT_FREQ_LIST_PATH
      const list = buildFreqList(new Date().toISOString().slice(0, 10))
      const problems = validateFreqList(list)
      if (problems.length > 0) {
        for (const p of problems) ctx.errOut(`エラー: ${p}`)
        return 1
      }
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, JSON.stringify(list, null, 2) + '\n', 'utf-8')
      const sCount = list.words.filter((w) => w.freqRank === 'S').length
      ctx.out(`Sランク${sCount}語を含む頻出度リストを ${outputPath} に書き出しました`)
      ctx.out('rankSourceは全語llm（B-1未解決のため公開コーパスは未使用。精度は未検証）')
      return 0
    },
  },
  {
    name: 'review-export',
    description: '生成結果（ドラフトJSONL）をレビュー用TSVに書き出し（T-30）',
    run: async (ctx) => {
      const [inputPath, outputPath] = ctx.args
      if (!inputPath || !outputPath) {
        ctx.errOut('使い方: beb review-export <ドラフト.jsonl> <レビュー用.tsv>')
        return 1
      }
      const raw = await readFile(inputPath, 'utf-8')
      const drafts = parseJsonl<GeneratedItemDraft>(raw)
      await writeFile(outputPath, buildReviewTsv(drafts), 'utf-8')
      ctx.out(`${drafts.length}件を ${outputPath} に書き出しました`)
      return 0
    },
  },
  {
    name: 'review-import',
    description: 'レビュー済みTSV（採用/修正/破棄）の取込（T-30）',
    run: async (ctx) => {
      const [draftPath, tsvPath, acceptedPath, rejectedPath] = ctx.args
      if (!draftPath || !tsvPath || !acceptedPath || !rejectedPath) {
        ctx.errOut(
          '使い方: beb review-import <元のドラフト.jsonl> <レビュー済み.tsv> <採用後.jsonl> <rejected.jsonl>',
        )
        return 1
      }
      const drafts = parseJsonl<GeneratedItemDraft>(await readFile(draftPath, 'utf-8'))
      const draftsById = new Map(drafts.map((d) => [d.id, d]))
      const tsv = await readFile(tsvPath, 'utf-8')
      const { accepted, rejected, skipped } = parseReviewTsv(tsv, draftsById)

      await writeFile(acceptedPath, toJsonl(accepted), 'utf-8')
      await writeFile(rejectedPath, toJsonl(rejected), 'utf-8')

      ctx.out(`採用・修正 ${accepted.length}件 → ${acceptedPath}`)
      ctx.out(`破棄 ${rejected.length}件 → ${rejectedPath}`)
      if (skipped > 0) {
        ctx.out(`レビュー未完了（status未記入等） ${skipped}件はスキップ（次回に持ち越し）`)
      }
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
    `APIキーが必要なのは tts のみ（環境変数 ${TTS_API_KEY_ENV}）。generate はLLM APIを呼ばない（T-25以降の方針変更）。`,
    'リポジトリ・設定ファイルにキーを置かないこと。',
  ]
  return lines.join('\n')
}

/** CLI 本体。引数を解釈してコマンドを実行し、終了コードを返す */
export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  out: (line: string) => void = console.log,
  errOut: (line: string) => void = console.error,
): Promise<number> {
  const [name, ...rest] = argv
  if (name === '--help' || name === '-h' || name === 'help') {
    out(usage())
    return 0
  }
  if (!name) {
    errOut(usage())
    return 1
  }
  const command = findCommand(name)
  if (!command) {
    errOut(`不明なコマンド: ${name}`)
    errOut('')
    errOut(usage())
    return 1
  }
  try {
    return await command.run({ args: rest, env, out, errOut })
  } catch (e) {
    errOut(`エラー: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
}
