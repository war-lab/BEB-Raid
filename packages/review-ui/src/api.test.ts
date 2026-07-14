// T-57 完了条件のテスト（クライアント側APIラッパー）:
// - 各エンドポイントへ正しいURL/メソッド/ボディでfetchする
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchDraftFiles, fetchDrafts, submitReview } from './api'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchDraftFiles', () => {
  it('GET /api/drafts を呼ぶ', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(['a.jsonl', 'b.jsonl']))
    vi.stubGlobal('fetch', fetchMock)

    const files = await fetchDraftFiles()

    expect(fetchMock).toHaveBeenCalledWith('/api/drafts')
    expect(files).toEqual(['a.jsonl', 'b.jsonl'])
  })
})

describe('fetchDrafts', () => {
  it('GET /api/drafts/:filename をURLエンコードして呼ぶ', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ id: 'v-1' }]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchDrafts('vocab card.jsonl')

    expect(fetchMock).toHaveBeenCalledWith('/api/drafts/vocab%20card.jsonl')
  })

  it('レスポンスが失敗ならエラーを投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, false, 404)),
    )
    await expect(fetchDrafts('missing.jsonl')).rejects.toThrow(/404/)
  })
})

describe('submitReview', () => {
  it('POST /api/review にfilename/accepted/rejectedを送る', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ acceptedPath: 'a', rejectedPath: 'r' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitReview(
      'vocab.jsonl',
      [{ id: 'v-1' }],
      [{ id: 'v-2', kind: 'vocab_card', reason: '重複' }],
    )

    expect(result).toEqual({ acceptedPath: 'a', rejectedPath: 'r' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/review')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as unknown
    expect(body).toEqual({
      filename: 'vocab.jsonl',
      accepted: [{ id: 'v-1' }],
      rejected: [{ id: 'v-2', kind: 'vocab_card', reason: '重複' }],
    })
  })
})
