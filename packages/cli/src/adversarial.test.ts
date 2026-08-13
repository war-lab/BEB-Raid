// T-355完了条件のテスト: 敵対的検証記録用TSVの雛形生成・解析（正本: docs/32 8節）
import { describe, expect, it } from 'vitest'
import {
  buildAdversarialTsvTemplate,
  parseAdversarialTsv,
  reviewMethodLabel,
} from './adversarial.js'

describe('buildAdversarialTsvTemplate', () => {
  it('ヘッダー＋1件1行のTSVを作る（verdict以降の列は空欄）', () => {
    const tsv = buildAdversarialTsvTemplate(['p5-client', 'p5-audit'])
    const lines = tsv.split('\n').filter((l) => l.length > 0)
    expect(lines[0]).toBe('id\tverdict\tobservation\treviewer\treviewedAt')
    expect(lines[1]).toBe('p5-client\t\t\t\t')
    expect(lines[1]?.split('\t')).toEqual(['p5-client', '', '', '', ''])
    expect(lines[2]?.split('\t')).toEqual(['p5-audit', '', '', '', ''])
  })

  it('id0件でもヘッダーだけのTSVを作る', () => {
    const tsv = buildAdversarialTsvTemplate([])
    expect(tsv.trim().split('\n')).toHaveLength(1)
  })
})

describe('parseAdversarialTsv', () => {
  it('記入済み行を読み取る', () => {
    const tsv = [
      'id\tverdict\tobservation\treviewer\treviewedAt',
      'p5-client\taccept\t\tclaude-opus-5\t2026-08-12',
      'p5-audit\trevise\t二重正答の疑い\tclaude-opus-5\t2026-08-12',
    ].join('\n')
    const { records, skipped, errors } = parseAdversarialTsv(tsv)
    expect(errors).toEqual([])
    expect(skipped).toBe(0)
    expect(records).toHaveLength(2)
    expect(records[1]).toEqual({
      id: 'p5-audit',
      verdict: 'revise',
      observation: '二重正答の疑い',
      reviewer: 'claude-opus-5',
      reviewedAt: '2026-08-12',
    })
  })

  it('verdict未記入の行はスキップされる（次回に持ち越し）', () => {
    const tsv = ['id\tverdict\tobservation\treviewer\treviewedAt', 'p5-client\t\t\t\t'].join('\n')
    const { records, skipped } = parseAdversarialTsv(tsv)
    expect(records).toHaveLength(0)
    expect(skipped).toBe(1)
  })

  it('verdictが不正な値ならエラーとして返す（黙って無視しない）', () => {
    const tsv = [
      'id\tverdict\tobservation\treviewer\treviewedAt',
      'p5-client\tmaybe\t\tclaude-opus-5\t2026-08-12',
    ].join('\n')
    const { records, errors } = parseAdversarialTsv(tsv)
    expect(records).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('p5-client')
  })

  it('前後の空白は詰める（sanitizeCell）', () => {
    const tsv = [
      'id\tverdict\tobservation\treviewer\treviewedAt',
      'p5-client\taccept\t  余白付きの所見  \tclaude-opus-5\t2026-08-12',
    ].join('\n')
    const { records } = parseAdversarialTsv(tsv)
    expect(records[0]?.observation).toBe('余白付きの所見')
  })
})

describe('parseAdversarialTsv: 欠けた行の扱い', () => {
  it('id空欄の行は読み飛ばす（skippedにも数えない）', () => {
    const tsv = [
      'id\tverdict\tobservation\treviewer\treviewedAt',
      '\taccept\t\tclaude-opus-5\t2026-08-12',
      'p5-client\taccept\t\tclaude-opus-5\t2026-08-12',
    ].join('\n')
    const { records, skipped, errors } = parseAdversarialTsv(tsv)
    expect(records).toHaveLength(1)
    expect(skipped).toBe(0)
    expect(errors).toHaveLength(0)
  })

  it('observation以降の列が欠けていても空文字として読める', () => {
    const tsv = ['id\tverdict\tobservation\treviewer\treviewedAt', 'p5-client\taccept'].join('\n')
    const { records } = parseAdversarialTsv(tsv)
    expect(records[0]).toEqual({
      id: 'p5-client',
      verdict: 'accept',
      observation: '',
      reviewer: '',
      reviewedAt: '',
    })
  })
})

describe('reviewMethodLabel', () => {
  it('8.2節の書式でpack.origin向けの工程名を組み立てる', () => {
    expect(reviewMethodLabel('claude-opus-5', 6, '2026-08-12')).toBe(
      'AIクロスレビュー（claude-opus-5）＋敵対的検証（6観点・2026-08-12）',
    )
  })
})
