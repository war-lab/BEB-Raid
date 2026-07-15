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
  },
})
