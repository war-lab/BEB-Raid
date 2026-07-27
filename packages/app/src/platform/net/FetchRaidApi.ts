// 共有API（レイド）の本実装（M3・T-96。正本: docs/17_M3実装計画.md 3.6節）。
// fetch直呼び（外部API呼び出しはplatform実装内に閉じる=13の3.7節の運用ルール踏襲）。
// UI・サービス層はこのクラスを直接newせず、platform/index.ts の createRaidApi 経由で使うこと

import type {
  DamageSyncPayload,
  GhostRecordPayload,
  QuestionReportPayload,
  QuestionStatPayload,
  QuestionStatsRequest,
  RaidBossState,
  RaidSyncRequest,
  RaidSyncResponse,
  RegisterRequest,
} from '@beb-raid/shared-schema'

import type { RaidApi } from './RaidApi'

/** deviceTokenの取得手段（settingsの読み出しは呼び出し元=App.tsxが担う。db直依存を避ける疎結合） */
export type DeviceTokenProvider = () => Promise<string>

export type FetchLike = typeof fetch

/** タイムアウト（3.6節） */
const REQUEST_TIMEOUT_MS = 15_000

export type RaidApiErrorKind = 'unauthorized' | 'network' | 'timeout' | 'unknown'

export class RaidApiError extends Error {
  constructor(
    public readonly kind: RaidApiErrorKind,
    message: string,
    // 元例外を診断用にcauseへ残せるようにする（ES2022のErrorOptions）
    options?: ErrorOptions,
    /**
     * HTTPステータス（T-115。docs/18 T-115シート）。レスポンスを受け取れた場合のみ設定する
     * （network/timeoutはHTTP応答自体が無いためundefinedのまま）。呼び出し側（RaidScreen等）は
     * エラーメッセージ文字列の正規表現判定ではなく、この数値で出し分ける
     */
    public readonly status?: number,
  ) {
    super(message, options)
    this.name = 'RaidApiError'
  }
}

export class FetchRaidApi implements RaidApi {
  constructor(
    private readonly baseUrl: string | undefined,
    private readonly getDeviceToken: DeviceTokenProvider,
    private readonly fetchImpl: FetchLike = (...args) => fetch(...args),
  ) {}

  isConfigured(): boolean {
    return typeof this.baseUrl === 'string' && this.baseUrl.trim() !== ''
  }

  async register(req: RegisterRequest): Promise<void> {
    await this.request('/register', { method: 'POST', body: JSON.stringify(req) }, false)
  }

  async fetchCurrentBoss(): Promise<RaidBossState | null> {
    const res = await this.request('/raid/current', { method: 'GET' }, true, true)
    if (res === null) return null
    return (await res.json()) as RaidBossState
  }

  async syncDamage(payloads: DamageSyncPayload[]): Promise<RaidSyncResponse> {
    const body: RaidSyncRequest = { payloads }
    const res = await this.request(
      '/raid/sync',
      { method: 'POST', body: JSON.stringify(body) },
      true,
    )
    return (await res!.json()) as RaidSyncResponse
  }

  async sendQuestionStats(stats: QuestionStatPayload[]): Promise<number> {
    const body: QuestionStatsRequest = { stats }
    const res = await this.request(
      '/stats/questions',
      { method: 'POST', body: JSON.stringify(body) },
      true,
    )
    const { accepted } = (await res!.json()) as { accepted: number }
    return accepted
  }

  async sendReport(report: QuestionReportPayload): Promise<void> {
    await this.request('/reports', { method: 'POST', body: JSON.stringify(report) }, true)
  }

  async sendGhostRecord(payload: GhostRecordPayload): Promise<void> {
    await this.request('/ghosts', { method: 'POST', body: JSON.stringify(payload) }, true)
  }

  async deleteOwnGhostRecord(): Promise<void> {
    await this.request('/ghosts/own', { method: 'DELETE' }, true)
  }

  /**
   * allowNotFound=trueのときは404をnull扱いにして返す（呼び出し側はres===nullで分岐）。
   * それ以外のエラーはRaidApiErrorをthrowする
   */
  private async request(
    path: string,
    init: RequestInit,
    authenticated: boolean,
    allowNotFound = false,
  ): Promise<Response | null> {
    if (!this.isConfigured()) {
      throw new RaidApiError('unknown', 'VITE_RAID_API_BASE_URLが未設定です')
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authenticated) {
      headers.Authorization = `Bearer ${await this.getDeviceToken()}`
    }

    let res: Response
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...init.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new RaidApiError('timeout', '応答がタイムアウトしました')
      }
      // 元例外（CORS・DNS失敗等の詳細）を診断用にcauseへ残す（握りつぶさない）
      throw new RaidApiError('network', '通信エラーが発生しました', { cause: e })
    }

    if (allowNotFound && res.status === 404) return null
    if (!res.ok) {
      if (res.status === 401) {
        throw new RaidApiError('unauthorized', '認証エラーです（401）', undefined, res.status)
      }
      // サーバー（packages/api）はエラー詳細を { error: { code } } で返すため、読めれば
      // メッセージへ含める（例:「400 invalid_body」）。本文がJSONでない・形式が違う場合は
      // HTTPステータスのみの従来文言へフォールバックする
      let detail = String(res.status)
      try {
        const body = (await res.json()) as { error?: { code?: string } }
        if (typeof body?.error?.code === 'string') detail = `${res.status} ${body.error.code}`
      } catch {
        // 本文読取失敗はステータスのみで続行
      }
      throw new RaidApiError(
        'unknown',
        `レイドAPIの呼び出しに失敗しました（${detail}）`,
        undefined,
        res.status,
      )
    }
    return res
  }
}
