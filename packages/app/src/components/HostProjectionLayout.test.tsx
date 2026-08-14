// V-11 投影レイアウトと外周リングのテスト。防ぐもの:
// - 外周リングが1秒刻みの離散更新でなくなること（秒未満の変化で描画が変わること）
// - reduced-motion でリングが残らず、残秒数の数値表示へ縮退しなくなること
// - 縦3分割（ScreenLayout）に戻ること＝投影レイアウトの前提が崩れること
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { HostProjectionLayout } from './HostProjectionLayout'

/** matchMedia を差し替えて prefers-reduced-motion を切り替える（BattleAward.test.tsxと同じ手法） */
function setReducedMotion(reduce: boolean): () => void {
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  return () => {
    window.matchMedia = original
  }
}

describe('HostProjectionLayout: 外周リング', () => {
  it('残り時間の割合を stroke-dasharray（周長100基準）で描く', () => {
    render(
      <HostProjectionLayout meta="Q3 / 12" remainingSec={12} totalSec={20} action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )

    const ring = screen.getByTestId('battle-host-ring')
    expect(ring.querySelector('.battle-host-ring__fill')?.getAttribute('stroke-dasharray')).toBe(
      '60.00 100',
    )
    expect(ring.dataset.remainingSec).toBe('12')
    // 残り時間は数値でも必ず併記する（リングだけに頼らない）
    expect(screen.getByTestId('battle-host-timer').textContent).toContain('残り12秒')
  })

  it('秒未満の端数では描画が変わらない（1秒刻みの離散更新）', () => {
    const { rerender } = render(
      <HostProjectionLayout meta="Q1 / 12" remainingSec={9} totalSec={20} action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    const dashAt9 = screen
      .getByTestId('battle-host-ring')
      .querySelector('.battle-host-ring__fill')
      ?.getAttribute('stroke-dasharray')

    // 9.0秒→9.9秒相当（秒未満）では同じ値
    rerender(
      <HostProjectionLayout meta="Q1 / 12" remainingSec={9.9} totalSec={20} action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(
      screen
        .getByTestId('battle-host-ring')
        .querySelector('.battle-host-ring__fill')
        ?.getAttribute('stroke-dasharray'),
    ).toBe(dashAt9)

    // 秒が1つ減ったときだけ変わる
    rerender(
      <HostProjectionLayout meta="Q1 / 12" remainingSec={8} totalSec={20} action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(
      screen
        .getByTestId('battle-host-ring')
        .querySelector('.battle-host-ring__fill')
        ?.getAttribute('stroke-dasharray'),
    ).toBe('40.00 100')
  })

  it('残り5秒以下はリングと残秒数の両方を警告色へ切り替える（色単独に頼らない）', () => {
    render(
      <HostProjectionLayout meta="Q1 / 12" remainingSec={5} totalSec={20} action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(screen.getByTestId('battle-host-ring').dataset.low).toBe('true')
    expect(screen.getByTestId('battle-host-timer').dataset.low).toBe('true')
  })

  it('reduced-motion時はリングを描かず残秒数の数値表示のみに縮退する', () => {
    const restore = setReducedMotion(true)
    try {
      render(
        <HostProjectionLayout meta="Q3 / 12" remainingSec={12} totalSec={20} action={<span />}>
          <p>本文</p>
        </HostProjectionLayout>,
      )
      expect(screen.queryByTestId('battle-host-ring')).toBeNull()
      expect(screen.getByTestId('battle-host-timer').textContent).toContain('残り12秒')
    } finally {
      restore()
    }
  })

  it('残り時間を渡さないフェーズ（順位・リザルト）ではリングも数値も出さない', () => {
    render(
      <HostProjectionLayout meta="FINAL RESULT" action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(screen.queryByTestId('battle-host-ring')).toBeNull()
    expect(screen.queryByTestId('battle-host-timer')).toBeNull()
  })
})

describe('HostProjectionLayout: 投影レイアウトの構造', () => {
  it('縦3分割（ScreenLayout）を使わず、投影用スケールを持つ .battle-host 配下に組む', () => {
    const { container } = render(
      <HostProjectionLayout meta="Q1 / 12" action={<button type="button">次の問題へ</button>}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(container.querySelector('.screen-layout')).toBeNull()
    const stage = container.querySelector('.battle-host-stage')
    expect(stage?.classList.contains('battle-host')).toBe(true)
    // 進行ボタンは画面下端の操作帯に置く（投影本体には混ぜない）
    expect(
      container.querySelector('.battle-host-stage__foot')?.querySelector('button'),
    ).not.toBeNull()
  })
})

// T-217（Q-51）: 出題中・順位表示中はブラウザバック頼みでしか中止できず、
// ホストの瞬断1回で全参加者が切断される非対称があった。ヘッダに中止導線を出す
describe('HostProjectionLayout: 中止導線（T-217）', () => {
  it('onAbortを渡さなければ中止ボタンは出ない', () => {
    render(
      <HostProjectionLayout meta="Q1 / 12" action={<span />}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    expect(screen.queryByRole('button', { name: '中止' })).toBeNull()
  })

  it('onAbortを渡すとヘッダに中止ボタンが出て、押すと呼ばれる', () => {
    const onAbort = vi.fn()
    render(
      <HostProjectionLayout meta="Q1 / 12" action={<span />} onAbort={onAbort}>
        <p>本文</p>
      </HostProjectionLayout>,
    )
    fireEvent.click(screen.getByRole('button', { name: '中止' }))
    expect(onAbort).toHaveBeenCalledTimes(1)
  })
})
