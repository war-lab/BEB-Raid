// 主ボタン（docs/07 6節: --gold地＋濃色文字・高さ56px・全幅。1画面に1つ）
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({ children, className, ...rest }: Props) {
  return (
    <button type="button" className={`primary-button ${className ?? ''}`} {...rest}>
      {children}
    </button>
  )
}
