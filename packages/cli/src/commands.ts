// コンテンツパイプラインのコマンド体系（T-24。正本: docs/04 5節）。
//
// パイプライン: freq-list（頻出度リスト=T-25・本実装済み）→
// generate（コンテンツ生成。vocab_card=T-26・audio_qa=T-27・text_blank=T-28・
// key_vocab_similar=T-29 実装済み）→
// review-export/review-import（JSONL往復レビュー=T-30・本実装済み）→
// tts（音声生成=T-31・Piperで本実装済み）→ build（バリデーション＋manifest=T-32）。
//
// 【設計判断】T-25以降、ユーザー指示によりランタイムでLLM APIを呼ぶ実装はしない方針に
// 変更した（詳細はdocs/STATUS.mdのT-25〜T-31行）。generateコマンドはAPIキーを要求しない
// （T-24時点の雛形はrequireApiKeyでゲートしていたが、この方針転換に伴い撤去した）。
// ttsコマンドも同様にAPIキー不要（採用したPiperはローカルTTSでAPIキー自体が存在しない）。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { SCHEMA_VERSION, type Question } from '@beb-raid/shared-schema'

import { buildFreqList, validateFreqList } from './freqList.js'
import {
  buildKeyVocabSimilarDrafts,
  buildKeyVocabSimilarQuestions,
  KEY_VOCAB_SIMILAR_ENTRIES,
  validateKeyVocabSimilarQuestions,
  validateTargetWordCoverage,
} from './keyVocabSimilar.js'
import { buildPart2Drafts, buildPart2Questions, validatePart2Questions } from './part2Question.js'
import { buildPart5Drafts, buildPart5Questions, validatePart5Questions } from './part5Question.js'
import {
  buildReviewTsv,
  parseJsonl,
  parseReviewTsv,
  toJsonl,
  type GeneratedItemDraft,
} from './review.js'
import { PiperTtsProvider } from './tts.js'
import { synthesizeDraftsAudio } from './ttsBatch.js'
import {
  buildVocabCardDrafts,
  buildVocabCardQuestions,
  validateVocabCardQuestions,
} from './vocabCard.js'

const DEFAULT_FREQ_LIST_PATH = 'content/freq-list.json'
const DEFAULT_VOCAB_DRAFT_PATH = 'content/drafts/vocab-card-s.jsonl'
const DEFAULT_PART2_DRAFT_PATH = 'content/drafts/part2-s.jsonl'
const DEFAULT_PART5_DRAFT_PATH = 'content/drafts/part5-s.jsonl'
const DEFAULT_KEY_VOCAB_SIMILAR_DRAFT_PATH = 'content/drafts/key-vocab-similar-s.jsonl'

interface GenerateKindHandler {
  buildQuestions: () => Question[]
  buildDrafts: () => GeneratedItemDraft[]
  validate: (questions: Question[]) => string[]
  defaultPath: string
}

const GENERATE_KINDS: Record<string, GenerateKindHandler> = {
  vocab_card: {
    buildQuestions: buildVocabCardQuestions,
    buildDrafts: buildVocabCardDrafts,
    validate: validateVocabCardQuestions,
    defaultPath: DEFAULT_VOCAB_DRAFT_PATH,
  },
  audio_qa: {
    buildQuestions: buildPart2Questions,
    buildDrafts: buildPart2Drafts,
    validate: validatePart2Questions,
    defaultPath: DEFAULT_PART2_DRAFT_PATH,
  },
  text_blank: {
    buildQuestions: buildPart5Questions,
    buildDrafts: buildPart5Drafts,
    validate: validatePart5Questions,
    defaultPath: DEFAULT_PART5_DRAFT_PATH,
  },
  key_vocab_similar: {
    buildQuestions: buildKeyVocabSimilarQuestions,
    buildDrafts: buildKeyVocabSimilarDrafts,
    validate: (questions) => [
      ...validateKeyVocabSimilarQuestions(questions),
      ...validateTargetWordCoverage(KEY_VOCAB_SIMILAR_ENTRIES),
    ],
    defaultPath: DEFAULT_KEY_VOCAB_SIMILAR_DRAFT_PATH,
  },
}

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
    description:
      'コンテンツ生成（vocab_card=T-26、audio_qa=T-27、text_blank=T-28、key_vocab_similar=T-29 実装済み）',
    run: async (ctx) => {
      const [kind, outputPath] = ctx.args
      const handler = kind ? GENERATE_KINDS[kind] : undefined
      if (!handler) {
        ctx.errOut(
          `使い方: beb generate <${Object.keys(GENERATE_KINDS).join('|')}> <出力.jsonl>（省略時は既定パス）`,
        )
        if (kind !== undefined) {
          ctx.errOut(`未対応のkind: ${kind}`)
        }
        return 1
      }
      const out = outputPath ?? handler.defaultPath
      const problems = handler.validate(handler.buildQuestions())
      if (problems.length > 0) {
        for (const p of problems) ctx.errOut(`エラー: ${p}`)
        return 1
      }
      const drafts = handler.buildDrafts()
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, toJsonl(drafts), 'utf-8')
      ctx.out(`${kind} ${drafts.length}件のドラフトを ${out} に書き出しました`)
      ctx.out('バリデーション（shared-schema validatePack）通過済み')
      return 0
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
    description: 'Piperで音声合成しaudioMetaを実測値に更新（vocab_card/audio_qaのみ対象。T-31）',
    run: async (ctx) => {
      const [draftPath, audioRoot, outputDraftPath] = ctx.args
      if (!draftPath || !audioRoot || !outputDraftPath) {
        ctx.errOut('使い方: beb tts <ドラフト.jsonl> <音声出力ルート> <更新後ドラフト.jsonl>')
        return 1
      }
      const drafts = parseJsonl<GeneratedItemDraft>(await readFile(draftPath, 'utf-8'))
      const provider = new PiperTtsProvider()
      const { updatedDrafts, synthesized, skipped } = await synthesizeDraftsAudio(
        drafts,
        provider,
        audioRoot,
      )
      await mkdir(dirname(outputDraftPath), { recursive: true })
      await writeFile(outputDraftPath, toJsonl(updatedDrafts), 'utf-8')
      ctx.out(`${synthesized}件の音声を生成（出力先: ${audioRoot}）`)
      if (skipped > 0) {
        ctx.out(`${skipped}件は音声不要のformat（text_blank等）のためスキップ`)
      }
      ctx.out(`更新後ドラフトを ${outputDraftPath} に書き出しました`)
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
    'APIキーは不要（generate/ttsともにローカル実行。T-25以降の方針変更でLLM APIを、B-2解消でTTSもPiper採用によりクラウドAPIを、それぞれ呼ばない）。',
    'ttsコマンドの実行にはpiper/ffmpeg/ffprobeが別途ローカルにインストールされている必要がある。',
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
