// 猶予付き確定（T-156。正本: ADR 0009・docs/28 の3.1節）。
// 不可逆な操作をタップした直後の短時間だけ永続化を遅らせ、その間に「取り消し」を
// 受け付ける仕組み。DrillScreen の選択肢タップから抽出した（元は同画面のローカル実装）。
// 語彙カードの自己評価（T-160）・語彙仕分けのスワイプ（T-161）も同じ仕組みに乗せる。

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 誤タップの取り消し猶予（2026-07-29。正本: ADR 0009）。
 * 操作してからこの時間だけ永続化を遅らせ、その間だけ「取り消し」を出す。
 * まだ書いていないので attempts 追記専用の不変条件は破らない。
 * 視覚フィードバック（色・✓✕）は即時のままなのでテンポは変わらない。
 * 400msは推定値でドッグフード実測（H-16）での調整前提
 */
export const UNDO_WINDOW_MS = 400

export interface PendingCommitController<T> {
  /** 猶予中のペイロード（描画用）。null なら猶予中ではない */
  pending: T | null
  /**
   * 猶予中ペイロードの同期参照。レンダーを待たずに猶予の有無を見る必要がある経路
   * （時間切れ判定の多層防御など）から読む
   */
  pendingRef: React.MutableRefObject<T | null>
  /**
   * マウント状態の参照。commit はアンマウント後（flush経路）でも走るため、
   * commit 側の setState はこれで守る
   */
  mountedRef: React.MutableRefObject<boolean>
  /** 猶予付きで確定を予約する */
  schedule: (payload: T) => void
  /** 予約を破棄して猶予中のペイロードを返す（取り消し導線用） */
  cancel: () => T | null
  /** 予約タイマーだけを止める（commit の冒頭から呼ぶ） */
  clearTimer: () => void
  /** 猶予中の表示状態を解除する（commit の冒頭から呼ぶ。アンマウント後は何もしない） */
  clearPending: () => void
}

/**
 * 猶予付き確定のフック。
 *
 * `commit` はアンマウント時の flush からも呼ばれるため、**確定に必要な値は
 * すべてペイロードに載せて渡すこと**（クロージャから読むと、5問目の解答を
 * 1問目のIDで記録する類の取り違えが起きる）。
 *
 * `commit` は毎レンダーで最新のものを参照する（レンダー時の関数を setTimeout に
 * 焼き付けない）。アンマウント時の flush が初回レンダーのクロージャを呼ぶという
 * 元実装の落とし穴を構造的に無くすためで、ペイロードから読む規律とあわせて
 * 挙動は変わらない。
 */
export function usePendingCommit<T>(
  commit: (payload: T) => void | Promise<void>,
  windowMs: number = UNDO_WINDOW_MS,
): PendingCommitController<T> {
  const [pending, setPending] = useState<T | null>(null)
  const pendingRef = useRef<T | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)
  const commitRef = useRef(commit)
  // レンダー中にrefを書くと react-hooks/refs に触れるためeffectで同期する。
  // schedule はイベントハンドラ（＝レンダー後）からしか呼ばれないので、
  // 予約時点で最新のcommitが入っていることは保証される
  useEffect(() => {
    commitRef.current = commit
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearPending = useCallback(() => {
    pendingRef.current = null
    if (mountedRef.current) setPending(null)
  }, [])

  const schedule = useCallback(
    (payload: T) => {
      // T-194（Q-107）: 猶予中に再度scheduleが呼ばれると、以前は前のペイロードのタイマーだけを
      // clearTimerで解除しており、前の解答がコミットされずに消えていた。現状はDrillScreenの
      // finalizeAnswerが早期returnでこの再呼び出し自体をガードしていて到達しないが、フックの
      // APIとしては無防備だった。前のpendingが残っていれば即flushしてから新しい予約を始める
      const previous = pendingRef.current
      clearTimer()
      if (previous !== null) {
        void commitRef.current(previous)
      }
      pendingRef.current = payload
      setPending(payload)
      timerRef.current = setTimeout(() => void commitRef.current(payload), windowMs)
    },
    [clearTimer, windowMs],
  )

  const cancel = useCallback((): T | null => {
    const payload = pendingRef.current
    if (payload === null) return null
    clearTimer()
    pendingRef.current = null
    setPending(null)
    return payload
  }, [clearTimer])

  // アンマウント時（中断・途中終了・画面切替・タブ閉じ）に猶予中の操作が残っていたら
  // 確定させる（ADR 0009）。操作は実際に行われており、attempts は分析の基盤なので
  // 捨てる方が損失が大きい。
  // beforeunload は扱わない（IndexedDBへの同期書き込みができないため。未書き込みなら
  // 次回セッション再開時に未解答として再出題される＝オフライン正常系の既存方針どおり）
  useEffect(() => {
    // マウント時に true へ戻すのが必須。StrictModeの開発時二重マウント
    // （mount→cleanup→mount）でcleanupがfalseにしたまま再マウントすると、
    // 以降 setPending(null) が走らず取り消しボタンが消えないまま固まる（実機で発見）
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const payload = pendingRef.current
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      if (payload !== null) void commitRef.current(payload)
    }
  }, [])

  return { pending, pendingRef, mountedRef, schedule, cancel, clearTimer, clearPending }
}
