// T-57 完了条件のテスト（ローカルAPI本体。正本: docs/13 3.9節）:
// - ドラフト一覧・読込・採用/破棄の書出が既存review-importの出力（GeneratedItemDraft/RejectedItem）と互換
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { toJsonl, type GeneratedItemDraft } from '@beb-raid/cli/review'
import { listDraftFiles, loadDraftFile, writeReviewResult } from './draftsApi.js'

let contentRoot: string

beforeEach(async () => {
  contentRoot = await mkdtemp(join(tmpdir(), 'beb-review-ui-'))
})

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true })
})

function draft(id: string, kind = 'vocab_card'): GeneratedItemDraft {
  return { id, kind, preview: `${id} preview`, payload: { id, kind } }
}

describe('listDraftFiles', () => {
  it('content/drafts/直下の*.jsonlのみをファイル名昇順で返す', async () => {
    const draftsDir = join(contentRoot, 'drafts')
    await mkdir(draftsDir, { recursive: true })
    await writeFile(join(draftsDir, 'b-drafts.jsonl'), '', 'utf-8')
    await writeFile(join(draftsDir, 'a-drafts.jsonl'), '', 'utf-8')
    await writeFile(join(draftsDir, 'readme.md'), '', 'utf-8')

    expect(await listDraftFiles(contentRoot)).toEqual(['a-drafts.jsonl', 'b-drafts.jsonl'])
  })

  it('drafts/ ディレクトリが無ければ空配列', async () => {
    expect(await listDraftFiles(contentRoot)).toEqual([])
  })
})

describe('loadDraftFile', () => {
  it('JSONLをパースしてGeneratedItemDraft[]を返す', async () => {
    const draftsDir = join(contentRoot, 'drafts')
    await mkdir(draftsDir, { recursive: true })
    const drafts = [draft('v-1'), draft('v-2')]
    await writeFile(join(draftsDir, 'vocab.jsonl'), toJsonl(drafts), 'utf-8')

    const loaded = await loadDraftFile(contentRoot, 'vocab.jsonl')
    expect(loaded).toEqual(drafts)
  })

  it('basename化されるためパストラバーサルできない', async () => {
    const draftsDir = join(contentRoot, 'drafts')
    await mkdir(draftsDir, { recursive: true })
    await writeFile(join(draftsDir, 'safe.jsonl'), toJsonl([draft('v-1')]), 'utf-8')

    const loaded = await loadDraftFile(contentRoot, '../../etc/safe.jsonl')
    expect(loaded).toEqual([draft('v-1')])
  })
})

describe('writeReviewResult', () => {
  it('accepted/rejectedをdrafts/reviewed/配下にJSONLで書き出す（review-importと同形式）', async () => {
    const result = await writeReviewResult(contentRoot, {
      filename: 'vocab-card-s.jsonl',
      accepted: [{ id: 'v-1' }],
      rejected: [{ id: 'v-2', kind: 'vocab_card', reason: 'ひっかけが不自然' }],
    })

    expect(result.acceptedPath).toBe(
      join(contentRoot, 'drafts', 'reviewed', 'vocab-card-s.accepted.jsonl'),
    )
    expect(result.rejectedPath).toBe(
      join(contentRoot, 'drafts', 'reviewed', 'vocab-card-s.rejected.jsonl'),
    )

    const acceptedText = await readFile(result.acceptedPath, 'utf-8')
    const rejectedText = await readFile(result.rejectedPath, 'utf-8')
    expect(acceptedText).toBe(toJsonl([{ id: 'v-1' }]))
    expect(rejectedText).toBe(
      toJsonl([{ id: 'v-2', kind: 'vocab_card', reason: 'ひっかけが不自然' }]),
    )
  })

  it('採用・破棄が0件でも空JSONLを書き出す', async () => {
    const result = await writeReviewResult(contentRoot, {
      filename: 'part2-s.jsonl',
      accepted: [],
      rejected: [],
    })
    expect(await readFile(result.acceptedPath, 'utf-8')).toBe('')
    expect(await readFile(result.rejectedPath, 'utf-8')).toBe('')
  })
})
