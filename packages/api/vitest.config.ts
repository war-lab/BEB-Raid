import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// @cloudflare/vitest-pool-workers 0.18系はVitest4のプラグイン方式に対応
// （旧`defineWorkersProject`/`poolOptions.workers`は廃止。同梱のcodemodで確認済み）
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.toml' } })],
})
