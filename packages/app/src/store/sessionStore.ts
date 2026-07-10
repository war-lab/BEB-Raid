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

  begin: (
    snapshot: SessionSnapshot,
    questions: readonly Question[],
    ratingBefore: { L: number; R: number } | null,
    options?: { partialAudioMode?: boolean },
  ) => void
  /** 1問の解答結果を記録し、スナップショットを進める（DB書き込み後に呼ぶ） */
  recordAnswer: (snapshot: SessionSnapshot, entry: SessionResultEntry) => void
  reset: () => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  snapshot: null,
  questions: new Map(),
  results: [],
  ratingBefore: null,
  partialAudioMode: false,

  begin: (snapshot, questions, ratingBefore, options) =>
    set({
      snapshot,
      questions: new Map(questions.map((q) => [q.id, q])),
      results: [],
      ratingBefore,
      partialAudioMode: options?.partialAudioMode ?? false,
    }),

  recordAnswer: (snapshot, entry) =>
    set((state) => ({ snapshot, results: [...state.results, entry] })),

  reset: () =>
    set({
      snapshot: null,
      questions: new Map(),
      results: [],
      ratingBefore: null,
      partialAudioMode: false,
    }),
}))
