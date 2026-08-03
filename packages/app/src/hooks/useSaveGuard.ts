// 解答保存の進行ガード（T-176。正本: docs/28 の3.1節・ADR 0010）。
// DrillScreen・ReadingScreen が持っていた再試行導線のローカル実装を抽出し、
// 「保存が終わるまで／失敗している間は先へ進めない」判定をここに集約した。
//
// 抽出と拡張はいずれもレビュー指摘による（2026-07-31・2026-08-03）。
//
// 1. 再試行の多重実行: ボタンが実行中も有効だったため、連打すると同じ解答が二重に書かれた
//    （Reading経路はsnapshotを使わないので他に歯止めが無かった）。
// 2. 保存の完了を待たない進行: 正誤表示は保存より先に出るため、保存中・保存失敗中でも
//    「次へ」を押せた。Reading の最終サブ設問では未保存のままリザルトへ進み、Drill では
//    snapshotが進んでいないまま次の問題を解いて、attemptを前問のIDで記録しつつ
//    タグ・レートには次問の情報を使う不整合が起きうる。
//
// どちらも「書き込みが原子的か」（ADR 0010）とは別の問題で、UI側で操作を止める必要がある。

import { useCallback, useEffect, useRef, useState } from 'react'

export interface SaveGuardController {
  /** 保存の実行中（初回・再試行の両方を含む） */
  saving: boolean
  /** 再試行ボタンを出すか（再試行中も出したままにする＝連続失敗時のちらつき回避） */
  retryShown: boolean
  /** 再試行の実行中。ボタンの disabled に渡す（同期のガードはフック内にある） */
  retryBusy: boolean
  /**
   * 進行（「次へ」「次の設問へ」「ここで終了」等）を止めるべきか。
   * 保存中か、再試行待ちの失敗が残っている状態を指す
   */
  blocked: boolean
  /** 保存処理を包む。実行中は saving が true になる（例外はそのまま呼び出し側へ投げる） */
  track: <T>(run: () => Promise<T>) => Promise<T>
  /** 再試行の内容を登録する。保存失敗のcatch節から呼ぶ */
  offerRetry: (run: () => Promise<void>) => void
  /** 登録を破棄する。保存の開始時・成功時に呼ぶ */
  clearRetry: () => void
  /** 再試行を実行する。実行中の再入は無視する */
  runRetry: () => Promise<void>
}

export function useSaveGuard(): SaveGuardController {
  const [saving, setSaving] = useState(false)
  const [retryOffered, setRetryOffered] = useState(false)
  const [retryBusy, setRetryBusy] = useState(false)
  const retryRef = useRef<(() => Promise<void>) | null>(null)
  // 連打は同一レンダー内で2回目のクリックが来るため、state（retryBusy）では間に合わない。
  // 同期に読めるrefで弾く（usePendingCommit の pendingRef と同じ理由）
  const retryBusyRef = useRef(false)
  // 保存の入れ子・並行（audio_setのサブ設問を続けて解答する等）でも取りこぼさないよう
  // 真偽値ではなく件数で持つ
  const savingCountRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    // マウント時に true へ戻す（StrictModeの二重マウント対策。usePendingCommit と同じ）
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const track = useCallback(async <T>(run: () => Promise<T>): Promise<T> => {
    savingCountRef.current += 1
    if (mountedRef.current) setSaving(true)
    try {
      return await run()
    } finally {
      savingCountRef.current -= 1
      // 猶予付き確定のflush経路はアンマウント後にも走るため、setStateは必ず守る
      if (savingCountRef.current === 0 && mountedRef.current) setSaving(false)
    }
  }, [])

  const offerRetry = useCallback((run: () => Promise<void>) => {
    retryRef.current = run
    setRetryOffered(true)
  }, [])

  const clearRetry = useCallback(() => {
    retryRef.current = null
    if (mountedRef.current) setRetryOffered(false)
  }, [])

  const runRetry = useCallback(async () => {
    const pending = retryRef.current
    if (pending === null || retryBusyRef.current) return
    retryBusyRef.current = true
    if (mountedRef.current) setRetryBusy(true)
    try {
      // 再試行の本体は保存処理そのもの（成功なら clearRetry、失敗なら offerRetry を
      // 自分で呼ぶ）。例外は本体側で握られている想定だが、漏れても busy を戻す
      await pending()
    } finally {
      retryBusyRef.current = false
      if (mountedRef.current) setRetryBusy(false)
    }
  }, [])

  return {
    saving,
    retryShown: retryOffered || retryBusy,
    retryBusy,
    blocked: saving || retryOffered || retryBusy,
    track,
    offerRetry,
    clearRetry,
    runRetry,
  }
}
