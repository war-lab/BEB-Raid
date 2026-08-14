// POST /admin/raid/generate（運用用。2026-08-03追加）。
// 何を防ぐか:
// - 認可なしで叩けること／トークン未設定の環境でルートが露出すること
// - 既にボスがある週に generateWeeklyBoss を再実行して emaDailyDamage を二度平滑化すること
//   （③ボスDO初期化は冪等だが①EMA更新は冪等でない）
import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import { memberKey, type MemberRecord } from './env'
import type { RaidBossDO } from './raidBossDo'
import { bossIdFor, isoWeekInfo, weekEndAt } from './raidWeek'

const ADMIN_TOKEN = 'test-admin-token'

function generateRequest(token?: string): Request {
  return new Request('https://example.com/admin/raid/generate', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

async function seedMember(deviceToken: string, ema?: number) {
  const record: MemberRecord = {
    displayName: '太郎',
    dailyGoal: 'normal',
    registeredAt: Date.now(),
    ...(ema === undefined ? {} : { emaDailyDamage: ema }),
  }
  await env.MEMBERS.put(memberKey(deviceToken), JSON.stringify(record))
}

async function readMember(deviceToken: string): Promise<MemberRecord> {
  const raw = await env.MEMBERS.get(memberKey(deviceToken))
  return JSON.parse(raw!) as MemberRecord
}

afterEach(async () => {
  await reset()
})

describe('POST /admin/raid/generate', () => {
  it('ADMIN_TOKENが無ければ今週のボスを生成する', async () => {
    await seedMember('device-1')

    const res = await SELF.fetch(generateRequest(ADMIN_TOKEN))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: boolean; bossId: string; boss: unknown }
    expect(body.created).toBe(true)
    expect(body.bossId).toBe(bossIdFor(isoWeekInfo(Date.now())))
    expect(body.boss).not.toBeNull()
  })

  it('既にボスがあれば生成せず現状を返す（EMAを二度更新しない）', async () => {
    const current = isoWeekInfo(Date.now())
    const bossId = bossIdFor(current)
    await seedMember('device-1', 100)
    // 期限を未来に置く（週末に実行してもclosedにならないようにする）
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    await runInDurableObject(stub, (instance: RaidBossDO) => {
      instance.init({
        bossId,
        profile: bossProfileForWeek(current.isoWeek),
        maxHp: 12345,
        startAt: current.weekStartAt,
        endAt: weekEndAt(current.weekStartAt) + 7 * 24 * 60 * 60 * 1000,
      })
    })

    const res = await SELF.fetch(generateRequest(ADMIN_TOKEN))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { created: boolean; boss: { maxHp: number } }
    expect(body.created).toBe(false)
    // 既存ボスのHPがそのまま（＝再生成で作り直されていない）
    expect(body.boss.maxHp).toBe(12345)
    // EMAも触られていない
    expect((await readMember('device-1')).emaDailyDamage).toBe(100)
  })

  it('トークンが違えば401', async () => {
    const res = await SELF.fetch(generateRequest('wrong-token'))
    expect(res.status).toBe(401)
  })

  it('Authorizationが無ければ401', async () => {
    const res = await SELF.fetch(generateRequest())
    expect(res.status).toBe(401)
  })

  it('ADMIN_TOKEN未設定の環境では404（ルートを露出しない）', async () => {
    const original = env.ADMIN_TOKEN
    // 未設定状態を作る（型上は optional なのでそのまま代入できる）
    env.ADMIN_TOKEN = undefined
    try {
      const res = await SELF.fetch(generateRequest(ADMIN_TOKEN))
      expect(res.status).toBe(404)
    } finally {
      env.ADMIN_TOKEN = original
    }
  })

  it('GETでは受け付けない', async () => {
    const res = await SELF.fetch(
      new Request('https://example.com/admin/raid/generate', {
        headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      }),
    )
    expect(res.status).toBe(404)
  })

  // T-250・29のQ-32: 以前はadminトークンの照合が`!==`だった。`!==`は不一致文字までの
  // 応答時間差から秘密値を推測されうる（タイミング攻撃）。crypto.subtle.timingSafeEqualが
  // 実際に比較へ使われていることを、そのメソッドの呼び出しをスパイして確認する
  // （`!==`のままだと本テストはtimingSafeEqualが一度も呼ばれず失敗する）
  it('adminトークンの照合はcrypto.subtle.timingSafeEqualで行われる（タイミングセーフ比較）', async () => {
    const spy = vi.spyOn(crypto.subtle, 'timingSafeEqual')
    try {
      const res = await SELF.fetch(generateRequest(ADMIN_TOKEN))
      expect(res.status).toBe(200)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
