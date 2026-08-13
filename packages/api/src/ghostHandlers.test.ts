// POST /ghosts・DELETE /ghosts/own 統合テスト（正本: docs/22 3.1節・3.3節、docs/21 T-127行）
import { env, reset, runInDurableObject, SELF } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

import { bossProfileForWeek } from './bossProfiles'
import { ghostKey, type GhostRecord } from './ghostStore'
import type { RaidBossDO } from './raidBossDo'
import { bossIdFor, isoWeekInfo, previousWeekInfo } from './raidWeek'

const VALID_INVITE_CODE = 'test-invite-code'
const HOUR_MS = 60 * 60 * 1000

async function registerDevice(displayName = '太郎'): Promise<string> {
  const deviceToken = crypto.randomUUID()
  const res = await SELF.fetch('https://example.com/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inviteCode: VALID_INVITE_CODE,
      deviceToken,
      displayName,
      dailyGoal: 'normal',
    }),
  })
  expect(res.status).toBe(200)
  return deviceToken
}

function postGhost(deviceToken: string, body: unknown): Request {
  return new Request('https://example.com/ghosts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify(body),
  })
}

function deleteGhostOwn(deviceToken: string): Request {
  return new Request('https://example.com/ghosts/own', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${deviceToken}` },
  })
}

const VALID_PAYLOAD = {
  consent: true,
  displayName: 'ボス太郎',
  records: [
    { questionId: 'q-1', correct: true },
    { questionId: 'q-2', correct: false },
  ],
}

/** 当週ボスをghost週として直接初期化する（DELETE時の当週差し替えテスト用） */
async function initCurrentGhostBoss(sourceDeviceToken: string, maxHp: number) {
  const current = isoWeekInfo(Date.now())
  const bossId = bossIdFor(current)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
  await runInDurableObject(stub, (instance: RaidBossDO) => {
    instance.init({
      bossId,
      profile: { name: 'ゴースト・ボス太郎', flavor: 'テスト用ゴースト' },
      maxHp,
      startAt: current.weekStartAt,
      endAt: Date.now() + HOUR_MS, // status='active'を保つため期限を未来に置く
      bossType: 'ghost',
      defense: [{ questionId: 'q-1', multiplier: 0.5 }],
      ghost: { displayName: 'ボス太郎', defeatedCount: 2 },
      ghostSourceToken: sourceDeviceToken,
    })
  })
  return { bossId, stub }
}

afterEach(async () => {
  await reset()
})

describe('POST /ghosts', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch(postGhost('unknown-device', VALID_PAYLOAD))
    expect(res.status).toBe(401)
  })

  it('consentがtrue以外（false・欠落・文字列）は400になる', async () => {
    const deviceToken = await registerDevice()
    const invalidBodies = [
      { ...VALID_PAYLOAD, consent: false },
      { ...VALID_PAYLOAD, consent: 'true' },
      { displayName: VALID_PAYLOAD.displayName, records: VALID_PAYLOAD.records }, // consent欠落
    ]
    for (const body of invalidBodies) {
      const res = await SELF.fetch(postGhost(deviceToken, body))
      expect(res.status).toBe(400)
    }
  })

  it('displayName欠落・records欠落/空/不正要素は400になる', async () => {
    const deviceToken = await registerDevice()
    const invalidBodies = [
      { consent: true, records: VALID_PAYLOAD.records }, // displayName欠落
      { consent: true, displayName: '', records: VALID_PAYLOAD.records }, // 空文字
      { consent: true, displayName: 'x', records: [] }, // records空
      { consent: true, displayName: 'x', records: [{ questionId: 'q-1' }] }, // correct欠落
      { consent: true, displayName: 'x', records: [{ questionId: 'q-1', correct: 'yes' }] }, // 型不正
    ]
    for (const body of invalidBodies) {
      const res = await SELF.fetch(postGhost(deviceToken, body))
      expect(res.status).toBe(400)
    }
  })

  it('不正なJSONボディは400になる', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(
      new Request('https://example.com/ghosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
        body: '{not json',
      }),
    )
    expect(res.status).toBe(400)
  })

  // 【T-251・29のQ-26】displayNameは登録済みメンバーの表示名（'太郎'。registerDeviceの既定値）
  // を使う。VALID_PAYLOAD.displayName（'ボス太郎'）は自己申告のため無視される
  it('正常系: 200 { ok: true } を返し、KVにghost:<deviceToken>として保存される（displayNameは登録済みメンバー名）', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    expect(raw).not.toBeNull()
    const record = JSON.parse(raw!) as GhostRecord
    expect(record.displayName).toBe('太郎')
    expect(record.consent).toBe(true)
    expect(record.records).toEqual(VALID_PAYLOAD.records)
    expect(record.defeatedCount).toBe(0)
    expect(record.lastUsedBossId).toBeNull()
  })

  // T-251・29のQ-26: 以前はbody.displayName（自己申告・最大100字）をそのまま保存しており、
  // 他メンバーの表示名を騙ったゴースト（ボス名として全参加者に配信される）を誰でも作れた。
  // 修正後は自己申告のdisplayNameが何であっても、登録済みメンバー名で上書きされる
  it('なりすまし防止: 他メンバーの表示名を自己申告しても、登録済みメンバー名で保存される', async () => {
    const deviceToken = await registerDevice('本人太郎')
    const res = await SELF.fetch(
      postGhost(deviceToken, { ...VALID_PAYLOAD, displayName: '他人になりすまし' }),
    )
    expect(res.status).toBe(200)

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const record = JSON.parse(raw!) as GhostRecord
    expect(record.displayName).toBe('本人太郎')
    expect(record.displayName).not.toBe('他人になりすまし')
  })

  it('再POSTは記録を作り直す（defeatedCount・lastUsedBossIdが初期化される）', async () => {
    const deviceToken = await registerDevice()
    await env.MEMBERS.put(
      ghostKey(deviceToken),
      JSON.stringify({
        displayName: '旧名',
        consent: true,
        records: [{ questionId: 'old', correct: true }],
        createdAt: 0,
        defeatedCount: 5,
        lastUsedBossId: 'boss-old',
      } satisfies GhostRecord),
    )

    const res = await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))
    expect(res.status).toBe(200)

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const record = JSON.parse(raw!) as GhostRecord
    expect(record.displayName).toBe('太郎')
    expect(record.defeatedCount).toBe(0)
    expect(record.lastUsedBossId).toBeNull()
  })
})

describe('DELETE /ghosts/own', () => {
  it('未登録tokenは401になる', async () => {
    const res = await SELF.fetch(deleteGhostOwn('unknown-device'))
    expect(res.status).toBe(401)
  })

  it('記録が無くても200・冪等', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('KVから即時削除される', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))
    expect(await env.MEMBERS.get(ghostKey(deviceToken))).not.toBeNull()

    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)
    expect(await env.MEMBERS.get(ghostKey(deviceToken))).toBeNull()
  })

  it('当週ボスがこの記録由来なら、当週DOがsynthetic相当へ差し替わる（HP・累計ダメージは維持）', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))
    const { bossId, stub } = await initCurrentGhostBoss(deviceToken, 1000)

    // 事前にダメージを与えて「累計ダメージ維持」を検証できるようにする
    await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.syncDamage(
        'other-device',
        [{ attemptId: 'a-1', damage: 300, questionCount: 1, answeredAt: Date.now() }],
        Date.now(),
      ),
    )

    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)

    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(Date.now()),
    )
    expect(state?.bossId).toBe(bossId)
    expect(state?.bossType).toBe('synthetic')
    expect(state?.defense).toBeUndefined()
    expect(state?.ghost).toBeUndefined()
    expect(state?.maxHp).toBe(1000) // HP維持
    expect(state?.hp).toBe(700) // 累計ダメージ(300)維持
    const current = isoWeekInfo(Date.now())
    expect(state?.name).toBe(bossProfileForWeek(current.isoWeek).name) // syntheticローテーション名へ
  })

  it('当週ボスが別ユーザー由来のghostなら差し替えない', async () => {
    const deviceToken = await registerDevice()
    const otherToken = 'other-ghost-owner'
    const { bossId, stub } = await initCurrentGhostBoss(otherToken, 1000)

    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)

    const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
      instance.getBossState(Date.now()),
    )
    expect(state?.bossId).toBe(bossId)
    expect(state?.bossType).toBe('ghost') // 変化しない
  })

  it('当週ボスが未生成でも例外にならない', async () => {
    const deviceToken = await registerDevice()
    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)
  })

  // 何を防ぐか（レビュー指摘5）: T-335はlastUsedBossId（直近1週）しか辿らなかったため、
  // 同じゴーストが複数週で使われていると古い週のDOに問題別正誤詳細（defense）が
  // 保持期間の終わりまで残っていた。usedBossIdsで全使用週を辿って消す
  it('複数週で使われた場合、全ての週のDOから正誤詳細が消える', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))

    const current = isoWeekInfo(Date.now())
    const previous = previousWeekInfo(current)
    const older = previousWeekInfo(previous)
    const previousBossId = bossIdFor(previous)
    const olderBossId = bossIdFor(older)

    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const record = JSON.parse(raw!) as GhostRecord
    await env.MEMBERS.put(
      ghostKey(deviceToken),
      JSON.stringify({
        ...record,
        lastUsedBossId: previousBossId,
        usedBossIds: [previousBossId, olderBossId],
      }),
    )

    for (const [bossId, week] of [
      [previousBossId, previous],
      [olderBossId, older],
    ] as const) {
      const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
      await runInDurableObject(stub, (instance: RaidBossDO) => {
        instance.init({
          bossId,
          profile: { name: 'ゴースト・太郎', flavor: 'テスト用ゴースト' },
          maxHp: 1000,
          startAt: week.weekStartAt,
          endAt: Date.now(),
          bossType: 'ghost',
          defense: [{ questionId: 'q-1', multiplier: 0.5 }],
          ghost: { displayName: '太郎', defeatedCount: 0 },
          ghostSourceToken: deviceToken,
        })
      })
    }

    expect((await SELF.fetch(deleteGhostOwn(deviceToken))).status).toBe(200)

    for (const bossId of [previousBossId, olderBossId]) {
      const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))
      const state = await runInDurableObject(stub, (instance: RaidBossDO) =>
        instance.getBossState(Date.now()),
      )
      // 修正前は olderBossId 側が bossType='ghost' のまま残っていた
      expect(state?.bossType).toBe('synthetic')
      expect(state?.defense).toBeUndefined()
    }
  })

  // 何を防ぐか（T-335・K-70）: 同意画面は「いつでも撤回でき撤回すると記録がサーバーから
  // 即時削除される」と説明する（ADR 0013）。旧実装は当週DOしか差し替えず、この記録が
  // 直近の別の週（今週は選ばれていない＝lastUsedBossIdが今週と異なる）で使われていた場合、
  // その週のRaidBossDOには問題別正誤詳細（defense）が残り続けていた
  it('直近使用週（lastUsedBossId）が当週と異なる場合、そちらのDOも差し替わる', async () => {
    const deviceToken = await registerDevice()
    await SELF.fetch(postGhost(deviceToken, VALID_PAYLOAD))

    // 直近使用週は先週だった、というシナリオを再現する（今週は別のghost or syntheticのため
    // lastUsedBossIdが更新されず先週のbossIdのまま残っている状態）
    const previous = previousWeekInfo(isoWeekInfo(Date.now()))
    const previousBossId = bossIdFor(previous)
    const raw = await env.MEMBERS.get(ghostKey(deviceToken))
    const record = JSON.parse(raw!) as GhostRecord
    await env.MEMBERS.put(
      ghostKey(deviceToken),
      JSON.stringify({ ...record, lastUsedBossId: previousBossId }),
    )

    const previousStub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
    await runInDurableObject(previousStub, (instance: RaidBossDO) => {
      instance.init({
        bossId: previousBossId,
        profile: { name: 'ゴースト・太郎', flavor: 'テスト用ゴースト' },
        maxHp: 1000,
        startAt: previous.weekStartAt,
        endAt: Date.now(),
        bossType: 'ghost',
        defense: [{ questionId: 'q-1', multiplier: 0.5 }],
        ghost: { displayName: '太郎', defeatedCount: 0 },
        ghostSourceToken: deviceToken,
      })
    })

    // 今週は無関係（未生成）のまま撤回する
    const res = await SELF.fetch(deleteGhostOwn(deviceToken))
    expect(res.status).toBe(200)

    const previousState = await runInDurableObject(previousStub, (instance: RaidBossDO) =>
      instance.getBossState(Date.now()),
    )
    // 修正前はここがbossType='ghost'のまま（defenseが残り続ける）だった
    expect(previousState?.bossType).toBe('synthetic')
    expect(previousState?.defense).toBeUndefined()
    expect(previousState?.ghost).toBeUndefined()
  })
})
