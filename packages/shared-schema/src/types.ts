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
  /** 設問単位の解法タグ（例: text_passage の 'cross-reference'）。弱点集計の粒度を上げる用（docs/18 3.4節） */
  tags?: string[] | null
}

/**
 * text_passage（Part6/7）の刺激文書（正本: docs/18 3.1節・ADR 0006 判断3）。
 * Part6・Part7単一は1件、Part7複数パッセージは2〜3件。
 * Part6は text に空所マーカー [[1]]…[[4]] を埋め込み、subQuestions の n 番目が [[n]] に対応する。
 */
export interface Passage {
  id: string
  /** email | notice | article | chat | form | advertisement 等。表示ラベルと出題文脈 */
  kind: string
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
  /** text_passage（Part6/7）用。刺激文書。Part7複数パッセージは2〜3件（docs/18 3.1節） */
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
