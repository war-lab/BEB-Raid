// 猶予付き確定フックの単体テスト（T-156）。
// 何を防ぐか: 猶予の予約・取り消し・アンマウント時flushの取り違え。
// この3経路のいずれかが壊れると、解答が二重に記録される・記録されずに消える・
// 取り消したのに永続化されるといった、attempts の信頼性に直結する事故になる。

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNDO_WINDOW_MS, usePendingCommit } from './usePendingCommit'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('usePendingCommit', () => {
  it('猶予が経過するとコミットされる', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    expect(commit).not.toHaveBeenCalled()
    expect(result.current.pending).toBe('a')

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS))

    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('猶予中に取り消すとコミットされず、ペイロードが返る', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    let cancelled: string | null = null
    act(() => {
      cancelled = result.current.cancel()
    })

    expect(cancelled).toBe('a')
    expect(result.current.pending).toBeNull()
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 10))
    expect(commit).not.toHaveBeenCalled()
  })

  it('猶予中でなければ取り消しは null を返し、何も起きない', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit))

    let cancelled: string | null = 'sentinel'
    act(() => {
      cancelled = result.current.cancel()
    })

    expect(cancelled).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })

  it('猶予中にアンマウントされると即コミットされる（flush）', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    unmount()

    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
    // flush済みの予約がタイマー経由で二重に走らない
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 10))
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('猶予中でなければアンマウントで何もコミットしない', () => {
    const commit = vi.fn()
    const { unmount } = renderHook(() => usePendingCommit<string>(commit))

    unmount()

    expect(commit).not.toHaveBeenCalled()
  })

  it('コミット後にアンマウントされても二重にコミットしない', () => {
    const commit = vi.fn()
    const { result, unmount } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS))
    // 実利用では commit 側が clearPending を呼ぶ（DrillScreen の commitAnswer と同じ順序）
    act(() => result.current.clearPending())
    unmount()

    expect(commit).toHaveBeenCalledTimes(1)
  })

  // T-194（Q-107）: 猶予中にscheduleを再度呼ぶケース。以前はここで前のペイロードのタイマーだけを
  // 解除し、前の解答をコミットせずに捨てていた（本テストは元々「'b'だけがコミットされる」＝
  // 'a'が消えることを正としていたが、それ自体がバグの症状だった）。
  // 現状はDrillScreenのfinalizeAnswerが早期returnでこの再呼び出し自体を防いでいるため実害は
  // ないが、フックのAPIとして無防備だった。前のペイロードは即flushし、解答を失わないようにする
  it('猶予中に再度scheduleすると、前のペイロードは即flushされ、新しいペイロードは通常どおり猶予後にコミットされる', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS / 2))
    act(() => result.current.schedule('b'))

    // 'a'は猶予を待たず、2回目のscheduleの時点で即座にコミットされる（消えない）
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
    expect(result.current.pending).toBe('b')

    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS))

    expect(commit).toHaveBeenCalledTimes(2)
    expect(commit).toHaveBeenNthCalledWith(2, 'b')
  })

  it('コミットは毎レンダーの最新の関数を呼ぶ（初回レンダーのクロージャに焼き付かない）', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(
      ({ commit }: { commit: (p: string) => void }) => usePendingCommit<string>(commit),
      { initialProps: { commit: first } },
    )

    act(() => result.current.schedule('a'))
    rerender({ commit: second })
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS))

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('猶予時間は引数で上書きできる', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit, 1000))

    act(() => result.current.schedule('a'))
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS))
    expect(commit).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(1000 - UNDO_WINDOW_MS))
    expect(commit).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('clearTimer は予約タイマーだけを止める（コミットは走らない）', () => {
    const commit = vi.fn()
    const { result } = renderHook(() => usePendingCommit<string>(commit))

    act(() => result.current.schedule('a'))
    act(() => result.current.clearTimer())
    act(() => void vi.advanceTimersByTime(UNDO_WINDOW_MS * 10))

    expect(commit).not.toHaveBeenCalled()
    // pendingRef は残るため、アンマウント時のflushで拾われる（解答を捨てない）
    expect(result.current.pendingRef.current).toBe('a')
  })
})
