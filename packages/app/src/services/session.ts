// セッション中断復帰サービス（T-07。正本: docs/02 2.1節）。
//
// 「中断に強い: 1問単位で自動保存。アプリを閉じても次回同じ場所から。
// 電車を降りる瞬間に離脱しても何も失わない」を実装する。
//
// スナップショットの置き場所は settings ストア（キーバリュー）の1エントリ。
// docs/04 3節のストア表に専用ストアを増やさないための判断（T-07 コミット参照）。

import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode } from '../db/schema'
import { buildAttempt, type RecordAttemptInput } from './attempts'

/** settings ストア内のスナップショットのキー */
export const ACTIVE_SESSION_KEY = 'activeSession'

/** 進行中セッションのスナップショット（1問解答するたびに更新される） */
export interface SessionSnapshot {
  sessionId: string
  mode: AttemptMode
  /** 出題順の問題ID一覧（セッション開始時に確定） */
  questionIds: string[]
  /** 解答済み問題数 = 次に出題する questionIds のインデックス */
  answeredCount: number
  /** 解答済み分の attempt ID（リザルト画面の集計入力） */
  attemptIds: string[]
  startedAt: number
  updatedAt: number
}

/** 次に出題する問題ID。全問解答済みなら null */
export function currentQuestionId(snapshot: SessionSnapshot): string | null {
  return snapshot.questionIds[snapshot.answeredCount] ?? null
}

/** セッションを開始し、スナップショットを保存して返す（既存の進行中セッションは上書き） */
export async function startSession(
  db: BebRaidDatabase,
  input: { mode: AttemptMode; questionIds: string[]; startedAt?: number },
): Promise<SessionSnapshot> {
  if (input.questionIds.length === 0) {
    throw new Error('問題が0件のセッションは開始できない')
  }
  const now = input.startedAt ?? Date.now()
  const snapshot: SessionSnapshot = {
    sessionId: crypto.randomUUID(),
    mode: input.mode,
    questionIds: input.questionIds,
    answeredCount: 0,
    attemptIds: [],
    startedAt: now,
    updatedAt: now,
  }
  await db.settings.put({ key: ACTIVE_SESSION_KEY, value: snapshot })
  return snapshot
}

/**
 * 現在の問題への解答を記録し、スナップショットを1問進める。
 * attempts への追記とスナップショット更新は同一トランザクション
 * （中断がどのタイミングで起きても「解答済みなのに再出題」「未解答なのにスキップ」
 * のどちらも起きない）。
 * トランザクション内で DB 上のスナップショットと照合し、引数が古い場合
 * （二度押し・複数タブ・終了済みセッション）は拒否する（重複ログの恒久残存を防ぐ）。
 */
export async function answerCurrentQuestion(
  db: BebRaidDatabase,
  snapshot: SessionSnapshot,
  input: Omit<RecordAttemptInput, 'questionId' | 'mode'>,
): Promise<SessionSnapshot> {
  const questionId = currentQuestionId(snapshot)
  if (questionId === null) {
    throw new Error('全問解答済みのセッションには解答できない')
  }
  const attempt = buildAttempt({ ...input, questionId, mode: snapshot.mode })
  const next: SessionSnapshot = {
    ...snapshot,
    answeredCount: snapshot.answeredCount + 1,
    attemptIds: [...snapshot.attemptIds, attempt.id],
    updatedAt: attempt.answeredAt,
  }
  await db.transaction('rw', db.attempts, db.settings, async () => {
    const stored = (await db.settings.get(ACTIVE_SESSION_KEY))?.value as
      | SessionSnapshot
      | undefined
    if (
      stored === undefined ||
      stored.sessionId !== snapshot.sessionId ||
      stored.answeredCount !== snapshot.answeredCount
    ) {
      throw new Error('スナップショットが古い（二重解答か、セッションは終了済み）')
    }
    await db.attempts.add(attempt)
    await db.settings.put({ key: ACTIVE_SESSION_KEY, value: next })
  })
  return next
}

/** 進行中セッションを復元する。無ければ null（=新規セッションを開始する） */
export async function resumeSession(db: BebRaidDatabase): Promise<SessionSnapshot | null> {
  const record = await db.settings.get(ACTIVE_SESSION_KEY)
  return record ? (record.value as SessionSnapshot) : null
}

/** セッションを終了し、スナップショットを破棄する（解答ログは attempts に残る） */
export async function completeSession(db: BebRaidDatabase): Promise<void> {
  await db.settings.delete(ACTIVE_SESSION_KEY)
}
