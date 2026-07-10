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

  begin: (
    snapshot: SessionSnapshot,
    questions: readonly Question[],
    ratingBefore: { L: number; R: number } | null,
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

  begin: (snapshot, questions, ratingBefore) =>
    set({
      snapshot,
      questions: new Map(questions.map((q) => [q.id, q])),
      results: [],
      ratingBefore,
    }),

  recordAnswer: (snapshot, entry) =>
    set((state) => ({ snapshot, results: [...state.results, entry] })),

  reset: () => set({ snapshot: null, questions: new Map(), results: [], ratingBefore: null }),
}))
