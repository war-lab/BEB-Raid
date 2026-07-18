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

    fireEvent.click(screen.getByText('閉じる'))

    expect(screen.queryByRole('note')).toBeNull()
    expect(localStorage.getItem(DISMISS_KEY)).toBe('1')
  })
})
