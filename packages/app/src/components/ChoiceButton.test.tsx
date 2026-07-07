import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceButton, type ChoiceState } from './ChoiceButton'

function renderChoice(state: ChoiceState) {
  return render(
    <ChoiceButton marker="A" state={state}>
      選択肢テキスト
    </ChoiceButton>,
  )
}

describe('ChoiceButton（07の6節: 4状態・二重符号化・レイアウト不動）', () => {
  it('正解状態: --ok系クラス＋✓アイコン（色とアイコンの二重符号化）', () => {
    renderChoice('correct')
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('is-correct')
    expect(btn.querySelector('.choice-button__icon')?.textContent).toBe('✓')
    expect(screen.getByText('（正解）')).toBeTruthy()
  })

  it('誤答状態: --ng系クラス＋✕アイコン', () => {
    renderChoice('wrong')
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('is-wrong')
    expect(btn.querySelector('.choice-button__icon')?.textContent).toBe('✕')
    expect(screen.getByText('（誤答）')).toBeTruthy()
  })

  it('減光状態: is-dimmed クラスが付き、アイコンは空', () => {
    renderChoice('dimmed')
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('is-dimmed')
    expect(btn.querySelector('.choice-button__icon')?.textContent).toBe('')
  })

  it('通常状態でもアイコン枠のDOM要素が存在する（状態変化でレイアウトが動かない前提）', () => {
    renderChoice('idle')
    const icon = screen.getByRole('button').querySelector('.choice-button__icon')
    expect(icon).not.toBeNull()
    // 空のときは支援技術から隠す
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('全状態で DOM 構造（子要素の並び）が同一', () => {
    const structures = (['idle', 'correct', 'wrong', 'dimmed'] as const).map((state) => {
      const { container, unmount } = renderChoice(state)
      const classes = Array.from(container.querySelector('button')?.children ?? []).map(
        (el) => el.className,
      )
      unmount()
      return classes.filter((c) => c !== 'visually-hidden').join('|')
    })
    expect(new Set(structures).size).toBe(1)
  })
})
