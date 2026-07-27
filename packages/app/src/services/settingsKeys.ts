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
/**
 * 招待コードでの登録（POST /register）が一度成功したか（epoch ms）。
 * これがあれば「登録済み」とみなし、毎回サーバー照会しない（M3・T-98・3.7節）
 */
export const RAID_REGISTERED_AT_KEY = 'raidRegisteredAt'
/**
 * 匿名問題別正誤集計（questionStats）の共有API送信を有効にするか（M3・T-100・3.8節）。
 * 既定OFF。OFF時はattempts読み取り・送信とも一切発生しない（縮退設計）
 */
export const QUESTION_STATS_ENABLED_KEY = 'questionStatsEnabled'
/**
 * questionStats送信のwatermark（epoch ms）。この時刻より新しいattemptsのみを
 * 次回送信対象とする（3.8節。pendingSyncは使わず集計値の再計算で足りるため）
 */
export const QUESTION_STATS_LAST_SENT_AT_KEY = 'questionStatsLastSentAt'
/**
 * ホームの「今日のクエスト」時間チップ（3/7/15分）の選択値（T-112。docs/18 3.4節）。
 * 「今日のクエスト」専用でPart2瞬発等の他モードには作用しない。画面遷移・再起動を跨いで
 * 維持するため、コンポーネントstateではなくここに永続化する
 */
export const QUEST_DURATION_KEY = 'questDuration'
/**
 * 初期診断（P0）の途中経過の一時保存キー（T-113。docs/18 3節）。診断完了・スキップ時に削除する。
 * db/database.tsのストア定義は変更せず、既存のsettings（key-value）に間借りする
 */
export const DIAGNOSTIC_PROGRESS_KEY = 'diagnosticProgress'
/**
 * 単独モード（Part2瞬発・Part5）の問数選択値（T-118。docs/19 3.1節）。
 * 「今日のクエスト」には作用しない。Part2/Part5で共通の1キーでよい（同節）
 */
export const SINGLE_MODE_COUNT_KEY = 'singleModeCount'
/**
 * ボス役記録（POST /ghosts）を送信済みか（epoch ms。M4・T-128）。
 * RaidScreenがこれを見て「撤回する」導線の表示要否を判断する（サーバー側KVの
 * 有無を都度問い合わせない端末内キャッシュ。撤回=DELETE成功時に削除する）
 */
export const GHOST_BOSS_SUBMITTED_AT_KEY = 'ghostBossSubmittedAt'
