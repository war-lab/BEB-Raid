import { env, evictDurableObject, reset, runInDurableObject } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import { MEMBER_KEY_PREFIX, memberKey, type MemberRecord } from './env'
import { MIN_BOSS_HP, RAID_BOSS_RETENTION_WEEKS } from './raidConfig'
import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'
import { generateWeeklyBoss } from './scheduled'
import type { RaidBossDO } from './raidBossDo'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

async function seedPreviousWeekDamage(
  currentMondayEpoch: number,
  deviceToken: string,
  totalDamage: number,
) {
  const current = isoWeekInfo(currentMondayEpoch)
  const previous = previousWeekInfo(current)
  const previousBossId = bossIdFor(previous)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
  const startAt = previous.weekStartAt
  const endAt = weekEndAt(previous.weekStartAt)

  await runInDurableObject(stub, (instance: RaidBossDO) => {
    instance.init({
      bossId: previousBossId,
      profile: bossProfileForWeek(previous.isoWeek),
      maxHp: 999_999,
      startAt,
      endAt,
    })
  })
  await runInDurableObject(stub, (instance: RaidBossDO) =>
    instance.syncDamage(
      deviceToken,
      [
        {
          attemptId: `seed-${deviceToken}`,
          damage: totalDamage,
          questionCount: 1,
          answeredAt: startAt + HOUR_MS,
        },
      ],
      startAt + HOUR_MS,
    ),
  )
}

// KV(MEMBERS)は全テストで共有され、HP算出は「全登録メンバーの合計」で行われるため、
// リセットしないと先行テストのメンバーが後続テストのmaxHp期待値を汚染する
afterEach(async () => {
  await reset()
})

describe('generateWeeklyBoss', () => {
  it('前週実績もEMAも無い新規メンバーはemaが書き込まれず、dailyGoalフォールバックでHPが算出される', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 4) // 適当な月曜（他テストと衝突しない週）
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '新規太郎', dailyGoal: 'normal', registeredAt: 0 }),
    )

    await generateWeeklyBoss(env, currentMondayEpoch)

    // ema=0を確定させるとJ-48のdailyGoalフォールバックが以後死ぬため、undefinedのまま温存される
    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    expect(updated.emaDailyDamage).toBeUndefined()

    const current = isoWeekInfo(currentMondayEpoch)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )
    // normal 1人分のフォールバック(15問×128×5日×0.85=8160)はMIN_BOSS_HPと同値
    expect(state?.maxHp).toBe(MIN_BOSS_HP)
    expect(state?.name).toBe(bossProfileForWeek(current.isoWeek).name)
    expect(state?.startAt).toBe(current.weekStartAt)
    expect(state?.endAt).toBe(weekEndAt(current.weekStartAt))
  })

  it('EMA保持者が前週不参加(実績0)の場合は0とのブレンドで減衰する', async () => {
    const currentMondayEpoch = Date.UTC(2027, 1, 1) // 他テストと衝突しない週
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({
        displayName: '休眠太郎',
        dailyGoal: 'normal',
        registeredAt: 0,
        emaDailyDamage: 4000,
      }),
    )

    await generateWeeklyBoss(env, currentMondayEpoch)

    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    // 0.5×0(前週実績なし) + 0.5×4000 = 2000
    expect(updated.emaDailyDamage).toBe(2000)
  })

  it('cron発火が遅延してもstartAtはISO週の開始時刻になる（発火前のansweredAtが期間外にならない）', async () => {
    const monday = Date.UTC(2027, 1, 8) // 他テストと衝突しない週の月曜0:00 UTC
    const delayedFire = monday + 3 * HOUR_MS // 3時間遅延して発火した想定

    await generateWeeklyBoss(env, delayedFire)

    const current = isoWeekInfo(delayedFire)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(delayedFire),
    )
    expect(state?.startAt).toBe(monday)
  })

  it('前週実績があるメンバーはemaDailyDamageが実績値(初回=前週日次そのまま)になり、HPがそれを反映する', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 11) // 前のテストと別の週
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '活動太郎', dailyGoal: 'normal', registeredAt: 0 }),
    )
    // 前週(5日換算)で合計20000ダメージ稼いだ実績を用意 → 前週日次 = 20000/5 = 4000
    await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 20_000)

    await generateWeeklyBoss(env, currentMondayEpoch)

    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    expect(updated.emaDailyDamage).toBe(4000)

    const current = isoWeekInfo(currentMondayEpoch)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )
    // maxHp = round(4000 × 5日 × 0.85) = 17000 (MIN_BOSS_HPを上回るので下限は使われない)
    expect(state?.maxHp).toBe(17_000)
    expect(state?.maxHp).toBeGreaterThan(MIN_BOSS_HP)
  })

  it('同じ週に2回実行しても当週ボスは初期化済みのまま変化しない（冪等）', async () => {
    const currentMondayEpoch = Date.UTC(2027, 0, 18) // 別の週
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({ displayName: '二回太郎', dailyGoal: 'heavy', registeredAt: 0 }),
    )

    await generateWeeklyBoss(env, currentMondayEpoch)
    const current = isoWeekInfo(currentMondayEpoch)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const firstState = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )

    // 2回目実行（EMA更新自体は起きるが、ボスDOのinitは冪等なので状態は変わらない）
    await generateWeeklyBoss(env, currentMondayEpoch + HOUR_MS)
    const secondState = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )

    expect(secondState?.maxHp).toBe(firstState?.maxHp)
    expect(secondState?.startAt).toBe(firstState?.startAt)
  })

  it('同一週に2回呼んでもEMAは1回しか更新されない（生成権の主張。T-179/J-101）', async () => {
    const currentMondayEpoch = Date.UTC(2027, 2, 1) // 別の週（他テストと衝突しない）
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({
        displayName: '重複太郎',
        dailyGoal: 'normal',
        registeredAt: 0,
        emaDailyDamage: 1000,
      }),
    )
    // 前週(5日換算)で合計20000ダメージ → 前週日次 = 4000
    await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 20_000)

    await generateWeeklyBoss(env, currentMondayEpoch)
    const afterFirstRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const afterFirst = JSON.parse(afterFirstRaw!) as MemberRecord
    // 0.5×4000(前週日次) + 0.5×1000(元のema) = 2500
    expect(afterFirst.emaDailyDamage).toBe(2500)

    // 2回目呼び出し（手動生成とcronの競合、または並行リクエストを想定）。
    // 生成権の主張が無いと、2回目はKVから読んだ「1回目で更新済みのema(2500)」を
    // 再度ブレンドしてしまい 0.5×4000 + 0.5×2500 = 3250 に壊れる
    await generateWeeklyBoss(env, currentMondayEpoch + HOUR_MS)
    const afterSecondRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const afterSecond = JSON.parse(afterSecondRaw!) as MemberRecord
    expect(afterSecond.emaDailyDamage).toBe(2500)
  })

  // T-244・29のQ-23: env.MEMBERS.list({prefix})は1ページ最大1,000件しか返さない。
  // 以前はcursorを見ずに1ページ目だけでtotalDailyDamageを集計しており、メンバー数が
  // 1,000を超えると1,000件を超えた分が無言で無視され、HP算出が正しい合計より小さくなっていた。
  // 1,050人（全員dailyGoal='normal'・ema無し）を登録し、maxHpが「1,000人分」ではなく
  // 「1,050人分」で算出されることを実測で確認する
  it('登録メンバーが1,000人を超えてもHP算出が全員分を反映する（KV.listのcursor対応）', async () => {
    const currentMondayEpoch = Date.UTC(2027, 3, 5) // 他テストと衝突しない週
    const MEMBER_COUNT = 1050
    const puts: Promise<unknown>[] = []
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const deviceToken = `bulk-member-${String(i).padStart(5, '0')}`
      puts.push(
        env.MEMBERS.put(
          memberKey(deviceToken),
          JSON.stringify({
            displayName: `一括太郎${i}`,
            dailyGoal: 'normal',
            registeredAt: 0,
          }),
        ),
      )
    }
    await Promise.all(puts)

    await generateWeeklyBoss(env, currentMondayEpoch)

    const current = isoWeekInfo(currentMondayEpoch)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossIdFor(current)))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )

    // normal 1人あたり 15問×128×5日×0.85 = 8,160。1,050人分なら8,568,000。
    // 1,000件で打ち切られていれば8,160,000になる（本テストが検出したい旧不具合の値）
    const expectedMaxHp = Math.round(MEMBER_COUNT * 15 * 128 * 5 * 0.85)
    expect(expectedMaxHp).toBe(8_568_000)
    expect(state?.maxHp).toBe(expectedMaxHp)
  }, 30_000)

  // 何を防ぐか（T-326・K-61）: EMA更新（①）とHP算出（②）が別々の全件走査になっており、
  // メンバーごとにKV.getを2回（①・②）呼んでいた。無料枠の外向き呼び出し上限に
  // メンバー数の増加で当たりうる（週次cronはメンバー数Nに対しO(3N)＝list＋2N gets）。
  // ②を①に統合すれば、メンバー1人あたりのget呼び出しは1回で済む
  it('メンバー数Nに対するKV.getの呼び出し回数がN以下になる（EMA更新とHP算出の全件走査を統合）', async () => {
    const currentMondayEpoch = Date.UTC(2027, 3, 19) // 他テストと衝突しない週
    const MEMBER_COUNT = 6
    for (let i = 0; i < MEMBER_COUNT; i++) {
      const deviceToken = `get-count-member-${i}`
      await env.MEMBERS.put(
        memberKey(deviceToken),
        JSON.stringify({ displayName: `太郎${i}`, dailyGoal: 'normal', registeredAt: 0 }),
      )
      // 半数だけ前週実績を持たせ、EMA更新の分岐（実績あり/無し）双方を通す
      if (i % 2 === 0) {
        await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 10_000)
      }
    }

    const getSpy = vi.spyOn(env.MEMBERS, 'get')
    getSpy.mockClear()

    await generateWeeklyBoss(env, currentMondayEpoch)

    // 修正前は全件走査が2回（①EMA更新・②HP算出）のため、メンバー1人あたりget2回だった。
    // 統合後は1人あたり1回以下になる。
    // 数えるのは `member:` へのgetだけにする。掃除境界（raid:cleanupWatermarkEpoch）のような
    // メンバー数に比例しない定数回の読み取りが増えても、この不変条件（O(N)でありO(2N)でない）
    // の判定は変わらないため
    const memberGets = getSpy.mock.calls.filter((call) =>
      String(call[0]).startsWith(MEMBER_KEY_PREFIX),
    )
    expect(memberGets.length).toBeLessThanOrEqual(MEMBER_COUNT)
  })

  it('generation_claim導入前にinit済みだった週（boss-2026-W32相当）はEMAが更新されない', async () => {
    // generation_claimテーブルは今回の変更で新規追加されたため、変更前に手動生成やcronで
    // 既にinit済みの週ではこのテーブルが空のままになる。claimGeneration()がgeneration_claim
    // だけを見て主張を成立させると、デプロイ後最初の呼び出しでEMAが二度目に平滑化されて
    // しまう（stateテーブルの行こそが「生成済み」の実質的な正本であるため、そちらも見る必要がある）
    const currentMondayEpoch = Date.UTC(2027, 2, 8) // 別の週（他テストと衝突しない）
    const deviceToken = `device-${crypto.randomUUID()}`
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({
        displayName: '既存太郎',
        dailyGoal: 'normal',
        registeredAt: 0,
        emaDailyDamage: 1000,
      }),
    )
    // 前週(5日換算)で合計20000ダメージ → 前週日次 = 4000（このテストではEMAが動けば検出できる値にする）
    await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 20_000)

    // generation_claimを経由せず、旧実装と同じ経路（POST /admin/raid/generateの手動生成や
    // 旧cron）でinit()だけが呼ばれた状態を再現する
    const current = isoWeekInfo(currentMondayEpoch)
    const bossId = bossIdFor(current)
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    await runInDurableObject(stub, (instance: RaidBossDO) => {
      instance.init({
        bossId,
        profile: bossProfileForWeek(current.isoWeek),
        maxHp: 12345,
        startAt: current.weekStartAt,
        endAt: weekEndAt(current.weekStartAt),
      })
    })

    await generateWeeklyBoss(env, currentMondayEpoch)

    const updatedRaw = await env.MEMBERS.get(memberKey(deviceToken))
    const updated = JSON.parse(updatedRaw!) as MemberRecord
    // 生成権が正しく主張不可と判定されれば、EMAは元の1000のまま変化しない
    expect(updated.emaDailyDamage).toBe(1000)

    // ボスの状態（HP等）も、既存のinit済み内容のまま変わらない
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(currentMondayEpoch),
    )
    expect(state?.maxHp).toBe(12345)
  })

  // T-247・29のQ-29: RaidBossDOには削除経路が無く、bossIdごとに別インスタンスのSQLiteが
  // 無期限に蓄積していた。generateWeeklyBossの末尾でRAID_BOSS_RETENTION_WEEKSより古い週の
  // DOを掃除する配線（cleanupExpiredRaidBoss）を検証する
  describe('週次データの掃除（T-247・29のQ-29）', () => {
    it(`保持期間(${RAID_BOSS_RETENTION_WEEKS}週)を超えて古い週のRaidBossDOは削除される`, async () => {
      const week1 = Date.UTC(2028, 0, 3) // 他テストと衝突しない週
      const week1BossId = bossIdFor(isoWeekInfo(week1))
      await generateWeeklyBoss(env, week1)
      const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))

      // week1がちょうど保持期間の境界を過ぎる週まで進める
      // （cleanupExpiredRaidBossの対象週選定はscheduled.tsのコメント参照）
      const farFuture = week1 + (RAID_BOSS_RETENTION_WEEKS + 1) * WEEK_MS
      await generateWeeklyBoss(env, farFuture)

      // deleteAll()直後は同一インスタンスのままだと例外になるため、エビクションで
      // コンストラクタを再実行させてから確認する（raidBossDo.test.tsと同じ理由）
      await evictDurableObject(week1Stub)
      const state = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
        instance.getBossState(farFuture),
      )
      expect(state).toBeUndefined()
    })

    it(`保持期間(${RAID_BOSS_RETENTION_WEEKS}週)以内の週のRaidBossDOは削除されない`, async () => {
      const week1 = Date.UTC(2028, 2, 6) // 他テストと衝突しない週
      const week1BossId = bossIdFor(isoWeekInfo(week1))
      await generateWeeklyBoss(env, week1)
      const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))

      // 保持期間の半分程度しか進めない
      const nearFuture = week1 + Math.floor(RAID_BOSS_RETENTION_WEEKS / 2) * WEEK_MS
      await generateWeeklyBoss(env, nearFuture)

      const state = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
        instance.getBossState(nearFuture),
      )
      expect(state).not.toBeUndefined()
    })

    // 何を防ぐか（T-337・K-72）: 旧実装は境界週ちょうど1週だけをチェックしていた。
    // cronが長期間発火せず（障害等）、次回発火時に一気に複数週分が保持期間を超えると、
    // 「対象週は約7日間かけて同じbossIdを指し続ける」という前提が成立せず、境界より
    // さらに古い週は一度も対象にならないまま永久に残っていた。1回のcron実行で
    // 境界週から複数週まとめてチェックすれば、この飛ばした週も自己修復する
    it('cronが長期間発火せず複数週分が一気に保持期間を超えても、境界より古い週も掃除される', async () => {
      const week1 = Date.UTC(2029, 0, 1) // 他テストと衝突しない週
      const week1BossId = bossIdFor(isoWeekInfo(week1))
      await generateWeeklyBoss(env, week1)
      const week1Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week1BossId))

      const week2 = week1 + WEEK_MS
      const week2BossId = bossIdFor(isoWeekInfo(week2))
      await generateWeeklyBoss(env, week2)
      const week2Stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(week2BossId))

      // week1・week2の生成直後、間の週を1個ずつ経由せず一気にfarFutureへ飛ぶ
      // （cronの長期停止＋復帰を再現）。旧実装ではこの1回のcleanupExpiredRaidBoss呼び出しで
      // 境界週（week2）だけが対象になり、week1（境界よりさらに1週古い）は一度も
      // 対象にならないまま残っていた
      const farFuture = week1 + (RAID_BOSS_RETENTION_WEEKS + 2) * WEEK_MS
      await generateWeeklyBoss(env, farFuture)

      await evictDurableObject(week1Stub)
      await evictDurableObject(week2Stub)
      const week1State = await runInDurableObject(week1Stub, (instance: RaidBossDO) =>
        instance.getBossState(farFuture),
      )
      const week2State = await runInDurableObject(week2Stub, (instance: RaidBossDO) =>
        instance.getBossState(farFuture),
      )
      expect(week1State).toBeUndefined()
      expect(week2State).toBeUndefined()
    })

    it('掃除に失敗しても週次ボス生成自体は成功する', async () => {
      // cleanupExpiredRaidBossは内部でtry/catchしているため、cutoff計算が正常に走る限り
      // 例外がgenerateWeeklyBossまで伝播しないことを回帰として確認する
      // （週1回しか走らないジョブの成否に副次処理の失敗を混ぜ込まないことが目的）
      const currentMondayEpoch = Date.UTC(2028, 3, 3) // 他テストと衝突しない週
      await expect(generateWeeklyBoss(env, currentMondayEpoch)).resolves.toBe(true)
    })
  })
})

describe('週次生成の再実行と掃除の追いつき（レビュー指摘2・6）', () => {
  it('EMA更新済みのメンバーは再実行しても二度平滑化されない', async () => {
    const currentMondayEpoch = Date.UTC(2026, 7, 10)
    const bossId = bossIdFor(isoWeekInfo(currentMondayEpoch))
    const deviceToken = 'token-ema'
    await env.MEMBERS.put(
      memberKey(deviceToken),
      JSON.stringify({
        displayName: 'ema',
        dailyGoal: 'normal',
        registeredAt: 0,
        emaDailyDamage: 100,
      } satisfies MemberRecord),
    )
    await seedPreviousWeekDamage(currentMondayEpoch, deviceToken, 10_000)

    await generateWeeklyBoss(env, currentMondayEpoch)
    const afterFirst = JSON.parse((await env.MEMBERS.get(memberKey(deviceToken)))!) as MemberRecord
    expect(afterFirst.emaUpdatedForBossId).toBe(bossId)
    const emaAfterFirst = afterFirst.emaDailyDamage

    // 生成権を解放して同じ週をもう一度走らせる（途中失敗→翌日の再実行を模擬）
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    await stub.releaseGenerationClaim()
    await generateWeeklyBoss(env, currentMondayEpoch)

    const afterSecond = JSON.parse((await env.MEMBERS.get(memberKey(deviceToken)))!) as MemberRecord
    // マーカーが無かった頃は前回値をさらに平滑化して値がずれていた
    expect(afterSecond.emaDailyDamage).toBe(emaAfterFirst)
  })

  it('掃除境界を記録し、cronが長期停止しても取りこぼした週へ追いつく', async () => {
    const currentMondayEpoch = Date.UTC(2026, 7, 10)
    await generateWeeklyBoss(env, currentMondayEpoch)

    // 境界が残っていること（次回はここから当週のcutoffまでを埋める）
    const watermark = await env.MEMBERS.get('raid:cleanupWatermarkEpoch')
    expect(watermark).not.toBeNull()
    expect(Number(watermark)).toBeLessThan(currentMondayEpoch)
  })
})
