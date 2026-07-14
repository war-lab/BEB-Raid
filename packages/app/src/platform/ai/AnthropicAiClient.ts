// BYOK AI解説の本実装骨格（M2・T-43=C-3改訂）。
// 正本: docs/05 5節、docs/13 3.7節。
// 【このタスク（T-43）の範囲】isConfigured のみ実装し、ask() は T-56 で実装する
// （fetch本体・エラー種別・モデル定数の確定は「AIに聞く」UI実装時にまとめて行う）。
// ここでは AiClient の具象クラスとしての骨格・型・factory配線のみを確定させる。

import type { AiAskContext, AiChatTurn, AiClient } from './AiClient'

/**
 * APIキーの取得手段（settings ストアの読み出しは呼び出し元=App.tsx が担い、
 * このクラスは db に直接依存しない。PackCache 注入と同じ疎結合パターン）
 */
export type ApiKeyProvider = () => Promise<string | null>

/**
 * 既定のBYOKモデルID。T-56実装時に claude-api スキル等で最新の安価モデルIDを
 * 確認して更新する（13の3.7節）。設定（byokModel）で上書き可能
 */
export const DEFAULT_BYOK_MODEL = 'claude-haiku-4-5-20251001'

export class AnthropicAiClient implements AiClient {
  constructor(
    private readonly getApiKey: ApiKeyProvider,
    private readonly model: string = DEFAULT_BYOK_MODEL,
  ) {}

  async isConfigured(): Promise<boolean> {
    const key = await this.getApiKey()
    return typeof key === 'string' && key.trim() !== ''
  }

  ask(
    context: AiAskContext,
    userQuestion: string,
    history: readonly AiChatTurn[],
  ): Promise<string> {
    void context
    void userQuestion
    void history
    // fetch実装本体はT-56で追加する（3.7節のとおりAnthropic APIを直接fetchで呼ぶ）
    return Promise.reject(new Error('AnthropicAiClient.ask は未実装（T-56で実装予定。13の3.7節）'))
  }
}
