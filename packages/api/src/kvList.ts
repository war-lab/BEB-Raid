// KVの全件列挙ヘルパー（正本: docs/30_改修計画_全量レビュー棚卸し.md T-244・29のQ-23）。
//
// `KV.list()` は1ページ最大1,000件しか返さず、`list_complete`がfalseなら`cursor`で
// 続きを取得する必要がある。以前は1ページ目しか読んでいなかったため、メンバー等が
// 1,000件を超えると週次のEMA更新・HP算出・ゴースト選定・サマリ集計が無言で一部の
// キーを取りこぼしていた（実測はしていないが、KVの仕様上1ページ目のみでは
// 1,000件超で必ず発生する）。本関数はcursorが尽きるまで全ページを読み切る

export async function listAllKeys(
  kv: KVNamespace,
  options: { prefix: string },
): Promise<KVNamespaceListKey<unknown>[]> {
  const keys: KVNamespaceListKey<unknown>[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await kv.list({ prefix: options.prefix, cursor })
    keys.push(...page.keys)
    if (page.list_complete) break
    cursor = page.cursor
  }
  return keys
}
