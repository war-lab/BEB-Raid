// ルートErrorBoundary（レビューF7）。render中の未捕捉例外が即白画面になり、
// PWAスタンドアロン起動ではブラウザのリロードUIも無く復帰導線がゼロだったため、
// フォールバックUI（「問題が発生しました」＋再読み込みボタン）を出す。
// ErrorBoundaryはReactの仕様上クラスコンポーネントでのみ実装できる
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** テスト差し替え用（既定はページ全体の再読み込み） */
  reload?: () => void
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 原因追跡用にコンソールへ残す（UIには詳細を出さない）
    console.error('[ErrorBoundary] render中に未捕捉の例外', error, info)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const reload = this.props.reload ?? (() => window.location.reload())
    return (
      <div className="error-boundary" role="alert">
        <p>問題が発生しました</p>
        <button type="button" className="primary-button" onClick={reload}>
          再読み込み
        </button>
      </div>
    )
  }
}
