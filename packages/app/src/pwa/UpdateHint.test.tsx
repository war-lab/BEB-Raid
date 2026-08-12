// T-280（K-3）回帰テスト。UpdateHintは更新ボタンを押した時だけapplyUpdateを呼ぶ
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSwUpdateStore } from './swUpdateStore'
import { UpdateHint } from './UpdateHint'

afterEach(() => {
  cleanup()
  useSwUpdateStore.getState().resetForTest()
})

describe('UpdateHint', () => {
  it('updateAvailable=falseのときは何も表示しない', () => {
    render(<UpdateHint />)
    expect(screen.queryByText('更新する')).toBeNull()
  })

  it('updateAvailable=trueのとき更新ボタンを表示し、クリックでapplyUpdateだけが呼ばれる', () => {
    const applyUpdate = vi.fn()
    useSwUpdateStore.getState().setUpdateAvailable(applyUpdate)

    render(<UpdateHint />)
    expect(applyUpdate).not.toHaveBeenCalled() // 表示だけではリロードされない
    fireEvent.click(screen.getByText('更新する'))
    expect(applyUpdate).toHaveBeenCalledTimes(1)
  })
})
