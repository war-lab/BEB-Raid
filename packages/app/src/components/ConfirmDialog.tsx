// 確認ダイアログ（T-162。docs/27 のS-6・S-7・S-38）。
//
// window.confirm を置き換えるために作った。理由は2つある。
// (1) PWAでネイティブダイアログが出ると文脈が切れる。
// (2) Yes/Noの2択しか表現できないため、「続きから再開する」のような第3の選択肢を
//     その場で出せず、ホームへ戻って別のボタンを探させることになっていた。
//
// 演出は置かない（07の原則3。確認は判断の場であって演出の場ではない）。
import { useEffect, useRef } from 'react'

export interface ConfirmAction {
  label: string
  /** 主要な選択肢（PrimaryButton相当の見た目にする）。1つだけ指定する想定 */
  primary?: boolean
  onSelect: () => void
}

interface Props {
  /** 何を確認しているか（1行） */
  message: string
  /** 選択肢。取り消し（何もしない）も含めて呼び出し側が全部渡す */
  actions: ConfirmAction[]
  /** 背景タップ・Escでの取り消し。渡さない場合は選択肢からしか閉じられない */
  onDismiss?: () => void
}

export function ConfirmDialog({ message, actions, onDismiss }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Escで閉じられるようにする（モーダルの最低限の作法。onDismiss未指定なら何もしない）
  useEffect(() => {
    if (!onDismiss) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  /**
   * 開いたら最初の選択肢へフォーカスを移し、閉じたら開く前の要素へ戻す。
   * Tabはダイアログ内で循環させる（レビュー指摘、2026-08-03）。
   *
   * `aria-modal` は支援技術への申告にすぎず、**操作は制限しない**。トラップが無いと
   * Tabで背景の「中断」や選択肢へ抜けられ、確認しているはずの操作を裏で実行できてしまう。
   * 背景をinert化する手もあるが、この画面はダイアログをオーバーレイとして各画面の中に
   * 直接置く構成（ポータルを使わない）なので、対象の親を特定せずに済むトラップを採る
   */
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])].filter(
        (el) => !el.disabled,
      )
    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      // 端からの移動、およびダイアログ外にフォーカスがある場合を内側へ引き戻す
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      // 閉じた後にフォーカスが body へ落ちると、キーボード操作の位置を見失う
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [])

  return (
    <div
      className="confirm-overlay"
      // 背景クリックでの取り消し。ダイアログ本体のクリックは伝播で拾わない
      onClick={onDismiss ? () => onDismiss() : undefined}
      data-testid="confirm-overlay"
    >
      <div
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={message}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? 'confirm-dialog__primary' : 'secondary-action'}
              onClick={action.onSelect}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
