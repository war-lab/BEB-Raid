// プラットフォーム抽象化レイヤの入口（docs/05 7節、CLAUDE.md 不変条件）。
//
// 【依存ルール】UI・学習エンジンのコードは、音声再生・パックキャッシュ・通知を
// Web API（Audio / caches / Notification）で直接呼ばず、必ずここの factory から
// 取得したインターフェース経由で使うこと。Capacitor 移行時はこのファイルの
// factory の返す実装を差し替えるだけで済む構造を維持する。

import type { AudioPlayer } from './audio/AudioPlayer'
import { WebAudioPlayer } from './audio/WebAudioPlayer'
import type { PackCache } from './cache/PackCache'
import { CacheStoragePackCache } from './cache/CacheStoragePackCache'

export type { AudioPlayer, PlayOptions } from './audio/AudioPlayer'
export type { PackCache, CacheUsage } from './cache/PackCache'
export type { Notifier, ScheduledNotification } from './notifications/Notifier'

/** 音声再生の実装を返す（現状は Web 実装のみ） */
export function createAudioPlayer(): AudioPlayer {
  return new WebAudioPlayer()
}

/** パックキャッシュの実装を返す（現状は Cache Storage 直叩きの Web 実装のみ） */
export function createPackCache(): PackCache {
  return new CacheStoragePackCache()
}
