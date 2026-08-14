// workerd（vitest-pool-workers）内ではホストのファイルシステムをnode:fsで読めないため、
// Viteの?raw importでビルド時（Node側）に文字列として埋め込む（raw-imports.d.ts参照）
import wranglerToml from '../wrangler.toml?raw'
import {
  createExecutionContext,
  env,
  reset,
  runInDurableObject,
  SELF,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import worker, { CRON_WEEKLY_BOSS } from './index'
import type { RaidBossDO } from './raidBossDo'
import { bossIdFor, isoWeekInfo } from './raidWeek'

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

  // T-181（Q-2）: DELETE /ghosts/own はAuthorizationヘッダを伴う単純リクエストでない
  // DELETEのため必ずプリフライトされる。Allow-Methodsに列挙されていないとブラウザが
  // ブロックし、ゴースト記録の撤回（同意の取り消し）が実行できなくなる
  it('プリフライトの Access-Control-Allow-Methods に DELETE を含む（ゴースト記録撤回に必要）', async () => {
    const res = await SELF.fetch('https://example.com/health', {
      method: 'OPTIONS',
      headers: { Origin: ALLOWED_ORIGIN },
    })
    const methods = res.headers.get('Access-Control-Allow-Methods') ?? ''
    expect(methods.split(',')).toContain('DELETE')
  })
})

// scheduled()のcron出し分け（回帰テスト）。
// 「controller.cronを見ずに全cronで週次ボス生成を走らせる」実装に戻ると、cronを1本
// 追加した時点でemaDailyDamageのEMA平滑化が壊れ（毎日適用で約1週で前週値へ収束）、
// 翌週以降のボスHPが無症状で狂う。generateWeeklyBoss単体の検証はscheduled.test.tsが
// 担当し、ここでは「どのcronで呼ばれるか／呼ばれないか」だけを見る
describe('scheduled（cron出し分け）', () => {
  /** 将来追加されうる別時刻のcronの例（正午発火。wrangler.tomlには未追加） */
  const OTHER_CRON = '0 12 * * *'
  const HOUR_MS = 60 * 60 * 1000

  // T-288（K-15）: wrangler.toml・index.tsのCRON_WEEKLY_BOSS・このテストファイルの3箇所が
  // 一字一句一致していないと、controller.cronがCRON_WEEKLY_BOSSと不一致になりdefault分岐
  // （何もしない）に落ちる。従来はこのテストファイル内にcron式を独自にハードコードしており、
  // wrangler.toml自体は一度も読んでいなかったため、wrangler.tomlだけを書き換えても
  // 検出できなかった。実際にwrangler.tomlを読んで照合する
  it('wrangler.tomlのcronsがCRON_WEEKLY_BOSS 1件と一致する', () => {
    const match = /crons\s*=\s*\[([^\]]*)\]/.exec(wranglerToml)
    if (!match) throw new Error('wrangler.tomlに[triggers] cronsが見つからない')
    const crons = match[1]!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/^"(.*)"$/, '$1'))

    expect(crons).toEqual([CRON_WEEKLY_BOSS])
  })

  // KV(MEMBERS)とボスDOの状態が後続テストへ漏れないようにする（scheduled.test.tsと同じ方針）
  afterEach(async () => {
    vi.restoreAllMocks()
    await reset()
  })

  function controllerFor(cron: string, scheduledTime: number): ScheduledController {
    return { cron, scheduledTime, noRetry: () => {} }
  }

  /** 指定時刻のISO週のボスDOが初期化済みか（=generateWeeklyBossが走ったか）を返す */
  async function isBossInitialized(scheduledTime: number): Promise<boolean> {
    const bossId = bossIdFor(isoWeekInfo(scheduledTime))
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(scheduledTime),
    )
    return state !== undefined
  }

  async function runScheduled(cron: string, scheduledTime: number): Promise<void> {
    const ctx = createExecutionContext()
    await worker.scheduled(controllerFor(cron, scheduledTime), env, ctx)
    // waitUntilに積まれたボス生成の完了を待つ（待たないと未初期化と誤判定する）
    await waitOnExecutionContext(ctx)
  }

  it('週次cron式で発火したときは週次ボス生成が実行される', async () => {
    const scheduledTime = Date.UTC(2028, 0, 3) // 月曜。他テストと週が衝突しない
    const warn = vi.spyOn(console, 'warn')

    await runScheduled(CRON_WEEKLY_BOSS, scheduledTime)

    expect(await isBossInitialized(scheduledTime)).toBe(true)
    expect(warn).not.toHaveBeenCalled()
  })

  // T-180の完了条件: 日次発火にしても週1回だけ生成される（3箇所の一致自体は上のテストで見る）
  it('日次発火として週内の複数日で発火しても週1回だけボスが生成される', async () => {
    const monday = Date.UTC(2028, 1, 7) // 月曜。他テストと週が衝突しない
    const wednesday = monday + 2 * 24 * HOUR_MS // 同じISO週の水曜

    await runScheduled(CRON_WEEKLY_BOSS, monday)
    const bossId = bossIdFor(isoWeekInfo(monday))
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
    const afterMonday = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(monday),
    )
    expect(afterMonday).toBeDefined()

    await runScheduled(CRON_WEEKLY_BOSS, wednesday)
    const afterWednesday = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(wednesday),
    )

    // 同じ週のボスが再生成されていない（maxHp・startAtが変化しない）ことを確認する
    expect(afterWednesday?.maxHp).toBe(afterMonday?.maxHp)
    expect(afterWednesday?.startAt).toBe(afterMonday?.startAt)
  })

  it('別のcron式で発火したときは週次ボス生成が実行されない', async () => {
    const scheduledTime = Date.UTC(2028, 0, 10) // 月曜。上のテストと別週

    await runScheduled(OTHER_CRON, scheduledTime)

    expect(await isBossInitialized(scheduledTime)).toBe(false)
  })

  it('未知のcron式では警告ログを残す（黙って捨てるとcron追加ミスに気づけない）', async () => {
    const scheduledTime = Date.UTC(2028, 0, 17) // 月曜。他テストと別週
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await runScheduled(OTHER_CRON, scheduledTime)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain(OTHER_CRON)
  })
})
