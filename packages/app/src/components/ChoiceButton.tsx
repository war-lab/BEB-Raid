// 選択肢ボタン A–D（docs/07 6節）
// - --surface地＋--line枠、左端に丸囲みの選択肢記号
// - 状態: 通常 / 正解（--ok枠＋✓）/ 誤答（--ng枠＋✕）/ 減光（他選択肢）
// - 正誤表示時もレイアウトを動かさない: 枠は常に同じ太さで色だけ変え、
//   右端のアイコン枠は常時確保しておく（色＋アイコンの二重符号化。07 原則4）
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ChoiceState = 'idle' | 'correct' | 'wrong' | 'dimmed'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 選択肢記号（A/B/C/D） */
  marker: string
  /** 選択肢本文 */
  children: ReactNode
  state?: ChoiceState
}

const STATE_ICON: Record<ChoiceState, string> = {
  idle: '',
  correct: '✓',
  wrong: '✕',
  dimmed: '',
}

export function ChoiceButton({ marker, children, state = 'idle', className, ...rest }: Props) {
  const icon = STATE_ICON[state]
  return (
    <button
      type="button"
      className={`choice-button is-${state} ${className ?? ''}`}
      data-state={state}
      {...rest}
    >
      <span className="choice-button__marker" aria-hidden="true">
        {marker}
      </span>
      <span className="choice-button__label">{children}</span>
      {/* アイコン枠は常時確保（状態変化でレイアウトを動かさないため） */}
      <span className="choice-button__icon" aria-hidden={icon === ''}>
        {icon}
      </span>
      {/* スクリーンリーダー向けの状態読み上げ（色に依存しない） */}
      {state === 'correct' && <span className="visually-hidden">（正解）</span>}
      {state === 'wrong' && <span className="visually-hidden">（誤答）</span>}
    </button>
  )
}
