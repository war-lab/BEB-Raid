import { defineConfig } from 'vitest/config'

// T-286（K-13。docs/32 3節J-126）: カバレッジ計測手段が無かった。
// 閾値は導入時点（2026-08-06）の実測値をそのまま下限として固定する。以後この値を下げない
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 82.19,
        branches: 81.77,
        functions: 100,
        lines: 83.13,
      },
    },
  },
})
