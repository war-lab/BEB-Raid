// Service Worker更新の適用状態（T-280・K-3。正本: docs/32 3節J-118）。
// onNeedRefresh検知からユーザーが「更新する」を押すまでの間の状態を保持する。
// main.tsx（registerServiceWorkerUpdates経由）がsetUpdateAvailableを呼び、
// UpdateHintコンポーネントがこれを読んでボタンを出す

import { create } from 'zustand'

interface SwUpdateStore {
  updateAvailable: boolean
  applyUpdate: (() => void) | null
  setUpdateAvailable: (apply: () => void) => void
  /** テスト専用: 状態リセット（ストアはモジュールスコープでシングルトンのため） */
  resetForTest: () => void
}

export const useSwUpdateStore = create<SwUpdateStore>((set) => ({
  updateAvailable: false,
  applyUpdate: null,
  setUpdateAvailable: (apply) => set({ updateAvailable: true, applyUpdate: apply }),
  resetForTest: () => set({ updateAvailable: false, applyUpdate: null }),
}))
