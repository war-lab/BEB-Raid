// IndexedDB 各ストアのレコード型定義（正本: docs/04_データ設計.md 3節）。
//
// J-7（docs/08 1.1節）: ストア定義は04の表どおり全ストア分を最初に作る。
// M1で書き込むのは phase・badges・pendingSync 以外（これら3つは定義のみ）。
//
// 時刻表現の規約:
// - 時刻（イベント発生時点）: epoch ms の number（範囲クエリ・ソートのため）
// - 暦日（日単位の概念）: 'YYYY-MM-DD' の string（端末ローカルタイムゾーン基準）

/** 学習モード（attempts.mode）。M1で使うのは solo / srs のみ */
export type AttemptMode = 'solo' | 'raid' | 'battle' | 'srs'

/** レートのセクション */
export type RatingSection = 'L' | 'R' | 'total'

/** SRSカードの参照種別（03の2節: 語彙と問題の2種） */
export type SrsRefType = 'vocab' | 'question'

/** カリキュラムのシーズン（03の1.2節。M1では書き込まない=J-7） */
export type PhaseSeason = 'P1' | 'P2' | 'P3'

/** profile: 単一レコード（id は固定値 PROFILE_ID） */
export interface ProfileRecord {
  id: string
  displayName: string
  /** 自己申告TOEICスコア（未申告は null。P0診断の事前値に使う） */
  initialToeic: number | null
  createdAt: number
  /** 共有API用の匿名ID（M1では発行のみ・送信しない） */
  deviceToken: string
}

/** profile ストアの固定キー */
export const PROFILE_ID = 'me'

/**
 * attempts: 全解答の生ログ。**分析の基盤なので消さない（追記のみ）**。
 * 削除は Dexie フックで実行時にも遮断する（database.ts）。
 */
export interface AttemptRecord {
  /** UUID（共有API送信時の冪等キーにもなる） */
  id: string
  questionId: string
  mode: AttemptMode
  isCorrect: boolean
  responseMs: number
  /** 時間切れ（速度不足として知識不足と別カウント。03の7.2節） */
  isTimeout: boolean
  /** 当て勘フラグ: 応答<2秒の誤答（03の7.2節。弱点統計で重みを下げる） */
  isGuess: boolean
  answeredAt: number
}

/** srsCards: SRSカード（語彙・問題の2種。03の2節） */
export interface SrsCardRecord {
  /** `${refType}:${refId}` 形式（同一対象の重複カードを防ぐ） */
  id: string
  refType: SrsRefType
  refId: string
  /** 間隔テーブルの段階 0–5（1→3→7→14→30→60日。60日で卒業） */
  stage: number
  dueAt: number
  /** 「もう一回」でリセットされた回数 */
  lapses: number
  // --- 以下は T-09/T-11（F3）で追加した非インデックスフィールド。
  //     既存レコードには存在しないため省略可とし、読み手は undefined を既定値として扱う
  /** 新規として初めて復習された暦日（null/undefined=未出題の新規。新規上限20枚/日の集計に使う） */
  introducedDate?: string | null
  /** 卒業時刻（60日間隔を突破した時点。卒業カードは出題対象外だが定着の記録として残す） */
  graduatedAt?: number | null
  /** 発生元の問題ID（誤答由来のkey語彙カード。定着後の元問題再出題=03の3.2に使う） */
  sourceQuestionId?: string | null
}

/** ratings: 現在レート（L/R/total の3行） */
export interface RatingRecord {
  section: RatingSection
  rating: number
  updatedAt: number
  /**
   * このセクションのレートを動かした解答数（最初の50問は K=32 とする判定に使う。03の5.4）。
   * T-10（F3）で追加した非インデックスフィールド。省略時は 0 として扱う
   */
  answerCount?: number
}

/** ratingHistory: 日次スナップショット（伸びグラフの入力） */
export interface RatingHistoryRecord {
  /** 'YYYY-MM-DD' */
  date: string
  section: RatingSection
  rating: number
}

/**
 * tagStats: タグ別の直近100問移動窓サマリ（attempts から再構築可能）。
 * 当て勘誤答は重み 0.5 で集計するため（03の7.2）、値は小数を含む重み付き合計。
 * 時間切れは「速度不足」の別カウントであり移動窓に含めない（T-12）
 */
export interface TagStatRecord {
  tag: string
  /** 移動窓内の重み付き正答数 */
  windowCorrect: number
  /** 移動窓内の重み付き出題数（対象解答は最大100件） */
  windowTotal: number
}

/** リスニング段階（03の8節 L1–L4。M2=T-51で書き込む） */
export type ListeningStage = 1 | 2 | 3 | 4

/** phase: カリキュラム進行（M1では書き込まない=J-7。M2=T-51で書き込む） */
export interface PhaseRecord {
  season: PhaseSeason
  criteriaJson: string
  achievedAt: number | null
  /**
   * リスニング段階（L1–L4）。T-42（C-2改訂）で追加した非インデックスフィールド。
   * 既存レコード（M1時点はphaseを書き込んでいないため実質皆無）には存在しないため省略可とし、
   * 読み手は1（L1）を既定値として扱う（13の3.2節: リスニングは段階スキップさせない）
   */
  listeningStage?: ListeningStage
}

/** streak: 連続学習日数（02の7節） */
export interface StreakRecord {
  id: string
  currentDays: number
  bestDays: number
  /** 最後に学習が成立した暦日 */
  lastActiveDate: string | null
  /** ストリーク保護（週1回）を最後に使った暦日 */
  protectionUsedAt: string | null
}

/** streak ストアの固定キー */
export const STREAK_ID = 'streak'

/** badges: 獲得バッジ（M1では書き込まない=J-7） */
export interface BadgeRecord {
  badgeId: string
  earnedAt: number
}

/** pendingSync: 共有APIへの未送信キュー（M1では書き込まない=J-7） */
export interface PendingSyncRecord {
  /** 自動採番 */
  id?: number
  /** 送信種別（例: 'raidDamage'） */
  kind: string
  /** 送信ペイロード（JSON文字列。冪等キー=attempt ID を含む） */
  payloadJson: string
  createdAt: number
}

/** settings: キーバリュー型の設定ストア */
export interface SettingRecord {
  key: string
  value: unknown
}

/** 実試験・IPテストのスコア登録元（03の5.5節・06の4節） */
export type ExamScoreSource = 'IP' | '公開' | 'その他'

/**
 * examScores: 実試験・IPテストスコアの任意登録（T-42=C-2改訂。M2で新設。
 * 正本: docs/03 5.5節・06の4節。予測スコアとの乖離の校正データ・シーズンクリア判定=J-16 に使う）
 */
export interface ExamScoreRecord {
  id: string
  /** 'YYYY-MM-DD' */
  date: string
  listening: number
  reading: number
  total: number
  source: ExamScoreSource
  note?: string
}
