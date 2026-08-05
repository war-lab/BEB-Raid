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
        // ADMIN_TOKEN も同じ理由でダミー値を注入する（POST /admin/raid/generate。
        // 未設定時に404を返す挙動のテストは、テスト内で env.ADMIN_TOKEN を消して確認する）
        bindings: { INVITE_CODE: 'test-invite-code', ADMIN_TOKEN: 'test-admin-token' },
      },
    }),
  ],
  test: {
    // 【T-247〜T-253統合後のフレーク対策・2026-08-05】@cloudflare/vitest-pool-workersは
    // テストファイルごとに別々のworkerd（simulated Workers runtime）インスタンスを立ち上げ、
    // ストレージ（KV・Durable Object）をファイル単位で自動的に隔離する。ファイルを並列実行
    // すると、workerdインスタンスが同時に多数起動してCPU・メモリを奪い合い、個々のテストが
    // 既定のtestTimeout（5秒）を超えてタイムアウトする——ルートの`npm test`（全ファイル）では
    // 失敗するが、ファイル単独やテスト数の少ない実行では再現しないという形で観測された
    // （PR #148マージ後のdevで発覚。5件が実行順・並列度に応じて不定に失敗した）。
    // maxWorkersを1に絞ってファイルを順次実行することでこの競合を避ける。
    // `--no-isolate`ではないため、ファイル単位のストレージ隔離自体は維持される
    maxWorkers: 1,
    // 上記に加え、CI等の低スペック環境でも個々の重い操作（DO/KVの往復を伴うシードや
    // 複数回のgenerateWeeklyBoss呼び出し）が既定の5秒に収まらない場合の安全マージンとして
    // 引き上げる（縮退ではなく、実行環境の差を吸収するための余裕）
    testTimeout: 20000,
  },
})
