import react from '@vitejs/plugin-react'
// vitest の test 設定を型付きで書くため vitest/config を使う（vite の defineConfig と互換）
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
