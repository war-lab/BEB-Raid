// 学習エンジンの入出力型（契約 C-4。docs/09 2節）。
//
// SRS（T-09）・レーティング（T-10）・key単語（T-11）・弱点判定（T-12）・
// クイックパック生成（T-13）・ストリーク（T-14）の入出力型をここで確定する。
// UI（Track A）はこの型に対するモック実装で先行し、後から実装を差し替える。
//
// 実装は engine/ 配下の各モジュール（srs.ts / rating.ts / keyVocab.ts /
// tagStats.ts / quickPack.ts / streak.ts）が持つ。エンジンは「純粋関数＋
// DBアクセスの薄い層」の構成とし、DOM・platform 層には依存しない。
//
// 時刻・暦日の規約は db/schema.ts と同じ（epoch ms / 'YYYY-MM-DD'）。

import type { FreqRank, Question } from '@beb-raid/shared-schema'

import type { AttemptMode, ListeningStage, PhaseSeason, SrsCardRecord } from '../db/schema'

// ---------------------------------------------------------------------------
// SRS（T-09。03の2節）
// ---------------------------------------------------------------------------

/** 自己評価3段階: もう一回（リセット）/ OK（次段階）/ 余裕（1段階スキップ） */
export type SrsGrade = 'again' | 'good' | 'easy'

/** SRSカード追加の入力 */
export interface AddSrsCardInput {
  refType: 'vocab' | 'question'
  /** vocab は単語そのもの、question は問題ID */
  refId: string
  /** 発生元の問題ID（誤答由来のkey語彙カードのみ。定着後の元問題再出題に使う） */
  sourceQuestionId?: string | null
  /** 省略時は現在時刻 */
  now?: number
}

/** カード復習（自己評価）の結果 */
export interface ReviewSrsCardResult {
  card: SrsCardRecord
  /** この評価で卒業した（60日間隔を突破した）か */
  graduated: boolean
}

/** 出題対象のSRSキュー（期限到来の復習＋新規） */
export interface SrsQueue {
  /** 期限到来（dueAt <= now）の導入済みカード。dueAt 昇順 */
  dueReviews: SrsCardRecord[]
  /** 今日出題してよい新規カード（1日の新規上限と滞留停止を適用済み） */
  newCards: SrsCardRecord[]
  /** 復習滞留（期限超過が閾値以上）により新規を自動停止中か */
  newStopped: boolean
}

// ---------------------------------------------------------------------------
// レーティング（T-10。03の5節）
// ---------------------------------------------------------------------------

/** レート更新の入力（1解答分） */
export interface RatingUpdateInput {
  /** 問題の part（1–7。0=語彙カードはレート対象外） */
  part: number
  /** 問題難易度 D（1–5） */
  difficulty: number
  isCorrect: boolean
  /** SRS復習（mode='srs'）はレート更新から除外される（03の5.4） */
  mode: AttemptMode
  /** 省略時は現在時刻 */
  now?: number
}

/** レート更新の結果。対象外の解答（SRS復習・語彙カード）では null が返る */
export interface RatingUpdate {
  section: 'L' | 'R'
  before: number
  after: number
  /** この問題の基礎点（クランプ[40,130]。J-4 のリザルト表示に使う） */
  basePoints: number
}

// ---------------------------------------------------------------------------
// タグ統計・弱点判定（T-12。03の7節）
// ---------------------------------------------------------------------------

/**
 * 問題ID→タグ・keyVocab の解決表。attempts はタグを持たないため、
 * 統計の更新・再構築には呼び出し側（キャッシュ済みパックを知る層）が
 * この解決表を渡す。表に無い questionId の解答は集計対象外
 */
export type QuestionLookup = ReadonlyMap<string, Question>

/** タグ1件の集計結果 */
export interface TagAccuracy {
  tag: string
  /** 重み付き正答率（0–1）。当て勘誤答は重み0.5、時間切れは集計外 */
  accuracy: number
  /** 移動窓内の重み付き出題数 */
  windowTotal: number
  /** 弱点判定（正答率60%未満かつ最小標本数以上） */
  isWeak: boolean
}

// ---------------------------------------------------------------------------
// クイックパック生成（T-13。03の1.3、02の2.1・2.3）
// ---------------------------------------------------------------------------

/** パック所要時間（分） */
export type QuickPackDuration = 3 | 7 | 15

/** 出題理由（「なぜこの問題が出たか」の明示。03の3.2） */
export type QuickPackReason =
  | { type: 'srsDue' } // SRS期限到来の復習
  | { type: 'srsNew' } // 新規カードの導入
  | { type: 'keyVocabReview'; word: string; isSameQuestion: boolean } // 類題（在庫ゼロ時は同一問題: isSameQuestion=true）
  | { type: 'weakTag'; tag: string } // 弱点タグのドリル
  | { type: 'allocation' } // 学習配分による通常ドリル

/** パック内の1出題 */
export interface QuickPackItem {
  /** 語彙SRSカード / 誤答問題SRSカード / ドリル問題 */
  kind: 'srsVocab' | 'srsQuestion' | 'drill'
  /** attempts 記録時の mode（SRS復習='srs'、ドリル='solo'）。レート更新の除外判定と一致させる */
  mode: AttemptMode
  /** 出題する問題ID（srsVocab は語彙カードの問題（vocab_card）ID または null） */
  questionId: string | null
  /** SRSカードID（drill は null）。復習の自己評価は reviewSrsCard(このID) で反映する */
  srsCardId: string | null
  reason: QuickPackReason
}

/** クイックパック生成の入力 */
export interface QuickPackRequest {
  duration: QuickPackDuration
  /** 出題候補の全問題（キャッシュ済みパックの中身。呼び出し側が渡す） */
  questions: Question[]
  /** 省略時は現在時刻 */
  now?: number
  /** 重み付き抽選の乱数源（テストでは固定シード関数を注入する）。省略時は Math.random */
  rng?: () => number
  /**
   * M2（T-52）: 現フェーズ。省略時はM1挙動（quickPackConfig.jsonの固定配分）に
   * フォールバックする後方互換オプション（13の3.2節）。T-44でPhaseCriteria等を追加した
   * C-4改訂に続く、T-52での軽微な追記（既存フィールドの変更なし・完全にオプショナル）
   */
  phase?: PhaseSeason
  /** M2（T-52）: 現リスニング段階。phase指定時のみ使う。省略時は1（L1） */
  listeningStage?: ListeningStage
}

/** 生成されたクイックパック */
export interface QuickPack {
  duration: QuickPackDuration
  items: QuickPackItem[]
  /** SRS期限超過のうち上限15枚で打ち切られ次パックに回った枚数 */
  srsOverflow: number
}

// ---------------------------------------------------------------------------
// ストリーク（T-14。02の7節）
// ---------------------------------------------------------------------------

/** ストリーク評価の結果 */
export interface StreakStatus {
  currentDays: number
  bestDays: number
  /** 今日のSRS解答数（成立条件 5問 に対する進捗） */
  todaySrsCount: number
  /** 今日の分が成立済みか */
  todayCompleted: boolean
  /** この評価でストリーク保護（週1回の欠席免除）を消費したか */
  protectionUsed: boolean
}

// ---------------------------------------------------------------------------
// カリキュラム・フェーズエンジン（M2・T-44=C-4改訂→T-51で実装。13の3.1・3.2節）
// ---------------------------------------------------------------------------

/** accuracy 条件の集計範囲: part番号 または タグ名（13の3.1節） */
export type PhaseCriterionScope = { part: number } | { tag: string }

/** SRS定着率条件（対象ランクの導入済みカードに占める「定着」割合。13の3.1節） */
export interface SrsRetentionCriterion {
  type: 'srsRetention'
  minRank: FreqRank
  min: number
}

/** 正答率条件（直近window問。vocab:/shadow:プレフィックスは集計対象外） */
export interface AccuracyCriterion {
  type: 'accuracy'
  scope: PhaseCriterionScope
  min: number
  window: number
}

/** audio_set のセット正解率条件（1セット2/3問以上正解=セット正解。13の3.6節） */
export interface SetAccuracyCriterion {
  type: 'setAccuracy'
  min: number
  windowSets: number
}

/** 実試験スコア登録条件（examScoresストア。J-16のシーズンクリア判定に使用） */
export interface ExamScoreCriterion {
  type: 'examScore'
  minTotal: number
}

export type PhaseCriterion =
  SrsRetentionCriterion | AccuracyCriterion | SetAccuracyCriterion | ExamScoreCriterion

/**
 * phase.criteriaJson（文字列）をパースした形。全条件AND（`all`）のみ（13の3.1節。
 * ORはM2では作らない）
 */
export interface PhaseCriteria {
  all: PhaseCriterion[]
}

/** カリキュラム進行の現在状態（db/schema.ts の PhaseRecord から criteriaJson をパースした形） */
export interface PhaseState {
  season: PhaseSeason
  listeningStage: ListeningStage
  criteria: PhaseCriteria
  achievedAt: number | null
}

/** 個々の条件タイプの判定結果（分母不足=未達扱いを明示できるようにする。13の3.1節） */
export interface CriterionEvaluation {
  criterion: PhaseCriterion
  /** 分母（対象カード数・attempts数・セット数）が不足していて判定不能 */
  insufficientData: boolean
  met: boolean
}

/** フェーズ移行判定の結果 */
export interface PhaseTransitionResult {
  evaluations: CriterionEvaluation[]
  /** 全条件を満たし移行が成立したか */
  transitioned: boolean
}

/** リスニング枠の内訳（L段階ごとの構成比。13の3.2節） */
export interface ListeningBreakdown {
  dictation?: number
  shadowing?: number
  part2?: number
  audioSet?: number
}

/**
 * フェーズ配分（03の1.2節）。カテゴリはフェーズにより異なりうる
 * （P1/P2=語彙・リスニング・part5、P3=弱点補強・リスニング・part5=13の3.2節）
 */
export type CurriculumAllocation = Record<string, number>

/** フェーズテンプレ1件分（engine/curriculumConfig.json の1エントリに対応。T-51で読み込む） */
export interface CurriculumTemplate {
  season: PhaseSeason
  allocation: CurriculumAllocation
  listeningBreakdown: Record<ListeningStage, ListeningBreakdown>
}

// ---------------------------------------------------------------------------
// 予測スコア・到達予測（M2・T-44=C-4改訂→T-53で実装。13の3.3節）
// ---------------------------------------------------------------------------

/** 予測スコア帯（予測TOEIC=総合レート×0.99 ±50。03の5.5節） */
export interface ScoreBand {
  center: number
  low: number
  high: number
}

interface ForecastBase {
  scoreBand: ScoreBand
}

/** ratingHistory が14日分未満で回帰計算ができない状態 */
export type ForecastMeasuring = ForecastBase & {
  kind: 'measuring'
}

/** 現ペース継続で目標到達が見込める状態（年月粒度。日付・幅は出さない=13の3.3節） */
export type ForecastOnTrack = ForecastBase & {
  kind: 'onTrack'
  year: number
  month: number
}

/** 現ペースでは到達しない状態。不足量を「週の学習日数をあとN日増やす」で表現 */
export type ForecastBehind = ForecastBase & {
  kind: 'behind'
  /** 1–7。切り上げ */
  addDaysPerWeek: number
}

export type ForecastResult = ForecastMeasuring | ForecastOnTrack | ForecastBehind

// ---------------------------------------------------------------------------
// ディクテーション（M2・T-44=C-4改訂→T-47で実装。13の3.4節）
// ---------------------------------------------------------------------------

/** ワードバンク（正解語＋ダミー語。シャッフル済み。计6語程度=13の3.4節） */
export interface DictationWordBank {
  words: string[]
}

/** 穴埋め1件分の解答（ワードバンクからタップで選んだ語） */
export interface DictationAnswer {
  blankIndex: number
  word: string
}

/** ディクテーションの採点結果（全穴一致で正解。部分点なし=13の3.4節） */
export interface DictationJudgement {
  isCorrect: boolean
  blankResults: { blankIndex: number; isCorrect: boolean }[]
}

// ---------------------------------------------------------------------------
// audio_set セット正解判定（M2・T-44=C-4改訂→T-49で実装。13の3.6節）
// ---------------------------------------------------------------------------

/** 1セット（audio_set 1問のsubQuestions群）の正解判定。2/3問以上正解でセット正解 */
export interface SetResult {
  setId: string
  totalQuestions: number
  correctCount: number
  isSetCorrect: boolean
}
