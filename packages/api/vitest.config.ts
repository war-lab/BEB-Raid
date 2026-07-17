import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'

// @cloudflare/vitest-pool-workers 0.18系はVitest4のプラグイン方式に対応
// （旧`defineWorkersProject`/`poolOptions.workers`は廃止。同梱のcodemodで確認済み）。
// INVITE_CODEはwrangler.tomlに書かない秘密値のため（本番は`wrangler secret`・ローカルは
// `.dev.vars`=gitignore対象）、テスト実行専用のダミー値をここでminiflare.bindingsとして
// 注入する（CIには.dev.varsが存在しないため、これが無いとテストが決定的に動かない）
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        bindings: { INVITE_CODE: 'test-invite-code' },
      },
    }),
  ],
})
