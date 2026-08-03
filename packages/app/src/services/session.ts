// セッション中断復帰サービス（T-07。正本: docs/02 2.1節）。
//
// 「中断に強い: 1問単位で自動保存。アプリを閉じても次回同じ場所から。
// 電車を降りる瞬間に離脱しても何も失わない」を実装する。
//
// スナップショットの置き場所は settings ストア（キーバリュー）の1エントリ。
// docs/04 3節のストア表に専用ストアを増やさないための判断（T-07 コミット参照）。
//
// T-16（docs/10 3.3節）: per-item mode 対応。SessionSnapshot.questionIds を
// items: SessionItem[] に置き換え、SRS由来・ドリル由来が混在するクイックパックを
// そのまま1セッションとして進行できるようにする。SessionSnapshot は進行中セッションの
// 一時データでマイグレーション不要（形式が変わったら旧スナップショットは破棄する）。

import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode } from '../db/schema'
import type { QuickPackReason } from '../engine/types'
import { buildAttempt, type RecordAttemptInput } from './attempts'

/** settings ストア内のスナップショットのキー */
export const ACTIVE_SESSION_KEY = 'activeSession'

/** セッション内の1出題（QuickPackItem から質問実体のあるものを写像。3.3節） */
export interface SessionItem {
  questionId: string
  /** attempts 記録時の mode（SRS復習='srs'、ドリル='solo'） */
  mode: AttemptMode
  /** SRS由来 item のみ。解答時に reviewSrsCard を呼ぶ判定に使う */
  srsCardId?: string
  /** 出題理由（ステータス帯のラベル表示用） */
  reason?: QuickPackReason
}

/**
 * 複合問題（読解 text_passage・リスニング audio_set）で解答済みのサブ設問1問
 * （レビュー指摘、2026-08-03）。
 *
 * これらのitemは1itemでサブ設問を複数要求し、全問終わってから親itemを進める。
 * サブ設問単位の解答済み位置をスナップショットに持たないと、途中で中断した場合に
 * 再開後へ解答済みのサブ設問が再出題され、attempt・レート・タグ統計が重複する。
 * 表示の復元（選んだ選択肢と正誤）にも使うため、選択キーも保持する
 */
export interface SessionSubAnswer {
  /** サブ設問のID（attempts の questionId と同じ） */
  subQuestionId: string
  /** 選んだ選択肢のキー。ディクテーション等キーを持たない解答は null */
  selectedKey: string | null
  isCorrect: boolean
}

/** 進行中セッションのスナップショット（1問解答するたびに更新される） */
export interface SessionSnapshot {
  sessionId: string
  /** 出題順の item 一覧（セッション開始時に確定） */
  items: SessionItem[]
  /** 解答済み問題数 = 次に出題する items のインデックス */
  answeredCount: number
  /** 解答済み分の attempt ID（リザルト画面の集計入力） */
  attemptIds: string[]
  /**
   * **現在のitem**（`items[answeredCount]`）で解答済みのサブ設問。
   * itemを進めた時点（answerCurrentQuestion・advanceSession）で空になる。
   * サブ設問を持たないitemでは常に空
   */
  subAnswers?: SessionSubAnswer[]
  startedAt: number
  updatedAt: number
}

/** 現在itemの解答済みサブ設問（未定義の旧スナップショットも空配列として扱う） */
export function currentSubAnswers(snapshot: SessionSnapshot): readonly SessionSubAnswer[] {
  return snapshot.subAnswers ?? []
}

/** 次に出題する item。全問解答済みなら null */
export function currentItem(snapshot: SessionSnapshot): SessionItem | null {
  return snapshot.items[snapshot.answeredCount] ?? null
}

/**
 * 保存値が現行形式の SessionSnapshot かを判定する（3.3節: 旧形式は破棄）。
 * items 配列の有無で新旧を区別する（旧形式は questionIds を持ち items を持たない）
 */
function isValidSnapshot(value: unknown): value is SessionSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.sessionId === 'string' &&
    Array.isArray(v.items) &&
    v.items.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SessionItem).questionId === 'string' &&
        typeof (item as SessionItem).mode === 'string',
    ) &&
    typeof v.answeredCount === 'number' &&
    Array.isArray(v.attemptIds) &&
    typeof v.startedAt === 'number' &&
    typeof v.updatedAt === 'number'
  )
}

/** セッションを開始し、スナップショットを保存して返す（既存の進行中セッションは上書き） */
export async function startSession(
  db: BebRaidDatabase,
  input: { items: SessionItem[]; startedAt?: number },
): Promise<SessionSnapshot> {
  if (input.items.length === 0) {
    throw new Error('問題が0件のセッションは開始できない')
  }
  const now = input.startedAt ?? Date.now()
  const snapshot: SessionSnapshot = {
    sessionId: crypto.randomUUID(),
    items: input.items,
    answeredCount: 0,
    attemptIds: [],
    subAnswers: [],
    startedAt: now,
    updatedAt: now,
  }
  await db.settings.put({ key: ACTIVE_SESSION_KEY, value: snapshot })
  return snapshot
}

/**
 * DB上のスナップショットと引数が食い違ったときのエラー（二度押し・複数タブ・終了済みセッション）。
 *
 * T-176: 保存失敗の扱いを「同じ解答の保存をやり直す」に変えたが、この失敗だけは
 * やり直しても直らない（引数の snapshot が古いままなので同じ検知でまた弾かれる）。
 * 呼び出し側がこのエラーだけを見分けて `resumeSession` での再同期へ回すため、
 * メッセージ照合ではなく型で判別できるようにする
 */
export class StaleSnapshotError extends Error {
  constructor() {
    super('スナップショットが古い（二重解答か、セッションは終了済み）')
    this.name = 'StaleSnapshotError'
  }
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
  const item = currentItem(snapshot)
  if (item === null) {
    throw new Error('全問解答済みのセッションには解答できない')
  }
  const attempt = buildAttempt({ ...input, questionId: item.questionId, mode: item.mode })
  const next: SessionSnapshot = {
    ...snapshot,
    answeredCount: snapshot.answeredCount + 1,
    attemptIds: [...snapshot.attemptIds, attempt.id],
    // itemを進めるのでサブ設問の解答済み記録は次itemのために空へ戻す
    subAnswers: [],
    updatedAt: attempt.answeredAt,
  }
  await db.transaction('rw', db.attempts, db.settings, async () => {
    const stored = (await db.settings.get(ACTIVE_SESSION_KEY))?.value as SessionSnapshot | undefined
    if (
      stored === undefined ||
      stored.sessionId !== snapshot.sessionId ||
      stored.answeredCount !== snapshot.answeredCount
    ) {
      throw new StaleSnapshotError()
    }
    await db.attempts.add(attempt)
    await db.settings.put({ key: ACTIVE_SESSION_KEY, value: next })
  })
  return next
}

/**
 * 現在のitemの解答をサブ設問1問分だけ記録する（複合問題。レビュー指摘、2026-08-03）。
 *
 * `answerCurrentQuestion` との違いは**itemを進めない**ことである。読解・audio_set は
 * 1itemでサブ設問全問を要求するため、item を進めるのは全問終わってから
 * （`advanceSession`）になる。それまでの間、
 *
 * - attempt の追記
 * - `attemptIds` への追加（リザルトの集計入力。これが無いと「正解 0/0」になる）
 * - `subAnswers` への追加（再開時に再出題しないための位置記録）
 *
 * を同一トランザクションで行う。従来はサブ設問を `recordAttempt` で直接保存しており、
 * スナップショットに何も残らなかったため、中断すると再開後に再出題されて重複が生まれ、
 * 完走してもリザルトの集計対象から漏れていた。
 *
 * 同じサブ設問が既に記録済みなら `StaleSnapshotError` で拒否する（二度押し・複数タブ）。
 * 保存が失敗した場合は何も書かれないので、同じ入力での再試行はそのまま通る。
 */
export async function answerCurrentSubQuestion(
  db: BebRaidDatabase,
  snapshot: SessionSnapshot,
  input: Omit<RecordAttemptInput, 'mode'> & { selectedKey?: string | null },
): Promise<SessionSnapshot> {
  const item = currentItem(snapshot)
  if (item === null) {
    throw new Error('全問解答済みのセッションには解答できない')
  }
  const attempt = buildAttempt({ ...input, mode: item.mode })
  let next: SessionSnapshot | null = null
  await db.transaction('rw', db.attempts, db.settings, async () => {
    const stored = (await db.settings.get(ACTIVE_SESSION_KEY))?.value as SessionSnapshot | undefined
    if (
      stored === undefined ||
      stored.sessionId !== snapshot.sessionId ||
      stored.answeredCount !== snapshot.answeredCount
    ) {
      throw new StaleSnapshotError()
    }
    const storedSubAnswers = currentSubAnswers(stored)
    if (storedSubAnswers.some((a) => a.subQuestionId === input.questionId)) {
      throw new StaleSnapshotError()
    }
    // 追加元は**DB上の値**にする。画面が持つスナップショットのサブ設問一覧が
    // 一手古い場合でも、記録済みの解答を取りこぼさない
    next = {
      ...stored,
      attemptIds: [...stored.attemptIds, attempt.id],
      subAnswers: [
        ...storedSubAnswers,
        {
          subQuestionId: input.questionId,
          selectedKey: input.selectedKey ?? null,
          isCorrect: attempt.isCorrect,
        },
      ],
      updatedAt: attempt.answeredAt,
    }
    await db.attempts.add(attempt)
    await db.settings.put({ key: ACTIVE_SESSION_KEY, value: next })
  })
  return next!
}

/**
 * 現在のitemを解答不要で次へ進める（M2・T-49: audio_setのセット全問終了後に使う）。
 * サブ設問ごとのattemptsは呼び出し側が個別に記録済みのため、ここではattemptsに
 * 書かず（重複記録を避ける）スナップショットの answeredCount だけ進める
 */
export async function advanceSession(
  db: BebRaidDatabase,
  snapshot: SessionSnapshot,
): Promise<SessionSnapshot> {
  const item = currentItem(snapshot)
  if (item === null) {
    throw new Error('全問解答済みのセッションを進めることはできない')
  }
  const next: SessionSnapshot = {
    ...snapshot,
    answeredCount: snapshot.answeredCount + 1,
    // itemを進めるのでサブ設問の解答済み記録は次itemのために空へ戻す
    subAnswers: [],
    updatedAt: Date.now(),
  }
  await db.transaction('rw', db.settings, async () => {
    const stored = (await db.settings.get(ACTIVE_SESSION_KEY))?.value as SessionSnapshot | undefined
    if (
      stored === undefined ||
      stored.sessionId !== snapshot.sessionId ||
      stored.answeredCount !== snapshot.answeredCount
    ) {
      throw new StaleSnapshotError()
    }
    await db.settings.put({ key: ACTIVE_SESSION_KEY, value: next })
  })
  return next
}

/** 進行中セッションを復元する。無い/旧形式なら null（=新規セッションを開始する。3.3節） */
export async function resumeSession(db: BebRaidDatabase): Promise<SessionSnapshot | null> {
  const record = await db.settings.get(ACTIVE_SESSION_KEY)
  if (!record) return null
  return isValidSnapshot(record.value) ? record.value : null
}

/** セッションを終了し、スナップショットを破棄する（解答ログは attempts に残る） */
export async function completeSession(db: BebRaidDatabase): Promise<void> {
  await db.settings.delete(ACTIVE_SESSION_KEY)
}
