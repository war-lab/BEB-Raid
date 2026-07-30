// プラットフォーム抽象化レイヤの入口（docs/05 7節、CLAUDE.md 不変条件）。
//
// 【依存ルール】UI・学習エンジンのコードは、音声再生・パックキャッシュ・通知を
// Web API（Audio / caches / Notification）で直接呼ばず、必ずここの factory から
// 取得したインターフェース経由で使うこと。Capacitor 移行時はこのファイルの
// factory の返す実装を差し替えるだけで済む構造を維持する。

import type { AiClient } from './ai/AiClient'
import { AiClientError, AnthropicAiClient, type ApiKeyProvider } from './ai/AnthropicAiClient'
import type { AudioPlayer } from './audio/AudioPlayer'
import { WebAudioPlayer } from './audio/WebAudioPlayer'
import type { PackCache } from './cache/PackCache'
import { CacheStoragePackCache } from './cache/CacheStoragePackCache'
import { type DeviceTokenProvider, FetchRaidApi, RaidApiError } from './net/FetchRaidApi'
import type { RaidApi } from './net/RaidApi'
import { WebSocketBattleSocket, type BattleSocket } from './net/BattleSocket'

export type { AudioPlayer, PlayOptions } from './audio/AudioPlayer'
export type { PackCache, CacheUsage } from './cache/PackCache'
export type { Notifier, ScheduledNotification } from './notifications/Notifier'
export type { AiAskContext, AiChatTurn, AiClient } from './ai/AiClient'
export type { AiErrorKind, ApiKeyProvider } from './ai/AnthropicAiClient'
export { AiClientError }
export type { RaidApi } from './net/RaidApi'
export type { DeviceTokenProvider, RaidApiErrorKind } from './net/FetchRaidApi'
export { RaidApiError }
export type {
  BattleSocket,
  BattleSocketCloseHandler,
  BattleSocketMessageHandler,
} from './net/BattleSocket'

/** 音声再生の実装を返す（現状は Web 実装のみ） */
export function createAudioPlayer(): AudioPlayer {
  return new WebAudioPlayer(createPackCache())
}

/** パックキャッシュの実装を返す（現状は Cache Storage 直叩きの Web 実装のみ） */
export function createPackCache(): PackCache {
  return new CacheStoragePackCache()
}

/**
 * BYOK AI解説クライアントの実装を返す（M2・T-43/T-56）。
 * getApiKey は呼び出し元（App.tsx）が settings ストアから読み出す関数を渡す
 * （PackCache 等と同じ疎結合パターン。db に直接依存しない）
 */
export function createAiClient(getApiKey: ApiKeyProvider): AiClient {
  return new AnthropicAiClient(getApiKey)
}

/**
 * 共有API（レイド）クライアントの実装を返す（M3・T-96）。
 * baseUrlはビルド時環境変数VITE_RAID_API_BASE_URL（未設定/空文字ならisConfigured()=false）。
 * getDeviceTokenはgetApiKeyと同じ疎結合パターン（呼び出し元がprofileストアから読み出す）
 */
export function createRaidApi(
  baseUrl: string | undefined,
  getDeviceToken: DeviceTokenProvider,
): RaidApi {
  return new FetchRaidApi(baseUrl, getDeviceToken)
}

/**
 * イベントバトル（M4・T-125）のWebSocketクライアントの実装を返す。
 * baseUrlはRaidApiと同じ VITE_RAID_API_BASE_URL（http/httpsをws/wssへ変換して使う）
 */
export function createBattleSocket(
  baseUrl: string | undefined,
  getDeviceToken: DeviceTokenProvider,
): BattleSocket {
  return new WebSocketBattleSocket(baseUrl, getDeviceToken)
}
