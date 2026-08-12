// 保存失敗の原因判別（T-299・K-25。正本: docs/31 K-25、docs/32 T-299）。
//
// 従来はDrillScreen/VocabScreen/ReadingScreenのいずれも保存失敗を一律
// 「空き容量を確認してください」で表示していたが、原因を確認していないため
// 実際に容量不足（QuotaExceededError）で失敗している場合に、確認を促すだけで
// 具体的な回復手段（エクスポート）を示せていなかった。
//
// IndexedDBの容量超過はDOMException（name==='QuotaExceededError'）で、
// Dexieもラップ後も.nameを保持する（https://dexie.org/docs/DexieErrors/Dexie.QuotaExceededError）

/**
 * QuotaExceededError（容量不足）専用の保存失敗文言。DrillScreen・ReadingScreenで共有する
 * （JSX側はこの文字列との一致でエクスポート導線の表示を判定する。saveErrorとは別のstateを
 * 持って両者を同期させる必要をなくすため）
 */
export const QUOTA_EXCEEDED_SAVE_ERROR =
  '端末のストレージ容量が不足しています。データをエクスポートして空き容量を確保してください'

export function isQuotaExceededError(err: unknown): boolean {
  // DOMExceptionはNode/jsdomでError extendsではない実装があるため、
  // Errorのinstanceof判定ではなくnameプロパティの有無で見る
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'QuotaExceededError'
  )
}
