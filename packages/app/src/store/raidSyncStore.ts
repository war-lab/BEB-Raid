// レイド同期状態ストア（T-103。正本: docs/18_改修計画_表示更新とUX残課題.md 3.1節）。
//
// バックグラウンド同期（syncRaidDamage）の完了を画面へ通知する仕組み。旧
// services/raidSync.ts のモジュールスコープフラグ（isLastRaidSyncFailed 等）は
// レンダーに影響を与えず「同期完了→表示更新」を実現できなかったため、このストアへ
// 移設して廃止した。画面側は syncCount を購読し、useEffect の依存に加えることで
// 同期完了時にDB再読込のトリガーとして使う（3.1節: Dexieのライブクエリは導入しない）。

import { create } from 'zustand'

interface RaidSyncStore {
  /** 同期試行が完了するたびに+1（成否問わず）。画面のuseEffect依存に使う再読込トリガー */
  syncCount: number
  /** 直近の同期試行が失敗したか（種別を問わない）。「最終同期」表示の強調に使う */
  lastFailed: boolean
  /** 直近の同期試行が401（未登録/失効deviceToken）だったか */
  lastUnauthorized: boolean
  /** 同期成功時に呼ぶ */
  recordSuccess: () => void
  /** 同期失敗時に呼ぶ（unauthorizedはRaidApiError kind==='unauthorized'のときtrue） */
  recordFailure: (unauthorized: boolean) => void
}

export const useRaidSyncStore = create<RaidSyncStore>((set) => ({
  syncCount: 0,
  lastFailed: false,
  lastUnauthorized: false,
  recordSuccess: () =>
    set((state) => ({
      syncCount: state.syncCount + 1,
      lastFailed: false,
      lastUnauthorized: false,
    })),
  recordFailure: (unauthorized) =>
    set((state) => ({
      syncCount: state.syncCount + 1,
      lastFailed: true,
      lastUnauthorized: unauthorized,
    })),
}))

/** テスト専用: ストアを初期状態にリセットする（テスト間の状態漏れ防止） */
export function resetRaidSyncStoreForTest(): void {
  useRaidSyncStore.setState({ syncCount: 0, lastFailed: false, lastUnauthorized: false })
}
