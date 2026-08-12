// Service Worker更新の適用をユーザー操作に限定する（T-280・K-3。正本: docs/32 3節J-118）。
//
// vite.config.tsのregisterType: 'autoUpdate'はSW側の即時activate（skipWaiting+clientsClaim）
// を意味するだけで、クライアント側でvirtual:pwa-registerのregisterSWにonNeedRefreshを渡さないと、
// vite-plugin-pwaが新版検知時にwindow.location.reload()を無条件に呼ぶ。セッション中に
// 無警告でリロードされ進行中の解答が失われていた（K-3。[18]の記述「回避した」は実装が
// 満たしていなかった）。onNeedRefreshを渡すとこの自動リロードが起こらなくなり、代わりに
// このコールバックが呼ばれるだけになるので、適用（updateSW(true)）はswUpdateStore経由で
// ユーザーが更新ボタンを押した時だけ実行する

import { useSwUpdateStore } from './swUpdateStore'

export type RegisterSWOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
}
export type RegisterSW = (options?: RegisterSWOptions) => (reloadPage?: boolean) => Promise<void>

export function registerServiceWorkerUpdates(registerSW: RegisterSW): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      useSwUpdateStore.getState().setUpdateAvailable(() => {
        void updateSW(true)
      })
    },
  })
}
