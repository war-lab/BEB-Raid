// 新版検知時の更新案内（T-280・K-3。正本: docs/32 3節J-118）。
// 適用（updateSW(true)＝リロード）はこのボタンを押したユーザー操作時のみ実行される。
// InstallHintと同じ「ホームに置く控えめな案内」パターン

import { useSwUpdateStore } from './swUpdateStore'

export function UpdateHint() {
  const updateAvailable = useSwUpdateStore((s) => s.updateAvailable)
  const applyUpdate = useSwUpdateStore((s) => s.applyUpdate)

  if (!updateAvailable) return null

  return (
    <aside role="note" className="update-hint">
      <p>新しいバージョンがあります。</p>
      <button type="button" onClick={() => applyUpdate?.()}>
        更新する
      </button>
    </aside>
  )
}
