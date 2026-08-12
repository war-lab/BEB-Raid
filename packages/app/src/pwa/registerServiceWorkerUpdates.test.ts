// T-280（K-3）回帰テスト。正本: docs/32 3節J-118・docs/31 4節K-3。
//
// vite-plugin-pwa（registerType: 'autoUpdate'）は、registerSWにonNeedRefreshを渡さないと
// 新版検知時にwindow.location.reload()を無条件で呼ぶ。セッション中に無警告でリロードされ、
// 進行中の解答が失われる（K-3）。onNeedRefreshを渡すとこの自動リロードが起こらなくなり、
// 適用（updateSW(true)）はユーザー操作（更新ボタン）が呼ぶまで実行されない
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerServiceWorkerUpdates, type RegisterSW } from './registerServiceWorkerUpdates'
import { useSwUpdateStore } from './swUpdateStore'

beforeEach(() => {
  useSwUpdateStore.getState().resetForTest()
})

describe('registerServiceWorkerUpdates', () => {
  it('registerSWをonNeedRefresh付きで呼ぶ（渡さないと無条件リロードされるため）', () => {
    const updateSW = vi.fn()
    const registerSW = vi.fn<RegisterSW>(() => updateSW)

    registerServiceWorkerUpdates(registerSW)

    expect(registerSW).toHaveBeenCalledTimes(1)
    const options = registerSW.mock.calls[0]![0]!
    expect(options.immediate).toBe(true)
    expect(typeof options.onNeedRefresh).toBe('function')
  })

  it('onNeedRefreshが呼ばれてもupdateSW（実際のリロード適用）は即時実行されない', () => {
    const updateSW = vi.fn()
    const registerSW = vi.fn<RegisterSW>(() => updateSW)

    registerServiceWorkerUpdates(registerSW)
    const options = registerSW.mock.calls[0]![0]!
    options.onNeedRefresh!()

    expect(updateSW).not.toHaveBeenCalled()
    expect(useSwUpdateStore.getState().updateAvailable).toBe(true)
  })

  it('ストアのapplyUpdateを呼ぶと、その時初めてupdateSW(true)が実行される（ユーザー操作時のみ適用）', () => {
    const updateSW = vi.fn()
    const registerSW = vi.fn<RegisterSW>(() => updateSW)

    registerServiceWorkerUpdates(registerSW)
    const options = registerSW.mock.calls[0]![0]!
    options.onNeedRefresh!()

    useSwUpdateStore.getState().applyUpdate?.()

    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('onNeedRefreshが呼ばれていない間は、updateAvailableがfalseのままである', () => {
    const registerSW = vi.fn<RegisterSW>(() => vi.fn())

    registerServiceWorkerUpdates(registerSW)

    expect(useSwUpdateStore.getState().updateAvailable).toBe(false)
    expect(useSwUpdateStore.getState().applyUpdate).toBeNull()
  })
})
