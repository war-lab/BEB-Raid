import { fileURLToPath } from 'node:url'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'

// T-286（K-13。docs/32 3節J-126）: カバレッジ計測手段が無かった。
// 閾値は導入時点（2026-08-06）の実測値をそのまま下限として固定する。以後この値を下げない
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 92.67,
        branches: 83.72,
        functions: 93.16,
        lines: 93.35,
      },
    },
    // T-287（K-14）: 消費側がpackage.jsonのexports経由でdistを見るため、
    // shared-schemaを変更してもビルドし直さない限りテストが古いコードを見ていた
    alias: {
      '@beb-raid/shared-schema': fileURLToPath(
        new URL('../shared-schema/src/index.ts', import.meta.url),
      ),
    },
  },
})
