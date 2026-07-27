// T-56 完了条件のテスト（正本: docs/13 3.7節、02の8節、05の5節）:
// - キー未設定・オフライン・401/429エラーの各状態表示
// - 質問→回答→追加質問（履歴がaskに渡ること）
// - 画面遷移（アンマウント）で履歴が破棄される
// T-101完了条件のテスト（正本: docs/17 3.8節）:
// - 未登録・オフライン・API無効の各状態でボタンが出ない/disabledになる
// - 報告送信→成功で再報告ボタンが無効化される、失敗時はエラーメッセージのみ
import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'

import { BebRaidDatabase } from '../db/database'
import { AiClientError, type RaidApi } from '../platform'
import type { AiAskContext, AiChatTurn, AiClient } from '../platform'
import { RAID_REGISTERED_AT_KEY } from '../services/settingsKeys'
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

class FakeRaidApi implements RaidApi {
  constructor(private readonly configured = true) {}
  isConfigured = () => this.configured
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => {
    throw new Error('not used in this test')
  })
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
}

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`explanation-card-test-${++seq}`)
  dbs.push(db)
  return db
}

async function registeredDb(): Promise<BebRaidDatabase> {
  const db = newDb()
  await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: 1000 })
  return db
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

afterEach(async () => {
  setOnline(true)
  vi.restoreAllMocks()
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
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
    // レビューF4(c): 存在しない「悪問メモ」ではなく、実在する報告導線へ案内する
    expect(
      screen.getByText(
        'AI回答は未レビュー。矛盾に気づいたら「問題がおかしい」から報告してください',
      ),
    ).toBeTruthy()
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

describe('ExplanationCard: 「問題がおかしい」報告の表示条件（T-101）', () => {
  it('raidApi未注入なら表示しない', async () => {
    const db = await registeredDb()
    render(<ExplanationCard question={question()} isCorrect={true} db={db} />)
    expect(screen.queryByText('問題がおかしい')).toBeNull()
  })

  it('raidApi.isConfigured()=falseなら表示しない', async () => {
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(false)
    render(<ExplanationCard question={question()} isCorrect={true} raidApi={raidApi} db={db} />)
    expect(screen.queryByText('問題がおかしい')).toBeNull()
  })

  it('db未注入（登録状態不明）なら表示しない', () => {
    const raidApi = new FakeRaidApi(true)
    render(<ExplanationCard question={question()} isCorrect={true} raidApi={raidApi} />)
    expect(screen.queryByText('問題がおかしい')).toBeNull()
  })

  it('未登録（raidRegisteredAt未設定）なら表示しない', async () => {
    const db = newDb()
    const raidApi = new FakeRaidApi(true)
    render(<ExplanationCard question={question()} isCorrect={true} raidApi={raidApi} db={db} />)
    // 登録状態照会（db.settings.get）の完了を待ってから「出ない」ことを確認する
    await db.settings.get(RAID_REGISTERED_AT_KEY)
    expect(screen.queryByText('問題がおかしい')).toBeNull()
  })

  it('isConfigured=true かつ登録済みなら表示する', async () => {
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(true)
    render(<ExplanationCard question={question()} isCorrect={true} raidApi={raidApi} db={db} />)
    expect(await screen.findByText('問題がおかしい')).toBeTruthy()
  })

  it('オフライン時はdisabledになる', async () => {
    setOnline(false)
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(true)
    render(<ExplanationCard question={question()} isCorrect={true} raidApi={raidApi} db={db} />)
    const button = (await screen.findByText('問題がおかしい')) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })
})

describe('ExplanationCard: 「問題がおかしい」報告の送信（T-101）', () => {
  it('理由選択→送信でsendReportが呼ばれ、成功後は「報告しました」に変わる', async () => {
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(true)
    render(
      <ExplanationCard
        question={question({ id: 'q-42' })}
        isCorrect={false}
        raidApi={raidApi}
        db={db}
      />,
    )

    fireEvent.click(await screen.findByText('問題がおかしい'))
    // レビューF4(b): 理由ボタン群の上に問いかけの1行が出る
    expect(screen.getByText('どこがおかしいですか？')).toBeTruthy()
    fireEvent.click(screen.getByText('英文が不自然'))

    await screen.findByText('報告しました')
    expect(raidApi.sendReport).toHaveBeenCalledWith({ questionId: 'q-42', reason: 'unnatural' })
    expect(screen.queryByText('英文が不自然')).toBeNull()
  })

  it('理由ラベルは「正解が間違っている/英文が不自然/解説が間違っている」の3種（レビューF4(b)）', async () => {
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(true)
    render(<ExplanationCard question={question()} isCorrect={false} raidApi={raidApi} db={db} />)

    fireEvent.click(await screen.findByText('問題がおかしい'))

    expect(screen.getByText('正解が間違っている')).toBeTruthy()
    expect(screen.getByText('英文が不自然')).toBeTruthy()
    expect(screen.getByText('解説が間違っている')).toBeTruthy()
    // 曖昧だった旧ラベルが残っていない
    expect(screen.queryByText('誤答扱い')).toBeNull()
  })

  it('送信失敗時はエラーメッセージを表示し、再報告ボタンは無効化されない', async () => {
    const db = await registeredDb()
    const raidApi = new FakeRaidApi(true)
    raidApi.sendReport.mockRejectedValueOnce(new Error('network error'))
    render(<ExplanationCard question={question()} isCorrect={false} raidApi={raidApi} db={db} />)

    fireEvent.click(await screen.findByText('問題がおかしい'))
    fireEvent.click(screen.getByText('正解が間違っている'))

    // レビューF4(d): 対処（通信環境の確認）まで含めた文言にする
    expect(
      await screen.findByText('送信できませんでした。通信環境を確認して再度お試しください'),
    ).toBeTruthy()
    expect(screen.queryByText('報告しました')).toBeNull()
    expect(screen.getByText('正解が間違っている')).toBeTruthy()
  })
})
