// 保存失敗時の再試行導線（T-176。正本: docs/28 の3.1節・ADR 0010）。
// DrillScreen・ReadingScreen が同じ形で持っていたローカル実装を抽出した。
//
// 抽出の動機は再試行の**多重実行防止**である（レビュー指摘、2026-07-31）。
// 再試行中もボタンが有効だったため、ReadingScreen（snapshotを使わない経路）では
// 連打した2回の再試行が両方成功すると同じ解答のattempt・レートが二重に書かれた。
// ADR 0010 の単一トランザクション化は「失敗した1回の書き込みが部分的に残らない」ことを
// 保証するが、成功する処理を2回走らせる操作は防げない。

import { useCallback, useEffect, useRef, useState } from 'react'

export interface RetrySaveController {
  /** 再試行ボタンを出すか（再試行中も出したままにする＝連続失敗時のちらつき回避） */
  shown: boolean
  /** 再試行の実行中。ボタンの disabled に渡す（同期のガードはフック内にある） */
  busy: boolean
  /** 再試行の内容を登録する。保存失敗のcatch節から呼ぶ */
  offer: (run: () => Promise<void>) => void
  /** 登録を破棄する。保存の開始時・成功時に呼ぶ */
  clear: () => void
  /** 再試行を実行する。実行中の再入は無視する */
  run: () => Promise<void>
}

export function useRetrySave(): RetrySaveController {
  const [offered, setOffered] = useState(false)
  const [busy, setBusy] = useState(false)
  const runRef = useRef<(() => Promise<void>) | null>(null)
  // 連打は同一レンダー内で2回目のクリックが来るため、state（busy）では間に合わない。
  // 同期に読めるrefで弾く（usePendingCommit の pendingRef と同じ理由）
  const busyRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    // マウント時に true へ戻す（StrictModeの二重マウント対策。usePendingCommit と同じ）
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const offer = useCallback((run: () => Promise<void>) => {
    runRef.current = run
    setOffered(true)
  }, [])

  const clear = useCallback(() => {
    runRef.current = null
    if (mountedRef.current) setOffered(false)
  }, [])

  const run = useCallback(async () => {
    const pending = runRef.current
    if (pending === null || busyRef.current) return
    busyRef.current = true
    if (mountedRef.current) setBusy(true)
    try {
      // 再試行の本体は保存処理そのもの（成功なら clear、失敗なら offer を自分で呼ぶ）。
      // 例外は本体側で握られている想定だが、漏れても busy を戻す
      await pending()
    } finally {
      busyRef.current = false
      if (mountedRef.current) setBusy(false)
    }
  }, [])

  return { shown: offered || busy, busy, offer, clear, run }
}
