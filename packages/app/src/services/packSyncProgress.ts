// パック同期（音声ダウンロード）の進捗を画面へ届ける小さなストア（T-321。正本: docs/32 ウェーブ5 T-321行）。
//
// packSync.ts は onAudioProgress コールバックを既に持っていたが、どこからも渡されておらず
// 進捗が画面に出ていなかった（完了条件「進捗が見えること」が未達だった）。
// 同期は起動直後のバックグラウンド処理で、画面の生存期間とは無関係に進むため、
// Reactの状態ではなくモジュールスコープの1件のストアに置き、画面側が購読する。

export interface PackSyncProgress {
  packId: string
  completed: number
  total: number
}

let current: PackSyncProgress | null = null
const listeners = new Set<(p: PackSyncProgress | null) => void>()

/** 現在の進捗（同期していなければ null） */
export function getPackSyncProgress(): PackSyncProgress | null {
  return current
}

/** 進捗の更新を購読する。戻り値を呼ぶと購読を解除する */
export function subscribePackSyncProgress(
  listener: (progress: PackSyncProgress | null) => void,
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** syncPacks の onAudioProgress から呼ぶ */
export function setPackSyncProgress(progress: PackSyncProgress | null): void {
  current = progress
  for (const listener of listeners) listener(current)
}

/** 同期の完了時に呼ぶ（進捗表示を消す） */
export function clearPackSyncProgress(): void {
  setPackSyncProgress(null)
}
