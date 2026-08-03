// 「間違えた問題をいまから復習する」セッションの開始（発起人の要望、2026-08-03）。
//
// 間違えた問題一覧（S9）とイベントバトルのリザルト（S7）の2箇所から使う。
// HomeScreen の beginNewSession と同じことをするが、あちらは3/7/15分クエスト・単独モードの
// 設定（再生モード・遷移先）を抱えているため、復習用の最小経路だけをここに置く。
//
// 進行中セッションがあるときは**黙って破棄しない**（J-34と同じ扱い）。
// 呼び出し側が `conflict` を見て確認ダイアログを出し、選択後に `discardAndStart` を呼ぶ。

import { useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { resumeSession, startSession, type SessionItem } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'

export interface ReviewSessionController {
  /** 復習を開始する。進行中セッションがあれば開始せず conflict を立てる */
  start: (questionIds: readonly string[]) => Promise<void>
  /** 進行中セッションと衝突している状態（確認ダイアログの表示条件） */
  conflict: boolean
  /** 進行中セッションを破棄して復習を開始する */
  discardAndStart: () => Promise<void>
  /** 進行中セッションの続きへ戻る */
  resume: () => Promise<void>
  /** 確認を取り下げる */
  cancel: () => void
}

export function useReviewSession(
  db: BebRaidDatabase,
  questionPool: readonly Question[],
): ReviewSessionController {
  const beginSession = useSessionStore((s) => s.begin)
  const navigate = useAppStore((s) => s.navigate)
  const [pendingIds, setPendingIds] = useState<readonly string[] | null>(null)

  async function begin(questionIds: readonly string[]) {
    const items: SessionItem[] = questionIds.map((questionId) => ({ questionId, mode: 'solo' }))
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(snapshot, [...questionPool], {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
    // 読解itemが先頭でも drill から reading へ自動で切り替わる（T-105）ため遷移先は drill 固定
    navigate('drill')
  }

  async function start(questionIds: readonly string[]) {
    if (questionIds.length === 0) return
    const existing = await resumeSession(db)
    if (existing) {
      setPendingIds(questionIds)
      return
    }
    await begin(questionIds)
  }

  async function discardAndStart() {
    const ids = pendingIds
    setPendingIds(null)
    if (ids) await begin(ids)
  }

  async function resume() {
    setPendingIds(null)
    const existing = await resumeSession(db)
    if (!existing) return
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(existing, [...questionPool], {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
    navigate('drill')
  }

  return {
    start,
    conflict: pendingIds !== null,
    discardAndStart,
    resume,
    cancel: () => setPendingIds(null),
  }
}
