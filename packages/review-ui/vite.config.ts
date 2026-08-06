import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'
import { draftsServerPlugin } from './src/server/draftsServerPlugin'

// リポジトリルートのcontent/（generateコマンドが出力するドラフトJSONLの置き場=content/drafts/）。
// vite.config.tsの位置基準で解決するため、npm run devの実行時cwdに依存しない
const contentRoot = fileURLToPath(new URL('../../content', import.meta.url))

export default defineConfig({
  plugins: [react(), draftsServerPlugin(contentRoot)],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // T-287（K-14）: 消費側がpackage.jsonのexports経由でdistを見るため、
    // shared-schemaを変更してもビルドし直さない限りテストが古いコードを見ていた
    alias: {
      '@beb-raid/shared-schema': fileURLToPath(
        new URL('../shared-schema/src/index.ts', import.meta.url),
      ),
    },
    // 【フレーク対策・2026-08-05】ルートの `npm test` は全ワークスペースを並列で回すため、
    // 他パッケージ（特にworkerdを多数起動するapi）と負荷を奪い合う。App.test.tsx の
    // findByText が既定タイムアウト（5秒）に間に合わず、フルスイートでのみ不定に落ちる
    // 事象が観測された（単独実行では4回連続で全pass）。アサーションは変えずに余裕を持たせる
    testTimeout: 20000,
  },
})
