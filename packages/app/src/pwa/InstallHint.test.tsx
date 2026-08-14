// T-107(b)完了条件のテスト: appinstalled発火でヒントが閉じる（正本: docs/18 T-107シート）。
// 既存のbeforeinstallprompt捕捉・localStorage永続化の回帰も併せて確認する。
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InstallHint } from './InstallHint'

const DISMISS_KEY = 'beb.installHintDismissed'

beforeEach(() => {
  localStorage.removeItem(DISMISS_KEY)
})

afterEach(() => {
  localStorage.removeItem(DISMISS_KEY)
})

describe('InstallHint: appinstalledでヒントが閉じる（T-107b）', () => {
  it('appinstalledイベントで案内が非表示になり、localStorageにも記録される', async () => {
    render(<InstallHint />)
    expect(screen.getByRole('note')).toBeTruthy()

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(screen.queryByRole('note')).toBeNull()
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')
  })

  it('既にlocalStorageで非表示指定済みなら最初から表示されない', () => {
    localStorage.setItem(DISMISS_KEY, '1')
    render(<InstallHint />)

    expect(screen.queryByRole('note')).toBeNull()
  })

  it('閉じるボタンで非表示になる（既存挙動の回帰）', () => {
    render(<InstallHint />)
    expect(screen.getByRole('note')).toBeTruthy()

    // T-213: 既定折りたたみになったため、実機の操作順に合わせて開いてから閉じる
    fireEvent.click(screen.getByText('ホーム画面への追加案内'))
    fireEvent.click(screen.getByText('閉じる'))

    expect(screen.queryByRole('note')).toBeNull()
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')
  })
})

// 何を防ぐか（T-213。docs/29 Q-43・J-109）: この案内が既定で全文展開され、
// モバイル幅のファーストビューでCTAより上を占有していたこと
describe('InstallHint: 既定で折りたたむ（T-213・J-109）', () => {
  it('初期表示では案内文・ボタンが折りたたまれている', () => {
    const { container } = render(<InstallHint />)

    const details = container.querySelector('details')
    expect(details).toBeTruthy()
    expect(details?.open).toBe(false)
    // 折りたたみの見出しだけは常に見える
    expect(screen.getByText('ホーム画面への追加案内')).toBeTruthy()
  })

  it('見出しをクリックすると展開される', () => {
    const { container } = render(<InstallHint />)

    fireEvent.click(screen.getByText('ホーム画面への追加案内'))

    const details = container.querySelector('details')
    expect(details?.open).toBe(true)
  })
})
