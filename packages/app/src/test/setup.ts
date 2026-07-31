// Vitest（jsdom）共通セットアップ。
// jsdom は matchMedia を実装しないため、最小のスタブを入れる。
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// globals 無効運用では testing-library の自動クリーンアップが効かないため明示する
afterEach(cleanup)

/**
 * testing-library の非同期ユーティリティ（waitFor・findBy*）のタイムアウトを延ばす。
 *
 * `testTimeout`（vite.config.ts で30秒）とは**別系統**で、waitFor は既定1秒で自身が
 * タイムアウトする。jsdomワーカーを並列で立てたときのCPU競合下では、実データ（Dexie＋
 * fake-indexeddb）を触る画面テストが1秒に収まらず、実行ごとに異なる数件が落ちていた
 * （2026-07-31のCI失敗・ローカルの再現。testTimeoutだけ延ばしても直らなかったのはこのため）。
 *
 * 個々のテストがこの秒数を使い切ることは想定しておらず、あくまで負荷の緩衝である。
 */
configure({ asyncUtilTimeout: 15_000 })

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}
