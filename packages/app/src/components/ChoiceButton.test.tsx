import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CHOICE_SHAPE_MARKERS, ChoiceButton, type ChoiceState } from './ChoiceButton'

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

// V-12（docs/25 4.4節・JV-7=案B）。防ぐもの:
// - ソロ学習の選択肢が記号A–Dから形に変わること（TOEIC本試験との一致を崩さない）
// - 形マーカーが読み上げ対象になり、選択肢記号が支援技術に伝わらなくなること
describe('ChoiceButton: 形マーカー（イベントバトル専用。docs/25 4.4節）', () => {
  it('既定（markerVariant省略）は記号表示のままで、形マーカー用の属性を持たない', () => {
    render(
      <ChoiceButton marker="A" state="idle">
        選択肢テキスト
      </ChoiceButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn.querySelector('.choice-button__marker')?.textContent).toBe('A')
    expect(btn.getAttribute('data-marker-variant')).toBeNull()
    expect(btn.getAttribute('data-choice-key')).toBeNull()
    // 記号が見えているので読み上げ用の補いは付けない（アクセシブル名は本文のみ）
    expect(btn.textContent).toBe('A選択肢テキスト')
  })

  it("markerVariant='shape' はA–Dを▲■●◆に置き換え、記号はvisually-hiddenで伝える", () => {
    for (const [key, shape] of Object.entries(CHOICE_SHAPE_MARKERS)) {
      const { container, unmount } = render(
        <ChoiceButton marker={key} markerVariant="shape">
          選択肢テキスト
        </ChoiceButton>,
      )
      const btn = container.querySelector('button')
      const markerEl = btn?.querySelector('.choice-button__marker')
      expect(markerEl?.textContent).toBe(shape)
      // 形は装飾。色分けのフックとしてキーをDOMに残す
      expect(markerEl?.getAttribute('aria-hidden')).toBe('true')
      expect(btn?.getAttribute('data-choice-key')).toBe(key)
      expect(btn?.getAttribute('data-marker-variant')).toBe('shape')
      // 支援技術には選択肢記号と本文が伝わる
      expect(btn?.querySelector('.visually-hidden')?.textContent).toBe(`選択肢${key}`)
      unmount()
    }
  })

  it("markerVariant='shape' でも対応表に無いキーは記号表示に落とす", () => {
    render(
      <ChoiceButton marker="E" markerVariant="shape">
        選択肢テキスト
      </ChoiceButton>,
    )
    const btn = screen.getByRole('button')
    expect(btn.querySelector('.choice-button__marker')?.textContent).toBe('E')
    expect(btn.getAttribute('data-marker-variant')).toBeNull()
  })
})
