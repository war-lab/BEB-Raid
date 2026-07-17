// 共有API（レイド）の抽象インターフェース（M3・T-96。正本: docs/17_M3実装計画.md 3.6節）。
// UI・サービス層は fetch を直接呼ばず、必ずこのインターフェース経由で使う
// （platform/index.ts の factory 経由。ESLintの直接WebAPI禁止と同じ運用方針。
// AiClient/AnthropicAiClientと同じ抽象化パターン）。
// sendQuestionStats（T-100）・sendReport（T-101）を追加済み

import type {
  DamageSyncPayload,
  QuestionReportPayload,
  QuestionStatPayload,
  RaidBossState,
  RaidSyncResponse,
  RegisterRequest,
} from '@beb-raid/shared-schema'

export interface RaidApi {
  /** VITE_RAID_API_BASE_URLが設定されているか（未設定ならレイド関連UIを一切表示せず通信もゼロ） */
  isConfigured(): boolean
  register(req: RegisterRequest): Promise<void>
  /** 今週のボスが未生成（404）ならnullを返す */
  fetchCurrentBoss(): Promise<RaidBossState | null>
  syncDamage(payloads: DamageSyncPayload[]): Promise<RaidSyncResponse>
  /** 匿名問題別正誤集計の送信（M3・T-100）。戻り値はサーバーが受理した件数 */
  sendQuestionStats(stats: QuestionStatPayload[]): Promise<number>
  /** 「問題がおかしい」報告の送信（M3・T-101）。キューイングしない直接送信 */
  sendReport(report: QuestionReportPayload): Promise<void>
}
