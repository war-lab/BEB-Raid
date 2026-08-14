// 配信物のCIゲート（T-234。正本: docs/30_改修計画_全量レビュー棚卸し.md 11節「T-234の実装方針」、
// docs/29_全量レビュー棚卸し.md Q-74・Q-83）。
//
// 【解決する問題】CIは lint・build・test のみを実行し、deploy.yml は content/ をそのまま
// GitHub Pages へ配置する。validatePack（license・origin必須・answer整合・
// responsesTextDigest照合）が走るのは開発者が手動で `beb build` を実行したときだけで、
// アプリ側から validatePack を呼ぶ箇所は0件。したがって content/packs/*.json を直接編集して
// コミットすれば、すべての検査を素通りして全世界へ配信される（Q-74）。
//
// 【この関数がすること】配信物（content/packs/*.json・manifest.json・content/audio/）を、
// drafts経由のビルドとは独立に、実ファイルそのものに対して検証する。5点を検証する。
//   1. 全パックの validatePack（license・origin必須・answer整合・responsesTextDigest照合）
//      を配信パックJSONに対して直接実行する（drafts を経由しない）
//   2. manifest.json の各エントリの hash と sizeBytes が実ファイルの内容と一致すること
//   3. 音声ファイルの参照切れ（パックが参照するmp3が実在しない）
//   4. 孤児ファイル（manifestからもパックからも参照されないmp3・パックJSON）
//   5. パックと content/drafts/ の乖離（drafts から再ビルドした内容とハッシュが一致しない
//      ＝ 配信パックが手編集された疑い）
//
// ハッシュ照合（2・5）は生ファイルのバイト比較をしない。Windows での改行コード
// （CRLF）チェックアウトと Linux の CI（LF）とで同じパックでもバイト列が変わり、
// 誤検出になるため。JSON.parse してから build.ts と同じアルゴリズム
// （computePackContentHash）で再シリアライズしたハッシュを比較することで、
// 改行コードの差異を吸収する。

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { validatePack, type Manifest, type QuestionPack } from '@beb-raid/shared-schema'
import { parseAdversarialTsv } from './adversarial.js'
import {
  buildPack,
  computePackContentHash,
  loadPackSources,
  PACK_DEFINITIONS,
  scanAudioFiles,
} from './build.js'

export interface VerifyContentResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T
}

/**
 * パックJSON（構造の妥当性を問わない unknown）から audio / phraseAudio 参照を
 * ベストエフォートで収集する。validatePack の成否に関係なく呼ぶための緩い実装
 * （型を強制せず、それらしいフィールドがあれば拾うだけ）。
 */
function collectAudioRefs(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const questions = (raw as { questions?: unknown }).questions
  if (!Array.isArray(questions)) return []
  const refs: string[] = []
  for (const q of questions) {
    if (typeof q !== 'object' || q === null) continue
    const audio = (q as { audio?: unknown }).audio
    const phraseAudio = (q as { phraseAudio?: unknown }).phraseAudio
    if (typeof audio === 'string' && audio !== '') refs.push(audio)
    if (typeof phraseAudio === 'string' && phraseAudio !== '') refs.push(phraseAudio)
  }
  return refs
}

/**
 * 配信物（content/packs・manifest.json・content/audio・content/drafts）を検証する。
 * エラーが1件でもあれば ok=false（CIゲートとして「不正パックをコミットすると赤くなる」ことを保証する）。
 */
export async function verifyContent(contentRoot: string): Promise<VerifyContentResult> {
  const errors: string[] = []
  const warnings: string[] = []

  const audioFiles = await scanAudioFiles(contentRoot)
  const packsDir = join(contentRoot, 'packs')

  let packFileNames: string[]
  try {
    packFileNames = (await readdir(packsDir)).filter((f) => f.endsWith('.json')).sort()
  } catch (e) {
    errors.push(`${packsDir} の読み込みに失敗: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, errors, warnings }
  }

  const manifestPath = join(contentRoot, 'manifest.json')
  let manifest: Manifest
  try {
    manifest = await readJsonFile<Manifest>(manifestPath)
  } catch (e) {
    errors.push(`${manifestPath} の読み込みに失敗: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, errors, warnings }
  }

  // --- 1. 全パックの validatePack（配信パックJSONそのものを直接検証。draftsを経由しない） ---
  const validPacks = new Map<string, QuestionPack>()
  const referencedAudio = new Set<string>()
  for (const fileName of packFileNames) {
    const path = join(packsDir, fileName)
    let raw: unknown
    try {
      raw = await readJsonFile(path)
    } catch (e) {
      errors.push(`${fileName}: JSON解析失敗（${e instanceof Error ? e.message : String(e)}）`)
      continue
    }
    // 音声参照の収集（3・4用）は validatePack の成否に関わらず行う。1件のフィールドが
    // 不正でパック全体が invalid_structure 系以外の理由でエラーになっても、そのパックの
    // 他の問題が参照する実在の音声まで「孤児」と誤検出しないようにするため
    collectAudioRefs(raw).forEach((ref) => referencedAudio.add(ref))

    const result = validatePack(raw, { audioFiles })
    if (!result.ok) {
      for (const err of result.errors) {
        errors.push(`${fileName} ${err.path}: ${err.message}`)
      }
      // 構造が信用できないパックは以降の照合（hash・drafts乖離）から外す
      continue
    }
    const pack = raw as QuestionPack
    const idFromFileName = fileName.replace(/\.json$/, '')
    if (pack.pack.id !== idFromFileName) {
      warnings.push(`${fileName}: pack.id(${pack.pack.id})がファイル名と一致しない`)
    }
    validPacks.set(pack.pack.id, pack)
  }

  // --- 2. manifest.json の hash・sizeBytes が実ファイルの内容と一致すること ---
  const manifestIds = new Set(manifest.packs.map((e) => e.id))
  for (const entry of manifest.packs) {
    const pack = validPacks.get(entry.id)
    if (!pack) {
      errors.push(
        `manifest.json: ${entry.id} に対応する有効なパックファイルが無い（未検出、または1のvalidatePackで検証失敗済み）`,
      )
      continue
    }
    const { hash, sizeBytes } = computePackContentHash(pack)
    if (hash !== entry.hash) {
      errors.push(
        `${entry.id}: manifest.jsonのhash(${entry.hash})が実ファイルの内容から再算出したhash(${hash})と一致しない`,
      )
    }
    if (sizeBytes !== entry.sizeBytes) {
      errors.push(
        `${entry.id}: manifest.jsonのsizeBytes(${entry.sizeBytes})が実ファイルの内容から再算出したsizeBytes(${sizeBytes})と一致しない`,
      )
    }
    if (pack.pack.sizeBytes !== undefined && pack.pack.sizeBytes !== sizeBytes) {
      errors.push(
        `${entry.id}: パック自身のpack.sizeBytes(${pack.pack.sizeBytes})が実内容から再算出したsizeBytes(${sizeBytes})と一致しない`,
      )
    }
  }
  // 4a. 孤児パックJSON（manifest.jsonに登録されていない、有効なパックファイル）
  for (const id of validPacks.keys()) {
    if (!manifestIds.has(id)) {
      errors.push(`${id}.json: manifest.jsonに登録されていない孤児パックJSON`)
    }
  }

  // --- 3・4. 音声ファイルの参照切れ・孤児 ---
  for (const ref of referencedAudio) {
    if (!audioFiles.has(ref)) {
      errors.push(`音声参照切れ: ${ref} を参照するパックがあるが実ファイルが存在しない`)
    }
  }
  for (const file of audioFiles) {
    if (!referencedAudio.has(file)) {
      errors.push(`孤児音声ファイル: ${file} はどの有効なパックからも参照されない`)
    }
  }

  // --- 5. パックと content/drafts/ の乖離 ---
  let sources
  try {
    sources = await loadPackSources(contentRoot)
  } catch (e) {
    errors.push(
      `content/drafts/ からのドラフト読み込みに失敗（drafts⇔packs乖離チェックを実行できない）: ${
        e instanceof Error ? e.message : String(e)
      }`,
    )
    sources = null
  }
  if (sources) {
    const sourcesById = new Map(sources.map((s) => [s.id, s]))
    for (const def of PACK_DEFINITIONS) {
      const source = sourcesById.get(def.id)
      if (!source) continue // loadPackSourcesは常にPACK_DEFINITIONS全件を返すため到達しない
      const { built, errors: buildErrors } = buildPack(source, audioFiles)
      if (!built) {
        errors.push(
          `${def.id}: drafts(${def.draftPath})からの再ビルドに失敗（${buildErrors.join('; ')}）`,
        )
        continue
      }
      const shipped = validPacks.get(def.id)
      if (!shipped) {
        // 1のvalidatePackで既に検証失敗をエラー報告済み、または3.のmanifest照合で報告済み
        continue
      }
      const rebuilt = computePackContentHash(built.pack)
      const shippedHash = computePackContentHash(shipped)
      if (rebuilt.hash !== shippedHash.hash) {
        errors.push(
          `${def.id}: 配信パックがdrafts(${def.draftPath})からの再ビルドと内容が一致しない（パックJSONの直接編集の疑い）`,
        )
      }
    }
  }

  // --- 6. 敵対的検証の工程記録（T-355。正本: docs/32 8.2節・8.3節） ---
  //
  // CLAUDE.mdの不変条件「工程を経ていないコンテンツは配信しない」を機械で強制する。
  // これを検査する仕組みが無かったため、記録が無いまま配信されている状態を検出できなかった
  // （2026-08-13時点で pack-p2-s-003 にTSVが無く、全パックで3フィールドが未記入だった）。
  for (const [id, pack] of validPacks) {
    const meta = pack.pack as {
      origin?: string
      reviewedBy?: string
      reviewedAt?: string
      reviewMethod?: string
    }
    for (const field of ['reviewedBy', 'reviewedAt', 'reviewMethod'] as const) {
      if (!meta[field]) {
        errors.push(`${id}: pack.${field} が無い（敵対的検証の工程記録。docs/32 8.2節）`)
      }
    }
    // originにも工程名が含まれること（人が読む1行の出所表記と機械可読フィールドを揃える）
    if (meta.reviewMethod && !(meta.origin ?? '').includes(meta.reviewMethod)) {
      errors.push(`${id}: pack.origin に pack.reviewMethod の工程名が含まれていない`)
    }

    const tsvPath = join(contentRoot, 'drafts', `${id}.adversarial.tsv`)
    let tsv: string
    try {
      tsv = await readFile(tsvPath, 'utf-8')
    } catch {
      errors.push(`${id}: 敵対的検証の記録 drafts/${id}.adversarial.tsv が無い（docs/32 8.3節）`)
      continue
    }
    const { records, skipped, errors: tsvErrors } = parseAdversarialTsv(tsv)
    for (const e of tsvErrors) errors.push(`${id}.adversarial.tsv ${e}`)
    if (skipped > 0) {
      errors.push(`${id}.adversarial.tsv: verdict未記入が${skipped}件ある`)
    }
    const recorded = new Set(records.map((r) => r.id))
    const missing = pack.questions.filter((q) => !recorded.has(q.id)).map((q) => q.id)
    if (missing.length > 0) {
      errors.push(
        `${id}.adversarial.tsv: 判定の無い設問が${missing.length}件ある（例: ${missing.slice(0, 3).join(', ')}）`,
      )
    }
    const questionIds = new Set(pack.questions.map((q) => q.id))
    const stale = records.filter((r) => !questionIds.has(r.id)).map((r) => r.id)
    if (stale.length > 0) {
      errors.push(
        `${id}.adversarial.tsv: パックに存在しない設問の行が${stale.length}件ある（例: ${stale.slice(0, 3).join(', ')}）`,
      )
    }
    const unresolved = records.filter((r) => r.verdict !== 'accept')
    if (unresolved.length > 0) {
      errors.push(
        `${id}.adversarial.tsv: acceptになっていない設問が${unresolved.length}件ある（例: ${unresolved
          .slice(0, 3)
          .map((r) => `${r.id}=${r.verdict}`)
          .join(', ')}）。修正するか、発起人判断で配信対象から外す`,
      )
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}
