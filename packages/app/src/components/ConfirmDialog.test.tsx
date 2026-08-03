// ConfirmDialog（T-162。docs/27 のS-6・S-7・S-38）のうち、キーボード操作の担保。
// 何を防ぐか（レビュー指摘、2026-08-03）: aria-modal だけでは操作が制限されないため、
// Tabで背景のボタンへ抜けて、確認しているはずの操作を裏で実行できてしまうこと。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from './ConfirmDialog'

function setup(onDismiss?: () => void) {
  return render(
    <>
      <button type="button">背景のボタン</button>
      <ConfirmDialog
        message="中断しますか？"
        onDismiss={onDismiss}
        actions={[
          { label: '中断する', primary: true, onSelect: vi.fn() },
          { label: '続ける', onSelect: vi.fn() },
        ]}
      />
    </>,
  )
}

describe('ConfirmDialog: フォーカス管理', () => {
  it('開いたら最初の選択肢にフォーカスが移る', () => {
    setup()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '中断する' }))
  })

  it('Tabはダイアログ内で循環し、背景のボタンへ抜けない', () => {
    setup()
    const first = screen.getByRole('button', { name: '中断する' })
    const last = screen.getByRole('button', { name: '続ける' })
    const background = screen.getByRole('button', { name: '背景のボタン' })

    // 末尾からのTabは先頭へ戻る（背景へ行かない）
    last.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    expect(document.activeElement).not.toBe(background)

    // 先頭からのShift+Tabは末尾へ回る
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('背景にフォーカスが逃げていてもTabでダイアログ内へ引き戻す', () => {
    setup()
    screen.getByRole('button', { name: '背景のボタン' }).focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '中断する' }))
  })

  it('閉じたら開く前の要素へフォーカスを戻す', () => {
    // ダイアログの外側にフォーカスを置いた状態から開く
    render(<button type="button">開く前のボタン</button>)
    const opener = screen.getByRole('button', { name: '開く前のボタン' })
    opener.focus()

    const dialog = render(
      <ConfirmDialog
        message="中断しますか？"
        actions={[{ label: '中断する', onSelect: vi.fn() }]}
      />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '中断する' }))

    dialog.unmount()
    expect(document.activeElement).toBe(opener)
  })

  it('Escで取り消せる（onDismiss指定時）', () => {
    const onDismiss = vi.fn()
    setup(onDismiss)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
  })
})
