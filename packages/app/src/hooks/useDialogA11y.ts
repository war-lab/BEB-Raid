// ダイアログ共通の最低限の作法（T-162でConfirmDialogに実装したものを、T-203で
// HomeScreenの3モーダルにも適用するために抽出したフック）。
// フォーカストラップ・Escでの取り消し・開いたときの初期フォーカス・閉じたときの
// フォーカス復帰を行う。onDismiss未指定ならEsc・背景タップでは閉じない
// （呼び出し側がbackdropのonClickで別途onDismissを渡す想定）。
//
// `enabled` は「このダイアログが現在開いているか」を渡す。呼び出し側はモーダルを
// 条件付きレンダリングせず常時マウントしたまま `enabled` で開閉を切り替えるケースが
// あるため（HomeScreenの3モーダルは同一コンポーネント内で複数のuseStateを条件分岐
// するため、hooksを条件付きで呼べない）、フック内部でenabledを見て有効/無効を切り替える
import { useEffect, type RefObject } from 'react'

export function useDialogA11y(
  dialogRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  onDismiss?: () => void,
) {
  // Escで閉じられるようにする（モーダルの最低限の作法。onDismiss未指定なら何もしない）
  useEffect(() => {
    if (!enabled || !onDismiss) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onDismiss])

  /**
   * 開いたら最初の選択肢へフォーカスを移し、閉じたら開く前の要素へ戻す。
   * Tabはダイアログ内で循環させる。
   *
   * `aria-modal` は支援技術への申告にすぎず、**操作は制限しない**。トラップが無いと
   * Tabで背景の要素へ抜けられ、確認しているはずの操作を裏で実行できてしまう
   */
  useEffect(() => {
    if (!enabled) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dialogRefは安定した参照
  }, [enabled])
}
