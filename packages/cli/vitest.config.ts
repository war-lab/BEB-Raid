import { fileURLToPath } from 'node:url'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // T-287（K-14）: 消費側がpackage.jsonのexports経由でdistを見るため、
    // shared-schemaを変更してもビルドし直さない限りテストが古いコードを見ていた
    alias: {
      '@beb-raid/shared-schema': fileURLToPath(
        new URL('../shared-schema/src/index.ts', import.meta.url),
      ),
    },
  },
})
