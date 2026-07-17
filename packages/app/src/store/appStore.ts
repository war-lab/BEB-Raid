// 画面遷移ストア（T-16。docs/10 3.1節: ルーターレス）。
// react-router 等は導入せず、この判別unionの screen 状態を App.tsx が読んで
// 画面コンポーネントを切り替える。ブラウザ履歴連携（戻るボタン）はM2で検討する。

import { create } from 'zustand'

export type ScreenName =
  | 'home'
  | 'drill'
  | 'vocab'
  | 'shadowing'
  | 'dashboard'
  | 'settings'
  | 'diagnostic'
  | 'result'
  | 'raid'

interface AppStore {
  screen: ScreenName
  navigate: (screen: ScreenName) => void
}

export const useAppStore = create<AppStore>((set) => ({
  screen: 'home',
  navigate: (screen) => set({ screen }),
}))
