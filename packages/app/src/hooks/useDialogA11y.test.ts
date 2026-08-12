// T-294（K-21）: ダイアログ共通の最低限の作法フックに専用テストが無かった。
// フォーカストラップが無いとTabで背景の要素へ抜けられ、確認しているはずの操作を
// 裏で実行できてしまう（コメント参照）。主要分岐（初期フォーカス・Esc・Tab循環・
// disabled除外・フォーカス復帰）を検証する
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDialogA11y } from './useDialogA11y'

function makeDialog(buttonCount: number, disabledIndexes: number[] = []): HTMLDivElement {
  const div = document.createElement('div')
  for (let i = 0; i < buttonCount; i++) {
    const btn = document.createElement('button')
    btn.textContent = `btn-${i}`
    if (disabledIndexes.includes(i)) btn.disabled = true
    div.appendChild(btn)
  }
  document.body.appendChild(div)
  return div
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useDialogA11y', () => {
  it('enabled=trueで開くと最初のボタンへフォーカスが移る', () => {
    const dialog = makeDialog(3)
    renderHook(() => useDialogA11y({ current: dialog }, true))
    expect(document.activeElement).toBe(dialog.querySelectorAll('button')[0])
  })

  it('disabledなボタンは初期フォーカス対象から除外される', () => {
    const dialog = makeDialog(3, [0])
    renderHook(() => useDialogA11y({ current: dialog }, true))
    expect(document.activeElement).toBe(dialog.querySelectorAll('button')[1])
  })

  it('enabled=falseでは初期フォーカスを移さない', () => {
    const dialog = makeDialog(3)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    renderHook(() => useDialogA11y({ current: dialog }, false))
    expect(document.activeElement).toBe(outside)
  })

  it('EscでonDismissが呼ばれる（enabled時のみ）', () => {
    const dialog = makeDialog(2)
    const onDismiss = vi.fn()
    renderHook(() => useDialogA11y({ current: dialog }, true, onDismiss))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('onDismiss未指定ならEscでも何も起きない（例外にならない）', () => {
    const dialog = makeDialog(2)
    renderHook(() => useDialogA11y({ current: dialog }, true))

    expect(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    }).not.toThrow()
  })

  it('enabled=falseならEscでonDismissが呼ばれない', () => {
    const dialog = makeDialog(2)
    const onDismiss = vi.fn()
    renderHook(() => useDialogA11y({ current: dialog }, false, onDismiss))

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('最後のボタンでTabを押すと最初のボタンへ循環する', () => {
    const dialog = makeDialog(3)
    const buttons = dialog.querySelectorAll('button')
    renderHook(() => useDialogA11y({ current: dialog }, true))
    buttons[2]!.focus()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('最初のボタンでShift+Tabを押すと最後のボタンへ循環する', () => {
    const dialog = makeDialog(3)
    const buttons = dialog.querySelectorAll('button')
    renderHook(() => useDialogA11y({ current: dialog }, true))
    buttons[0]!.focus()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    })
    expect(document.activeElement).toBe(buttons[2])
  })

  it('ダイアログ外にフォーカスがある状態でTabを押すと内側へ引き戻す', () => {
    const dialog = makeDialog(2)
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const buttons = dialog.querySelectorAll('button')
    renderHook(() => useDialogA11y({ current: dialog }, true))
    outside.focus()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('閉じたら開く前の要素へフォーカスを戻す', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const dialog = makeDialog(2)

    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDialogA11y({ current: dialog }, enabled),
      { initialProps: { enabled: true } },
    )
    expect(document.activeElement).toBe(dialog.querySelectorAll('button')[0])

    rerender({ enabled: false })
    expect(document.activeElement).toBe(outside)
  })
})
