// @cloudflare/vitest-pool-workers の'cloudflare:test'型（SELF/env等）を有効化する。
// パッケージのexportsが"./types"サブパスのみ提供するため（compilerOptions.typesでは
// 解決できない）、トリプルスラッシュ参照でこのプロジェクトに取り込む
/// <reference types="@cloudflare/vitest-pool-workers/types" />
