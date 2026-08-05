// 保存ガードフックの単体テスト（T-264。29の11節「テスト空白地帯」）。
// 何を防ぐか: 再試行の連打による二重実行、入れ子/並行trackでの
// blocked/savingの取り違え、アンマウント後のsetState（Reactの警告・値の巻き戻り）。
// いずれもattemptsの二重記録やUIの誤った進行許可に直結する。

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSaveGuard } from './useSaveGuard'

/** 手動で解決タイミングを制御できるPromiseを作る */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useSaveGuard', () => {
  describe('track', () => {
    it('実行中はsaving・blockedがtrueになり、完了後はfalseに戻る', async () => {
      const { result } = renderHook(() => useSaveGuard())
      const d = deferred<void>()

      let trackPromise!: Promise<void>
      act(() => {
        trackPromise = result.current.track(() => d.promise)
      })
      expect(result.current.saving).toBe(true)
      expect(result.current.blocked).toBe(true)

      await act(async () => {
        d.resolve()
        await trackPromise
      })
      expect(result.current.saving).toBe(false)
      expect(result.current.blocked).toBe(false)
    })

    it('入れ子/並行trackでは両方が終わるまでsavingがtrueのまま維持される（savingCountRefのカウント）', async () => {
      // audio_setのサブ設問を続けて解答する等、trackの呼び出しが並行しうる経路を想定。
      // 真偽値だけで管理すると、片方が先に終わった時点でsavingがfalseに戻ってしまい、
      // まだ保存中のもう一方の間も「次へ」等の進行操作を許してしまう
      const { result } = renderHook(() => useSaveGuard())
      const first = deferred<void>()
      const second = deferred<void>()

      let firstPromise!: Promise<void>
      let secondPromise!: Promise<void>
      act(() => {
        firstPromise = result.current.track(() => first.promise)
        secondPromise = result.current.track(() => second.promise)
      })
      expect(result.current.saving).toBe(true)

      await act(async () => {
        first.resolve()
        await firstPromise
      })
      // 片方だけが終わってもまだもう片方が進行中なのでsavingは戻らない
      expect(result.current.saving).toBe(true)

      await act(async () => {
        second.resolve()
        await secondPromise
      })
      expect(result.current.saving).toBe(false)
    })

    it('trackの本体が例外を投げてもsavingは戻り、例外は呼び出し側へ伝播する', async () => {
      const { result } = renderHook(() => useSaveGuard())
      const err = new Error('save failed')

      let caught: unknown
      await act(async () => {
        try {
          await result.current.track(() => Promise.reject(err))
        } catch (e) {
          caught = e
        }
      })
      expect(caught).toBe(err)
      expect(result.current.saving).toBe(false)
    })
  })

  describe('offerRetry / runRetry', () => {
    it('再試行を連打しても、実行中の呼び出しは1回しか走らない', async () => {
      const { result } = renderHook(() => useSaveGuard())
      const d = deferred<void>()
      const retryFn = vi.fn(() => d.promise)

      act(() => result.current.offerRetry(retryFn))
      expect(result.current.retryShown).toBe(true)

      // 1回目の実行が完了する前に連打（同一レンダー内の2回目クリックを模す）
      let runPromise1!: Promise<void>
      let runPromise2!: Promise<void>
      act(() => {
        runPromise1 = result.current.runRetry()
        runPromise2 = result.current.runRetry()
      })
      expect(result.current.retryBusy).toBe(true)

      await act(async () => {
        d.resolve()
        await Promise.all([runPromise1, runPromise2])
      })

      // retryBusyRef（同期の連打ガード）により、連打しても本体は1回しか呼ばれない
      expect(retryFn).toHaveBeenCalledTimes(1)
      expect(result.current.retryBusy).toBe(false)
    })

    it('実行中の再試行が完了した後は、次のrunRetryで再び本体が呼ばれる', async () => {
      const { result } = renderHook(() => useSaveGuard())
      const retryFn = vi.fn(async () => {})

      act(() => result.current.offerRetry(retryFn))
      await act(async () => {
        await result.current.runRetry()
      })
      expect(retryFn).toHaveBeenCalledTimes(1)

      await act(async () => {
        await result.current.runRetry()
      })
      // offerRetry/clearRetryを呼ばなくても、retryRef自体は残っているため再実行できる
      // （clearRetryは呼び出し側=保存成功時のcatch節の外で行う設計）
      expect(retryFn).toHaveBeenCalledTimes(2)
    })

    it('clearRetryを呼ぶとretryShownがfalseに戻り、以後のrunRetryは何もしない', async () => {
      const { result } = renderHook(() => useSaveGuard())
      const retryFn = vi.fn(async () => {})

      act(() => result.current.offerRetry(retryFn))
      act(() => result.current.clearRetry())
      expect(result.current.retryShown).toBe(false)

      await act(async () => {
        await result.current.runRetry()
      })
      expect(retryFn).not.toHaveBeenCalled()
    })

    it('登録が無い状態でrunRetryを呼んでも何も起きない', async () => {
      const { result } = renderHook(() => useSaveGuard())
      await act(async () => {
        await result.current.runRetry()
      })
      expect(result.current.retryBusy).toBe(false)
    })
  })

  describe('アンマウント後のsetState抑止', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('trackの実行中にアンマウントされても、完了時にReactのsetState警告が出ない', async () => {
      const { result, unmount } = renderHook(() => useSaveGuard())
      const d = deferred<void>()

      let trackPromise!: Promise<void>
      act(() => {
        trackPromise = result.current.track(() => d.promise)
      })
      unmount()

      // アンマウント後にpromiseを解決させる（猶予付き確定のflush経路と同じタイミング）
      await act(async () => {
        d.resolve()
        await trackPromise
      })

      // mountedRefがfalseの間はsetSavingを呼ばないため、Reactの
      // 「アンマウント済みコンポーネントへのstate更新」警告が出ない
      const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls
      const warned = calls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('unmounted component')),
      )
      expect(warned).toBe(false)
    })

    it('再試行の実行中にアンマウントされても、完了時にReactのsetState警告が出ない', async () => {
      const { result, unmount } = renderHook(() => useSaveGuard())
      const d = deferred<void>()
      act(() => result.current.offerRetry(() => d.promise))

      let runPromise!: Promise<void>
      act(() => {
        runPromise = result.current.runRetry()
      })
      unmount()

      await act(async () => {
        d.resolve()
        await runPromise
      })

      const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls
      const warned = calls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('unmounted component')),
      )
      expect(warned).toBe(false)
    })
  })
})
