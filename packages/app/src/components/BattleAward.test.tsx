// V-10 表彰（表彰台・ベストグロース賞・段階開示）のテスト。防ぐもの:
// - 表彰台の三重符号化（順位数字・台の高さを決める data-rank・色）が落ちること
// - 段階開示が3位→2位→1位→ベストグロース賞の順序を外れること
// - reduced-motion で段階開示・カウントアップが動き、情報が一時的に欠落すること
// - 演出の総時間が07の9節の報酬演出（600〜900ms）から外れること
// - 開示を待たずに全体を見る手段（「すべて表示」）が失われること
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { AWARD_TOTAL_MS, BattleAward } from './BattleAward'

const ENTRIES = [
  { displayName: 'テスト1', totalPoints: 1240 },
  { displayName: 'テスト2', totalPoints: 1080 },
  { displayName: 'テスト3', totalPoints: 960 },
  { displayName: 'テスト4', totalPoints: 820 },
]

/** matchMedia を差し替えて prefers-reduced-motion を切り替える */
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

function places(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.battle-award__place'))
}

/** 表彰台のN番目（0始まり）。存在しなければテストを落とす */
function place(index: number): HTMLElement {
  const el = places()[index]
  if (!el) throw new Error(`表彰台の${index}番目が存在しない`)
  return el
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BattleAward: 表彰台の三重符号化', () => {
  it('上位3名だけを表彰台に載せ、順位数字・data-rank・順位の読み上げを持つ', () => {
    const restore = setReducedMotion(true)
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName="テスト4"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      const rows = places()
      expect(rows).toHaveLength(3)
      // data-rank が台の高さと色の両方を決める（CSS側）。数字と読み上げはDOMで担保する
      expect(rows.map((r) => r.dataset.rank)).toEqual(['1', '2', '3'])
      expect(place(0).textContent).toContain('1')
      expect(place(0).textContent).toContain('1位')
      expect(place(0).textContent).toContain('テスト1')
      // 4位は表彰台に出さない（順位表側の fromRank={4} が描く）
      expect(screen.queryByText('テスト4', { exact: false, selector: '.battle-award__name' })).toBe(
        null,
      )
    } finally {
      restore()
    }
  })

  it('自分が上位3名に入るときだけYOUを付ける', () => {
    const restore = setReducedMotion(true)
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName={null}
          selfDisplayName="テスト2"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      expect(place(1).textContent).toContain('YOU')
      expect(place(0).textContent).not.toContain('YOU')
    } finally {
      restore()
    }
  })

  it('ベストグロース賞は順位表と独立した枠で、順位表の行に混ざらない', () => {
    const restore = setReducedMotion(true)
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName="テスト4"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      const card = screen.getByTestId('battle-best-growth')
      expect(card.className).toContain('battle-award__growth')
      expect(card.textContent).toContain('テスト4')
      // 表彰台の中にも順位表の行の中にも入っていない
      expect(card.closest('.battle-award__podium')).toBe(null)
      expect(card.closest('.standings__row')).toBe(null)
    } finally {
      restore()
    }
  })
})

describe('BattleAward: reduced-motion時の代替表示', () => {
  it('段階開示・カウントアップを行わず最初から全表彰・全得点を静止表示する', () => {
    const restore = setReducedMotion(true)
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName="テスト4"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      // waitForを使わず即座に確認する（＝タイマーもrAFも介在しない静止表示の証明）
      expect(places().map((r) => r.dataset.revealed)).toEqual(['true', 'true', 'true'])
      expect(screen.getByTestId('battle-best-growth').dataset.revealed).toBe('true')
      expect(place(0).textContent).toContain('1,240点')
      expect(place(1).textContent).toContain('1,080点')
      expect(place(2).textContent).toContain('960点')
      // 静止表示ではスキップの導線そのものが不要
      expect(screen.queryByTestId('battle-award-skip')).toBe(null)
    } finally {
      restore()
    }
  })
})

describe('BattleAward: 段階開示', () => {
  it('3位→2位→1位→ベストグロース賞の順に開示し、演出時間は600〜900msに収まる', () => {
    const restore = setReducedMotion(false)
    vi.useFakeTimers()
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName="テスト4"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      // 07の9節の報酬演出の範囲（600〜900ms）
      expect(AWARD_TOTAL_MS).toBeGreaterThanOrEqual(600)
      expect(AWARD_TOTAL_MS).toBeLessThanOrEqual(900)

      const revealed = () => places().map((r) => r.dataset.revealed)
      // 最初は3位のみ
      expect(revealed()).toEqual(['false', 'false', 'true'])
      expect(screen.getByTestId('battle-best-growth').dataset.revealed).toBe('false')

      act(() => void vi.advanceTimersByTime(250))
      expect(revealed()).toEqual(['false', 'true', 'true'])

      act(() => void vi.advanceTimersByTime(250))
      expect(revealed()).toEqual(['true', 'true', 'true'])
      expect(screen.getByTestId('battle-best-growth').dataset.revealed).toBe('false')

      act(() => void vi.advanceTimersByTime(250))
      // 開示完了後は全順位・全表彰が残る（開示は情報を消さない）
      expect(revealed()).toEqual(['true', 'true', 'true'])
      expect(screen.getByTestId('battle-best-growth').dataset.revealed).toBe('true')
      expect(screen.queryByTestId('battle-award-skip')).toBe(null)
    } finally {
      restore()
    }
  })

  it('「すべて表示」で開示を打ち切り、全順位・全得点が即座に出る', () => {
    const restore = setReducedMotion(false)
    try {
      render(
        <BattleAward
          entries={ENTRIES}
          bestGrowthName="テスト4"
          bestGrowthTestId="battle-best-growth"
        />,
      )
      fireEvent.click(screen.getByTestId('battle-award-skip'))
      expect(places().map((r) => r.dataset.revealed)).toEqual(['true', 'true', 'true'])
      expect(screen.getByTestId('battle-best-growth').dataset.revealed).toBe('true')
      expect(place(0).textContent).toContain('1,240点')
    } finally {
      restore()
    }
  })
})
