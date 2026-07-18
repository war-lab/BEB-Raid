// T-96完了条件のテスト（正本: docs/17_M3実装計画.md 3.6節）:
// - isConfigured()の実装（baseUrl未設定/空文字でfalse）
// - register/fetchCurrentBoss/syncDamageの正しいURL・ヘッダ・ボディでのfetch呼び出し
// - fetchCurrentBossの404→null変換
// - 401/その他HTTPエラー・通信エラー・タイムアウトの種別判定
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { RaidBossState, RegisterRequest } from '@beb-raid/shared-schema'

import { FetchRaidApi, RaidApiError } from './FetchRaidApi'
import { createRaidApi } from '../index'

const BOSS: RaidBossState = {
  bossId: 'boss-2026-W30',
  name: 'テストボス',
  hp: 100,
  maxHp: 100,
  startAt: 0,
  endAt: 0,
  status: 'active',
  participantCount: 0,
  myDamage: 0,
  contributions: [],
}

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response
}

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FetchRaidApi.isConfigured', () => {
  it('baseUrlが非空文字列ならtrue', () => {
    const client = new FetchRaidApi('https://api.example.com', async () => 'token')
    expect(client.isConfigured()).toBe(true)
  })

  it('baseUrlが未設定ならfalse', () => {
    const client = new FetchRaidApi(undefined, async () => 'token')
    expect(client.isConfigured()).toBe(false)
  })

  it('baseUrlが空白のみならfalse', () => {
    const client = new FetchRaidApi('   ', async () => 'token')
    expect(client.isConfigured()).toBe(false)
  })
})

describe('FetchRaidApi.register', () => {
  it('POST /registerへ、Authorizationヘッダ無しでボディを送る', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({ ok: true }))
    const client = new FetchRaidApi('https://api.example.com', async () => 'token', fetchMock)
    const req: RegisterRequest = {
      inviteCode: 'invite-1',
      deviceToken: 'device-1',
      displayName: '太郎',
      dailyGoal: 'normal',
    }

    await client.register(req)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/register')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(JSON.parse(init!.body as string)).toEqual(req)
  })
})

describe('FetchRaidApi.fetchCurrentBoss', () => {
  it('GET /raid/currentへBearerヘッダ付きでリクエストし、bossを返す', async () => {
    const fetchMock = mockFetch(async () => fakeResponse(BOSS))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const boss = await client.fetchCurrentBoss()

    expect(boss).toEqual(BOSS)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/raid/current')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer device-1')
  })

  it('404はnullに変換される', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 404))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    expect(await client.fetchCurrentBoss()).toBeNull()
  })
})

describe('FetchRaidApi.syncDamage', () => {
  it('POST /raid/syncへpayloadsをボディに含めて送る', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({ acceptedIds: ['a-1'], boss: BOSS }))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)
    const payloads = [
      { attemptId: 'a-1', bossId: 'boss-2026-W30', damage: 100, questionCount: 1, answeredAt: 0 },
    ]

    const result = await client.syncDamage(payloads)

    expect(result).toEqual({ acceptedIds: ['a-1'], boss: BOSS })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/raid/sync')
    expect(init!.method).toBe('POST')
    expect(JSON.parse(init!.body as string)).toEqual({ payloads })
  })
})

describe('FetchRaidApi.sendQuestionStats', () => {
  it('POST /stats/questionsへBearerヘッダ・statsをボディに含めて送り、accepted件数を返す', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({ accepted: 2 }))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)
    const stats = [
      { questionId: 'q-1', correct: 3, wrong: 1, timeout: 0 },
      { questionId: 'q-2', correct: 0, wrong: 1, timeout: 1 },
    ]

    const accepted = await client.sendQuestionStats(stats)

    expect(accepted).toBe(2)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/stats/questions')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer device-1')
    expect(JSON.parse(init!.body as string)).toEqual({ stats })
  })
})

describe('FetchRaidApi.sendReport', () => {
  it('POST /reportsへBearerヘッダ・報告内容をボディに含めて送る', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({ ok: true }))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)
    const report = { questionId: 'q-1', reason: 'unnatural' as const }

    await client.sendReport(report)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.example.com/reports')
    expect(init!.method).toBe('POST')
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer device-1')
    expect(JSON.parse(init!.body as string)).toEqual(report)
  })
})

describe('FetchRaidApi: エラー種別判定', () => {
  it('未設定（isConfigured=false）ならfetchせずunknownエラー', async () => {
    const fetchMock = vi.fn()
    const client = new FetchRaidApi(undefined, async () => 'device-1', fetchMock)

    const error = await client.fetchCurrentBoss().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RaidApiError)
    expect((error as RaidApiError).kind).toBe('unknown')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401はunauthorizedとして分類され、statusに401が入る（T-115）', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 401))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('unauthorized')
    expect((error as RaidApiError).status).toBe(401)
  })

  it('その他のHTTPエラー（500等）はunknownとして分類され、statusに実HTTPステータスが入る（T-115）', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 500))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('unknown')
    expect((error as RaidApiError).status).toBe(500)
  })

  it('400系のstatusは呼び出し側のstatus判定（4xx）に使える（T-115: 文字列正規表現からの置き換え）', async () => {
    const fetchMock = mockFetch(async () => fakeResponse({}, false, 400))
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = (await client.syncDamage([]).catch((e: unknown) => e)) as RaidApiError
    expect(error.status).toBe(400)
    expect(error.status! >= 400 && error.status! < 500).toBe(true)
  })

  it('network/timeoutエラーはHTTP応答自体が無いためstatusがundefinedのまま', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = (await client.syncDamage([]).catch((e: unknown) => e)) as RaidApiError
    expect(error.status).toBeUndefined()
  })

  it('fetch自体が失敗（通信エラー）した場合はnetworkとして分類される', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('network')
  })

  it('networkエラーは元例外をcauseへ残す（診断情報の握りつぶし防止）', async () => {
    const original = new TypeError('Failed to fetch')
    const fetchMock = vi.fn(async () => {
      throw original
    })
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).cause).toBe(original)
  })

  it('非OKレスポンスはサーバーのerror.codeをメッセージへ含める（例: 400 invalid_body）', async () => {
    const fetchMock = mockFetch(async () =>
      fakeResponse({ error: { code: 'invalid_body', message: '形式が不正です' } }, false, 400),
    )
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('unknown')
    expect((error as RaidApiError).message).toContain('400 invalid_body')
  })

  it('非OKレスポンスの本文が読めない場合はHTTPステータスのみの従来文言へフォールバックする', async () => {
    const fetchMock = mockFetch(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('not json')
        },
      } as unknown as Response
    })
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('unknown')
    expect((error as RaidApiError).message).toContain('500')
  })

  it('AbortSignal.timeout由来のTimeoutErrorはtimeoutとして分類される', async () => {
    const fetchMock = vi.fn(async () => {
      throw new DOMException('signal timed out', 'TimeoutError')
    })
    const client = new FetchRaidApi('https://api.example.com', async () => 'device-1', fetchMock)

    const error = await client.syncDamage([]).catch((e: unknown) => e)
    expect((error as RaidApiError).kind).toBe('timeout')
  })
})

describe('createRaidApi factory（platform/index.ts配線）', () => {
  it('RaidApiを実装したインスタンスを返す', () => {
    const client = createRaidApi('https://api.example.com', async () => 'device-1')
    expect(client.isConfigured()).toBe(true)
  })

  it('baseUrl未指定ならisConfigured()=false', () => {
    const client = createRaidApi(undefined, async () => 'device-1')
    expect(client.isConfigured()).toBe(false)
  })
})
