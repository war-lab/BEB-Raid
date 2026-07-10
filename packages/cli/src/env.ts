// APIキーの読み込み（T-24。正本: docs/04 5節・docs/05 2節）。
//
// 【不変条件】LLM・TTS のAPIキーは環境変数（ローカル）と GitHub Actions Secrets
// のみに置く。コード・設定ファイル・リポジトリに含めない。
// このモジュール以外で process.env からキーを読まないこと。

/** LLM生成（T-26以降）のキー。Claude API を想定 */
export const LLM_API_KEY_ENV = 'ANTHROPIC_API_KEY'

/**
 * TTS生成（T-31）のキー。調達先は B-2（Azure Speech の個人利用可否）の確定待ちのため
 * ベンダー中立の変数名にしている。確定後に必要ならリージョン等の変数を足す
 */
export const TTS_API_KEY_ENV = 'BEB_TTS_API_KEY'

/** 環境変数からAPIキーを読む。未設定・空は null */
export function readApiKey(envName: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env[envName]
  return value && value.trim() !== '' ? value : null
}

/** APIキーを必須として読む。未設定なら設定方法の案内付きでエラー */
export function requireApiKey(envName: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = readApiKey(envName, env)
  if (key === null) {
    throw new Error(
      `環境変数 ${envName} が設定されていません。` +
        `キーはリポジトリに含めず、環境変数で渡してください（例: ${envName}=sk-... beb <command>）`,
    )
  }
  return key
}

/**
 * ログ表示用にキーを伏せる（先頭4文字のみ。キー全体は決して出力しない）。
 * 4文字以下のキーは先頭4文字を出すとキー全体が露出してしまうため、
 * 文字数のみを出す完全伏字にする（レビューフォローアップ3.8節）
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) {
    return `***（${key.length}文字）`
  }
  return `${key.slice(0, 4)}…（${key.length}文字）`
}
