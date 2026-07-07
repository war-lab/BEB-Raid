// 初回起動時のホーム画面追加推奨導線（docs/05 3節: iOSストレージ退避対策の一部）。
// - standalone 表示（=追加済み）なら出さない
// - iOS Safari は beforeinstallprompt が無いため手順の案内文を出す
// - それ以外（Android Chrome 等）は beforeinstallprompt を捕捉してボタンで prompt() を呼ぶ
// 見た目はデザイントークン（T-03）確定後に整える前提の最小実装。

import { useEffect, useState } from 'react'

/** 非表示フラグの保存キー（UI状態のみなので localStorage。学習データは置かない） */
const DISMISS_KEY = 'beb.installHintDismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari 独自プロパティ
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

export function InstallHint() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (dismissed || isStandalone()) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <aside role="note" className="install-hint">
      <p>
        ホーム画面に追加すると、オフラインでもすぐ起動でき、学習データが消えにくくなります。
        {isIos() && '共有ボタン → 「ホーム画面に追加」で追加できます。'}
      </p>
      {installEvent && (
        <button type="button" onClick={() => void installEvent.prompt()}>
          ホーム画面に追加
        </button>
      )}
      <button type="button" onClick={dismiss}>
        閉じる
      </button>
    </aside>
  )
}
