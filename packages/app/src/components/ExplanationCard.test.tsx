// T-56 完了条件のテスト（正本: docs/13 3.7節、02の8節、05の5節）:
// - キー未設定・オフライン・401/429エラーの各状態表示
// - 質問→回答→追加質問（履歴がaskに渡ること）
// - 画面遷移（アンマウント）で履歴が破棄される
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'

import { AiClientError } from '../platform'
import type { AiAskContext, AiChatTurn, AiClient } from '../platform'
import { ExplanationCard } from './ExplanationCard'

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q-1',
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: 'Please ___ the report.',
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: '事前生成解説',
    translation: '和訳',
    ...overrides,
  }
}

class FakeAiClient implements AiClient {
  configured = true
  askImpl: (context: AiAskContext, q: string, history: readonly AiChatTurn[]) => Promise<string> =
    async (_ctx, q) => `回答: ${q}`
  askCalls: Array<{ context: AiAskContext; question: string; history: readonly AiChatTurn[] }> = []

  async isConfigured(): Promise<boolean> {
    return this.configured
  }
  async ask(
    context: AiAskContext,
    userQuestion: string,
    history: readonly AiChatTurn[],
  ): Promise<string> {
    this.askCalls.push({ context, question: userQuestion, history })
    return this.askImpl(context, userQuestion, history)
  }
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

afterEach(() => {
  setOnline(true)
  vi.restoreAllMocks()
})

describe('ExplanationCard: 「AIに聞く」の表示条件', () => {
  it('aiClient未注入なら「AIに聞く」を表示しない', () => {
    render(<ExplanationCard question={question()} isCorrect={true} />)
    expect(screen.queryByText('AIに聞く')).toBeNull()
  })

  it('BYOK未設定（isConfigured=false）なら「AIに聞く」を表示しない', async () => {
    const client = new FakeAiClient()
    client.configured = false
    render(<ExplanationCard question={question()} isCorrect={true} aiClient={client} />)
    await vi.waitFor(() => expect(client.isConfigured).toBeTruthy())
    expect(screen.queryByText('AIに聞く')).toBeNull()
  })

  it('BYOK設定済みなら「AIに聞く」を表示する', async () => {
    const client = new FakeAiClient()
    render(<ExplanationCard question={question()} isCorrect={true} aiClient={client} />)
    expect(await screen.findByText('AIに聞く')).toBeTruthy()
  })

  it('オフライン時は「AIに聞く」がdisabledになる', async () => {
    setOnline(false)
    const client = new FakeAiClient()
    render(<ExplanationCard question={question()} isCorrect={true} aiClient={client} />)
    const button = (await screen.findByText('AIに聞く')) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

describe('ExplanationCard: 質問→回答→追加質問', () => {
  it('質問を送信すると回答が表示され、未レビュー注記が出る', async () => {
    const client = new FakeAiClient()
    render(<ExplanationCard question={question()} isCorrect={false} aiClient={client} />)

    fireEvent.click(await screen.findByText('AIに聞く'))
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: 'なぜBは違う?' } })
    fireEvent.click(screen.getByText('送信'))

    expect(await screen.findByText('回答: なぜBは違う?')).toBeTruthy()
    expect(screen.getByText('AI回答は未レビュー。事前生成解説と矛盾したら悪問メモへ')).toBeTruthy()
    expect(client.askCalls[0]?.question).toBe('なぜBは違う?')
    expect(client.askCalls[0]?.history).toEqual([])
    expect(client.askCalls[0]?.context.answer).toBe('A')
  })

  it('追加質問時はこれまでの履歴がaskへ渡る', async () => {
    const client = new FakeAiClient()
    render(<ExplanationCard question={question()} isCorrect={false} aiClient={client} />)

    fireEvent.click(await screen.findByText('AIに聞く'))
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: '1回目の質問' } })
    fireEvent.click(screen.getByText('送信'))
    await screen.findByText('回答: 1回目の質問')

    fireEvent.change(screen.getByLabelText('質問'), { target: { value: '2回目の質問' } })
    fireEvent.click(screen.getByText('送信'))
    await screen.findByText('回答: 2回目の質問')

    expect(client.askCalls[1]?.history).toEqual([
      { role: 'user', text: '1回目の質問' },
      { role: 'assistant', text: '回答: 1回目の質問' },
    ])
  })
})

describe('ExplanationCard: エラー表示', () => {
  it('401エラーはメッセージを表示し、「再試行」ボタンに変わる', async () => {
    const client = new FakeAiClient()
    client.askImpl = async () => {
      throw new AiClientError('unauthorized', 'APIキーが正しくありません（401）')
    }
    render(<ExplanationCard question={question()} isCorrect={false} aiClient={client} />)

    fireEvent.click(await screen.findByText('AIに聞く'))
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: 'なぜ?' } })
    fireEvent.click(screen.getByText('送信'))

    expect(await screen.findByText('APIキーが正しくありません（401）')).toBeTruthy()
    expect(screen.getByText('再試行')).toBeTruthy()
  })

  it('429エラーはレート制限メッセージを表示する', async () => {
    const client = new FakeAiClient()
    client.askImpl = async () => {
      throw new AiClientError(
        'rate_limited',
        'レート制限中です（429）。しばらくして再試行してください',
      )
    }
    render(<ExplanationCard question={question()} isCorrect={false} aiClient={client} />)

    fireEvent.click(await screen.findByText('AIに聞く'))
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: 'なぜ?' } })
    fireEvent.click(screen.getByText('送信'))

    expect(
      await screen.findByText('レート制限中です（429）。しばらくして再試行してください'),
    ).toBeTruthy()
  })
})

describe('ExplanationCard: 履歴の破棄（J-14）', () => {
  it('アンマウント後に再マウントすると履歴が残っていない（画面遷移で破棄）', async () => {
    const client = new FakeAiClient()
    const { unmount } = render(
      <ExplanationCard question={question()} isCorrect={false} aiClient={client} />,
    )
    fireEvent.click(await screen.findByText('AIに聞く'))
    fireEvent.change(screen.getByLabelText('質問'), { target: { value: 'なぜ?' } })
    fireEvent.click(screen.getByText('送信'))
    await screen.findByText('回答: なぜ?')

    unmount()

    render(<ExplanationCard question={question()} isCorrect={false} aiClient={client} />)
    expect(await screen.findByText('AIに聞く')).toBeTruthy()
    expect(screen.queryByText('回答: なぜ?')).toBeNull()
  })
})
