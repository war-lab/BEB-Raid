// 匿名問題別正誤集計の送信サービス（M3・T-100。正本: docs/17_M3実装計画.md 3.8節）。
//
// pendingSyncは使わない（集計値はattemptsから毎回再計算でき、冪等キー管理が不要なため=3.8節）。
// watermark方式: settings QUESTION_STATS_LAST_SENT_AT_KEY より新しいattemptsをquestionId別に
// 集計して送信し、成功時にwatermarkを今回処理したattemptsの最大answeredAtへ進める。
// shadowing由来の合成questionId（`shadow:`プレフィックス）はisCorrect固定で統計価値がないため
// 集計対象から除外する（03の規約。engine/curriculum.tsのisCountableAttemptと同じ除外規約）。
//
// 【縮退設計】isConfigured()=false または questionStatsEnabled!==true なら関数冒頭で即return

import { buildQuestionStatPayload, type QuestionStatPayload } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import type { RaidApi } from '../platform'
import { QUESTION_STATS_ENABLED_KEY, QUESTION_STATS_LAST_SENT_AT_KEY } from './settingsKeys'

function isCountableForStats(attempt: AttemptRecord): boolean {
  return !attempt.questionId.startsWith('shadow:')
}

function classify(attempt: AttemptRecord): 'correct' | 'wrong' | 'timeout' {
  if (attempt.isTimeout) return 'timeout'
  return attempt.isCorrect ? 'correct' : 'wrong'
}

function aggregate(attempts: AttemptRecord[]): QuestionStatPayload[] {
  const counts = new Map<string, { correct: number; wrong: number; timeout: number }>()
  for (const attempt of attempts) {
    const entry = counts.get(attempt.questionId) ?? { correct: 0, wrong: 0, timeout: 0 }
    entry[classify(attempt)] += 1
    counts.set(attempt.questionId, entry)
  }
  return [...counts.entries()].map(([questionId, c]) =>
    buildQuestionStatPayload({ questionId, ...c }),
  )
}

/** 失敗無視・非同期の送信サービス（raidSyncと同じトリガーに相乗り=3.8節） */
export async function sendQuestionStats(db: BebRaidDatabase, raidApi: RaidApi): Promise<void> {
  if (!raidApi.isConfigured()) return

  const enabledSetting = await db.settings.get(QUESTION_STATS_ENABLED_KEY)
  if (enabledSetting?.value !== true) return

  const watermark =
    ((await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value as number | undefined) ?? 0

  const attempts = await db.attempts.where('answeredAt').above(watermark).toArray()
  if (attempts.length === 0) return
  const newWatermark = attempts.reduce((max, a) => Math.max(max, a.answeredAt), watermark)

  const stats = aggregate(attempts.filter(isCountableForStats))
  if (stats.length > 0) {
    try {
      await raidApi.sendQuestionStats(stats)
    } catch {
      // 失敗時はwatermarkを進めない（次回トリガーで同じ範囲を再集計・再送する）
      return
    }
  }

  await db.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: newWatermark })
}
