// 問題パックJSONスキーマの共有定義（正本: docs/04_データ設計.md 2節）。
// 実スキーマ・バリデータの実装は T-05。ここでは app / cli が型を共有できる
// 配線の確認用に、確定済みの定数と最小の型のみを置く。

/** 問題パックJSONのスキーマ世代（docs/04 の schemaVersion 2 を採用） */
export const SCHEMA_VERSION = 2 as const

/** パック識別子（manifest.json の id と一致させる） */
export type PackId = string

/**
 * 問題パックのメタ情報（最小形）。
 * license / origin はコンテンツ出所の不変条件（CLAUDE.md）により必須。
 * フィールドの拡充は T-05 で行う。
 */
export interface PackMeta {
  id: PackId
  schemaVersion: typeof SCHEMA_VERSION
  title: string
  license: string
  origin: string
}
