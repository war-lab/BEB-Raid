import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'

// GitHub Pagesはプロジェクトページ（https://war-lab.github.io/BEB-Raid/）のためサブパス配信になる。
// ローカル開発（npm run dev）やCIのテスト実行では base='/' のままにし、
// Pagesデプロイビルドのときだけ環境変数GITHUB_PAGESでサブパスに切り替える（T-33）。
const base = process.env.GITHUB_PAGES === 'true' ? '/BEB-Raid/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
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
        // SW から分離した PackCache 層（T-04/T-35）が担う（05の7節: ネイティブ化時の差し替え点）
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
