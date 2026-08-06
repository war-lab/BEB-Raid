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
/**
 * 誤タップの取り消し猶予の有効/無効。既定ON（2026-07-29・ADR 0009）。
 * 選択肢をタップしてから短時間だけ「取り消し」を出し、その間は attempts を書かない
 */
export const MISTAP_UNDO_ENABLED_KEY = 'mistapUndoEnabled'
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
 * 読解（Part7）単独モードのパッセージ数の選択値（T-143・J-80）。
 * 読解は1パッセージが複数設問を要求するので、他の単独モード（SINGLE_MODE_COUNT_KEY）とは
 * 別のキーで持つ。問数チップと同じ値を共有すると「20問」で60設問級のセッションになる
 */
export const READING_SET_COUNT_KEY = 'readingSetCount'

/**
 * 2問目以降の音声自動再生を有効にするか（T-166・J-93。既定ON）。
 * 自動再生自体は18のT-110で意図的に入れた挙動で、既定は変えない。OFFにすると
 * ドリルの音声ゲート問題と語彙仕分けのフレーズ音声がタップ起点に戻る
 * （心の準備・音量調整・イヤホン装着直しの間が要る場合の逃げ道。docs/27 のS-14・S-16）
 */
export const AUTO_PLAY_ENABLED_KEY = 'autoPlayEnabled'

/**
 * ボス役記録（POST /ghosts）を送信済みか（epoch ms。M4・T-128）。
 * RaidScreenがこれを見て「撤回する」導線の表示要否を判断する（サーバー側KVの
 * 有無を都度問い合わせない端末内キャッシュ。撤回=DELETE成功時に削除する）
 */
export const GHOST_BOSS_SUBMITTED_AT_KEY = 'ghostBossSubmittedAt'
/**
 * ボス役セッションの完走済み結果（正誤一覧）で、まだPOST /ghostsの送信が
 * 成功していないものの一時保存（T-272。docs/30 17節）。
 *
 * GhostBossResultScreenの結果保持がReact state（useSessionStore）のみだと、
 * 送信成功前にアプリを終了・再読み込みすると解き切った結果がそのまま失われる。
 * API断が続く状況では再試行の機会が次回起動になるため現実に起こりうる。
 * DrillScreen側で既にcompleteSessionが呼ばれた後（＝セッション自体は完了済み）の
 * 状態を保存するので、activeSession（進行中セッションの再開）とは別のキーにする。
 * 送信成功時・破棄確定時に削除する（settings.deleteは冪等）
 */
export const GHOST_BOSS_PENDING_RESULT_KEY = 'ghostBossPendingResult'

/**
 * 成長ランクのrankPointsが到達した最大値（T-305・K-33）。
 * rankPointsはratingHistory（section='total'）の最古行をinitialRatingとして算定するため、
 * 過去日付でスナップショットが書かれると最古行が入れ替わり、初期値が現在レートへ移動して
 * rankPointsが下落しうる（実測でマスター→ゴールドへ退行）。「累積の継続装置」という
 * 位置づけ（docs/22 3.7節）に反するため、到達済みの最大値をここに永続化して
 * 単調性を保証する（engine/growthRank.ts参照）
 */
export const GROWTH_RANK_MAX_POINTS_KEY = 'growthRankMaxPoints'
