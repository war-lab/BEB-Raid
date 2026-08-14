// T-30 完了条件のテスト:
// - ダミーデータで export→（手で書き換え）→import の往復
// - 破棄理由が rejected に記録される
import { describe, expect, it } from 'vitest'
import {
  buildReviewTsv,
  parseJsonl,
  parseReviewTsv,
  toJsonl,
  type GeneratedItemDraft,
} from './review.js'

const DRAFTS: GeneratedItemDraft[] = [
  { id: 'v-1', kind: 'vocab_card', preview: 'submit / 提出する', payload: { word: 'submit' } },
  { id: 'v-2', kind: 'vocab_card', preview: 'attend / 出席する', payload: { word: 'attend' } },
  {
    id: 'v-3',
    kind: 'vocab_card',
    preview: 'negotiate / 交渉する',
    payload: { word: 'negotiate' },
  },
]

function draftsById(drafts: GeneratedItemDraft[]): Map<string, GeneratedItemDraft> {
  return new Map(drafts.map((d) => [d.id, d]))
}

describe('buildReviewTsv', () => {
  it('ヘッダー＋1件1行のTSVを作る（status以降の列は空欄）', () => {
    const tsv = buildReviewTsv(DRAFTS)
    const lines = tsv.trim().split('\n')
    expect(lines).toHaveLength(4) // ヘッダー + 3件
    expect(lines[0]).toBe('id\t種別\t本文プレビュー\tstatus(採用・修正・破棄)\t修正内容\t破棄理由')
    expect(lines[1]).toBe('v-1\tvocab_card\tsubmit / 提出する\t\t\t')
  })

  it('プレビュー内のタブ・改行は空白に潰す', () => {
    const tsv = buildReviewTsv([{ id: 'x', kind: 'vocab_card', preview: 'a\tb\nc', payload: {} }])
    expect(tsv).toContain('a b c')
    expect(tsv).not.toMatch(/a\tb/)
  })
})

describe('parseReviewTsv: 往復', () => {
  it('採用行はpayloadそのまま、修正行はJSONマージ、破棄行はrejectedに理由付きで入る', () => {
    const tsv = [
      'id\t種別\t本文プレビュー\tstatus\t修正内容\t破棄理由',
      'v-1\tvocab_card\tsubmit\t採用\t\t',
      'v-2\tvocab_card\tattend\t修正\t{"word":"attend-fixed"}\t',
      'v-3\tvocab_card\tnegotiate\t破棄\t\t既存教材に酷似',
    ].join('\n')

    const result = parseReviewTsv(tsv, draftsById(DRAFTS))

    expect(result.accepted).toEqual([{ word: 'submit' }, { word: 'attend-fixed' }])
    expect(result.rejected).toEqual([{ id: 'v-3', kind: 'vocab_card', reason: '既存教材に酷似' }])
    expect(result.skipped).toBe(0)
  })

  it('破棄理由が空欄の場合は「(理由未記入)」で記録される', () => {
    const tsv = [
      'id\t種別\t本文プレビュー\tstatus\t修正内容\t破棄理由',
      'v-1\tvocab_card\tsubmit\t破棄\t\t',
    ].join('\n')

    const result = parseReviewTsv(tsv, draftsById(DRAFTS))
    expect(result.rejected).toEqual([{ id: 'v-1', kind: 'vocab_card', reason: '(理由未記入)' }])
  })

  // T-240（Q-84）: 「修正」列のJSON解析失敗は、以前は黙って破棄側に振り分けられていた。
  // レビューアの修正意図（採用したかった内容）がrejected.jsonlの理由文字列に埋もれて
  // 消えるため、明示的なエラーで中断し、レビューアにTSVの修正を促す。
  it('修正内容が不正なJSONの場合は明示的なエラーを投げる（黙って破棄側に回さない）', () => {
    const tsv = [
      'id\t種別\t本文プレビュー\tstatus\t修正内容\t破棄理由',
      'v-1\tvocab_card\tsubmit\t修正\t{不正なJSON\t',
    ].join('\n')

    expect(() => parseReviewTsv(tsv, draftsById(DRAFTS))).toThrow(/v-1.*JSON解析に失敗/s)
  })

  it('不正なJSONの行が複数あれば、すべてのidをまとめてエラーメッセージに含める', () => {
    const tsv = [
      'id\t種別\t本文プレビュー\tstatus\t修正内容\t破棄理由',
      'v-1\tvocab_card\tsubmit\t修正\t{不正なJSON\t',
      'v-2\tvocab_card\tattend\t修正\t{もっと不正\t',
    ].join('\n')

    try {
      parseReviewTsv(tsv, draftsById(DRAFTS))
      expect.unreachable('エラーが投げられるはず')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      expect(message).toContain('v-1')
      expect(message).toContain('v-2')
    }
  })

  it('status未記入・対応ドラフト無しの行はスキップされる（次回に持ち越し）', () => {
    const tsv = [
      'id\t種別\t本文プレビュー\tstatus\t修正内容\t破棄理由',
      'v-1\tvocab_card\tsubmit\t\t\t',
      'unknown-id\tvocab_card\tx\t採用\t\t',
    ].join('\n')

    const result = parseReviewTsv(tsv, draftsById(DRAFTS))
    expect(result.accepted).toHaveLength(0)
    expect(result.rejected).toHaveLength(0)
    expect(result.skipped).toBe(2)
  })
})

describe('parseJsonl / toJsonl', () => {
  it('往復できる', () => {
    const items = [{ a: 1 }, { b: 2 }]
    const jsonl = toJsonl(items)
    expect(parseJsonl(jsonl)).toEqual(items)
  })

  it('空配列はから文字列になり、parseJsonlは空行を無視する', () => {
    expect(toJsonl([])).toBe('')
    expect(parseJsonl('')).toEqual([])
    expect(parseJsonl('\n\n')).toEqual([])
  })
})
