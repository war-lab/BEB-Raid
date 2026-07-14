// T-43（C-3改訂）完了条件のテスト:
// - AiClient フェイクを使った型レベルの疎通テスト
// - isConfigured の実装（ask()本体はT-56で実装、ここでは未実装エラーの確認のみ）
import { describe, expect, it } from 'vitest'

import type { AiAskContext, AiClient } from './AiClient'
import { AnthropicAiClient } from './AnthropicAiClient'
import { createAiClient } from '../index'

const context: AiAskContext = {
  question: 'Where should I submit the report?',
  choices: ['To the portal.', 'By Friday.'],
  answer: 'To the portal.',
  explanation: 'Where への応答は場所。',
}

describe('AiClient: 型レベルの疎通（フェイク実装）', () => {
  it('AiClient インターフェースを満たすフェイクを注入して呼び出せる', async () => {
    const fake: AiClient = {
      isConfigured: async () => true,
      ask: async (_ctx, question) => `フェイク回答: ${question}`,
    }
    expect(await fake.isConfigured()).toBe(true)
    expect(await fake.ask(context, 'なぜBは違う?', [])).toBe('フェイク回答: なぜBは違う?')
  })
})

describe('AnthropicAiClient.isConfigured', () => {
  it('APIキーが空でなければ true', async () => {
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx')
    expect(await client.isConfigured()).toBe(true)
  })

  it('APIキーが null なら false', async () => {
    const client = new AnthropicAiClient(async () => null)
    expect(await client.isConfigured()).toBe(false)
  })

  it('APIキーが空白のみなら false', async () => {
    const client = new AnthropicAiClient(async () => '   ')
    expect(await client.isConfigured()).toBe(false)
  })
})

describe('AnthropicAiClient.ask（本実装はT-56。ここでは骨格のみ確認）', () => {
  it('現時点では未実装エラーを返す', async () => {
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx')
    await expect(client.ask(context, 'なぜBは違う?', [])).rejects.toThrow(/未実装/)
  })
})

describe('createAiClient factory（platform/index.ts配線）', () => {
  it('AiClient を実装したインスタンスを返す', async () => {
    const client = createAiClient(async () => 'sk-ant-xxxx')
    expect(await client.isConfigured()).toBe(true)
  })
})
