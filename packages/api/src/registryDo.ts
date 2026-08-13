// 登録枠と表示名予約を強整合に確定させるDO（レビュー指摘1・4。正本: docs/17 3.2節）。
//
// 【解決する問題】register.ts は次の2つをKVのread-then-writeで行っていた。
//   ①登録者数を数える → 上限未満なら登録
//   ②表示名の所有者を読む → 空なら登録・逆引き索引を作る
// どちらも並行リクエストが同じ古い状態を読めるため、上限付近で複数件が同時に成功し、
// 同じ表示名も複数端末が同時に取得できた。Workers KVは結果整合なので、別ロケーション間では
// 逐次に近いアクセスでも危険である（`inviteRateLimitDo.ts` が招待失敗カウンタで解いたのと同型）。
//
// 単一インスタンス（idFromName('global')）のDOへ移し、DOが単一スレッドで動く特性を使って
// 「枠の確認・表示名の確認・確定」を1回のRPCで原子的に行う。
//
// 【もう一つの問題】一意性判定が新設の逆引きキーだけを見ていたため、デプロイ前から
// 存在するメンバー（逆引きキーを持たない）の表示名が保護されなかった。DOの初期化時に
// KVの `member:*` を走査して索引を作り直す（backfill）ことで既存ユーザーにも効かせる。
//
// KV側の `member:*` は引き続き正本として書く（他のハンドラ・週次cronが読むため）。
// このDOが持つのは「枠数」と「表示名→deviceToken」の索引だけである。

import { DurableObject } from 'cloudflare:workers'

import { MEMBER_KEY_PREFIX, memberKey, type Env, type MemberRecord } from './env'
import { listAllKeys } from './kvList'

/** 登録可能なメンバー数の上限（docs/17 3.2節。register.tsから移設） */
export const MAX_REGISTERED_MEMBERS = 500

/** reserve() の結果。ok以外はregister.tsがそのままHTTPエラーへ写す */
export type ReserveOutcome = 'ok' | 'limit_reached' | 'name_taken'

interface NameRow extends Record<string, string | number | null> {
  displayName: string
  deviceToken: string
}

interface MemberRow extends Record<string, string | number | null> {
  deviceToken: string
}

export class RegistryDo extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS names (
        displayName TEXT PRIMARY KEY,
        deviceToken TEXT NOT NULL
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS members (
        deviceToken TEXT PRIMARY KEY
      )
    `)
  }

  /**
   * KVの `member:*` からDOの索引を作り直す（1回だけ）。
   *
   * デプロイ前から存在するメンバーはDOにも逆引きキーにも載っていないため、
   * これを通さないと既存ユーザーの表示名が一意性チェックから漏れる（レビュー指摘1）。
   * 完了フラグをストレージに残し、2回目以降は即座に戻る
   */
  private async backfillOnce(): Promise<void> {
    const done = await this.ctx.storage.get<boolean>('backfilled')
    if (done) return
    const keys = await listAllKeys(this.env.MEMBERS, { prefix: MEMBER_KEY_PREFIX })
    for (const key of keys) {
      const deviceToken = key.name.slice(MEMBER_KEY_PREFIX.length)
      const raw = await this.env.MEMBERS.get(key.name)
      if (!raw) continue
      const member = JSON.parse(raw) as MemberRecord
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO members (deviceToken) VALUES (?)',
        deviceToken,
      )
      if (member.displayName) {
        // 同じ表示名の既存重複（この検証が無かった頃に作られたもの）は先勝ちで1件だけ残す。
        // 取りこぼした側は次に表示名を変えるときに一意性チェックへ掛かる
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO names (displayName, deviceToken) VALUES (?, ?)',
          member.displayName,
          deviceToken,
        )
      }
    }
    await this.ctx.storage.put('backfilled', true)
  }

  /**
   * 1回の登録リクエストにつき1度だけ呼ぶ。枠の確認・表示名の確認・確定を原子的に行う。
   *
   * 判定と確定を別RPCへ分けると、並列リクエストが「全件の判定 → 全件の確定」の順に
   * まとめて処理されて判定同士が互いを観測できない（inviteRateLimitDo.ts の冒頭に
   * 実測を記録したTOCTOU）。ここでも1呼び出しに閉じる
   */
  async reserve(deviceToken: string, displayName: string): Promise<ReserveOutcome> {
    await this.backfillOnce()

    const isExisting =
      this.ctx.storage.sql
        .exec<MemberRow>('SELECT deviceToken FROM members WHERE deviceToken = ?', deviceToken)
        .toArray().length > 0

    // 上限は新規登録のみに掛ける（既存メンバーの表示名更新は上限到達後も通す。
    // 通さないと上限に達した瞬間から誰も名前を変えられなくなる）
    if (!isExisting) {
      const count = this.ctx.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM members')
        .toArray()[0]!.n
      if (count >= MAX_REGISTERED_MEMBERS) return 'limit_reached'
    }

    const owner = this.ctx.storage.sql
      .exec<NameRow>('SELECT * FROM names WHERE displayName = ?', displayName)
      .toArray()[0]
    if (owner && owner.deviceToken !== deviceToken) return 'name_taken'

    // 確定。旧名の索引は落とす（放置すると別ユーザーが旧名を取れなくなる）
    this.ctx.storage.sql.exec('DELETE FROM names WHERE deviceToken = ?', deviceToken)
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO names (displayName, deviceToken) VALUES (?, ?)',
      displayName,
      deviceToken,
    )
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO members (deviceToken) VALUES (?)',
      deviceToken,
    )
    return 'ok'
  }

  /** テスト・運用確認用。登録者数と表示名索引の件数を返す */
  async stats(): Promise<{ members: number; names: number }> {
    await this.backfillOnce()
    return {
      members: this.ctx.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM members')
        .toArray()[0]!.n,
      names: this.ctx.storage.sql
        .exec<{ n: number }>('SELECT COUNT(*) AS n FROM names')
        .toArray()[0]!.n,
    }
  }
}

/** 単一インスタンスのDOを引く（登録枠・表示名は全体で1つの整合点に集約する） */
export function registryStub(env: Env) {
  return env.REGISTRY.get(env.REGISTRY.idFromName('global'))
}

export { memberKey }
