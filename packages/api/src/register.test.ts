import { env, reset, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { memberKey, type MemberRecord } from './env'
import { MAX_REGISTERED_MEMBERS } from './register'

const VALID_INVITE_CODE = 'test-invite-code'

function registerRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

// KV(MEMBERS)は全テストで共有されるため、リセットしないと先行テストの登録済みメンバー・
// 招待コード失敗カウンタが後続テスト（特にT-242の総数上限・レート制限テスト）を汚染する
afterEach(async () => {
  await reset()
})

describe('POST /register', () => {
  it('正しい招待コードでdeviceTokenがKVへ登録される', async () => {
    const deviceToken = crypto.randomUUID()
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'normal',
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const stored = await env.MEMBERS.get(memberKey(deviceToken))
    expect(stored).not.toBeNull()
    const record = JSON.parse(stored!) as MemberRecord
    expect(record.displayName).toBe('太郎')
    expect(record.dailyGoal).toBe('normal')
    expect(typeof record.registeredAt).toBe('number')
  })

  it('表示名は前後空白がtrimされて保存され、空白のみ・上限(32文字)超は400になる', async () => {
    const deviceToken = crypto.randomUUID()
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '  太郎  ',
        dailyGoal: 'normal',
      }),
    )
    expect(res.status).toBe(200)
    const record = JSON.parse((await env.MEMBERS.get(memberKey(deviceToken)))!) as MemberRecord
    expect(record.displayName).toBe('太郎')

    for (const displayName of ['   ', 'あ'.repeat(33)]) {
      const bad = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: crypto.randomUUID(),
          displayName,
          dailyGoal: 'normal',
        }),
      )
      expect(bad.status).toBe(400)
    }
  })

  // T-250・29のQ-32: 以前は招待コードの照合が`!==`だった。crypto.subtle.timingSafeEqualが
  // 実際に比較へ使われていることをスパイで確認する（`!==`のままだと本テストは失敗する）
  it('招待コードの照合はcrypto.subtle.timingSafeEqualで行われる（タイミングセーフ比較）', async () => {
    const spy = vi.spyOn(crypto.subtle, 'timingSafeEqual')
    try {
      const res = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: crypto.randomUUID(),
          displayName: '太郎',
          dailyGoal: 'normal',
        }),
      )
      expect(res.status).toBe(200)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('誤った招待コードは401になり、KVに書き込まれない', async () => {
    const deviceToken = crypto.randomUUID()
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: 'wrong-code',
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'normal',
      }),
    )

    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_invite_code')
    expect(await env.MEMBERS.get(memberKey(deviceToken))).toBeNull()
  })

  it('不正なリクエストボディ（dailyGoal不正）は400になる', async () => {
    const res = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken: crypto.randomUUID(),
        displayName: '太郎',
        dailyGoal: 'extreme',
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_body')
  })

  it('JSONとして壊れたボディは400になる', async () => {
    const res = await SELF.fetch(
      new Request('https://example.com/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{not json',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('再登録（同一deviceToken）はdisplayName/dailyGoalを上書きしつつregisteredAtを引き継ぐ', async () => {
    const deviceToken = crypto.randomUUID()

    const first = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎',
        dailyGoal: 'light',
      }),
    )
    expect(first.status).toBe(200)
    const firstRecord = JSON.parse((await env.MEMBERS.get(memberKey(deviceToken)))!) as MemberRecord

    const second = await SELF.fetch(
      registerRequest({
        inviteCode: VALID_INVITE_CODE,
        deviceToken,
        displayName: '太郎（改名）',
        dailyGoal: 'heavy',
      }),
    )
    expect(second.status).toBe(200)
    const secondRecord = JSON.parse(
      (await env.MEMBERS.get(memberKey(deviceToken)))!,
    ) as MemberRecord

    expect(secondRecord.displayName).toBe('太郎（改名）')
    expect(secondRecord.dailyGoal).toBe('heavy')
    expect(secondRecord.registeredAt).toBe(firstRecord.registeredAt)
  })

  // 何を防ぐか（T-331・K-66）: 表示名の一意性を検証しないと、参加者がイベントバトルの
  // joinメッセージで他メンバー（ホスト含む）の登録済み表示名をそのまま名乗れてしまい、
  // なりすまし対策（battleRoomDo.tsが採用する登録済み表示名）が無意味になる
  describe('表示名の一意性（T-331・K-66）', () => {
    it('既に他のdeviceTokenが使っている表示名で新規登録すると409になる', async () => {
      const firstToken = crypto.randomUUID()
      const first = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: firstToken,
          displayName: '花子',
          dailyGoal: 'normal',
        }),
      )
      expect(first.status).toBe(200)

      const secondToken = crypto.randomUUID()
      const second = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: secondToken,
          displayName: '花子',
          dailyGoal: 'normal',
        }),
      )
      expect(second.status).toBe(409)
      // 2人目のレコードはKVへ書き込まれない
      expect(await env.MEMBERS.get(memberKey(secondToken))).toBeNull()
    })

    it('自分自身の表示名を変更していない再登録（daily Goal更新のみ）は409にならない', async () => {
      const deviceToken = crypto.randomUUID()
      const first = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken,
          displayName: '一郎',
          dailyGoal: 'light',
        }),
      )
      expect(first.status).toBe(200)

      const second = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken,
          displayName: '一郎',
          dailyGoal: 'heavy',
        }),
      )
      expect(second.status).toBe(200)
    })

    it('表示名を別の未使用の名前へ変更する再登録は成功する', async () => {
      const deviceToken = crypto.randomUUID()
      await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken,
          displayName: '次郎',
          dailyGoal: 'normal',
        }),
      )

      const renamed = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken,
          displayName: '次郎（改名）',
          dailyGoal: 'normal',
        }),
      )
      expect(renamed.status).toBe(200)

      // 旧名は解放され、別のdeviceTokenが新規登録に使える
      const otherToken = crypto.randomUUID()
      const other = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: otherToken,
          displayName: '次郎',
          dailyGoal: 'normal',
        }),
      )
      expect(other.status).toBe(200)
    })
  })

  // T-242・29のQ-21（J-103）: 以前はdeviceTokenが1〜200字の非空文字列であれば何でも
  // 通っており、招待コードを知る者が任意個の偽deviceTokenを登録できた（登録者全員が
  // HP算出の母数になるためボスHPを恣意的に吊り上げられる）。新規登録・表示名更新
  // （=再登録）の経路にのみUUID v4形式を要求する（既存メンバーの認証=authenticateRequest
  // には適用しない。J-103で本番の既存トークン形式を事前確認できないため）
  describe('deviceTokenの形式強制（UUID v4。新規登録・表示名更新のみ）', () => {
    it('UUID v4形式でないdeviceTokenは400になる', async () => {
      for (const bad of [
        'not-a-uuid',
        'device-12345',
        '12345678-1234-1234-1234-123456789012', // バージョン桁(4番目のグループ先頭)が'4'でない
        crypto.randomUUID().toUpperCase().replace(/-/g, ''), // ハイフン無し
        `${crypto.randomUUID()}-extra`,
      ]) {
        const res = await SELF.fetch(
          registerRequest({
            inviteCode: VALID_INVITE_CODE,
            deviceToken: bad,
            displayName: '太郎',
            dailyGoal: 'normal',
          }),
        )
        expect(res.status).toBe(400)
      }
    })

    it('crypto.randomUUID()が生成する形式のdeviceTokenは受理される', async () => {
      const deviceToken = crypto.randomUUID()
      const res = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken,
          displayName: '太郎',
          dailyGoal: 'normal',
        }),
      )
      expect(res.status).toBe(200)
    })
  })

  // T-242・29のQ-21（J-103）: 登録総数の上限。母数（登録者全員）が無制限に増やせると
  // ボスHPを恣意的に吊り上げる荒らしが成立する
  describe('登録総数の上限', () => {
    it(`登録総数が上限(${MAX_REGISTERED_MEMBERS})に達した状態での新規登録は403になるが、既存メンバーの再登録（表示名更新）は許可される`, async () => {
      const puts: Promise<unknown>[] = []
      const existingToken = crypto.randomUUID()
      for (let i = 0; i < MAX_REGISTERED_MEMBERS; i++) {
        const deviceToken = i === 0 ? existingToken : crypto.randomUUID()
        puts.push(
          env.MEMBERS.put(
            memberKey(deviceToken),
            JSON.stringify({ displayName: `既存${i}`, dailyGoal: 'normal', registeredAt: 0 }),
          ),
        )
      }
      await Promise.all(puts)

      // 新規（未登録）deviceTokenでの登録は上限到達により拒否される
      const newRes = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: crypto.randomUUID(),
          displayName: '新規太郎',
          dailyGoal: 'normal',
        }),
      )
      expect(newRes.status).toBe(403)

      // 既存メンバーの再登録（表示名更新）は上限到達後でも許可される
      const reRes = await SELF.fetch(
        registerRequest({
          inviteCode: VALID_INVITE_CODE,
          deviceToken: existingToken,
          displayName: '改名太郎',
          dailyGoal: 'normal',
        }),
      )
      expect(reRes.status).toBe(200)
      const updated = JSON.parse((await env.MEMBERS.get(memberKey(existingToken)))!) as MemberRecord
      expect(updated.displayName).toBe('改名太郎')
    }, 30_000)
  })

  // T-242・29のQ-21（J-103）: 招待コード誤りの回数計測とレート制限。無認証・無レート制限だと
  // publicリポジトリで既知のURLに対し招待コードの総当たりを妨げるものが無かった
  describe('招待コード誤りのレート制限（IPごと）', () => {
    it('同一IPから招待コードを繰り返し間違えると、一定回数を超えて429になる', async () => {
      const ip = '203.0.113.10' // TEST-NET-3（RFC 5737）。他テストと衝突しない専用IP
      let lastStatus = 0
      const statuses: number[] = []
      // 十分な回数（実装の閾値を跨ぐことが目的で、閾値の具体的な回数は実装詳細としてregister.ts側に置く）
      for (let i = 0; i < 20; i++) {
        const res = await SELF.fetch(
          registerRequest(
            {
              inviteCode: 'wrong-code',
              deviceToken: crypto.randomUUID(),
              displayName: '太郎',
              dailyGoal: 'normal',
            },
            { 'CF-Connecting-IP': ip },
          ),
        )
        statuses.push(res.status)
        lastStatus = res.status
      }
      // 最初は401（招待コード誤り）だが、閾値を超えた以降は429（レート制限）になる
      expect(statuses[0]).toBe(401)
      expect(lastStatus).toBe(429)
      expect(statuses).toContain(429)
    })

    it('別IPからのアクセスは、他IPの失敗回数に影響されない', async () => {
      const attackerIp = '203.0.113.20'
      for (let i = 0; i < 20; i++) {
        await SELF.fetch(
          registerRequest(
            {
              inviteCode: 'wrong-code',
              deviceToken: crypto.randomUUID(),
              displayName: '太郎',
              dailyGoal: 'normal',
            },
            { 'CF-Connecting-IP': attackerIp },
          ),
        )
      }

      const innocentIp = '203.0.113.21'
      const res = await SELF.fetch(
        registerRequest(
          {
            inviteCode: VALID_INVITE_CODE,
            deviceToken: crypto.randomUUID(),
            displayName: '太郎',
            dailyGoal: 'normal',
          },
          { 'CF-Connecting-IP': innocentIp },
        ),
      )
      expect(res.status).toBe(200)
    })

    // 何を防ぐか（T-329・K-64）: 旧実装（KVへのread-modify-write）は並列リクエストだと
    // 複数のgetが同じ古いcountを読んでから書き込むため、加算が失われる（lost update）。
    // 20件を並列に送っても429が一切出ない（＝レート制限が実質無効化される）ことを
    // 実測で確認済み（DOへ移す前は本テストが確実に失敗した）
    it('並列リクエストでも一定回数を超えると429になる（KVのlost updateで無効化されない）', async () => {
      const ip = '203.0.113.99'
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          SELF.fetch(
            registerRequest(
              {
                inviteCode: 'wrong-code',
                deviceToken: crypto.randomUUID(),
                displayName: '太郎',
                dailyGoal: 'normal',
              },
              { 'CF-Connecting-IP': ip },
            ),
          ),
        ),
      )
      const statuses = results.map((r) => r.status)
      expect(statuses).toContain(429)
    })
  })
})
