// settings ストア（キーバリュー）のキー定数（T-23。正本: docs/04 3節）。
// SettingsScreen（書き込み側）とHomeScreen（読み取り側。イヤホンなしモードの適用）の
// 両方から参照するため、画面間の直接依存を避けて独立モジュールに切り出す。

export const NO_EARPHONE_MODE_KEY = 'noEarphoneMode'
export const THEME_PREFERENCE_KEY = 'themePreference'
export const FONT_SIZE_KEY = 'fontSizeScale'
/** BYOK APIキー（T-42=C-2改訂。端末内平文保存=04の6節既定。EXPORT_EXCLUDED_KEYSで除外必須） */
export const BYOK_API_KEY_KEY = 'byokApiKey'
/** BYOKで使うモデルID（既定値表示＋上級者向け自由入力=13の9節T-55） */
export const BYOK_MODEL_KEY = 'byokModel'
/** ハプティクス（正解確定時の振動）の有効/無効。既定ON（T-78・14の2.4節） */
export const HAPTICS_ENABLED_KEY = 'hapticsEnabled'
/** 前回HomeScreen表示時のストリーク日数（T-78: パルス演出を「増えた回だけ」にするための記憶） */
export const LAST_SEEN_STREAK_KEY = 'lastSeenStreak'
/**
 * レイドダメージの共有API同期を有効にするか（T-89。M3基盤・端末内完結ステップ）。
 * 既定OFF。UIトグルはM3本体（Workers疎通後）で作る。OFF時はpendingSyncへの
 * 追加書き込みが一切発生しない（縮退設計の常時保証。docs/16 段階導入1）
 */
export const RAID_SYNC_ENABLED_KEY = 'raidSyncEnabled'
