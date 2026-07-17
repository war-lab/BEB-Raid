// 'cloudflare:test'（および実行時の'cloudflare:workers'）が使うグローバル`Cloudflare.Env`を
// このWorker実際のバインディング（env.tsのEnv）で拡張する。これが無いと`cloudflare:test`の
// `env`が空のCloudflare.Envとして型付けされ、auth.ts等の関数に渡す際に型エラーになる
// （`wrangler types`の自動生成に頼らない。生成は.dev.vars=gitignore対象の有無に左右され、
// CI環境で不完全な型になりうるため、env.tsを単一の正本として手動で反映する）

import type { Env as WorkerEnv } from './env.js'

declare global {
  namespace Cloudflare {
    // 中身は空だが、グローバル名前空間へのdeclaration mergingが目的（ESLintのno-empty-object-type
    // は同名前空間へのマージを認識しないため個別に無効化する）
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Env extends WorkerEnv {}
  }
}

export {}
