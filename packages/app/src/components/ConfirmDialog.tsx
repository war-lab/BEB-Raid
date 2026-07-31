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

  // 開いたら最初の選択肢へフォーカスを移す（キーボード・支援技術で迷子にならないように）
  useEffect(() => {
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
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
