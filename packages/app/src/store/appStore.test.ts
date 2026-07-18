// T-114完了条件のテスト（正本: docs/18_改修計画_表示更新とUX残課題.md T-114シート）:
// - navigate()で履歴が積まれる（history.pushState）
// - navigateFromPopState()はhistory操作を伴わない（無限ループ防止）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from './appStore'

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('appStore: navigateで履歴が積まれる（T-114）', () => {
  it('navigate()はhistory.pushStateを呼び、screenを更新する', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    useAppStore.getState().navigate('settings')

    expect(pushStateSpy).toHaveBeenCalledTimes(1)
    expect(pushStateSpy).toHaveBeenCalledWith({ screen: 'settings' }, '')
    expect(useAppStore.getState().screen).toBe('settings')
  })

  it('navigateFromPopState()はhistory.pushStateを呼ばずscreenだけ更新する（無限ループ防止）', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState')

    useAppStore.getState().navigateFromPopState('drill')

    expect(pushStateSpy).not.toHaveBeenCalled()
    expect(useAppStore.getState().screen).toBe('drill')
  })
})
