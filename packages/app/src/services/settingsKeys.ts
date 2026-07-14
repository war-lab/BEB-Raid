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
