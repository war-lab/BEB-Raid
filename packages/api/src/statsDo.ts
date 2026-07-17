// 匿名問題別正誤集計・悪問報告のシングルトンDurable Object（正本: docs/17_M3実装計画.md 3.8節）。
// idFromName('global')で単一インスタンスに固定する。deviceTokenは受け取らず、
// SQLite表にも列を持たせない（14の4.4-④: 構造的にdeviceTokenと結合できない保存形式）

import { DurableObject } from 'cloudflare:workers'

import type { QuestionReportReason, QuestionStatPayload } from '@beb-raid/shared-schema'

import type { Env } from './env'

export const STATS_DO_NAME = 'global'

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

  /** 管理用GET /stats/questionsの入力（全件返却。3.8節） */
  getAllStats(): QuestionStatPayload[] {
    return this.ctx.storage.sql
      .exec<QuestionStatRow>(
        'SELECT questionId, correct, wrong, timeout FROM question_stats ORDER BY questionId',
      )
      .toArray()
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
