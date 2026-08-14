// レビュー指摘1・4の回帰テスト。
// - 1: デプロイ前から存在するメンバー（逆引き索引を持たない）の表示名が保護されること
// - 4: 並行登録で登録枠・表示名予約が突破されないこと
import { env, reset } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MEMBER_KEY_PREFIX, memberKey, type MemberRecord } from './env'
import { MAX_REGISTERED_MEMBERS, registryStub } from './registryDo'

function member(displayName: string): MemberRecord {
  return { displayName, dailyGoal: 'normal', registeredAt: 1000 }
}

async function clearMembers(): Promise<void> {
  const list = await env.MEMBERS.list({ prefix: MEMBER_KEY_PREFIX })
  await Promise.all(list.keys.map((k) => env.MEMBERS.delete(k.name)))
}

// RegistryDoは単一インスタンス（idFromName('global')）なので、リセットしないと
// 先行テストで積んだ登録枠・表示名索引が後続テストへ持ち越される
afterEach(async () => {
  await reset()
})

describe('RegistryDo.reserve（レビュー指摘1・4）', () => {
  it('デプロイ前から存在するメンバーの表示名を別端末が取れない（backfill）', async () => {
    await clearMembers()
    // 逆引き索引を作らずに member:* だけを置く＝この検証を導入する前の状態
    await env.MEMBERS.put(memberKey('token-hanako'), JSON.stringify(member('花子')))

    const stub = registryStub(env)
    expect(await stub.reserve('token-other', '花子', 'normal', 1000)).toBe('name_taken')
    // 本人は自分の名前をそのまま使える
    expect(await stub.reserve('token-hanako', '花子', 'normal', 1000)).toBe('ok')
  })

  it('同じ表示名の並行登録は1件だけ成功する', async () => {
    await clearMembers()
    const stub = registryStub(env)
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => stub.reserve(`token-${i}`, 'かぶる名前', 'normal', 1000)),
    )
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'name_taken')).toHaveLength(7)
  })

  it('登録上限を超える並行登録は上限までしか成功しない', async () => {
    await clearMembers()
    const stub = registryStub(env)
    // 上限直前まで埋める
    for (let i = 0; i < MAX_REGISTERED_MEMBERS - 1; i++) {
      expect(await stub.reserve(`seed-${i}`, `name-${i}`, 'normal', 1000)).toBe('ok')
    }
    // 残り1枠へ5件を同時に投げる
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        stub.reserve(`rush-${i}`, `rush-name-${i}`, 'normal', 1000),
      ),
    )
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'limit_reached')).toHaveLength(4)
  })

  it('既存メンバーの表示名変更は上限到達後も通る（通さないと名前を変えられなくなる）', async () => {
    await clearMembers()
    const stub = registryStub(env)
    for (let i = 0; i < MAX_REGISTERED_MEMBERS; i++) {
      expect(await stub.reserve(`seed-${i}`, `name-${i}`, 'normal', 1000)).toBe('ok')
    }
    expect(await stub.reserve('seed-0', '新しい名前', 'normal', 1000)).toBe('ok')
    // 旧名は解放され、別の端末が取れる
    expect(await stub.reserve('seed-1', 'name-0', 'normal', 1000)).toBe('ok')
  })
})

describe('RegistryDo.reserve のKV書き込み（レビュー2巡目 指摘3・4）', () => {
  it('reserve()がKV正本まで書く（呼び出し側が別途書かないので食い違わない）', async () => {
    await clearMembers()
    const stub = registryStub(env)
    expect(await stub.reserve('token-a', '名前A', 'normal', 5000)).toBe('ok')

    const raw = await env.MEMBERS.get(memberKey('token-a'))
    expect(raw).not.toBeNull()
    const stored = JSON.parse(raw!) as MemberRecord
    expect(stored.displayName).toBe('名前A')
    expect(stored.registeredAt).toBe(5000)
  })

  it('同じ端末の名前A/Bを並行登録しても、索引とKVの最終名が一致する', async () => {
    await clearMembers()
    const stub = registryStub(env)
    await Promise.all([
      stub.reserve('token-a', '名前A', 'normal', 1000),
      stub.reserve('token-a', '名前B', 'normal', 1000),
    ])

    const stored = JSON.parse((await env.MEMBERS.get(memberKey('token-a')))!) as MemberRecord
    // KV上の最終名が索引でも自分のものになっている＝別端末が取れない
    expect(await stub.reserve('token-other', stored.displayName, 'normal', 1000)).toBe('name_taken')
  })

  it('再登録でEMAの冪等マーカーと登録日時を引き継ぐ（レビュー2巡目 指摘4）', async () => {
    await clearMembers()
    await env.MEMBERS.put(
      memberKey('token-a'),
      JSON.stringify({
        displayName: '旧名',
        dailyGoal: 'normal',
        registeredAt: 111,
        emaDailyDamage: 42,
        emaUpdatedForBossId: 'boss-2026-W33',
      } satisfies MemberRecord),
    )
    const stub = registryStub(env)
    expect(await stub.reserve('token-a', '新名', 'heavy', 999)).toBe('ok')

    const stored = JSON.parse((await env.MEMBERS.get(memberKey('token-a')))!) as MemberRecord
    expect(stored.displayName).toBe('新名')
    expect(stored.dailyGoal).toBe('heavy')
    // 落とすと、生成が途中失敗した週に再登録した利用者だけEMAが二度平滑化される
    expect(stored.emaUpdatedForBossId).toBe('boss-2026-W33')
    expect(stored.emaDailyDamage).toBe(42)
    expect(stored.registeredAt).toBe(111)
  })
})

// 何を防ぐか（レビュー3巡目 指摘1）: DOが単一スレッドでも、ストレージ以外のI/O
// （KVのget/put）をawaitしている間は他のイベントが割り込める。KVに遅延と失敗を注入して、
// 索引とKVが食い違わないこと・失敗時のrollbackが他リクエストを壊さないことを見る
describe('RegistryDo.reserve のKV待機中の割り込み（レビュー3巡目 指摘1）', () => {
  it('KVのputが遅れて完了順が入れ替わっても、索引とKV正本が一致する', async () => {
    await clearMembers()
    const original = env.MEMBERS.put.bind(env.MEMBERS)
    let call = 0
    const spy = vi.spyOn(env.MEMBERS, 'put').mockImplementation(async (key, value, opts) => {
      call += 1
      // 1回目だけ遅らせる＝先に始まった登録が後に完了する状況を作る
      const delay = call === 1 ? 40 : 0
      await new Promise((resolve) => setTimeout(resolve, delay))
      return original(key as string, value as string, opts)
    })

    try {
      await Promise.all([
        registryStub(env).reserve('token-a', '名前A', 'normal', 1000),
        registryStub(env).reserve('token-a', '名前B', 'normal', 1000),
      ])
    } finally {
      spy.mockRestore()
    }

    const stored = JSON.parse((await env.MEMBERS.get(memberKey('token-a')))!) as MemberRecord
    // KVの最終名が索引でも自分のものになっている（別端末が取れない）
    expect(await registryStub(env).reserve('token-other', stored.displayName, 'normal', 1000)).toBe(
      'name_taken',
    )
  })

  it('KV書き込みが失敗しても、他リクエストが確定した索引を巻き戻さない', async () => {
    await clearMembers()
    const original = env.MEMBERS.put.bind(env.MEMBERS)
    // 「どちらが先に処理されるか」に依存しないよう、書き込む内容で失敗させる対象を決める
    const spy = vi.spyOn(env.MEMBERS, 'put').mockImplementation(async (key, value, opts) => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      if (typeof value === 'string' && value.includes('取れない名前')) {
        throw new Error('KV書き込み失敗（注入）')
      }
      return original(key as string, value as string, opts)
    })

    const [failed, succeeded] = await Promise.all([
      registryStub(env).reserve('token-fail', '取れない名前', 'normal', 1000),
      registryStub(env).reserve('token-ok', '取れる名前', 'normal', 1000),
    ])
    spy.mockRestore()

    // 例外は投げない（投げるとblockConcurrencyWhileがDOごと落として他リクエストを巻き込む）
    expect(failed).toBe('storage_error')
    expect(succeeded).toBe('ok')
    // 失敗した側は枠も名前も予約したままにならない
    expect(await registryStub(env).reserve('token-other', '取れない名前', 'normal', 1000)).toBe(
      'ok',
    )
    // 成功した側の索引は生きている
    expect(await registryStub(env).reserve('token-third', '取れる名前', 'normal', 1000)).toBe(
      'name_taken',
    )
  })
})
