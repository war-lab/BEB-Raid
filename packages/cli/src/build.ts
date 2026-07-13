// パックビルド（T-32。正本: docs/04 2節・2.1節、docs/10 T-32行）。
//
// 生成→（AIクロスレビュー）→TTSを経た content/drafts/*.jsonl を実配布パックJSONに
// 組み立てる最終工程。全パック定義にT-05の validatePack を実行し、1件でもエラーが
// あればビルド全体を失敗させ、何も書き出さない（部分取込なし。CLAUDE.mdの
// 「出所不明パックは取込拒否」を含む不変条件をここで機械的に強制する）。
//
// ハッシュ計算は pack.sizeBytes を含めない内容（schemaVersion+pack meta(sizeBytes抜き)+
// questions）に対して行う。sizeBytes 自身がハッシュ対象に入ると
// 「sizeBytes→シリアライズ→ハッシュ→sizeBytes確定」の循環になるため、
// sizeBytes 抜きの内容でハッシュ確定→そのサイズを sizeBytes として書き込む、の順にする。

import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import {
  SCHEMA_VERSION,
  validatePack,
  type Manifest,
  type ManifestPackEntry,
  type PackLicense,
  type Question,
  type QuestionPack,
} from '@beb-raid/shared-schema'
import type { CorrectionsFile } from './calibrate.js'

/**
 * ビルド対象パックの定義（実データはドラフトJSONLから読み込む。commands.ts から参照）。
 * draftPath は contentRoot からの相対パス（例: 'drafts/vocab-card-s.jsonl'）。
 * contentRoot 自体をテストで差し替え可能にするため、'content/' 等のルート名を含めない
 */
export interface PackDefinition {
  id: string
  title: string
  license: PackLicense
  origin: string
  targetLevel: [number, number]
  draftPath: string
}

/** M1で配布する4パック（04の2節の例に倣ったid命名。docs/10完了条件の「ダミー4種パック」に対応する実データ版） */
export const PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-vocab-s-001',
    title: '語彙カード Sランク200語',
    license: 'internal-original',
    origin: 'エージェント直接執筆＋別モデル(Fable 5)AIクロスレビュー 2026-07',
    targetLevel: [600, 600],
    draftPath: 'drafts/vocab-card-s.jsonl',
  },
  {
    id: 'pack-p2-s-001',
    title: 'Part2瞬発 Sランク50問',
    license: 'internal-original',
    origin: 'エージェント直接執筆＋別モデル(Fable 5)AIクロスレビュー 2026-07',
    targetLevel: [600, 600],
    draftPath: 'drafts/part2-s.jsonl',
  },
  {
    id: 'pack-p5-s-001',
    title: 'Part5文法 Sランク50問',
    license: 'internal-original',
    origin: 'エージェント直接執筆＋別モデル(Fable 5)AIクロスレビュー 2026-07',
    targetLevel: [600, 600],
    draftPath: 'drafts/part5-s.jsonl',
  },
  {
    id: 'pack-p5-similar-s-001',
    title: 'Part5 key単語類題57問',
    license: 'internal-original',
    origin: 'エージェント直接執筆 2026-07（key単語システムの循環問題。AIクロスレビュー対象外）',
    targetLevel: [600, 600],
    draftPath: 'drafts/key-vocab-similar-s.jsonl',
  },
]

/** バリデーション前のパック素材（license/origin は validatePack が実行時に再検証する対象なので string のまま持つ） */
export interface PackSource {
  id: string
  title: string
  license: string
  origin: string
  targetLevel: [number, number]
  questions: Question[]
}

export interface BuiltPack {
  pack: QuestionPack
  /** manifest.json 用のコンテンツハッシュ（sizeBytes抜きの内容から算出） */
  hash: string
}

/**
 * T-34（実測補正）の補正値ファイルをパック素材に適用する。純粋関数（入力を書き換えず新規配列を返す）。
 * - questionDifficulty: 問題ID一致でdifficultyを上書き
 * - wordFreqRank: keyVocabの各wordが一致すればfreqRankを上書き。vocab_card自体のfront/freqRankも対象
 * corrections が無ければ sources をそのまま返す（T-32単体では従来どおり無補正で動く）
 */
export function applyCorrections(
  sources: readonly PackSource[],
  corrections: CorrectionsFile | null,
): PackSource[] {
  if (!corrections) return sources.slice()
  return sources.map((source) => ({
    ...source,
    questions: source.questions.map((q) => {
      const difficulty = corrections.questionDifficulty[q.id] ?? q.difficulty
      const keyVocab = q.keyVocab.map((kv) => {
        const corrected = corrections.wordFreqRank[kv.word]
        return corrected ? { ...kv, freqRank: corrected } : kv
      })
      const freqRank =
        q.format === 'vocab_card' && q.front
          ? (corrections.wordFreqRank[q.front] ?? q.freqRank)
          : q.freqRank
      return { ...q, difficulty, keyVocab, freqRank }
    }),
  }))
}

/** 1パック分の検証・組み立て。エラーがあれば built=null で全エラーを返す */
export function buildPack(
  source: PackSource,
  audioFiles: ReadonlySet<string>,
): { built: BuiltPack | null; errors: string[] } {
  const draftPack = {
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: source.id,
      title: source.title,
      license: source.license,
      origin: source.origin,
      targetLevel: source.targetLevel,
    },
    questions: source.questions,
  }

  const result = validatePack(draftPack, { audioFiles })
  if (!result.ok) {
    return {
      built: null,
      errors: result.errors.map((e) => `${source.id} ${e.path}: ${e.message}`),
    }
  }

  const contentForHash = JSON.stringify(draftPack, null, 2) + '\n'
  const hash = createHash('sha256').update(contentForHash).digest('hex').slice(0, 16)
  const sizeBytes = Buffer.byteLength(contentForHash, 'utf-8')

  const pack = {
    ...draftPack,
    pack: { ...draftPack.pack, sizeBytes },
  } as QuestionPack

  return { built: { pack, hash }, errors: [] }
}

/** 全パック定義を検証・組み立てる。1件でもエラーがあれば built は空（部分取込なし） */
export function buildAllPacks(
  sources: readonly PackSource[],
  audioFiles: ReadonlySet<string>,
): { built: BuiltPack[]; errors: string[] } {
  const errors: string[] = []
  const built: BuiltPack[] = []
  for (const source of sources) {
    const result = buildPack(source, audioFiles)
    if (result.built) {
      built.push(result.built)
    } else {
      errors.push(...result.errors)
    }
  }
  return { built: errors.length === 0 ? built : [], errors }
}

/** ビルド済みパック一覧 → manifest.json の中身 */
export function buildManifest(built: readonly BuiltPack[]): Manifest {
  const packs: ManifestPackEntry[] = built.map(({ pack, hash }) => ({
    id: pack.pack.id,
    title: pack.pack.title,
    targetLevel: pack.pack.targetLevel,
    sizeBytes: pack.pack.sizeBytes ?? 0,
    hash,
  }))
  return { schemaVersion: SCHEMA_VERSION, packs }
}

/**
 * `<contentRoot>/audio` 配下の実ファイルを再帰的に列挙し、Question.audio /
 * phraseAudio と同じ形式（例: 'audio/vocab/submit.mp3'、contentRoot基準の相対パス）
 * の集合を返す。audioディレクトリが無ければ空集合（テスト等、音声不要なパックのみの場合）
 */
export async function scanAudioFiles(contentRoot: string): Promise<Set<string>> {
  const files = new Set<string>()
  const audioDir = join(contentRoot, 'audio')

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else {
        files.add(relative(contentRoot, full).split(sep).join('/'))
      }
    }
  }

  await walk(audioDir)
  return files
}
