// V-9完了条件のテスト（docs/25 4.1節・6.3節）:
// - 順位が数字バッジ（形）＋色の二重符号化になっている（色は data-rank でCSS側が当てる）
// - 得点バーが1位基準の相対長で、得点の数値が必ず併記される
// - 自分の行（YOU）は参加者画面でのみ有効。表示名が重複する場合は誤検出しない
// - 得点にディスプレイ書体＋tabular-nums（.display-num）が効いている
// - V-10の表彰要素を載せるための拡張点（fromRank・children・renderRowAccessory）が働く
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StandingsList } from './StandingsList'

const ENTRIES = [
  { displayName: 'アルファ', totalPoints: 1240 },
  { displayName: 'ブラボー', totalPoints: 620 },
  { displayName: 'チャーリー', totalPoints: 310 },
  { displayName: 'デルタ', totalPoints: 0 },
]

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll('.standings__row'))
}

describe('StandingsList', () => {
  it('順位を数字バッジで示し、1〜3位だけ色の識別（data-rank）を持つ', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    const list = rows(container)
    expect(list.map((li) => li.querySelector('.standings__badge')!.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ])
    // 色（data-rank）は1〜3位のみ。数字バッジは全行にあるためグレースケールでも順位が読める
    expect(list.map((li) => li.getAttribute('data-rank'))).toEqual(['1', '2', '3', null])
  })

  it('順位はスクリーンリーダーにも「N位」として伝わる（バッジ自体は装飾扱い）', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    expect(container.querySelector('.standings__badge')!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('1位')).toBeTruthy()
  })

  it('得点バーは1位基準の相対長で、得点の数値も必ず併記される', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    const fills = Array.from(container.querySelectorAll<HTMLElement>('.standings__bar-fill'))
    expect(fills.map((el) => el.style.width)).toEqual(['100%', '50%', '25%', '0%'])
    expect(container.querySelector('.standings__bar')!.getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('1,240点')).toBeTruthy()
    expect(screen.getByText('0点')).toBeTruthy()
  })

  it('得点にディスプレイ書体＋tabular-numsのクラスが付く', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    for (const el of container.querySelectorAll('.standings__points')) {
      expect(el.classList.contains('display-num')).toBe(true)
    }
  })

  it('参加者画面では自分の行にYOUと左罫線の目印（data-self）が付く', () => {
    const { container } = render(<StandingsList entries={ENTRIES} selfDisplayName="チャーリー" />)
    expect(rows(container).map((li) => li.getAttribute('data-self'))).toEqual([
      null,
      null,
      'true',
      null,
    ])
    expect(screen.getByText('YOU')).toBeTruthy()
  })

  it('ホスト画面（selfDisplayName未指定）ではYOUの行を作らない', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    expect(container.querySelector('[data-self]')).toBeNull()
    expect(screen.queryByText('YOU')).toBeNull()
  })

  it('同名の参加者がいる場合は誤った行にYOUを付けない', () => {
    const duplicated = [
      { displayName: 'アルファ', totalPoints: 500 },
      { displayName: 'アルファ', totalPoints: 300 },
    ]
    const { container } = render(<StandingsList entries={duplicated} selfDisplayName="アルファ" />)
    expect(container.querySelector('[data-self]')).toBeNull()
  })

  it('英字ラベルを差し替えられる（途中順位と最終リザルトで同じコンポーネントを使う）', () => {
    const { rerender } = render(<StandingsList entries={ENTRIES} />)
    expect(screen.getByText('STANDINGS')).toBeTruthy()
    rerender(<StandingsList entries={ENTRIES} label="FINAL RESULT" />)
    expect(screen.getByText('FINAL RESULT')).toBeTruthy()
  })

  // T-265: サーバーはロスター基準で常に全参加者を返すため、瞬断中・離脱済みでも一覧からは
  // 消えない。StandingsList側はconnected:falseの行を「消す」のではなく「薄くして区別する」
  it('connected:falseの行は一覧からは消えず、data-connectedとバッジで在席状態を示す', () => {
    const withDisconnected = [
      { displayName: 'アルファ', totalPoints: 1240, connected: true },
      { displayName: 'ブラボー', totalPoints: 620, connected: false },
    ]
    const { container } = render(<StandingsList entries={withDisconnected} />)
    const list = rows(container)
    expect(list).toHaveLength(2)
    expect(list.map((li) => li.getAttribute('data-connected'))).toEqual([null, 'false'])
    expect(screen.getByText('通信切断中')).toBeTruthy()
  })

  it('connectedを省略した場合は接続中扱いになる（既存呼び出し元との後方互換）', () => {
    const { container } = render(<StandingsList entries={ENTRIES} />)
    expect(container.querySelector('[data-connected]')).toBeNull()
    expect(screen.queryByText('通信切断中')).toBeNull()
  })

  it('V-10の拡張点: fromRankで下位だけを描画しても、バーの基準は全体の1位のまま', () => {
    const { container } = render(
      <StandingsList
        entries={ENTRIES}
        fromRank={2}
        renderRowAccessory={(entry, rank) => (
          <span className="accessory">{`${rank}:${entry.displayName}`}</span>
        )}
      >
        {/* 表彰台（V-10）をラベルとリストの間に差し込むスロット */}
        <p data-testid="podium-slot">表彰台</p>
      </StandingsList>,
    )
    const list = rows(container)
    expect(list.map((li) => li.querySelector('.standings__badge')!.textContent)).toEqual([
      '2',
      '3',
      '4',
    ])
    // 1位（1240点）を基準にした相対長のまま（切り出しても基準は変わらない）
    expect(container.querySelector<HTMLElement>('.standings__bar-fill')!.style.width).toBe('50%')
    expect(container.querySelector('ol.standings__list')!.getAttribute('start')).toBe('2')
    expect(screen.getByTestId('podium-slot')).toBeTruthy()
    expect(container.querySelector('.accessory')!.textContent).toBe('2:ブラボー')
  })
})
