// 週次ボスDurable Object（正本: docs/17_M3実装計画.md 3.4節・3.5節）。
// 1ボス=1インスタンス（idFromName(bossId)で解決）。SQLiteストレージに
// state（1行）とdamage_attempts（attemptId主キー・冪等）の2表を持つ

import { DurableObject } from 'cloudflare:workers'

import type { RaidBossState, RaidContribution, RaidStatus } from '@beb-raid/shared-schema'

import type { BossProfile } from './bossProfiles'
import type { Env, MemberRecord } from './env'
import { memberKey } from './env'

const FIVE_MINUTES_MS = 5 * 60 * 1000

export interface InitBossParams {
  bossId: string
  profile: BossProfile
  maxHp: number
  startAt: number
  endAt: number
}

export interface DamageSyncEntry {
  attemptId: string
  damage: number
  questionCount: number
  answeredAt: number
}

export interface SyncDamageResult {
  acceptedIds: string[]
  boss: RaidBossState
}

interface StateRow extends Record<string, string | number | null> {
  bossId: string
  name: string
  profileJson: string
  maxHp: number
  startAt: number
  endAt: number
  defeatedAt: number | null
}

export class RaidBossDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS state (
        bossId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        profileJson TEXT NOT NULL,
        maxHp INTEGER NOT NULL,
        startAt INTEGER NOT NULL,
        endAt INTEGER NOT NULL,
        defeatedAt INTEGER
      )
    `)
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS damage_attempts (
        attemptId TEXT PRIMARY KEY,
        deviceToken TEXT NOT NULL,
        damage INTEGER NOT NULL,
        questionCount INTEGER NOT NULL,
        answeredAt INTEGER NOT NULL,
        receivedAt INTEGER NOT NULL
      )
    `)
  }

  /** ボス未初期化のときだけ初期化する（冪等。週次cronの再実行・重複呼び出し対策） */
  init(params: InitBossParams): void {
    if (this.getStateRow()) return
    this.ctx.storage.sql.exec(
      'INSERT INTO state (bossId, name, profileJson, maxHp, startAt, endAt, defeatedAt) VALUES (?, ?, ?, ?, ?, ?, NULL)',
      params.bossId,
      params.profile.name,
      JSON.stringify(params.profile),
      params.maxHp,
      params.startAt,
      params.endAt,
    )
  }

  /** 現在の状態を返す（未初期化ならundefined） */
  async getBossState(now: number, forDeviceToken?: string): Promise<RaidBossState | undefined> {
    const state = this.getStateRow()
    if (!state) return undefined
    return this.buildBossState(state, now, forDeviceToken)
  }

  /**
   * ダメージのバッチ受理（冪等。3.5節）。
   * 討伐後・帰属期間外（answeredAtが[startAt,endAt]外。J-49）のpayloadは加算しないが、
   * クライアント側pendingSyncを掃除できるようattemptIdはacceptedIdsに含める。
   * 受信（receivedAt）自体がendAtを過ぎていても、answeredAtが期間内なら加算する
   * （J-49: オフライン滞留分の正当な遅延到着を減点しない）
   */
  async syncDamage(
    deviceToken: string,
    entries: DamageSyncEntry[],
    receivedAt: number,
  ): Promise<SyncDamageResult> {
    const state = this.getStateRow()
    if (!state) throw new Error('boss is not initialized')

    const acceptedIds: string[] = []
    let defeated = state.defeatedAt !== null

    for (const entry of entries) {
      if (this.hasAttempt(entry.attemptId)) {
        acceptedIds.push(entry.attemptId)
        continue
      }

      // クライアント時計は信用しない: 未来方向に大きくずれた値は受信時刻へクランプする
      const answeredAt =
        entry.answeredAt > receivedAt + FIVE_MINUTES_MS ? receivedAt : entry.answeredAt
      const inPeriod = answeredAt >= state.startAt && answeredAt <= state.endAt

      // J-49: 受信(receivedAt)がボスの期限を過ぎていても、answeredAtが期間内なら加算する
      // （オフライン滞留分の正当な遅延到着を減点しない=01のオフライン正常系の原則）。
      // 拒否するのは「既に討伐済み」か「answeredAt自体が期間外」のときだけ
      if (defeated || !inPeriod) {
        acceptedIds.push(entry.attemptId)
        continue
      }

      this.ctx.storage.sql.exec(
        'INSERT INTO damage_attempts (attemptId, deviceToken, damage, questionCount, answeredAt, receivedAt) VALUES (?, ?, ?, ?, ?, ?)',
        entry.attemptId,
        deviceToken,
        entry.damage,
        entry.questionCount,
        answeredAt,
        receivedAt,
      )
      acceptedIds.push(entry.attemptId)

      if (!defeated && this.totalDamage() >= state.maxHp) {
        defeated = true
        this.ctx.storage.sql.exec(
          'UPDATE state SET defeatedAt = ? WHERE bossId = ?',
          receivedAt,
          state.bossId,
        )
      }
    }

    const finalState = this.getStateRow()!
    const boss = await this.buildBossState(finalState, receivedAt, deviceToken)
    return { acceptedIds, boss }
  }

  /**
   * 週次cron専用（EMA算出の内部集計。HTTPレスポンスには出さない）。
   * deviceToken別のダメージ合計を返す（未初期化なら空）
   */
  totalDamageByDeviceToken(): Record<string, number> {
    const rows = this.ctx.storage.sql
      .exec<{ deviceToken: string; damage: number }>(
        'SELECT deviceToken, SUM(damage) as damage FROM damage_attempts GROUP BY deviceToken',
      )
      .toArray()
    return Object.fromEntries(rows.map((row) => [row.deviceToken, row.damage]))
  }

  private getStateRow(): StateRow | undefined {
    return this.ctx.storage.sql.exec<StateRow>('SELECT * FROM state LIMIT 1').toArray()[0]
  }

  private totalDamage(): number {
    return this.ctx.storage.sql
      .exec<{ total: number }>('SELECT COALESCE(SUM(damage), 0) as total FROM damage_attempts')
      .one().total
  }

  private hasAttempt(attemptId: string): boolean {
    return (
      this.ctx.storage.sql
        .exec<{ c: number }>(
          'SELECT COUNT(*) as c FROM damage_attempts WHERE attemptId = ?',
          attemptId,
        )
        .one().c > 0
    )
  }

  private computeStatus(state: StateRow, now: number): RaidStatus {
    if (state.defeatedAt !== null) return 'defeated'
    if (now > state.endAt) return 'closed'
    return 'active'
  }

  private async buildBossState(
    state: StateRow,
    now: number,
    forDeviceToken?: string,
  ): Promise<RaidBossState> {
    const hp = Math.max(0, state.maxHp - this.totalDamage())
    const status = this.computeStatus(state, now)

    // 貢献一覧はランキングとして表示されるため、並び順（ダメージ降順）をサーバー側で保証する
    const grouped = this.ctx.storage.sql
      .exec<{ deviceToken: string; damage: number }>(
        'SELECT deviceToken, SUM(damage) as damage FROM damage_attempts GROUP BY deviceToken ORDER BY damage DESC',
      )
      .toArray()

    let myDamage = 0
    const contributions: RaidContribution[] = []
    for (const row of grouped) {
      if (row.deviceToken === forDeviceToken) myDamage = row.damage
      const raw = await this.env.MEMBERS.get(memberKey(row.deviceToken))
      const member = raw ? (JSON.parse(raw) as MemberRecord) : undefined
      contributions.push({
        // フォールバックはKVのmemberレコード欠損時（手動削除・KV障害）のみ通る。
        // そのままエンドユーザーの貢献一覧に表示される文字列である点に注意
        displayName: member?.displayName ?? '(不明なメンバー)',
        damage: row.damage,
      })
    }

    return {
      bossId: state.bossId,
      name: state.name,
      hp,
      maxHp: state.maxHp,
      startAt: state.startAt,
      endAt: state.endAt,
      status,
      participantCount: grouped.length,
      myDamage,
      contributions,
    }
  }
}
