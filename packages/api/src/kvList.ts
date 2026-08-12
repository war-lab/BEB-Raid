// KVの全件列挙ヘルパー（正本: docs/30_改修計画_全量レビュー棚卸し.md T-244・29のQ-23）。
//
// `KV.list()` は1ページ最大1,000件しか返さず、`list_complete`がfalseなら`cursor`で
// 続きを取得する必要がある。以前は1ページ目しか読んでいなかったため、メンバー等が
// 1,000件を超えると週次のEMA更新・HP算出・ゴースト選定・サマリ集計が無言で一部の
// キーを取りこぼしていた（実測はしていないが、KVの仕様上1ページ目のみでは
// 1,000件超で必ず発生する）。本関数はcursorが尽きるまで全ページを読み切る

/**
 * ページ反復数の上限（T-337・K-72）。旧実装は`for (;;)`で`list_complete`だけを
 * 終了条件にしており、KV側の不具合等で`list_complete`が真にならない場合に無限ループへ
 * 陥る構造だった。1ページ最大1,000件×1,000ページ=最大100万件相当まで許容する
 * （MAX_REGISTERED_MEMBERS=500の実運用規模を大きく超える値で、正常系を妨げない）
 */
const MAX_LIST_PAGES = 1000

export async function listAllKeys(
  kv: KVNamespace,
  options: { prefix: string },
): Promise<KVNamespaceListKey<unknown>[]> {
  const keys: KVNamespaceListKey<unknown>[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await kv.list({ prefix: options.prefix, cursor })
    keys.push(...result.keys)
    if (result.list_complete) return keys
    cursor = result.cursor
  }
  throw new Error(
    `listAllKeys: ページ反復数の上限（${MAX_LIST_PAGES}）に達しました（prefix=${options.prefix}）`,
  )
}
