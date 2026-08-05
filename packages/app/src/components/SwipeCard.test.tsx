// T-209（Q-47）: ドラッグ中に指がカード外へ出て離すと、setPointerCaptureが無いために
// pointerupがカードへ届かず、カードが途中位置（translateX固定）で固まる、またはスワイプが
// 不成立になる不具合の再発防止。
// jsdomはブラウザのポインタキャプチャによる再ルーティング（キャプチャ後は物理的な要素の外で
// 離しても、キャプチャした要素へpointerup等が送られる）を再現できないため、
// 「pointerdown時にsetPointerCaptureが正しいpointerIdで呼ばれる」ことを直接検証する。
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SwipeCard } from './SwipeCard'

describe('SwipeCard: ポインタキャプチャ（T-209・Q-47）', () => {
  beforeEach(() => {
    // jsdomはsetPointerCapture/releasePointerCaptureを実装していないため、スパイ用に用意する
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    })
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).setPointerCapture
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (HTMLElement.prototype as any).releasePointerCapture
  })

  it('pointerdown時に自身のpointerIdでsetPointerCaptureを呼ぶ', () => {
    render(
      <SwipeCard onSwipeRight={() => {}} onSwipeLeft={() => {}}>
        <p>card-content</p>
      </SwipeCard>,
    )
    const card = screen.getByText('card-content').closest('.swipe-card') as HTMLElement
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 7 })

    expect(card.setPointerCapture).toHaveBeenCalledWith(7)
  })
})
