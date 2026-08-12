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
import {
  QUESTION_STATS_ENABLED_KEY,
  QUESTION_STATS_LAST_SENT_AT_KEY,
  QUESTION_STATS_PROCESSED_COUNT_KEY,
} from './settingsKeys'

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

/**
 * 送信の実行中フラグ（raidSyncのモジュールスコープフラグと同じ流儀）。
 * StrictModeの二重effect等で並行実行されると、同一watermark範囲を2回集計・2回送信して
 * サーバー側（UPSERT加算のみ）で二重計上されるため、実行中の再入は黙って抑止する。
 * なおタイムアウト後の再送（サーバーには到達済み）等、at-least-once再送による多少の重複は
 * 許容する設計判断（匿名の近似統計であり、厳密なexactly-onceの管理コストに見合わない）
 */
let sendInFlight = false

/** テスト専用: 実行中フラグをリセットする（テスト間の状態漏れ防止） */
export function resetQuestionStatsFlagsForTest(): void {
  sendInFlight = false
}

/** 失敗無視・非同期の送信サービス（raidSyncと同じトリガーに相乗り=3.8節） */
export async function sendQuestionStats(db: BebRaidDatabase, raidApi: RaidApi): Promise<void> {
  if (!raidApi.isConfigured()) return

  const enabledSetting = await db.settings.get(QUESTION_STATS_ENABLED_KEY)
  if (enabledSetting?.value !== true) return

  if (sendInFlight) return
  sendInFlight = true
  try {
    const watermark =
      ((await db.settings.get(QUESTION_STATS_LAST_SENT_AT_KEY))?.value as number | undefined) ?? 0
    // T-302導入前からのwatermarkのみを持つ既存ユーザーはprocessedCountが未設定（=undefined）。
    // これを0と区別しないと、初回実行時に「above()の結果が総件数に届かない」という
    // 見せかけの巻き戻り検知が必ず発生し、過去の送信済み分を含めて毎回全件再送してしまう
    const processedCountSetting = await db.settings.get(QUESTION_STATS_PROCESSED_COUNT_KEY)
    const processedCount = processedCountSetting?.value as number | undefined

    const totalCount = await db.attempts.count()
    // 狭義超過（above）: watermarkと同一msのattemptは対象外になる。同一msでの追記を
    // 取りこぼす理論上の可能性より、境界一致分の重複送信を避けることを優先する
    let attempts = await db.attempts.where('answeredAt').above(watermark).toArray()

    // T-302（K-30）: 端末の時計が巻き戻ると、新規attemptsのanswered Atがwatermark以下に
    // なりabove()クエリで永続的に取りこぼす（時計が戻った分より進むまで恒久的に停止する）。
    // 処理済み件数（processedCount）との整合を見て、above()の結果が総件数との差分に
    // 届いていなければ巻き戻りが起きたと判断し、全件を対象に取り直す。
    // サーバー側はUPSERT加算のみで重複送信を許容する設計（45行のコメント）なので、
    // 復旧時に既送信分を含めて再送しても壊れない（匿名の近似統計であり厳密なexactly-onceは求めない）。
    // processedCountが未設定（このコード導入前からのwatermark）の間は検知を働かせない
    if (processedCount !== undefined && processedCount + attempts.length < totalCount) {
      attempts = await db.attempts.toArray()
    }

    if (attempts.length === 0) return
    const newWatermark = attempts.reduce((max, a) => Math.max(max, a.answeredAt), watermark)

    const stats = aggregate(attempts.filter(isCountableForStats))
    if (stats.length > 0) {
      try {
        await raidApi.sendQuestionStats(stats)
      } catch {
        // 失敗時はwatermark・processedCountを進めない（次回トリガーで同じ範囲を再集計・再送する）
        return
      }
    }

    await db.settings.put({ key: QUESTION_STATS_LAST_SENT_AT_KEY, value: newWatermark })
    await db.settings.put({ key: QUESTION_STATS_PROCESSED_COUNT_KEY, value: totalCount })
  } finally {
    sendInFlight = false
  }
}
