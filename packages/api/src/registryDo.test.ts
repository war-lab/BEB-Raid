// レビュー指摘1・4の回帰テスト。
// - 1: デプロイ前から存在するメンバー（逆引き索引を持たない）の表示名が保護されること
// - 4: 並行登録で登録枠・表示名予約が突破されないこと
import { env, reset } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'

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
    expect(await stub.reserve('token-other', '花子')).toBe('name_taken')
    // 本人は自分の名前をそのまま使える
    expect(await stub.reserve('token-hanako', '花子')).toBe('ok')
  })

  it('同じ表示名の並行登録は1件だけ成功する', async () => {
    await clearMembers()
    const stub = registryStub(env)
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => stub.reserve(`token-${i}`, 'かぶる名前')),
    )
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'name_taken')).toHaveLength(7)
  })

  it('登録上限を超える並行登録は上限までしか成功しない', async () => {
    await clearMembers()
    const stub = registryStub(env)
    // 上限直前まで埋める
    for (let i = 0; i < MAX_REGISTERED_MEMBERS - 1; i++) {
      expect(await stub.reserve(`seed-${i}`, `name-${i}`)).toBe('ok')
    }
    // 残り1枠へ5件を同時に投げる
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => stub.reserve(`rush-${i}`, `rush-name-${i}`)),
    )
    expect(results.filter((r) => r === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r === 'limit_reached')).toHaveLength(4)
  })

  it('既存メンバーの表示名変更は上限到達後も通る（通さないと名前を変えられなくなる）', async () => {
    await clearMembers()
    const stub = registryStub(env)
    for (let i = 0; i < MAX_REGISTERED_MEMBERS; i++) {
      expect(await stub.reserve(`seed-${i}`, `name-${i}`)).toBe('ok')
    }
    expect(await stub.reserve('seed-0', '新しい名前')).toBe('ok')
    // 旧名は解放され、別の端末が取れる
    expect(await stub.reserve('seed-1', 'name-0')).toBe('ok')
  })
})
