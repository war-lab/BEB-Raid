// 招待コード誤りのレート制限カウンタ用DO（T-329・K-64。正本: docs/32 ウェーブ6）。
// 旧実装（register.ts）はKVへの素朴なread-modify-write（get→加算→put）でカウンタを
// 保持していた。並列リクエストだと複数のgetが同じ古いcountを読んでから書き込むため、
// 加算が失われる（lost update）。IPごとに1インスタンス（idFromName(ip)）のDOへ移し、
// DOが単一スレッドで動く特性（同一インスタンスへのメソッド呼び出しは直列化される）を
// 使って原子的にカウントする。SQLiteストレージへ保存するため、DOのエビクション
// （アイドル退避）を挟んでも15分のウィンドウ内はカウントが失われない。
//
// 【重要】判定（レート制限中か）・記録（失敗の加算）・クリア（成功時）を別々のRPC呼び出しに
// 分けた最初の実装では、並列リクエストの「1回目の呼び出し（判定）」が全リクエスト分
// 一括で処理され、その後にまとめて「2回目の呼び出し（記録）」が処理される
// （ラウンドベースのスケジューリング）という挙動を実測で確認した。この場合、どの1回目の
// 呼び出しも他リクエストのまだ処理されていない2回目（加算）を観測できず、閾値を大幅に
// 超えて通過してしまう（TOCTOU: time-of-check-to-time-of-use）。1リクエストにつき
// evaluate() を1回だけ呼ぶ構成にすることで、このラウンド分割そのものを起こりえなくする

import { DurableObject } from 'cloudflare:workers'

import type { Env } from './env'

/**
 * 【③招待コード誤りのレート制限】IPごとにウィンドウ内の失敗回数を数える。
 * 正しいコードでの登録成功時にカウンタをクリアするため、正規ユーザーの誤入力の
 * 誤爆で長時間ロックされることはない
 */
export const INVITE_FAILURE_WINDOW_MS = 15 * 60 * 1000
export const MAX_INVITE_FAILURES_PER_WINDOW = 10

export type InviteAttemptOutcome = 'rate_limited' | 'invalid_code' | 'ok'

interface CounterRow extends Record<string, string | number | null> {
  id: number
  count: number
  windowStart: number
}

export class InviteRateLimitDo extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counter (
        id INTEGER PRIMARY KEY,
        count INTEGER NOT NULL,
        windowStart INTEGER NOT NULL
      )
    `)
  }

  private getRow(): CounterRow | undefined {
    return this.ctx.storage.sql.exec<CounterRow>('SELECT * FROM counter WHERE id = 1').toArray()[0]
  }

  private isLimited(row: CounterRow | undefined, now: number): boolean {
    if (!row) return false
    if (now - row.windowStart > INVITE_FAILURE_WINDOW_MS) return false
    return row.count >= MAX_INVITE_FAILURES_PER_WINDOW
  }

  /**
   * 1回の登録リクエストにつき呼ばれる唯一のエントリポイント。
   * 招待コードの正誤（isValidCode）は呼び出し側（register.ts）で
   * タイミングセーフ比較済みの結果を渡す（この関数の中で比較はしない。
   * 比較自体の実行タイミングはIPごとの状態と無関係なため、ここで行っても行わなくても
   * タイミングからの推測可能性に差は無い）。
   *
   * - 既に閾値に達していれば、正誤に関わらず'rate_limited'を返す（正誤を見てから拒否すると、
   *   閾値ちょうどで待っては試すパターンに「このリクエストの正誤」を漏らしてしまうため、
   *   挙動ベースで一律ブロックする。J-103と同じ考え方）
   * - 未達で正しいコードなら、カウンタをクリアして'ok'を返す
   * - 未達で誤ったコードなら、失敗を1件加算して'invalid_code'を返す
   */
  evaluate(now: number, isValidCode: boolean): InviteAttemptOutcome {
    const row = this.getRow()
    if (this.isLimited(row, now)) return 'rate_limited'

    if (isValidCode) {
      if (row) this.ctx.storage.sql.exec('DELETE FROM counter')
      return 'ok'
    }

    const windowExpired = !row || now - row.windowStart > INVITE_FAILURE_WINDOW_MS
    if (windowExpired) {
      this.ctx.storage.sql.exec('DELETE FROM counter')
      this.ctx.storage.sql.exec(
        'INSERT INTO counter (id, count, windowStart) VALUES (1, 1, ?)',
        now,
      )
    } else {
      this.ctx.storage.sql.exec('UPDATE counter SET count = count + 1 WHERE id = 1')
    }
    return 'invalid_code'
  }
}
