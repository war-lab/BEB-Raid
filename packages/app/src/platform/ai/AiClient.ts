// BYOKオンデマンドAI質問の抽象インターフェース（M2・T-43。正本: docs/05 5節、docs/13 3.7節）。
// UI・エンジンコードは fetch を直接呼ばず、必ずこのインターフェース経由で使う
// （platform/index.ts の factory 経由。ESLintの直接WebAPI禁止と同じ運用方針）。
// 本実装（AnthropicAiClient。Anthropic APIをブラウザから直接fetchで呼ぶ）はT-56で追加する。
// このタスク（T-43）ではIF定義とテスト用フェイクのみを提供する。

/** 「AIに聞く」の対話コンテキスト（対象問題の情報。プロンプトに埋め込む） */
export interface AiAskContext {
  question: string
  choices: string[]
  answer: string
  explanation: string
}

/** 対話履歴の1ターン（画面遷移で破棄=永続化しない。J-14） */
export interface AiChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AiClient {
  /** BYOK APIキーが設定済みか（未設定なら「AIに聞く」UI自体を出さない） */
  isConfigured(): Promise<boolean>

  /**
   * 対象問題のコンテキスト＋ユーザーの質問＋これまでの対話履歴を渡し、AIの回答を得る。
   * 通信エラー・レート制限等は呼び出し元で catch し、UI側でエラー種別を表示する
   */
  ask(context: AiAskContext, userQuestion: string, history: readonly AiChatTurn[]): Promise<string>
}
