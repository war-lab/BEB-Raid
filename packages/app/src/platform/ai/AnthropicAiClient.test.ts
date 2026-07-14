// T-43（C-3改訂）完了条件のテスト:
// - AiClient フェイクを使った型レベルの疎通テスト
// - isConfigured の実装
// T-56 完了条件のテスト（正本: docs/13 3.7節）:
// - モックfetchでの質問→回答→追加質問（送信ボディにコンテキスト・履歴・ヘッダが入ること）
// - 401/429/その他エラー・タイムアウト・通信エラーの種別判定
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiAskContext, AiChatTurn, AiClient } from './AiClient'
import { AiClientError, AnthropicAiClient, DEFAULT_BYOK_MODEL } from './AnthropicAiClient'
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

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

function textResponse(text: string): Response {
  return fakeResponse({ content: [{ type: 'text', text }] })
}

/** typeof fetch と同じ引数型のモックを作る（.mock.calls[0]!の要素型を保つため） */
function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnthropicAiClient.ask（T-56本実装。正本: docs/13 3.7節）', () => {
  it('正しいURL・ヘッダ（x-api-key/anthropic-version/dangerous-direct-browser-access）・コンテキストを含むsystemプロンプトでfetchする', async () => {
    const fetchMock = mockFetch(async () =>
      textResponse('Bは場所ではなく時間を答えているからです。'),
    )
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const answer = await client.ask(context, 'なぜBは違う?', [])

    expect(answer).toBe('Bは場所ではなく時間を答えているからです。')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = init!.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-xxxx')
    expect(headers['anthropic-version']).toBeTruthy()
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')

    const body = JSON.parse(init!.body as string) as {
      model: string
      system: string
      messages: Array<{ role: string; content: string }>
    }
    expect(body.model).toBe(DEFAULT_BYOK_MODEL)
    expect(body.system).toContain(context.question)
    expect(body.system).toContain(context.answer)
    expect(body.system).toContain(context.explanation)
    expect(body.messages).toEqual([{ role: 'user', content: 'なぜBは違う?' }])
  })

  it('追加質問時は、これまでの対話履歴をmessagesに含めて送る', async () => {
    const fetchMock = mockFetch(async () => textResponse('2回目の回答'))
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)
    const history: AiChatTurn[] = [
      { role: 'user', text: '1回目の質問' },
      { role: 'assistant', text: '1回目の回答' },
    ]

    await client.ask(context, '2回目の質問', history)

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse(init!.body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(body.messages).toEqual([
      { role: 'user', content: '1回目の質問' },
      { role: 'assistant', content: '1回目の回答' },
      { role: 'user', content: '2回目の質問' },
    ])
  })

  it('APIキー未設定なら fetch せず unauthorized エラー', async () => {
    const fetchMock = vi.fn()
    const client = new AnthropicAiClient(async () => null, DEFAULT_BYOK_MODEL, fetchMock)

    await expect(client.ask(context, 'なぜ?', [])).rejects.toMatchObject({
      kind: 'unauthorized',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401はunauthorizedとして分類される', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 401))
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const error = await client.ask(context, 'なぜ?', []).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AiClientError)
    expect((error as AiClientError).kind).toBe('unauthorized')
  })

  it('429はrate_limitedとして分類される', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 429))
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const error = await client.ask(context, 'なぜ?', []).catch((e: unknown) => e)
    expect((error as AiClientError).kind).toBe('rate_limited')
  })

  it('その他のHTTPエラー（500等）はunknownとして分類される', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 500))
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const error = await client.ask(context, 'なぜ?', []).catch((e: unknown) => e)
    expect((error as AiClientError).kind).toBe('unknown')
  })

  it('fetch自体が失敗（通信エラー）した場合はnetworkとして分類される', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const error = await client.ask(context, 'なぜ?', []).catch((e: unknown) => e)
    expect((error as AiClientError).kind).toBe('network')
  })

  it('AbortSignal.timeout由来のTimeoutErrorはtimeoutとして分類される', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    const client = new AnthropicAiClient(async () => 'sk-ant-xxxx', DEFAULT_BYOK_MODEL, fetchMock)

    const error = await client.ask(context, 'なぜ?', []).catch((e: unknown) => e)
    expect((error as AiClientError).kind).toBe('timeout')
  })
})

describe('createAiClient factory（platform/index.ts配線）', () => {
  it('AiClient を実装したインスタンスを返す', async () => {
    const client = createAiClient(async () => 'sk-ant-xxxx')
    expect(await client.isConfigured()).toBe(true)
  })
})
