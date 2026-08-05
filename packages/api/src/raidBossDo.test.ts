import { env, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import { memberKey } from './env'
import type { RaidBossDO } from './raidBossDo'

const HOUR_MS = 60 * 60 * 1000
const START_AT = Date.UTC(2026, 6, 13) // 月曜0時UTC
const END_AT = START_AT + 4 * 24 * HOUR_MS + 15 * HOUR_MS // 金曜15時UTC

function freshStub(suffix: string) {
  const id = env.RAID_BOSS.idFromName(`boss-test-${suffix}`)
  return env.RAID_BOSS.get(id)
}

async function initBoss(
  stub: ReturnType<typeof freshStub>,
  overrides: Partial<{ bossId: string; maxHp: number; startAt: number; endAt: number }> = {},
) {
  await runInDurableObject(stub, async (instance: RaidBossDO) => {
    instance.init({
      bossId: overrides.bossId ?? 'boss-test',
      profile: { name: 'テストボス', flavor: 'テスト用' },
      maxHp: overrides.maxHp ?? 1000,
      startAt: overrides.startAt ?? START_AT,
      endAt: overrides.endAt ?? END_AT,
    })
  })
}

describe('RaidBossDO', () => {
  it('ダメージを加算するとHPが減る', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })

    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 300, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )

    expect(result.acceptedIds).toEqual(['a-1'])
    expect(result.boss.hp).toBe(700)
    expect(result.boss.status).toBe('active')
  })

  it('HPが0以下になると討伐成立し、以降のダメージは加算されない', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 500 })

    const receivedAt = START_AT + HOUR_MS
    const killShot = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 600, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )
    expect(killShot.boss.hp).toBe(0)
    expect(killShot.boss.status).toBe('defeated')

    const afterDefeat = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-2',
        [{ attemptId: 'a-2', damage: 100, questionCount: 1, answeredAt: receivedAt + HOUR_MS }],
        receivedAt + HOUR_MS,
      ),
    )
    // acceptedIdsには含めてクライアント側キューは掃除させるが、加算はしない
    expect(afterDefeat.acceptedIds).toEqual(['a-2'])
    expect(afterDefeat.boss.hp).toBe(0)
    expect(afterDefeat.boss.myDamage).toBe(0)
  })

  it('同一attemptIdの二重送信は無視され、二重計上されない（冪等）', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })

    const receivedAt = START_AT + HOUR_MS
    const entries = [{ attemptId: 'dup-1', damage: 100, questionCount: 1, answeredAt: receivedAt }]

    const first = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage('device-1', entries, receivedAt),
    )
    const second = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage('device-1', entries, receivedAt + HOUR_MS),
    )

    expect(first.acceptedIds).toEqual(['dup-1'])
    expect(second.acceptedIds).toEqual(['dup-1'])
    expect(second.boss.hp).toBe(900) // 100だけ減った状態のまま(二重減算されない)
  })

  it('answeredAtがボス期間外のダメージは加算されない（J-49）が、acceptedIdsには含まれる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const beforePeriod = START_AT - HOUR_MS
    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'out-of-period', damage: 500, questionCount: 1, answeredAt: beforePeriod }],
        receivedAt,
      ),
    )

    expect(result.acceptedIds).toEqual(['out-of-period'])
    expect(result.boss.hp).toBe(1000) // 加算されていない
  })

  it('未来方向に大きくずれたansweredAtは受信時刻へクランプされる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const receivedAt = START_AT + HOUR_MS // 期間内
    const farFuture = receivedAt + 6 * 60 * 1000 // 6分後(5分クランプの閾値を超える)
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'future-1', damage: 200, questionCount: 1, answeredAt: farFuture }],
        receivedAt,
      ),
    )

    // クランプ後のanswered Atはreceived At(期間内)になるため加算される
    expect(result.boss.hp).toBe(800)
  })

  it('受信（receivedAt）が期限後でも、answeredAtが期間内なら加算する（J-49）。表示statusはclosed', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    const afterDeadline = END_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'late-1', damage: 200, questionCount: 1, answeredAt: END_AT - HOUR_MS }],
        afterDeadline,
      ),
    )

    expect(result.acceptedIds).toEqual(['late-1'])
    expect(result.boss.hp).toBe(800) // オフライン滞留分は期限後の受信でも加算される
    expect(result.boss.status).toBe('closed') // 表示上は期限切れのまま（討伐はしていない）
  })

  it('answeredAt自体が期間外（endAtより後）なら加算されない（クランプの影響を受けないよう受信時刻も同時刻にする）', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000, startAt: START_AT, endAt: END_AT })

    // answeredAt=receivedAtにして未来クランプが働かないようにし、純粋にinPeriod判定だけを見る
    const afterEnd = END_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'too-late-answer', damage: 200, questionCount: 1, answeredAt: afterEnd }],
        afterEnd,
      ),
    )

    expect(result.acceptedIds).toEqual(['too-late-answer'])
    expect(result.boss.hp).toBe(1000)
  })

  it('contributionsにKVの表示名が反映される', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })
    await env.MEMBERS.put(
      memberKey('device-1'),
      JSON.stringify({ displayName: '花子', dailyGoal: 'normal', registeredAt: 0 }),
    )

    const receivedAt = START_AT + HOUR_MS
    const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'device-1',
        [{ attemptId: 'a-1', damage: 100, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )

    expect(result.boss.contributions).toEqual([{ displayName: '花子', damage: 100 }])
    expect(result.boss.participantCount).toBe(1)
  })

  // T-246・29のQ-28: buildBossStateは貢献者1人につきKV getを1回発行し、これが
  // GET /raid/current・POST /raid/sync双方の応答経路で毎回走る。メンバーがポーリングすると
  // 読取が増幅し、KV無料枠（読取10万/日）を圧迫し得る。DO内で表示名を短期キャッシュし、
  // 同一TTL内の再呼び出しでは同じdeviceTokenへ再度KV getを発行しないことを確認する
  it('表示名解決のKV get回数は、TTL内の再呼び出しでは貢献者数に比例して増えない（短期キャッシュ）', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 100_000 })

    const CONTRIBUTOR_COUNT = 5
    const receivedAt = START_AT + HOUR_MS
    for (let i = 0; i < CONTRIBUTOR_COUNT; i++) {
      const deviceToken = `device-cache-${i}`
      await env.MEMBERS.put(
        memberKey(deviceToken),
        JSON.stringify({ displayName: `メンバー${i}`, dailyGoal: 'normal', registeredAt: 0 }),
      )
      await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.syncDamage(
          deviceToken,
          [{ attemptId: `seed-${i}`, damage: 10, questionCount: 1, answeredAt: receivedAt }],
          receivedAt,
        ),
      )
    }

    const getSpy = vi.spyOn(env.MEMBERS, 'get')
    getSpy.mockClear()

    // 同一TTL内でGET /raid/current相当の呼び出し（getBossState）を3回連続で行う
    // （実運用ではポーリングやraid/syncの応答構築のたびにbuildBossStateが走る想定）
    for (let call = 0; call < 3; call++) {
      const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.getBossState(receivedAt),
      )
      expect(state?.contributions).toHaveLength(CONTRIBUTOR_COUNT)
      expect(state?.contributions.every((c) => c.displayName.startsWith('メンバー'))).toBe(true)
    }

    // 修正前は呼び出し回数(3)×貢献者数(5)=15回のKV getになる。修正後はキャッシュヒットする
    // ため、呼び出し回数を3回に増やしてもget回数は増えない（シード時の内部呼び出しで
    // 既にキャッシュが温まっているため0になりうるが、いずれにせよ15回には遠く及ばない）
    expect(getSpy.mock.calls.length).toBeLessThanOrEqual(CONTRIBUTOR_COUNT)
  })

  // T-246: キャッシュがTTL経過後も表示名変更（再登録）を永久に反映しなくなる退行を防ぐ
  it('表示名キャッシュはTTL経過後、再登録による表示名変更を反映する', async () => {
    const stub = freshStub(crypto.randomUUID())
    await initBoss(stub, { maxHp: 1000 })
    const deviceToken = 'device-cache-ttl'
    const receivedAt = START_AT + HOUR_MS
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '旧名前', dailyGoal: 'normal', registeredAt: 0 }),
    )
    await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        deviceToken,
        [{ attemptId: 'ttl-1', damage: 10, questionCount: 1, answeredAt: receivedAt }],
        receivedAt,
      ),
    )
    const beforeRename = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(receivedAt),
    )
    expect(beforeRename?.contributions[0]?.displayName).toBe('旧名前')

    // 再登録（同一tokenでの再POST）による表示名変更を模す
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '新名前', dailyGoal: 'normal', registeredAt: 0 }),
    )

    // TTL内はまだ古い名前のまま（キャッシュヒット）
    const stillCached = await runInDurableObject(
      stub,
      (instance: RaidBossDO) => instance.getBossState(receivedAt + 60_000), // 1分後
    )
    expect(stillCached?.contributions[0]?.displayName).toBe('旧名前')

    // TTL(5分)経過後は新しい表示名に更新される
    const afterTtl = await runInDurableObject(
      stub,
      (instance: RaidBossDO) => instance.getBossState(receivedAt + 6 * 60_000), // 6分後
    )
    expect(afterTtl?.contributions[0]?.displayName).toBe('新名前')
  })

  it('未初期化のボスへsyncDamageすると例外になる', async () => {
    const stub = freshStub(crypto.randomUUID())
    await expect(
      runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.syncDamage('device-1', [], START_AT),
      ),
    ).rejects.toThrow()
  })

  it('getBossStateは未初期化のときundefinedを返す', async () => {
    const stub = freshStub(crypto.randomUUID())
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(START_AT),
    )
    expect(state).toBeUndefined()
  })

  // T-247・29のQ-29: RaidBossDOには削除経路が無く、bossIdごとに別インスタンスのSQLiteが
  // 無期限に蓄積していた。cleanupIfExpired(cutoff)は、cutoffより前にこの週が終了して
  // いれば（endAt < cutoff）ストレージを丸ごと削除する
  describe('cleanupIfExpired（T-247・29のQ-29）', () => {
    it('未初期化のボスはnot_foundを返す', async () => {
      const stub = freshStub(crypto.randomUUID())
      const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.cleanupIfExpired(END_AT + 1_000_000),
      )
      expect(result).toBe('not_found')
    })

    it('cutoffがendAt以下ならkeptを返し、状態は削除されない', async () => {
      const stub = freshStub(crypto.randomUUID())
      await initBoss(stub)

      const result = await runInDurableObject(
        stub,
        (instance: RaidBossDO) => instance.cleanupIfExpired(END_AT), // ちょうど境界（endAt >= cutoffなのでkept）
      )
      expect(result).toBe('kept')

      const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.getBossState(END_AT),
      )
      expect(state).not.toBeUndefined()
    })

    it('cutoffがendAtより後ならdeletedを返し、SQLiteストレージが丸ごと削除される', async () => {
      const stub = freshStub(crypto.randomUUID())
      await initBoss(stub)
      // 削除対象であることを確認できるよう、ダメージ記録も入れておく
      await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.syncDamage(
          'device-1',
          [{ attemptId: 'a-1', damage: 100, questionCount: 1, answeredAt: START_AT + HOUR_MS }],
          START_AT + HOUR_MS,
        ),
      )

      const result = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.cleanupIfExpired(END_AT + 1),
      )
      expect(result).toBe('deleted')

      // ストレージが本当に空であること（deleteAll()がSQLite表も含めて削除している確認）。
      // このチェック自体はsqlite_masterへの生クエリなので、CREATE TABLEの再実行前でも安全
      await runInDurableObject(stub, async (_instance, state) => {
        const tables = state.storage.sql
          .exec<{ name: string }>(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
          )
          .toArray()
        expect(tables).toEqual([])
      })

      // deleteAll()直後は「state」テーブル自体が無いため、同一インスタンスのままgetBossState等を
      // 呼ぶと例外になる（コンストラクタのCREATE TABLE IF NOT EXISTSは再実行されない）。
      // 本番ではこのDOインスタンスがアイドル後にエビクトされ、次回アクセス時にコンストラクタが
      // 再実行されてテーブルが復元される（空の状態で）。evictDurableObject()でその挙動を再現する
      await evictDurableObject(stub)
      const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.getBossState(END_AT + 1),
      )
      expect(state).toBeUndefined()
    })

    it('削除後（エビクション経由での再構築後）にinit()すると、未初期化のときと同様に新規作成できる', async () => {
      const stub = freshStub(crypto.randomUUID())
      await initBoss(stub, { maxHp: 999 })
      await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.cleanupIfExpired(END_AT + 1),
      )
      await evictDurableObject(stub)

      await initBoss(stub, { maxHp: 42 })
      const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.getBossState(START_AT),
      )
      expect(state?.maxHp).toBe(42)
    })
  })
})
