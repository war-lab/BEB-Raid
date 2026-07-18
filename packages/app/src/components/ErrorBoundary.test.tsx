// ルートErrorBoundary（レビューF7）のテスト:
// - 子のrender例外でフォールバックUI（問題が発生しました＋再読み込み）が出る
// - console.errorに原因が残る
// - 再読み込みボタンでreload（テストでは注入したモック）が呼ばれる
// - 例外が無ければ子をそのまま描画する
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Bomb(): never {
  throw new Error('render中の例外')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('例外が無ければ子をそのまま描画する', () => {
    render(
      <ErrorBoundary>
        <p>正常なコンテンツ</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('正常なコンテンツ')).toBeTruthy()
    expect(screen.queryByText('問題が発生しました')).toBeNull()
  })

  it('子のrender例外で白画面ではなくフォールバックUIを表示し、console.errorに記録する', () => {
    // Reactが標準出力する例外ログでテスト出力を汚さないよう抑止しつつ、呼び出し自体は検証する
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('問題が発生しました')).toBeTruthy()
    expect(screen.getByText('再読み込み')).toBeTruthy()
    expect(errorSpy.mock.calls.some((args) => String(args[0]).includes('[ErrorBoundary]'))).toBe(
      true,
    )
  })

  it('「再読み込み」ボタンでreloadが呼ばれる', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()

    render(
      <ErrorBoundary reload={reload}>
        <Bomb />
      </ErrorBoundary>,
    )

    fireEvent.click(screen.getByText('再読み込み'))
    expect(reload).toHaveBeenCalled()
  })
})
