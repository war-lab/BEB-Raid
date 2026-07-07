// 問題パック・音声キャッシュの抽象インターフェース（docs/05 7節）。
// Service Worker の precache（アプリシェル用）とは意図的に分離する:
// Capacitor 移行時に WKWebView の SW 制約に当たっても、この層だけを
// Filesystem 実装等に差し替えられるようにするため。
// 更新検知・自動ピン留めなどの運用ロジックは T-35（配信・キャッシュ統合）で実装する。

/** キャッシュ使用量の概算 */
export interface CacheUsage {
  /** キャッシュ済みバイト数（概算） */
  bytes: number
  /** キャッシュ済みエントリ数 */
  entries: number
}

export interface PackCache {
  /** URL がキャッシュ済みか */
  has(url: string): Promise<boolean>

  /** キャッシュから取得する（未キャッシュなら null。ネットワークへはフォールバックしない） */
  get(url: string): Promise<Blob | null>

  /**
   * URL群を取得してキャッシュに固定する（パックのピン留めダウンロード）。
   * 1件でも失敗したら例外を投げる（パック単位の整合性を守る。部分キャッシュを残すかは実装依存）。
   */
  addAll(urls: string[]): Promise<void>

  /** 指定URL群をキャッシュから削除する */
  delete(urls: string[]): Promise<void>

  /** キャッシュ済みURL一覧 */
  keys(): Promise<string[]>

  /** 使用量（設定画面のキャッシュ使用量表示 T-23 で使う） */
  usage(): Promise<CacheUsage>

  /** 全消去（設定画面の手動削除用。IndexedDB の学習データには一切触れない） */
  clear(): Promise<void>
}
