import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const ALLOWED_ORIGIN = 'http://localhost:5173'
const DISALLOWED_ORIGIN = 'https://evil.example.com'

describe('GET /health', () => {
  it('200と{ ok: true }を返す（Origin無しでも）', async () => {
    const res = await SELF.fetch('https://example.com/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})

describe('未定義パス', () => {
  it('404を返す', async () => {
    const res = await SELF.fetch('https://example.com/unknown')
    expect(res.status).toBe(404)
  })
})

describe('CORS', () => {
  it('許可Originのリクエストには Access-Control-Allow-Origin を付与する', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: ALLOWED_ORIGIN },
    })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
  })

  it('不許可Originのリクエストにはヘッダを付与しない（本文・ステータスは通常どおり返す）', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      headers: { Origin: DISALLOWED_ORIGIN },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('許可OriginのOPTIONSプリフライトは204+CORSヘッダで応答する', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_ORIGIN)
  })

  it('不許可OriginのOPTIONSプリフライトは403になる', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      method: 'OPTIONS',
      headers: { Origin: DISALLOWED_ORIGIN },
    })
    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})
