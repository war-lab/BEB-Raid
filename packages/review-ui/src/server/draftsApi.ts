// レビューUIのローカルAPI本体（M2・T-57。正本: docs/13 3.9節）。
// ファイル読み書きはここに閉じ、Viteのdevサーバーミドルウェア（draftsServerPlugin.ts）
// から呼ぶ。cliの review.ts と型・意味論を共有し、出力（accepted/rejected.jsonl）は
// 既存のCLI往復運用（review-import）と互換にする（11節参照）。

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import {
  parseJsonl,
  toJsonl,
  type GeneratedItemDraft,
  type RejectedItem,
} from '@beb-raid/cli/review'

/**
 * レビュー済み出力（review-import・review-uiのいずれが書き出したものも含む）のファイル名末尾。
 * T-238（Q-81）: `content/drafts/text-passage-p6-s.accepted.jsonl` のように
 * `content/drafts/` 直下にコミットされている運用があるため、拡張子（.jsonl）だけでは
 * レビュー対象のドラフトと区別できない。選ぶとpayload不在の空フォームになり、
 * 誤ってレビュー済みの結果を書き出しかねないため列挙から除外する
 */
const REVIEWED_OUTPUT_SUFFIXES = ['.accepted.jsonl', '.rejected.jsonl']

/** content/drafts/ 直下の *.jsonl 一覧（reviewed/ 等のサブディレクトリ、レビュー済み出力は除く） */
export async function listDraftFiles(contentRoot: string): Promise<string[]> {
  const draftsDir = join(contentRoot, 'drafts')
  let entries: string[]
  try {
    entries = await readdir(draftsDir)
  } catch {
    return []
  }
  return entries
    .filter(
      (name) =>
        extname(name) === '.jsonl' &&
        !REVIEWED_OUTPUT_SUFFIXES.some((suffix) => name.endsWith(suffix)),
    )
    .sort()
}

/** 指定ドラフトファイルをパースして返す */
export async function loadDraftFile(
  contentRoot: string,
  filename: string,
): Promise<GeneratedItemDraft[]> {
  const path = join(contentRoot, 'drafts', basename(filename))
  const raw = await readFile(path, 'utf-8')
  return parseJsonl<GeneratedItemDraft>(raw)
}

export interface WriteReviewResultInput {
  /** レビュー対象だった元のドラフトファイル名（出力ファイル名の接頭辞に使う） */
  filename: string
  accepted: unknown[]
  rejected: RejectedItem[]
}

export interface WriteReviewResultOutput {
  acceptedPath: string
  rejectedPath: string
}

/**
 * 採用・修正済みpayload一覧とrejected一覧を書き出す（既存review-importの出力と同形式）。
 * 出力先は content/drafts/reviewed/<元ファイル名の拡張子抜き>.accepted.jsonl / .rejected.jsonl
 * （複数種別のドラフトを同一ディレクトリで扱うため、出力ファイル名を元ファイル名で分ける）
 */
export async function writeReviewResult(
  contentRoot: string,
  input: WriteReviewResultInput,
): Promise<WriteReviewResultOutput> {
  const stem = basename(input.filename, extname(input.filename))
  const reviewedDir = join(contentRoot, 'drafts', 'reviewed')
  await mkdir(reviewedDir, { recursive: true })

  const acceptedPath = join(reviewedDir, `${stem}.accepted.jsonl`)
  const rejectedPath = join(reviewedDir, `${stem}.rejected.jsonl`)
  await writeFile(acceptedPath, toJsonl(input.accepted), 'utf-8')
  await writeFile(rejectedPath, toJsonl(input.rejected), 'utf-8')

  return { acceptedPath, rejectedPath }
}
