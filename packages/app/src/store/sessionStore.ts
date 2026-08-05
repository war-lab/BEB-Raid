// セッション進行ストア（T-16。docs/10 3.2節）。
// 正本データは常に IndexedDB。ここに置くのは「画面状態＋DBから読んだ表示用キャッシュ」
// のみで、解答の書き込みは必ずサービス層（services/session.ts 等）経由で行った後に
// このストアを更新する（Zustand 自体は DB へ書き込まない）。

import { create } from 'zustand'
import type { Question } from '@beb-raid/shared-schema'
import type { SessionSnapshot } from '../services/session'

/** リザルト画面向けの1問分の結果 */
export interface SessionResultEntry {
  questionId: string
  isCorrect: boolean
  basePoints: number
}

interface SessionStore {
  snapshot: SessionSnapshot | null
  /** セッション開始時の出題候補プール（DrillScreen が問題文等を引く表示用キャッシュ） */
  questions: Map<string, Question>
  results: SessionResultEntry[]
  /** セッション開始時点のレート（リザルト画面の before/after 表示用） */
  ratingBefore: { L: number; R: number } | null
  /**
   * 冒頭だけ再生モード（T-17。J-5「疑問詞の冒頭だけ再生」聞き取り特訓）。
   * QuickPack経由の通常セッションでは常に false。Part2単独モード起動時の
   * オプションとしてのみ true になりうる（3.7節: 単独モード起動時のオプション）
   */
  partialAudioMode: boolean
  /**
   * Part2 音声のみモード（本試験形式。T-154。正本: ADR 0008・docs/02 3.1節）。
   * 3応答すべてを音声で流し、選択肢は記号のみ表示する。partialAudioMode と同じく
   * Part2単独モードの起動時オプションで、永続化しない（同じモーダルに並ぶ兄弟
   * オプションで永続方針を食い違わせないため）。QuickPack経由では常に false
   */
  audioOnlyPart2: boolean
  /**
   * 表示できずスキップした問題数（T-108。docs/18 3.6節）。questionId未解決・描画分岐の無い
   * formatが混入した際にDrillScreenがカウントし、ResultScreenの「表示できなかった問題: N件」
   * 行に使う。スナップショットのスキーマは変えない（アプリ再起動を跨ぐ持続は不要）
   */
  skippedCount: number
  /**
   * ボス役セッション中か（M4・T-128。docs/22 3.5節）。true の間はApp.tsxが
   * 'result' 画面をResultScreenではなくGhostBossResultScreen（記録プレビュー・送信/破棄）へ
   * 振り分ける。RaidScreenの同意画面確定後にのみ true でbegin()が呼ばれる
   * （同意なしにこのフラグが立つ経路は無い＝GhostBossResultScreenの送信ボタンが
   * 到達不能になる構造的強制の一部）
   */
  isGhostBossSession: boolean

  begin: (
    snapshot: SessionSnapshot,
    questions: readonly Question[],
    ratingBefore: { L: number; R: number } | null,
    options?: {
      partialAudioMode?: boolean
      audioOnlyPart2?: boolean
      isGhostBossSession?: boolean
    },
  ) => void
  /** 1問の解答結果を記録し、スナップショットを進める（DB書き込み後に呼ぶ） */
  recordAnswer: (snapshot: SessionSnapshot, entry: SessionResultEntry) => void
  /** 表示できない問題をスキップした際にDrillScreenが呼ぶ（T-108） */
  incrementSkipped: () => void
  /**
   * 未送信のボス役結果（T-272・services/ghostBoss.tsのPendingGhostBossResult）から
   * セッション状態を復元する。App.tsxが起動時、settingsに保存された結果を見つけたときに呼ぶ。
   * このセッションは既に完走・completeSession済みのため snapshot は null のままにする
   * （GhostBossResultScreenのfinishAndGoHomeは snapshot が無ければcompleteSessionを
   * 呼ばない＝完了対象が無い正しい扱いになる）。basePointsはGhostBossResultScreenが
   * 読まないため0で埋める
   */
  hydrateGhostBossResults: (
    records: readonly { questionId: string; correct: boolean }[],
    questions: readonly Question[],
  ) => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  snapshot: null,
  questions: new Map(),
  results: [],
  ratingBefore: null,
  partialAudioMode: false,
  audioOnlyPart2: false,
  skippedCount: 0,
  isGhostBossSession: false,

  begin: (snapshot, questions, ratingBefore, options) =>
    set({
      snapshot,
      questions: new Map(questions.map((q) => [q.id, q])),
      results: [],
      ratingBefore,
      partialAudioMode: options?.partialAudioMode ?? false,
      audioOnlyPart2: options?.audioOnlyPart2 ?? false,
      skippedCount: 0,
      isGhostBossSession: options?.isGhostBossSession ?? false,
    }),

  recordAnswer: (snapshot, entry) =>
    set((state) => ({ snapshot, results: [...state.results, entry] })),

  incrementSkipped: () => set((state) => ({ skippedCount: state.skippedCount + 1 })),

  hydrateGhostBossResults: (records, questions) =>
    set({
      snapshot: null,
      questions: new Map(questions.map((q) => [q.id, q])),
      results: records.map((r) => ({
        questionId: r.questionId,
        isCorrect: r.correct,
        basePoints: 0,
      })),
      ratingBefore: null,
      partialAudioMode: false,
      audioOnlyPart2: false,
      skippedCount: 0,
      isGhostBossSession: true,
    }),

  reset: () =>
    set({
      snapshot: null,
      questions: new Map(),
      results: [],
      ratingBefore: null,
      partialAudioMode: false,
      audioOnlyPart2: false,
      skippedCount: 0,
      isGhostBossSession: false,
    }),
}))
