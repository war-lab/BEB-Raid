// スクリーンショット採取用モックの注入プラグイン（V-17。正本: docs/25 6節V-17・JV-8=案A）。
//
// App.tsx の `./platform` の解決先を devMocks/screenshotPlatform.ts へ差し替えるだけの
// プラグイン。アプリ実装（packages/app/src）には手を入れない。
//
// **本番ビルドに入らないことの担保**: `apply: 'serve'` により vite build のプラグイン
// チェーンには一切入らない（差し替えが起きないため、devMocks/ は production の依存グラフに
// 到達不能になる）。加えてモック自体がURLクエリ `?screenshotMock=1` でのみ有効になる
// （devMocks/screenshotPlatform.ts 冒頭のコメント参照）。
//
// 差し替え対象を「App.tsx からの `./platform`」1件に限定しているのは、
// src 配下の他ファイルが import する `../platform` を巻き込まないため
// （factory を呼ぶのは App.tsx だけなので、これで足りる）。

import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const MOCK_MODULE = fileURLToPath(new URL('../devMocks/screenshotPlatform.ts', import.meta.url))

export function screenshotMocksPlugin(): Plugin {
  return {
    name: 'beb-screenshot-mocks',
    apply: 'serve',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source !== './platform' || !importer) return null
      // パス区切りはOS差があるため正規化して比較する
      if (!importer.replace(/\\/g, '/').endsWith('/src/App.tsx')) return null
      return MOCK_MODULE
    },
  }
}
