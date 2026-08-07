// 匿名問題別正誤集計・悪問報告のシングルトンDurable Object（正本: docs/17_M3実装計画.md 3.8節）。
// idFromName('global')で単一インスタンスに固定する。deviceTokenは受け取らず、
// SQLite表にも列を持たせない（14の4.4-④: 構造的にdeviceTokenと結合できない保存形式）

import { DurableObject } from 'cloudflare:workers'

import type { QuestionReportReason, QuestionStatPayload } from '@beb-raid/shared-schema'

import type { Env } from './env'

export const STATS_DO_NAME = 'global'

/** T-333（K-68）: getAllStatsの1ページあたりの既定・上限件数 */
export const STATS_PAGE_DEFAULT_LIMIT = 200
export const STATS_PAGE_MAX_LIMIT = 1000

export interface StatsPage {
  items: QuestionStatPayload[]
  /** 次ページの取得に使うカーソル（このページの最後のquestionId）。もう無ければnull */
  nextCursor: string | null
}

interface QuestionStatRow extends Record<string, string | number | null> {
  questionId: string
  correct: number
  wrong: number
  timeout: number
}

interface QuestionReportRow extends Record<string, string | number | null> {
  questionId: string
  reason: string
  count: number
}

export class StatsDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS question_stats (
        questionId TEXT PRIMARY KEY,
        correct INTEGER NOT NULL DEFAULT 0,
        wrong INTEGER NOT NULL DEFAULT 0,
        timeout INTEGER NOT NULL DEFAULT 0
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS reports (
        questionId TEXT NOT NULL,
        reason TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (questionId, reason)
      )
    `)
  }

  /** questionId別にUPSERT加算する（同一questionIdの再送は既存件数に積み増す） */
  addStats(stats: QuestionStatPayload[]): void {
    for (const s of stats) {
      this.ctx.storage.sql.exec(
        `INSERT INTO question_stats (questionId, correct, wrong, timeout) VALUES (?, ?, ?, ?)
         ON CONFLICT(questionId) DO UPDATE SET
           correct = correct + excluded.correct,
           wrong = wrong + excluded.wrong,
           timeout = timeout + excluded.timeout`,
        s.questionId,
        s.correct,
        s.wrong,
        s.timeout,
      )
    }
  }

  /**
   * 管理用GET /stats/questionsの入力（3.8節）。
   * 【T-333・K-68】question_statsはパック配信ごとに増え続け、無制限に増えると
   * 全件を1レスポンスで返す旧実装は応答サイズ・メモリの両方で無制限に肥大する。
   * questionId昇順のキーセットページネーション（`WHERE questionId > cursor`）にする。
   * OFFSETベースにしないのは、件数が増えるほど「先頭からcursor件を読み捨てる」コストが
   * 増えるため（keyset方式はどのページでもO(limit)で済む）
   */
  getAllStats(cursor: string | null = null, limit: number = STATS_PAGE_DEFAULT_LIMIT): StatsPage {
    const boundedLimit = Math.max(1, Math.min(limit, STATS_PAGE_MAX_LIMIT))
    const rows = cursor
      ? this.ctx.storage.sql
          .exec<QuestionStatRow>(
            'SELECT questionId, correct, wrong, timeout FROM question_stats WHERE questionId > ? ORDER BY questionId LIMIT ?',
            cursor,
            boundedLimit,
          )
          .toArray()
      : this.ctx.storage.sql
          .exec<QuestionStatRow>(
            'SELECT questionId, correct, wrong, timeout FROM question_stats ORDER BY questionId LIMIT ?',
            boundedLimit,
          )
          .toArray()
    const nextCursor = rows.length === boundedLimit ? rows[rows.length - 1]!.questionId : null
    return { items: rows, nextCursor }
  }

  /** 「問題がおかしい」報告をquestionId×reason別にUPSERT加算する（T-101。deviceTokenは受け取らない） */
  addReport(questionId: string, reason: QuestionReportReason): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO reports (questionId, reason, count) VALUES (?, ?, 1)
       ON CONFLICT(questionId, reason) DO UPDATE SET count = count + 1`,
      questionId,
      reason,
    )
  }

  /** テスト・管理用: 報告の集計値を全件返す（HTTP経由では公開しない） */
  getAllReports(): QuestionReportRow[] {
    return this.ctx.storage.sql
      .exec<QuestionReportRow>(
        'SELECT questionId, reason, count FROM reports ORDER BY questionId, reason',
      )
      .toArray()
  }
}
