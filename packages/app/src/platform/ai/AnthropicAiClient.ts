// BYOK AI解説の本実装（M2・T-43=C-3改訂の骨格 → T-56で ask() を本実装）。
// 正本: docs/05 5節、docs/13 3.7節。
// fetch で https://api.anthropic.com/v1/messages を直接呼ぶ（SDK追加なし。
// anthropic-dangerous-direct-browser-access ヘッダでCORS直接アクセスにオプトイン）。
// UI・エンジンコードはこのクラスを直接newせず、platform/index.ts の createAiClient
// 経由で使うこと（抽象化レイヤ。ネイティブ移行時の差し替え点=05の7節）。

import type { AiAskContext, AiChatTurn, AiClient } from './AiClient'

/**
 * APIキーの取得手段（settings ストアの読み出しは呼び出し元=App.tsx が担い、
 * このクラスは db に直接依存しない。PackCache 注入と同じ疎結合パターン）
 */
export type ApiKeyProvider = () => Promise<string | null>

/**
 * 既定のBYOKモデルID。claude-api スキル等で確認した最新の安価モデルID
 * （T-43着手時点。13の3.7節）。設定（byokModel）で上級者が上書き可能
 */
export const DEFAULT_BYOK_MODEL = 'claude-haiku-4-5-20251001'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const MAX_TOKENS = 1024
/** タイムアウト（3.7節・T-56完了条件） */
const REQUEST_TIMEOUT_MS = 30_000

/** エラー種別（UI側で401/429/その他を出し分ける=T-56完了条件） */
export type AiErrorKind = 'unauthorized' | 'rate_limited' | 'network' | 'timeout' | 'unknown'

export class AiClientError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'AiClientError'
  }
}

/** fetch実装の差し替え口（テスト用。既定はグローバルfetch） */
export type FetchLike = typeof fetch

function systemPromptFor(context: AiAskContext): string {
  return [
    'あなたはTOEIC学習者向けの解説アシスタントです。以下の問題について、学習者からの追加質問に日本語で簡潔に答えてください。',
    `問題: ${context.question}`,
    `選択肢: ${context.choices.join(' / ')}`,
    `正解: ${context.answer}`,
    `事前生成された解説: ${context.explanation}`,
  ].join('\n')
}

export class AnthropicAiClient implements AiClient {
  constructor(
    private readonly getApiKey: ApiKeyProvider,
    private readonly model: string = DEFAULT_BYOK_MODEL,
    private readonly fetchImpl: FetchLike = (...args) => fetch(...args),
  ) {}

  async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey()
    return typeof key === 'string' && key.trim() !== ''
  }

  async ask(
    context: AiAskContext,
    userQuestion: string,
    history: readonly AiChatTurn[],
  ): Promise<string> {
    const apiKey = await this.getApiKey()
    if (!apiKey || apiKey.trim() === '') {
      throw new AiClientError('unauthorized', 'APIキーが設定されていません')
    }

    const messages = [
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: 'user' as const, content: userQuestion },
    ]

    let res: Response
    try {
      res = await this.fetchImpl(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_TOKENS,
          system: systemPromptFor(context),
          messages,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      // AbortSignal.timeout() が発火した場合、fetch は signal.reason（TimeoutError）で reject する
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new AiClientError('timeout', '応答がタイムアウトしました（30秒）。再試行してください')
      }
      throw new AiClientError('network', '通信エラーが発生しました。再試行してください')
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new AiClientError('unauthorized', 'APIキーが正しくありません（401）')
      }
      if (res.status === 429) {
        throw new AiClientError(
          'rate_limited',
          'レート制限中です（429）。しばらくして再試行してください',
        )
      }
      throw new AiClientError('unknown', `AI応答の取得に失敗しました（${res.status}）`)
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> }
    const text = data.content?.find((block) => block.type === 'text')?.text
    if (!text) {
      throw new AiClientError('unknown', 'AI応答の形式が不正でした')
    }
    return text
  }
}
