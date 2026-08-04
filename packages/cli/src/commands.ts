// コンテンツパイプラインのコマンド体系（T-24。正本: docs/04 5節）。
//
// パイプライン: freq-list（頻出度リスト=T-25・本実装済み）→
// generate（コンテンツ生成。vocab_card=T-26・audio_qa=T-27・text_blank=T-28・
// key_vocab_similar=T-29 実装済み）→
// review-export/review-import（JSONL往復レビュー=T-30・本実装済み）→
// tts（音声生成=T-31・Piperで本実装済み）→ build（バリデーション＋manifest=T-32・本実装済み）。
//
// 【設計判断】T-25以降、ユーザー指示によりランタイムでLLM APIを呼ぶ実装はしない方針に
// 変更した（詳細はdocs/STATUS.mdのT-25〜T-31行）。generateコマンドはAPIキーを要求しない
// （T-24時点の雛形はrequireApiKeyでゲートしていたが、この方針転換に伴い撤去した）。
// ttsコマンドも同様にAPIキー不要（採用したPiperはローカルTTSでAPIキー自体が存在しない）。

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { SCHEMA_VERSION, type Question } from '@beb-raid/shared-schema'

import {
  applyCorrections,
  buildAllPacks,
  buildManifest,
  loadPackSources,
  scanAudioFiles,
} from './build.js'
import { buildCorrections, parseExportedAttempts, type CorrectionsFile } from './calibrate.js'
import { VOCAB_CARDS_A } from './data/vocabCardsA.js'
import { VOCAB_CARDS_B } from './data/vocabCardsB.js'
import { VOCAB_CARDS_S2 } from './data/vocabCardsS2.js'
import {
  buildDictationDrafts,
  buildDictationQuestions,
  DICTATION_ENTRIES_S2,
  validateDictationQuestions,
} from './dictationQuestion.js'
import { buildFreqList, validateFreqList } from './freqList.js'
import { aggregateWeeklyKpi, parseKpiExport, renderWeeklyKpiTable } from './kpi.js'
import {
  buildKeyVocabSimilarDrafts,
  buildKeyVocabSimilarQuestions,
  buildKeyVocabSimilarS3Entries,
  KEY_VOCAB_SIMILAR_ENTRIES,
  KEY_VOCAB_SIMILAR_ENTRIES_S2,
  validateKeyVocabSimilarQuestions,
  validateTargetWordCoverage,
} from './keyVocabSimilar.js'
import {
  buildPart2Drafts,
  buildPart2EntriesS2,
  buildPart2Questions,
  validatePart2Questions,
} from './part2Question.js'
import {
  buildPart34Drafts,
  buildPart34Questions,
  PART34_ENTRIES_S2,
  PART34_ENTRIES_S3,
  validatePart34Questions,
} from './part34Question.js'
import {
  buildPart5Drafts,
  buildPart5EntriesS2,
  buildPart5EntriesS3,
  buildPart5Questions,
  validatePart5Questions,
} from './part5Question.js'
import {
  buildReviewTsv,
  parseJsonl,
  parseReviewTsv,
  toJsonl,
  type GeneratedItemDraft,
} from './review.js'
import {
  buildShadowingDrafts,
  buildShadowingQuestions,
  validateShadowingQuestions,
} from './shadowingQuestion.js'
import {
  buildPart6Drafts,
  buildPart6Questions,
  buildPart7MultiDrafts,
  buildPart7MultiQuestions,
  buildPart7SingleDrafts,
  buildPart7SingleQuestions,
  validatePart6Questions,
  validatePart7MultiQuestions,
  validatePart7SingleQuestions,
} from './textPassageQuestion.js'
import { PiperTtsProvider } from './tts.js'
import { synthesizeDraftsAudio } from './ttsBatch.js'
import { verifyContent } from './verifyContent.js'
import {
  buildVocabCardDrafts,
  buildVocabCardQuestions,
  validateVocabCardQuestions,
} from './vocabCard.js'

const DEFAULT_FREQ_LIST_PATH = 'content/freq-list.json'
const DEFAULT_VOCAB_DRAFT_PATH = 'content/drafts/vocab-card-s.jsonl'
const DEFAULT_VOCAB_A_DRAFT_PATH = 'content/drafts/vocab-card-a.jsonl'
const DEFAULT_VOCAB_B_DRAFT_PATH = 'content/drafts/vocab-card-b.jsonl'
const DEFAULT_VOCAB_S2_DRAFT_PATH = 'content/drafts/vocab-card-s2.jsonl'
const DEFAULT_PART2_DRAFT_PATH = 'content/drafts/part2-s.jsonl'
const DEFAULT_PART2_S2_DRAFT_PATH = 'content/drafts/part2-s2.jsonl'
const DEFAULT_PART5_DRAFT_PATH = 'content/drafts/part5-s.jsonl'
const DEFAULT_PART5_S2_DRAFT_PATH = 'content/drafts/part5-s2.jsonl'
const DEFAULT_PART5_S3_DRAFT_PATH = 'content/drafts/part5-s3.jsonl'
const DEFAULT_PART34_DRAFT_PATH = 'content/drafts/part34-s.jsonl'
const DEFAULT_PART34_S2_DRAFT_PATH = 'content/drafts/part34-s2.jsonl'
const DEFAULT_PART34_S3_DRAFT_PATH = 'content/drafts/part34-s3.jsonl'
const DEFAULT_DICTATION_DRAFT_PATH = 'content/drafts/dictation-s.jsonl'
const DEFAULT_DICTATION_S2_DRAFT_PATH = 'content/drafts/dictation-s2.jsonl'
const DEFAULT_SHADOWING_DRAFT_PATH = 'content/drafts/shadowing-s.jsonl'
const DEFAULT_KEY_VOCAB_SIMILAR_DRAFT_PATH = 'content/drafts/key-vocab-similar-s.jsonl'
const DEFAULT_KEY_VOCAB_SIMILAR_S2_DRAFT_PATH = 'content/drafts/key-vocab-similar-s2.jsonl'
const DEFAULT_KEY_VOCAB_SIMILAR_S3_DRAFT_PATH = 'content/drafts/key-vocab-similar-s3.jsonl'
const DEFAULT_TEXT_PASSAGE_P6_DRAFT_PATH = 'content/drafts/text-passage-p6-s.jsonl'
const DEFAULT_TEXT_PASSAGE_P7_SINGLE_DRAFT_PATH = 'content/drafts/text-passage-p7-single-s.jsonl'
/** T-144: Part7複数パッセージのドラフト出力先 */
const DEFAULT_TEXT_PASSAGE_P7_MULTI_DRAFT_PATH = 'content/drafts/text-passage-p7-multi-s.jsonl'

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
  vocab_card_a: {
    buildQuestions: () => buildVocabCardQuestions(VOCAB_CARDS_A, 'A'),
    buildDrafts: () => buildVocabCardDrafts(VOCAB_CARDS_A, 'A'),
    validate: (questions) => validateVocabCardQuestions(questions, 730),
    defaultPath: DEFAULT_VOCAB_A_DRAFT_PATH,
  },
  vocab_card_b: {
    buildQuestions: () => buildVocabCardQuestions(VOCAB_CARDS_B, 'B'),
    buildDrafts: () => buildVocabCardDrafts(VOCAB_CARDS_B, 'B'),
    validate: (questions) => validateVocabCardQuestions(questions, 860),
    defaultPath: DEFAULT_VOCAB_B_DRAFT_PATH,
  },
  // 初級追加パック（銀フレ相当・600帯。ドッグフィードバック 2026-07-22）。既存Sと同じ freqRank='S'/600帯
  vocab_card_s2: {
    buildQuestions: () => buildVocabCardQuestions(VOCAB_CARDS_S2, 'S'),
    buildDrafts: () => buildVocabCardDrafts(VOCAB_CARDS_S2, 'S'),
    validate: (questions) => validateVocabCardQuestions(questions, 600),
    defaultPath: DEFAULT_VOCAB_S2_DRAFT_PATH,
  },
  audio_qa: {
    buildQuestions: buildPart2Questions,
    buildDrafts: buildPart2Drafts,
    validate: validatePart2Questions,
    defaultPath: DEFAULT_PART2_DRAFT_PATH,
  },
  audio_qa_s2: {
    buildQuestions: () => buildPart2Questions(buildPart2EntriesS2()),
    buildDrafts: () => buildPart2Drafts(buildPart2EntriesS2()),
    validate: validatePart2Questions,
    defaultPath: DEFAULT_PART2_S2_DRAFT_PATH,
  },
  text_blank: {
    buildQuestions: buildPart5Questions,
    buildDrafts: buildPart5Drafts,
    validate: validatePart5Questions,
    defaultPath: DEFAULT_PART5_DRAFT_PATH,
  },
  text_blank_s2: {
    buildQuestions: () => buildPart5Questions(buildPart5EntriesS2()),
    buildDrafts: () => buildPart5Drafts(buildPart5EntriesS2()),
    validate: validatePart5Questions,
    defaultPath: DEFAULT_PART5_S2_DRAFT_PATH,
  },
  text_blank_s3: {
    buildQuestions: () => buildPart5Questions(buildPart5EntriesS3()),
    buildDrafts: () => buildPart5Drafts(buildPart5EntriesS3()),
    validate: validatePart5Questions,
    defaultPath: DEFAULT_PART5_S3_DRAFT_PATH,
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
  key_vocab_similar_s2: {
    buildQuestions: () => buildKeyVocabSimilarQuestions(KEY_VOCAB_SIMILAR_ENTRIES_S2),
    buildDrafts: () => buildKeyVocabSimilarDrafts(KEY_VOCAB_SIMILAR_ENTRIES_S2),
    validate: (questions) => [
      ...validateKeyVocabSimilarQuestions(questions),
      ...validateTargetWordCoverage(KEY_VOCAB_SIMILAR_ENTRIES_S2),
    ],
    defaultPath: DEFAULT_KEY_VOCAB_SIMILAR_S2_DRAFT_PATH,
  },
  key_vocab_similar_s3: {
    buildQuestions: () => buildKeyVocabSimilarQuestions(buildKeyVocabSimilarS3Entries()),
    buildDrafts: () => buildKeyVocabSimilarDrafts(buildKeyVocabSimilarS3Entries()),
    validate: (questions) => [
      ...validateKeyVocabSimilarQuestions(questions),
      ...validateTargetWordCoverage(buildKeyVocabSimilarS3Entries()),
    ],
    defaultPath: DEFAULT_KEY_VOCAB_SIMILAR_S3_DRAFT_PATH,
  },
  audio_set: {
    buildQuestions: buildPart34Questions,
    buildDrafts: buildPart34Drafts,
    validate: validatePart34Questions,
    defaultPath: DEFAULT_PART34_DRAFT_PATH,
  },
  audio_set_s2: {
    buildQuestions: () => buildPart34Questions(PART34_ENTRIES_S2),
    buildDrafts: () => buildPart34Drafts(PART34_ENTRIES_S2),
    validate: validatePart34Questions,
    defaultPath: DEFAULT_PART34_S2_DRAFT_PATH,
  },
  audio_set_s3: {
    buildQuestions: () => buildPart34Questions(PART34_ENTRIES_S3),
    buildDrafts: () => buildPart34Drafts(PART34_ENTRIES_S3),
    validate: validatePart34Questions,
    defaultPath: DEFAULT_PART34_S3_DRAFT_PATH,
  },
  text_passage_p6: {
    buildQuestions: buildPart6Questions,
    buildDrafts: buildPart6Drafts,
    validate: validatePart6Questions,
    defaultPath: DEFAULT_TEXT_PASSAGE_P6_DRAFT_PATH,
  },
  text_passage_p7_single: {
    buildQuestions: buildPart7SingleQuestions,
    buildDrafts: buildPart7SingleDrafts,
    validate: validatePart7SingleQuestions,
    defaultPath: DEFAULT_TEXT_PASSAGE_P7_SINGLE_DRAFT_PATH,
  },
  // T-144: Part7複数パッセージ。配信は人手レビュー（H-R1）後（ADR 0006 判断5）
  text_passage_p7_multi: {
    buildQuestions: buildPart7MultiQuestions,
    buildDrafts: buildPart7MultiDrafts,
    validate: validatePart7MultiQuestions,
    defaultPath: DEFAULT_TEXT_PASSAGE_P7_MULTI_DRAFT_PATH,
  },
  dictation: {
    buildQuestions: buildDictationQuestions,
    buildDrafts: buildDictationDrafts,
    validate: validateDictationQuestions,
    defaultPath: DEFAULT_DICTATION_DRAFT_PATH,
  },
  dictation_s2: {
    buildQuestions: () => buildDictationQuestions(DICTATION_ENTRIES_S2),
    buildDrafts: () => buildDictationDrafts(DICTATION_ENTRIES_S2),
    validate: validateDictationQuestions,
    defaultPath: DEFAULT_DICTATION_S2_DRAFT_PATH,
  },
  shadowing: {
    buildQuestions: buildShadowingQuestions,
    buildDrafts: buildShadowingDrafts,
    validate: validateShadowingQuestions,
    defaultPath: DEFAULT_SHADOWING_DRAFT_PATH,
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
    description:
      'Piperで音声合成しaudioMetaを実測値に更新（vocab_card/audio_qa/audio_set/dictation/shadowing対象。T-31・T-81でlength_scale校正に対応）',
    run: async (ctx) => {
      const [draftPath, audioRoot, outputDraftPath, lengthScaleArg] = ctx.args
      if (!draftPath || !audioRoot || !outputDraftPath) {
        ctx.errOut(
          '使い方: beb tts <ドラフト.jsonl> <音声出力ルート> <更新後ドラフト.jsonl> [length_scale]',
        )
        return 1
      }
      const lengthScale = lengthScaleArg !== undefined ? Number(lengthScaleArg) : undefined
      if (lengthScaleArg !== undefined && Number.isNaN(lengthScale)) {
        ctx.errOut(`length_scaleが数値ではない: ${lengthScaleArg}`)
        return 1
      }
      const drafts = parseJsonl<GeneratedItemDraft>(await readFile(draftPath, 'utf-8'))
      const provider = new PiperTtsProvider(lengthScale !== undefined ? { lengthScale } : {})
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
    name: 'calibrate',
    description:
      '端末エクスポートJSONから難易度D・頻出度ランクの補正値ファイルを算出（T-34。共有API導入=M3前の暫定運用）',
    run: async (ctx) => {
      const [exportPath, contentRoot, outputPath] = ctx.args
      if (!exportPath || !contentRoot || !outputPath) {
        ctx.errOut('使い方: beb calibrate <エクスポート.json> <content-root> <補正値.json>')
        return 1
      }
      const exported = JSON.parse(await readFile(exportPath, 'utf-8')) as unknown
      const attempts = parseExportedAttempts(exported)
      const sources = await loadPackSources(contentRoot)
      const questions = sources.flatMap((s) => s.questions)

      const corrections = buildCorrections(questions, attempts, Date.now())
      await mkdir(dirname(outputPath), { recursive: true })
      await writeFile(outputPath, JSON.stringify(corrections, null, 2) + '\n', 'utf-8')

      const difficultyCount = Object.keys(corrections.questionDifficulty).length
      const freqRankCount = Object.keys(corrections.wordFreqRank).length
      ctx.out(
        `補正値: difficulty ${difficultyCount}件・freqRank ${freqRankCount}件を ${outputPath} に書き出しました`,
      )
      return 0
    },
  },
  {
    name: 'kpi',
    description:
      '端末エクスポートJSONから週あたり学習日数・セッション数(近似)・SRS消化率を集計（T-40。ドッグフード計測支援）',
    run: async (ctx) => {
      const [exportPath] = ctx.args
      if (!exportPath) {
        ctx.errOut('使い方: beb kpi <エクスポート.json>')
        return 1
      }
      const exported = JSON.parse(await readFile(exportPath, 'utf-8')) as unknown
      const { attempts, srsCards } = parseKpiExport(exported)
      const rows = aggregateWeeklyKpi(attempts, srsCards)
      if (rows.length === 0) {
        ctx.out('attempts が0件のため集計対象がありません')
        return 0
      }
      ctx.out(renderWeeklyKpiTable(rows))
      return 0
    },
  },
  {
    name: 'build',
    description:
      'パック一括バリデーション＋manifest.json 生成（T-32。第2引数で実測補正=T-34を適用可）',
    run: async (ctx) => {
      const contentRoot = ctx.args[0] ?? 'content'
      const correctionsPath = ctx.args[1]
      const audioFiles = await scanAudioFiles(contentRoot)

      let sources = await loadPackSources(contentRoot)
      if (correctionsPath) {
        const corrections = JSON.parse(await readFile(correctionsPath, 'utf-8')) as CorrectionsFile
        sources = applyCorrections(sources, corrections)
        ctx.out(`実測補正（${correctionsPath}）を適用しました`)
      }

      const { built, errors, warnings } = buildAllPacks(sources, audioFiles)
      if (errors.length > 0) {
        for (const e of errors) ctx.errOut(`エラー: ${e}`)
        ctx.errOut(
          `ビルド失敗: ${errors.length}件のエラー（部分取込はしない。何も書き出していない）`,
        )
        return 1
      }
      // T-80: contentLintの検出結果はビルドを止めない警告として表示する（修正はT-81/T-82）
      if (warnings.length > 0) {
        for (const w of warnings) ctx.out(`警告: ${w}`)
        ctx.out(`contentLint: ${warnings.length}件の警告（ビルドは継続。docs/STATUS.md参照）`)
      }

      const packsDir = join(contentRoot, 'packs')
      await mkdir(packsDir, { recursive: true })
      for (const { pack } of built) {
        await writeFile(
          join(packsDir, `${pack.pack.id}.json`),
          JSON.stringify(pack, null, 2) + '\n',
          'utf-8',
        )
      }
      const manifest = buildManifest(built)
      await writeFile(
        join(contentRoot, 'manifest.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf-8',
      )

      ctx.out(`${built.length}パックをビルドし ${packsDir} に書き出しました`)
      ctx.out(`manifest.json（schemaVersion ${SCHEMA_VERSION}）を ${contentRoot} に書き出しました`)
      return 0
    },
  },
  {
    name: 'verify-content',
    description:
      '配信物（content/packs/*.json・manifest.json）の再検証。validatePack・manifestのhash/sizeBytes一致・音声の参照切れ/孤児・drafts乖離を検査（T-234）',
    run: async (ctx) => {
      const contentRoot = ctx.args[0] ?? 'content'
      const { ok, errors, warnings } = await verifyContent(contentRoot)
      for (const w of warnings) ctx.out(`警告: ${w}`)
      if (!ok) {
        for (const e of errors) ctx.errOut(`エラー: ${e}`)
        ctx.errOut(
          `検証失敗: ${errors.length}件のエラー（配信物・drafts・音声のいずれかに不整合がある）`,
        )
        return 1
      }
      ctx.out(`検証OK: パック・manifest・音声・drafts の整合を確認しました（${contentRoot}）`)
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
