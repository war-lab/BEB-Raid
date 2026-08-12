// 問題パックJSON・manifest の型定義（正本: docs/04_データ設計.md 2節・2.1節）。
// app / cli の双方から import して単一のスキーマ定義を共有する（T-05）。

/** 問題パックJSONのスキーマ世代（docs/04 の schemaVersion 2 を採用） */
export const SCHEMA_VERSION = 2 as const

/** パック識別子（manifest.json の id と一致させる） */
export type PackId = string

/** コンテンツ出所ライセンス。出所不明パックは取込拒否（CLAUDE.md 不変条件） */
export type PackLicense = 'internal-original' | 'cc-by' | 'public-domain'

/** 頻出度ランク（03の4節。自前頻出度リスト由来） */
export type FreqRank = 'S' | 'A' | 'B' | 'C'

/** 出題形式（04の2節）。M1で使うのは audio_qa / text_blank / vocab_card */
export type QuestionFormat =
  | 'audio_qa' // Part2: 音声のみ→選択肢
  | 'audio_photo' // Part1: 写真描写
  | 'audio_set' // Part3/4: 1音声に設問複数（subQuestions）
  | 'text_blank' // Part5: 短文穴埋め
  | 'text_passage' // Part6/7: 長文
  | 'vocab_card' // 語彙カード（1語1フレーズ）
  | 'dictation' // M2: ディクテーション（blanks 必須）
  | 'shadowing' // M2: シャドーイング（timing 必須）

/** key単語（03の3節: 誤答→語彙SRS→類題の循環の単位） */
export interface KeyVocab {
  word: string
  sense: string
  freqRank: FreqRank
}

/** TTSアクセント（米/英/豪/加のローテーション。04の5節） */
export type AudioAccent = 'US' | 'UK' | 'AU' | 'CA'

/** 音声メタデータ */
export interface AudioMeta {
  accent: AudioAccent
  tts: boolean
  voice: string
  durationMs: number
  /**
   * audio_qa（Part2）の質問部分の終端ms（「質問 — 応答」を1ファイルに連結しているため）。
   * 解答前の再生はここまでで止め、応答（=正答）の読み上げを解答後まで遅らせる。
   * 旧生成分には存在しない（省略時は全長再生=従来挙動）
   */
  questionEndMs?: number | null
  /**
   * audio_qa（Part2）の音声が「設問＋3応答すべて」を含む場合の、各応答の開始ms（T-151）。
   * 並びは choices の key 昇順で、音声の読み上げ順と一致させる。
   * 省略/ null は従来形式（設問＋正答応答のみ）＝音声のみモード非対応として扱う。
   */
  responseOffsetsMs?: number[] | null
  /**
   * responseOffsetsMs を生成した時点の choices（key+text）のダイジェスト。
   * TTS後に選択肢を編集・並び替えすると音声の読み上げ順と key の対応が崩れ、
   * answer が実質誤りになる（音声では B が正答なのに answer が A のまま等）。
   * これは無音の正誤バグなのでビルド時に再計算して照合し、不一致はエラーにする。
   */
  responsesTextDigest?: string | null
}

/** 選択肢 */
export interface Choice {
  key: string
  text: string
}

/** dictation の穴埋め定義（script の index 番目の単語が answer） */
export interface DictationBlank {
  index: number
  answer: string
}

/** audio_set（Part3/4）・text_passage（Part6/7）の設問。1刺激に複数ぶら下がる */
export interface SubQuestion {
  id: string
  question: string
  choices: Choice[]
  answer: string
  explanation?: string | null
  translation?: string | null
  /** 設問単位の解法タグ（例: text_passage の 'cross-reference'）。弱点集計の粒度を上げる用（docs/24 3.4節） */
  tags?: string[] | null
}

/**
 * passages[].kind の許容値（実データで使用中の分類。04の2節）。
 * T-239（Q-82）: 以前はdocコメントでのみ列挙されバリデータで強制されていなかった。
 * 新しい分類を追加する場合は本型と validate.ts の PASSAGE_KINDS を同じPRで更新する。
 */
export type PassageKind =
  'email' | 'notice' | 'article' | 'chat' | 'form' | 'advertisement' | 'memo'

/**
 * text_passage（Part6/7）の刺激文書（正本: docs/24 3.1節・ADR 0006 判断3）。
 * Part6・Part7単一は1件、Part7複数パッセージは2〜3件。
 * Part6は text に空所マーカー [[1]]…[[4]] を埋め込み、subQuestions の n 番目が [[n]] に対応する。
 */
export interface Passage {
  id: string
  /** 表示ラベルと出題文脈（PassageKind参照） */
  kind: PassageKind
  text: string
}

/**
 * 問題1件。format によって使うフィールドが異なり、使わないものは null / 省略。
 * format 毎の必須フィールドはバリデータ（validate.ts）が正とする。
 */
export interface Question {
  id: string
  /** 1–7 | 0（語彙カード） */
  part: number
  format: QuestionFormat
  /** 1–5（実測補正はビルド時に反映） */
  difficulty: number
  tags: string[]
  /** key単語。vocab_card 以外の format では1件以上必須（validate.ts 参照） */
  keyVocab: KeyVocab[]
  audio?: string | null
  audioMeta?: AudioMeta | null
  /** shadowing 用: 単語ごとの開始ms配列（カラオケハイライト） */
  timing?: number[] | null
  image?: string | null
  script?: string | null
  translation?: string | null
  question?: string | null
  choices?: Choice[] | null
  answer?: string | null
  explanation?: string | null
  /** dictation 用 */
  blanks?: DictationBlank[] | null
  /** audio_set（Part3/4）・text_passage（Part6/7）用。1刺激にぶら下がる設問 */
  subQuestions?: SubQuestion[] | null
  /** text_passage（Part6/7）用。刺激文書。Part7複数パッセージは2〜3件（docs/24 3.1節） */
  passages?: Passage[] | null

  // --- vocab_card 用（02の4節: 1語1フレーズ・フレーズ音声必須） ---
  front?: string | null
  phrase?: string | null
  phraseAudio?: string | null
  back?: string | null
  freqRank?: FreqRank | null
  /** 目標スコア帯（600 / 730 / 860 / 990） */
  levelBand?: number | null
}

/** パックのメタ情報。license / origin は必須（出所不明は取込拒否） */
export interface PackMeta {
  id: PackId
  title: string
  license: PackLicense
  origin: string
  /** 対象レート帯 [下限, 上限] */
  targetLevel: [number, number]
  /** オフラインキャッシュの容量表示用。ビルド時（T-32）に確定するため生成段階では省略可 */
  sizeBytes?: number
  /**
   * AIクロスレビュー＋敵対的検証の工程（T-355・docs/32 8節）の記録。任意フィールドで、
   * 既存パックの移行を止めないため必須化しない。origin文字列にも工程名・日付を記録するが、
   * ここでは同じ内容を機械可読な形で持つ
   */
  reviewedBy?: string
  reviewedAt?: string
  reviewMethod?: string
}

/** 問題パックJSON全体（コンテンツ層の配信単位） */
export interface QuestionPack {
  schemaVersion: typeof SCHEMA_VERSION
  pack: PackMeta
  questions: Question[]
}

/** manifest.json のパック1件分（04の2.1節: 更新検知とキャッシュ管理の入力） */
export interface ManifestPackEntry {
  id: PackId
  title: string
  targetLevel: [number, number]
  sizeBytes: number
  /** パック内容のバージョンハッシュ（変化したら再取得） */
  hash: string
}

/** manifest.json 全体 */
export interface Manifest {
  schemaVersion: typeof SCHEMA_VERSION
  packs: ManifestPackEntry[]
}

/**
 * レイドダメージの共有API送信ペイロード（M3基盤・T-89。正本: docs/14 4.4節、docs/16 T-91行）。
 * プライバシー境界の強制のため閉じた型として定義する。questionId・isCorrect・レート実値・
 * responseMs等の個人単位の正誤詳細は**含めない**（04の不変条件: 共有APIに送るのは
 * 「ダメージ換算値＋表示名」相当のみ）。実際の変換（attempts→payload）は
 * `buildDamageSyncPayload`（damageSync.ts）に限定し、この型のフィールドのみを生成する
 */
export interface DamageSyncPayload {
  /** 冪等キー（サーバー側でINSERT OR IGNOREに使う） */
  attemptId: string
  bossId: string
  damage: number
  /** このペイロードが何問分の集約か（バッチ送信時の内訳用） */
  questionCount: number
  /**
   * 解答時刻（epoch ms）。J-49の帰属判定（ボスの[startAt, endAt]区間内かどうか）に使う
   * サーバー側判定の入力（T-91・docs/17 3.1節）。クライアント時計は信用しないため、
   * サーバー側で受信時刻との乖離が大きい値はクランプする（docs/17 3.4節）
   */
  answeredAt: number
}

// ---------------------------------------------------------------------------
// M3共有APIの契約型（正本: docs/17_M3実装計画.md 3.1節・3.6節。T-91）
// app/apiの双方がこれらの型をimportし、単一正本として扱う（J-45）
// ---------------------------------------------------------------------------

/** 参加登録時の自己申告区分（J-48。想定消化問題数/日の換算に使う） */
export type DailyGoal = 'light' | 'normal' | 'heavy'

/** POST /register のリクエストボディ */
export interface RegisterRequest {
  inviteCode: string
  /** 端末が既に発行済みのprofile.deviceTokenをそのまま送る（新規発行はしない） */
  deviceToken: string
  displayName: string
  dailyGoal: DailyGoal
}

/** 週次ボスの状態（討伐判定はDurable Object側が正） */
export type RaidStatus = 'active' | 'defeated' | 'closed'

/** レイド貢献の表示行（表示名＋ダメージ換算値のみ。個人単位の正誤詳細は含まない） */
export interface RaidContribution {
  displayName: string
  damage: number
}

/** GET /raid/current のレスポンス、POST /raid/sync レスポンスの boss フィールド */
export interface RaidBossState {
  bossId: string
  name: string
  hp: number
  maxHp: number
  /** epoch ms */
  startAt: number
  /** epoch ms */
  endAt: number
  status: RaidStatus
  participantCount: number
  /** 認証tokenの主のこれまでの合計ダメージ */
  myDamage: number
  contributions: RaidContribution[]
  /**
   * M4: ボス種別（docs/22 3.1節。T-123）。既存クライアントとの互換のため省略可能とし、
   * 省略時はsynthetic相当として扱う（SCHEMA_VERSIONは据え置き）
   */
  bossType?: BossType
  /** M4: ghost時のみ配信。questionId別の倍率（docs/22 3.3節。堅い0.5/弱点2.0） */
  defense?: GhostDefenseEntry[] | null
  /** M4: ghost時のみ配信。S5の名誉表示（討伐された回数）に使う */
  ghost?: GhostBossInfo | null
}

/** POST /raid/sync のリクエストボディ */
export interface RaidSyncRequest {
  payloads: DamageSyncPayload[]
}

/** POST /raid/sync のレスポンス */
export interface RaidSyncResponse {
  /**
   * クライアントがpendingSyncから削除してよいattemptId一覧。
   * 今回新規加算分・受理済み重複分に加え、討伐後・期間外で加算されなかった分も含む
   * （「加算されたID」ではなく「再送不要なID」の集合であることに注意。
   * クライアントは期間外になりうるpayloadをそもそもエンキューしない責務を持つ）
   */
  acceptedIds: string[]
  boss: RaidBossState
}

/**
 * 匿名問題別正誤集計（3.8節）。deviceTokenを持たない閉じた型として定義する
 * （14の4.4-④: 保存レコード型にdeviceTokenフィールドを持たせない構造的強制）
 */
export interface QuestionStatPayload {
  questionId: string
  correct: number
  wrong: number
  timeout: number
}

/** POST /stats/questions のリクエストボディ */
export interface QuestionStatsRequest {
  stats: QuestionStatPayload[]
}

/** 「問題がおかしい」報告の理由（3.8節） */
export type QuestionReportReason = 'wrong_answer' | 'unnatural' | 'bad_explanation'

/** POST /reports のリクエストボディ */
export interface QuestionReportPayload {
  questionId: string
  reason: QuestionReportReason
}

/** 共有APIのエラーレスポンス形式（3.1節で統一） */
export interface ApiError {
  error: {
    code: string
    message: string
  }
}

// ---------------------------------------------------------------------------
// M4共有APIの契約型（正本: docs/22_M4実装計画.md 3.1節・3.2節・3.3節。T-123）
// app/apiの双方がこれらの型をimportし、単一正本として扱う（J-62〜J-70）
// ---------------------------------------------------------------------------

/** ボス種別（docs/04 2.2節）。synthetic=通常週、ghost=ボス役の記録によるゴースト週 */
export type BossType = 'synthetic' | 'ghost'

/** ゴーストボスの問題別倍率1件分（docs/22 3.3節。堅い=correct由来0.5・弱点=wrong由来2.0） */
export interface GhostDefenseEntry {
  questionId: string
  multiplier: number
}

/** ゴーストボスの表示情報（S5の名誉表示「討伐された回数」用） */
export interface GhostBossInfo {
  displayName: string
  defeatedCount: number
}

/** ゴースト記録の問題別正誤1件分（ボス役自身の解答記録） */
export interface GhostRecordEntry {
  questionId: string
  correct: boolean
}

/**
 * ボス役の記録受領ペイロード（POST /ghosts。正本: docs/22 3.1節・3.3節）。
 * consent はリテラル型 true 固定とし、未同意ペイロードを型レベルで構築不能にする
 * （questionStatsのdeviceToken非構造と同じ「型レベルで違反を作れない」方式。J-67）。
 * 実際の構築は `buildGhostRecordPayload`（ghostRecord.ts）に限定し、
 * 呼び出し側は同意結果（boolean）を明示的に渡す（実行時側の強制はビルダー関数が担う）
 */
export interface GhostRecordPayload {
  consent: true
  displayName: string
  records: GhostRecordEntry[]
}

/** POST /ghosts・DELETE /ghosts/own の成功レスポンス（記録が無い場合も200・冪等） */
export interface OkResponse {
  ok: true
}

/** POST /battle/rooms のレスポンス（4文字英数大文字のルームコード。衝突時はサーバー側で再生成） */
export interface CreateBattleRoomResponse {
  code: string
}

/**
 * 週次サマリ1件（GET /raid/summary。正本: docs/22 3.8節）。運用者の係数調整用の管理データで、
 * クライアントアプリはこのエンドポイントを呼ばない。個人別データは含めない
 */
export interface RaidSummary {
  bossId: string
  bossType: BossType
  maxHp: number
  remainingHp: number
  defeated: boolean
  /** epoch ms。未討伐ならnull */
  defeatedAt: number | null
  participantCount: number
}

// ---------------------------------------------------------------------------
// イベントバトルWebSocketメッセージ（正本: docs/22 3.2節。T-123）
// BattleRoomDOはコンテンツ非依存（questionIdと換算点のみを扱い、問題文・選択肢・正解は持たない）。
// 認証は Sec-WebSocket-Protocol: `bearer.<deviceToken>`（3.1節。ブラウザWebSocketは
// Authorizationヘッダを付けられないため）
// ---------------------------------------------------------------------------

/** Client→Server（参加者）: ルーム参加 */
export interface BattleJoinMessage {
  type: 'join'
  displayName: string
  /**
   * 期待点=直近の自己平均基礎点（ハンディキャップ換算値のみ。レート実値は送らない=J-63）。
   * 0以下はサーバー側で1にクランプする
   */
  expectedPointsPerQuestion: number
}

/** Client→Server（参加者）: 解答送信。基礎点のみを送り、速度ボーナスはDO側で加算する（J-64） */
export interface BattleAnswerMessage {
  type: 'answer'
  questionIndex: number
  /** クライアント算出の基礎点（既存 engine/damage.ts の基礎点ロジック）。誤答は0 */
  points: number
}

/**
 * Client→Server（ホストのみ。ルーム作成者のdeviceTokenのみ受理）: 出題オープン。
 * 音声の再生完了後に送る（docs/05 4.2節「再生完了イベントで解答受付を開く」）
 */
export interface BattleOpenQuestionMessage {
  type: 'openQuestion'
  questionIndex: number
  questionId: string
}

/** Client→Server（ホストのみ）: 出題クローズ */
export interface BattleCloseQuestionMessage {
  type: 'closeQuestion'
  questionIndex: number
}

/** Client→Server（ホストのみ）: バトル終了 */
export interface BattleFinishMessage {
  type: 'finish'
}

/** イベントバトルWebSocketのClient→Serverメッセージ（discriminated union。正本: docs/22 3.2節） */
export type BattleClientMessage =
  | BattleJoinMessage
  | BattleAnswerMessage
  | BattleOpenQuestionMessage
  | BattleCloseQuestionMessage
  | BattleFinishMessage

/** ルーム参加者1件（表示名のみ。個人紐づき情報は含めない） */
export interface BattleParticipant {
  displayName: string
  /**
   * 現在WebSocket接続中かどうか（T-265・29のQ-...で見つかった追加課題）。
   * ロスター（deviceToken単位のParticipantState）はルームの生存期間中保持されるため、
   * falseは瞬断中または離脱済みを示すのみで一覧からは消えない
   * （常にロスター全件を返す。切断済みでも常時「参加者」として表示され続ける懸念は
   * このフラグでUI側が区別する前提で許容する。docs/22 3.2節・docs/30 17節参照）
   */
  connected: boolean
}

/** Server→Client: ルーム状態（参加者一覧） */
export interface BattleRoomStateMessage {
  type: 'roomState'
  participants: BattleParticipant[]
}

/**
 * Server→Client: 出題オープン通知。
 * deadlineAt=DO受信時刻+30秒（epoch ms）。DO側タイマーが正でクライアント時計は信用しない
 */
export interface BattleQuestionOpenMessage {
  type: 'questionOpen'
  questionIndex: number
  questionId: string
  deadlineAt: number
}

/** 順位表示1件分（表示名＋合計最終点。換算値のみ） */
export interface BattleStandingEntry {
  displayName: string
  totalPoints: number
  /** 現在WebSocket接続中かどうか（T-265。BattleParticipant.connectedと同じ意味） */
  connected: boolean
}

/** Server→Client: 各問クローズ後の順位表示 */
export interface BattleStandingsMessage {
  type: 'standings'
  entries: BattleStandingEntry[]
}

/** Server→Client: 最終リザルト（順位＋ベストグロース賞。growth最大の参加者。同率は先着） */
export interface BattleResultMessage {
  type: 'result'
  entries: BattleStandingEntry[]
  bestGrowth: { displayName: string }
}

/** Server→Client: エラー通知（例: 未登録token=1008クローズ、deadline後の解答拒否等） */
export interface BattleErrorMessage {
  type: 'error'
  code: string
}

/** イベントバトルWebSocketのServer→Clientメッセージ（discriminated union。正本: docs/22 3.2節） */
export type BattleServerMessage =
  | BattleRoomStateMessage
  | BattleQuestionOpenMessage
  | BattleStandingsMessage
  | BattleResultMessage
  | BattleErrorMessage

/**
 * イベントバトルWebSocketのクローズ理由（Server→Client。WebSocket close frame の reason 文字列）。
 * サーバー（BattleRoomDO）が切断時に付与し、クライアントは理由ごとに案内文を出し分ける。
 * - unauthorized: この端末がレイド未登録（招待コードでの登録が未了）
 * - room_not_found: ルームが存在しない、またはすでに利用不可
 * - room_closed: ホストがバトルを終了した（異常ではない正常終了）
 * 上記以外（空文字を含む）は通信断等の想定外クローズとして扱う
 */
export type BattleCloseReason = 'unauthorized' | 'room_not_found' | 'room_closed'
