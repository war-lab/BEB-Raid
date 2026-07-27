// 画面遷移ストア（T-16。docs/10 3.1節: ルーターレス）。
// react-router 等は導入せず、この判別unionの screen 状態を App.tsx が読んで
// 画面コンポーネントを切り替える。
//
// T-114（docs/18 3.5節・J-55）: ブラウザ履歴との最小統合。navigate() は
// history.pushState を積んでから screen を更新する。popstate（ブラウザバック・
// Androidの戻るジェスチャー）はApp.tsx側のリスナーが navigateFromPopState を呼ぶ
// （history操作を伴わない＝pushState→popstate→pushStateの無限ループを防ぐ）。
// ルーターライブラリは導入しない（13の2節の見送り事項を維持）。

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
  | 'reading'
  | 'battle'

interface AppStore {
  screen: ScreenName
  /** 通常の画面遷移。history.pushStateを積む */
  navigate: (screen: ScreenName) => void
  /** popstate由来の遷移専用（App.tsxのpopstateリスナーから呼ぶ）。pushStateは積まない */
  navigateFromPopState: (screen: ScreenName) => void
}

export const useAppStore = create<AppStore>((set) => ({
  screen: 'home',
  navigate: (screen) => {
    window.history.pushState({ screen }, '')
    set({ screen })
  },
  navigateFromPopState: (screen) => set({ screen }),
}))
