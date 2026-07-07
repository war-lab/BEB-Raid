// Vitest（jsdom）共通セットアップ。
// jsdom は matchMedia を実装しないため、最小のスタブを入れる。
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// globals 無効運用では testing-library の自動クリーンアップが効かないため明示する
afterEach(cleanup)

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
