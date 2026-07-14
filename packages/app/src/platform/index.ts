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

export type { AudioPlayer, PlayOptions } from './audio/AudioPlayer'
export type { PackCache, CacheUsage } from './cache/PackCache'
export type { Notifier, ScheduledNotification } from './notifications/Notifier'
export type { AiAskContext, AiChatTurn, AiClient } from './ai/AiClient'
export type { AiErrorKind, ApiKeyProvider } from './ai/AnthropicAiClient'
export { AiClientError }

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
