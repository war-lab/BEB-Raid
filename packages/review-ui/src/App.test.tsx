// T-57 完了条件のテスト（UI層。正本: docs/13 3.9節）:
// - ドラフト読込→採用/破棄→accepted.jsonl/rejected.jsonl相当の書出パラメータが1サイクルで通る
// - 破棄は理由必須
// - shared-schemaバリデーション結果がインライン表示される
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedItemDraft } from '@beb-raid/cli/review'
import { App } from './App'
import * as api from './api'

function vocabDraft(id: string): GeneratedItemDraft {
  return {
    id,
    kind: 'vocab_card',
    preview: `${id} preview`,
    payload: {
      id,
      part: 0,
      format: 'vocab_card',
      difficulty: 1,
      tags: [],
      keyVocab: [],
      front: 'submit',
      phrase: 'Please submit the report.',
      phraseAudio: 'audio/vocab/submit.mp3',
      back: '提出する',
      freqRank: 'S',
      levelBand: 600,
    },
  }
}

function part5Draft(id: string, answer = 'A'): GeneratedItemDraft {
  return {
    id,
    kind: 'text_blank',
    preview: `${id} preview`,
    payload: {
      id,
      part: 5,
      format: 'text_blank',
      difficulty: 2,
      tags: ['品詞'],
      keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
      question: 'Please ___ the report.',
      choices: [
        { key: 'A', text: 'submit' },
        { key: 'B', text: 'submits' },
      ],
      answer,
      explanation: '解説',
      translation: '和訳',
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App: 1サイクル（読込→採用/破棄→書出）', () => {
  it('採用のみで書き出すと、acceptedにpayloadが、rejectedは空で送信される', async () => {
    vi.spyOn(api, 'fetchDraftFiles').mockResolvedValue(['vocab.jsonl'])
    vi.spyOn(api, 'fetchDrafts').mockResolvedValue([vocabDraft('v-1'), vocabDraft('v-2')])
    const submitSpy = vi.spyOn(api, 'submitReview').mockResolvedValue({
      acceptedPath: 'a.jsonl',
      rejectedPath: 'r.jsonl',
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('vocab.jsonl')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('ドラフトファイル'), {
      target: { value: 'vocab.jsonl' },
    })

    expect(await screen.findByText('id: v-1 / kind: vocab_card / status: pending')).toBeTruthy()
    fireEvent.click(screen.getByText('採用'))

    expect(await screen.findByText('id: v-2 / kind: vocab_card / status: pending')).toBeTruthy()
    fireEvent.click(screen.getByText('採用'))

    await waitFor(() =>
      expect((screen.getByText('書き出す') as HTMLButtonElement).disabled).toBe(false),
    )
    fireEvent.click(screen.getByText('書き出す'))

    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    const [filename, accepted, rejected] = submitSpy.mock.calls[0]!
    expect(filename).toBe('vocab.jsonl')
    expect(accepted).toHaveLength(2)
    expect(rejected).toEqual([])
    expect(await screen.findByText(/書き出しました/)).toBeTruthy()
  })

  it('編集した内容（修正）がそのまま採用されて送信される', async () => {
    vi.spyOn(api, 'fetchDraftFiles').mockResolvedValue(['vocab.jsonl'])
    vi.spyOn(api, 'fetchDrafts').mockResolvedValue([vocabDraft('v-1')])
    const submitSpy = vi.spyOn(api, 'submitReview').mockResolvedValue({
      acceptedPath: 'a.jsonl',
      rejectedPath: 'r.jsonl',
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('vocab.jsonl')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('ドラフトファイル'), {
      target: { value: 'vocab.jsonl' },
    })
    await screen.findByText('id: v-1 / kind: vocab_card / status: pending')

    fireEvent.change(screen.getByDisplayValue('Please submit the report.'), {
      target: { value: 'Please submit the report by Friday.' },
    })
    fireEvent.click(screen.getByText('採用'))
    fireEvent.click(screen.getByText('書き出す'))

    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    const [, accepted] = submitSpy.mock.calls[0]!
    expect((accepted[0] as { phrase: string }).phrase).toBe('Please submit the report by Friday.')
  })

  it('破棄は理由が空だと押せず、理由を入れると破棄される', async () => {
    vi.spyOn(api, 'fetchDraftFiles').mockResolvedValue(['vocab.jsonl'])
    vi.spyOn(api, 'fetchDrafts').mockResolvedValue([vocabDraft('v-1')])
    const submitSpy = vi.spyOn(api, 'submitReview').mockResolvedValue({
      acceptedPath: 'a.jsonl',
      rejectedPath: 'r.jsonl',
    })

    render(<App />)
    await waitFor(() => expect(screen.getByText('vocab.jsonl')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('ドラフトファイル'), {
      target: { value: 'vocab.jsonl' },
    })
    await screen.findByText('id: v-1 / kind: vocab_card / status: pending')

    expect((screen.getByText('破棄') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('破棄理由'), { target: { value: '重複語彙' } })
    expect((screen.getByText('破棄') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('破棄'))

    fireEvent.click(screen.getByText('書き出す'))
    await waitFor(() => expect(submitSpy).toHaveBeenCalled())
    const [, accepted, rejected] = submitSpy.mock.calls[0]!
    expect(accepted).toEqual([])
    expect(rejected).toEqual([{ id: 'v-1', kind: 'vocab_card', reason: '重複語彙' }])
  })
})

describe('App: shared-schemaバリデーションのインライン表示', () => {
  it('answerがchoicesのどのkeyとも一致しない場合、検証エラーが表示される', async () => {
    vi.spyOn(api, 'fetchDraftFiles').mockResolvedValue(['part5.jsonl'])
    vi.spyOn(api, 'fetchDrafts').mockResolvedValue([part5Draft('p5-1', 'Z')])

    render(<App />)
    await waitFor(() => expect(screen.getByText('part5.jsonl')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('ドラフトファイル'), {
      target: { value: 'part5.jsonl' },
    })

    expect(await screen.findByText(/検証エラー/)).toBeTruthy()
    expect(screen.getByText(/answer_mismatch/)).toBeTruthy()
  })

  it('正しいドラフトなら検証エラーが出ない', async () => {
    vi.spyOn(api, 'fetchDraftFiles').mockResolvedValue(['part5.jsonl'])
    vi.spyOn(api, 'fetchDrafts').mockResolvedValue([part5Draft('p5-1', 'A')])

    render(<App />)
    await waitFor(() => expect(screen.getByText('part5.jsonl')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('ドラフトファイル'), {
      target: { value: 'part5.jsonl' },
    })

    await screen.findByText('id: p5-1 / kind: text_blank / status: pending')
    expect(screen.queryByText(/検証エラー/)).toBeNull()
  })
})
