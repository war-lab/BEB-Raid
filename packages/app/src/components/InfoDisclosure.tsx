// T-210（Q-39・J-107）: タップで開閉できる説明。
//
// SRS間隔の意味・頻出度ランクの定義・「当て勘」「速度不足」の定義が、いずれも
// title属性（hoverでしか読めない）だけで提供されていた。主シナリオは通勤中の
// スマートフォン利用のため、タッチ端末では説明に一切到達できない不具合だった（Q-39）。
//
// J-107の判断: 該当箇所にその場で開閉できる説明を置く。別画面（用語集）は作らない
// （別画面へ飛ばすと学習の流れが切れるため）。title属性はデスクトップでの併用として
// 残してよく、本コンポーネントも呼び出し側から渡されたぶんはそのままボタンに乗せる。
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

interface Props extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'type' | 'onClick' | 'children'
> {
  /** トリガーボタンの見た目ラベル（ランク文字・「間隔について」等） */
  label: ReactNode
  /** 開いたときに表示する説明本文 */
  children: ReactNode
}

export function InfoDisclosure({ label, children, className, ...rest }: Props) {
  const [open, setOpen] = useState(false)
  const triggerClassName = className
    ? `info-disclosure-trigger ${className}`
    : 'info-disclosure-trigger'
  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        {...rest}
      >
        {label}
      </button>
      {open && <div className="info-disclosure__body">{children}</div>}
    </>
  )
}
