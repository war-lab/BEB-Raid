import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'
import { contentAssetsPlugin } from './vitePlugins/contentAssets'
import { screenshotMocksPlugin } from './vitePlugins/screenshotMocks'

// GitHub Pagesはプロジェクトページ（https://war-lab.github.io/BEB-Raid/）のためサブパス配信になる。
// ローカル開発（npm run dev）やCIのテスト実行では base='/' のままにし、
// Pagesデプロイビルドのときだけ環境変数GITHUB_PAGESでサブパスに切り替える（T-33）。
const base = process.env.GITHUB_PAGES === 'true' ? '/BEB-Raid/' : '/'

// リポジトリルートのcontent/（T-32/T-33のビルド成果物）。vite.config.tsの位置基準で
// 解決するため、npm run buildの実行時cwdに依存しない
const contentRoot = fileURLToPath(new URL('../../content', import.meta.url))

export default defineConfig({
  base,
  plugins: [
    react(),
    contentAssetsPlugin(contentRoot),
    // スクリーンショット採取用モックの注入（V-17。JV-8=案A）。プラグイン側が apply:'serve' の
    // ため vite build には入らず、モック自体もURLクエリ ?screenshotMock=1 の時だけ有効になる
    screenshotMocksPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'BEB Raid',
        short_name: 'BEB Raid',
        description: '通勤電車で英語ボスを討伐する TOEIC 学習アプリ',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait',
        // 既定テーマはダーク（J-8）。手動切替時の theme-color 更新は T-03 のテーマ切替側で行う
        theme_color: '#0E1220',
        background_color: '#0E1220',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // アプリシェルのみ precache する。問題パック・音声のキャッシュは
        // SW から分離した PackCache 層（T-04/T-35）が担う（05の7節: ネイティブ化時の差し替え点）。
        // splash.webp は起動スプラッシュ背景（docs/20 V-8）で、オフライン起動でも表示する
        // ため明示的に precache に含める（25KB。og-image.jpg は precache 対象外のまま）
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'splash.webp'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // T-286（K-13。docs/32 3節J-126）: 閾値は導入時点（2026-08-06）の実測値をそのまま
    // 下限として固定する。以後この値を下げない
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 91.4,
        branches: 87.42,
        functions: 88.74,
        lines: 93.19,
      },
    },
    /**
     * 既定の5000msでは、jsdomワーカーを並列で立てたときのCPU競合で実行ごとに異なる2〜4件が
     * タイムアウトしていた（2026-07-31に検出。無関係な画面のテストが入れ替わりで落ちる形）。
     * テストの論理ではなく実行環境の負荷が原因で、`--no-file-parallelism` を付けると
     * 全件パスするが1回10分以上かかる。並列のまま30秒へ延ばすと88秒で全件パスする。
     * 個々のテストがこの秒数を使い切ることは想定しておらず、あくまで負荷の緩衝である
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
