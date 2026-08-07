// 週次ボスDurable Object（正本: docs/17_M3実装計画.md 3.4節・3.5節）。
// 1ボス=1インスタンス（idFromName(bossId)で解決）。SQLiteストレージに
// state（1行）とdamage_attempts（attemptId主キー・冪等）の2表を持つ

import { DurableObject } from 'cloudflare:workers'

import type {
  BossType,
  GhostBossInfo,
  GhostDefenseEntry,
  RaidBossState,
  RaidContribution,
  RaidStatus,
  RaidSummary,
} from '@beb-raid/shared-schema'

import type { BossProfile } from './bossProfiles'
import type { Env, MemberRecord } from './env'
import { memberKey } from './env'

const FIVE_MINUTES_MS = 5 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * J-49（オフライン滞留分の遅延到着を減点しない）はanswaredAtが期間内なら
 * receivedAtが期限後でも加算を許すが、上限が無いと無期限に「あの週のボスへ」
 * ダメージを追加できてしまう（T-332・K-67）。週次cronは前週のEMA・raidSummaryを
 * 生成完了直後に確定させる（scheduled.ts）ため、それより大幅に遅れた到着は
 * もはや正当な「オフライン滞留」ではなく、確定済みの集計を後から書き換えるだけになる。
 * 7日はRAID_DAYS（5日）に休日を挟んだ通勤サイクル1往復分の余裕を持たせた値
 */
const LATE_ARRIVAL_GRACE_MS = 7 * DAY_MS

/**
 * 1 deviceTokenが週次で貢献できるダメージの上限（ボスの現在maxHpに対する比率。T-330・K-65）。
 * MAX_DAMAGE_PER_PAYLOAD（raidValidation.ts）とMAX_SYNC_PAYLOADSだけでは、1リクエストの
 * 上限が実HPの30倍にもなり、複数リクエストへ分割すれば1台の端末が単独でボスを討伐できた。
 * maxHpに対する比率にするのは、絶対値だとボスの規模（登録人数）に応じてスケールしないため。
 * 0.5（50%）なら、1台の端末だけではmaxHpの半分までしか削れず、他の参加者の貢献なしに
 * 単独討伐することが構造的に不可能になる
 */
const MAX_DEVICE_SHARE_OF_MAX_HP = 0.5

/**
 * 表示名キャッシュのTTL（正本: docs/30_改修計画_全量レビュー棚卸し.md T-246・29のQ-28）。
 * buildBossStateは貢献者1人につきKV getを1回発行しており、これがGET /raid/current・
 * POST /raid/syncの両方の応答経路で毎回走る。メンバーがポーリングすると読取が増幅し、
 * KV無料枠（読取10万/日）を圧迫し得るため、DOインスタンスのメモリ上に短期キャッシュする。
 * 表示名は「再登録（同一tokenでの再POST）」でのみ変わる値のため、5分程度の遅延は許容できる
 */
const DISPLAY_NAME_CACHE_TTL_MS = 5 * 60 * 1000

export interface InitBossParams {
  bossId: string
  profile: BossProfile
  maxHp: number
  startAt: number
  endAt: number
  /** M4: ボス種別（docs/22 3.3節）。省略時は'synthetic'として初期化する */
  bossType?: BossType
  /** M4: ghost時のみ。questionId別の倍率（堅い0.5/弱点2.0） */
  defense?: GhostDefenseEntry[] | null
  /** M4: ghost時のみ。S5の名誉表示用（生成時点のdefeatedCountをそのまま埋め込む） */
  ghost?: GhostBossInfo | null
  /**
   * M4: ghost時のみ。記録提供者のdeviceToken（サーバー内部専用。RaidBossState経由で
   * クライアントへは絶対に出さない）。撤回時の当週差し替え判定・翌週cronのdefeatedCount
   * 加算判定に使う
   */
  ghostSourceToken?: string | null
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
  bossType: string
  defenseJson: string | null
  ghostJson: string | null
  ghostSourceToken: string | null
  /** T-327（K-62）: damage_attempts合計のランニング値。SUMクエリの代わりにこれを読む */
  totalDamage: number
}

export class RaidBossDO extends DurableObject<Env> {
  /**
   * 表示名の短期キャッシュ（T-246・29のQ-28）。DOインスタンスがメモリ上に生存している間だけ
   * 保持する（永続ストレージではない。DOがエビクトされれば消える＝再度KVを引くだけで
   * 実害はない）
   */
  private displayNameCache = new Map<string, { displayName: string; cachedAt: number }>()

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
    // 週の生成権の主張用（冪等化。docs/30 J-101・T-179）。1行だけを許すPRIMARY KEYで、
    // このDOインスタンス（=このbossId）に対する生成が「進行中」かどうかを表す
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS generation_claim (
        claimed INTEGER PRIMARY KEY
      )
    `)
    // M4: ゴースト関連カラムの追加（正本: docs/22 3.3節）。
    // 既存のCREATE TABLE IF NOT EXISTSは既存テーブルへ新カラムを足せないため、
    // PRAGMA table_infoで存在確認してから足りないカラムだけALTER TABLEする
    // （本番データがまだ無い開発段階だが、後方互換な移行処理として実装しておく）
    this.ensureColumn('bossType', "bossType TEXT NOT NULL DEFAULT 'synthetic'")
    this.ensureColumn('defenseJson', 'defenseJson TEXT')
    this.ensureColumn('ghostJson', 'ghostJson TEXT')
    this.ensureColumn('ghostSourceToken', 'ghostSourceToken TEXT')
    // T-327（K-62）: totalDamageをこのタイミングで新設した場合のみ、既存のdamage_attempts
    // 合計で初期値をバックフィルする（移行時1回だけのコスト。以後はこの列をランニング合計として
    // 使い、syncDamageの1件ごとにSUMクエリを走らせない）
    if (this.ensureColumn('totalDamage', 'totalDamage INTEGER NOT NULL DEFAULT 0')) {
      this.ctx.storage.sql.exec(
        'UPDATE state SET totalDamage = (SELECT COALESCE(SUM(damage), 0) FROM damage_attempts)',
      )
    }
  }

  /** stateテーブルに指定カラムが無ければALTER TABLEで追加する（冪等）。追加したらtrueを返す */
  private ensureColumn(column: string, addColumnDdl: string): boolean {
    const columns = this.ctx.storage.sql
      .exec<{ name: string }>('PRAGMA table_info(state)')
      .toArray()
    if (columns.some((c) => c.name === column)) return false
    this.ctx.storage.sql.exec(`ALTER TABLE state ADD COLUMN ${addColumnDdl}`)
    return true
  }

  /**
   * 週の生成権を主張する（冪等化。docs/30 J-101・T-179）。
   * `generateWeeklyBoss` の冒頭で呼ぶ。DOは単一スレッドで動くため、SQLiteの主キー制約による
   * 1行INSERTがそのまま原子的な主張になる（KVやハンドラ側のチェックでは並行リクエストの
   * 競合を防げない）。既に主張済み（cronと手動生成の競合、または並行リクエストの競合）なら
   * falseを返す。生成処理が例外を投げた場合は releaseGenerationClaim() で解放すること
   *
   * `generation_claim` テーブルは本操作の追加と同時に新設されたため、導入前に
   * `POST /admin/raid/generate` や旧cronで既にinit済みの週（例: boss-2026-W32）では
   * このテーブルが空のままになる。`state` 行の存在も同時に確認しないと、デプロイ後
   * 最初の呼び出しで誤って主張が成立し、既存週のEMAが二重に平滑化されてしまう
   * （`state` 行こそが「この週は生成済み」の実質的な正本であるため）
   */
  claimGeneration(): boolean {
    if (this.hasGenerationClaim()) return false
    if (this.getStateRow()) return false
    this.ctx.storage.sql.exec('INSERT INTO generation_claim (claimed) VALUES (1)')
    return true
  }

  /**
   * 生成権の解放（例外時専用。docs/30 J-101）。
   * 解放しないと、ボスが存在しないまま週が「生成済み」に固定され、手動生成でも復旧できない
   */
  releaseGenerationClaim(): void {
    this.ctx.storage.sql.exec('DELETE FROM generation_claim')
  }

  private hasGenerationClaim(): boolean {
    return (
      this.ctx.storage.sql.exec<{ c: number }>('SELECT COUNT(*) as c FROM generation_claim').one()
        .c > 0
    )
  }

  /** ボス未初期化のときだけ初期化する（冪等。週次cronの再実行・重複呼び出し対策） */
  init(params: InitBossParams): void {
    if (this.getStateRow()) return
    this.ctx.storage.sql.exec(
      `INSERT INTO state
        (bossId, name, profileJson, maxHp, startAt, endAt, defeatedAt, bossType, defenseJson, ghostJson, ghostSourceToken)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      params.bossId,
      params.profile.name,
      JSON.stringify(params.profile),
      params.maxHp,
      params.startAt,
      params.endAt,
      params.bossType ?? 'synthetic',
      params.defense ? JSON.stringify(params.defense) : null,
      params.ghost ? JSON.stringify(params.ghost) : null,
      params.ghostSourceToken ?? null,
    )
  }

  /**
   * 撤回（DELETE /ghosts/own）時の当週差し替え（docs/22 3.3節）。
   * 当週ボスがdeviceToken由来のghostボスであるときのみ、synthetic相当へ差し替える
   * （名前・bossType・defense/ghostのみ変更。HP・累計ダメージ・討伐状態は維持）。
   * 由来が一致しなければ何もせずfalseを返す（未初期化・別ユーザー由来・既にsyntheticの場合を含む）
   */
  revokeGhostIfOwner(deviceToken: string, replacementProfile: BossProfile): boolean {
    const state = this.getStateRow()
    if (!state || state.bossType !== 'ghost' || state.ghostSourceToken !== deviceToken) {
      return false
    }
    this.ctx.storage.sql.exec(
      `UPDATE state
         SET name = ?, profileJson = ?, bossType = 'synthetic', defenseJson = NULL, ghostJson = NULL, ghostSourceToken = NULL
       WHERE bossId = ?`,
      replacementProfile.name,
      JSON.stringify(replacementProfile),
      state.bossId,
    )
    return true
  }

  /**
   * 翌週cronのクローズ処理向け（docs/22 3.3節）。このボスがghost週で、かつ記録提供者の
   * deviceTokenが残っている（=撤回されていない）ときのみ情報を返す。
   * defeatedがtrueの場合のみdefeatedCountを+1する判断は呼び出し側（scheduled.ts）が行う
   */
  getGhostCloseInfo(): { ghostSourceToken: string; defeated: boolean } | undefined {
    const state = this.getStateRow()
    if (!state || state.bossType !== 'ghost' || !state.ghostSourceToken) return undefined
    return { ghostSourceToken: state.ghostSourceToken, defeated: state.defeatedAt !== null }
  }

  /**
   * クローズ処理の実施済みマーク（冪等化。docs/22 3.3節）。
   * ghostSourceTokenをクリアし、cronの再実行でdefeatedCountが二重加算されないようにする
   * （getGhostCloseInfoはghostSourceToken不在だとundefinedを返すため以後は完全に無視される）
   */
  markGhostCloseoutHandled(): void {
    const state = this.getStateRow()
    if (!state) return
    this.ctx.storage.sql.exec(
      'UPDATE state SET ghostSourceToken = NULL WHERE bossId = ?',
      state.bossId,
    )
  }

  /**
   * 週次データの掃除（T-247・29のQ-29。方針は docs/17_M3実装計画.md 3.4節に記録）。
   * cutoff（epoch ms）より前にこのボスの週が終了している（endAt < cutoff）場合のみ、
   * DOのSQLiteストレージを丸ごと削除する（deleteAll()はSQLiteバックエンドのDOで
   * state・damage_attempts・generation_claimの全テーブルを含めて消す。次回同じbossIdへ
   * アクセスがあってもCREATE TABLE IF NOT EXISTSが再実行され未初期化状態から始まるだけで、
   * cronは常に「当週」「前週」のみへアクセスするため実害はない）。
   * 呼び出し元（scheduled.ts）は結果をログ目的でのみ使う
   */
  async cleanupIfExpired(cutoff: number): Promise<'deleted' | 'kept' | 'not_found'> {
    const state = this.getStateRow()
    if (!state) return 'not_found'
    if (state.endAt >= cutoff) return 'kept'
    await this.ctx.storage.deleteAll()
    return 'deleted'
  }

  /**
   * 週次サマリ用（正本: docs/22 3.8節）。個人別データ（contributions・displayName等）を
   * 一切含まない集計のみを返す（未初期化ならundefined）。週次cronのクローズ処理で
   * `raidSummary:<bossId>` としてKVへ書き込むために使う
   */
  getSummary(): RaidSummary | undefined {
    const state = this.getStateRow()
    if (!state) return undefined
    const remainingHp = Math.max(0, state.maxHp - state.totalDamage)
    const participantCount = this.ctx.storage.sql
      .exec<{ c: number }>('SELECT COUNT(DISTINCT deviceToken) as c FROM damage_attempts')
      .one().c
    return {
      bossId: state.bossId,
      bossType: state.bossType as BossType,
      maxHp: state.maxHp,
      remainingHp,
      defeated: state.defeatedAt !== null,
      defeatedAt: state.defeatedAt,
      participantCount,
    }
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
    // T-327（K-62）: 旧実装は挿入1件ごとにdamage_attempts全体のSUMクエリ（totalDamage()）を
    // 走らせていたため、200件バッチの行読取が既存の挿入件数に比例して増えていた。
    // stateのランニング合計（totalDamage列）をここで1回だけ読み、以後はメモリ上で加算する
    let runningTotal = state.totalDamage
    // T-330（K-65）: この端末の週次累計をここで1回だけ読み、以後はメモリ上で加算する
    // （syncDamageは1問=1payloadで呼ばれるため、通常は既存のバッチ内get回数を増やさない）
    let deviceTotal = this.deviceTotalDamage(deviceToken)
    const deviceCap = Math.round(state.maxHp * MAX_DEVICE_SHARE_OF_MAX_HP)

    for (const entry of entries) {
      if (this.hasAttempt(entry.attemptId)) {
        acceptedIds.push(entry.attemptId)
        continue
      }

      // クライアント時計は信用しない: 未来方向に大きくずれた値は受信時刻へクランプする
      const answeredAt =
        entry.answeredAt > receivedAt + FIVE_MINUTES_MS ? receivedAt : entry.answeredAt
      const inPeriod = answeredAt >= state.startAt && answeredAt <= state.endAt
      // T-332（K-67）: J-49はreceivedAtが期限後でもanswaredAtが期間内なら加算を許すが、
      // 上限が無いと確定済みの週（EMA・raidSummaryが生成済み）へ無期限に後から
      // ダメージを追加できてしまう。7日を超えた到着はもはや正当な遅延到着ではないとみなす
      const tooLateToArrive = receivedAt > state.endAt + LATE_ARRIVAL_GRACE_MS

      // J-49: 受信(receivedAt)がボスの期限を過ぎていても、answeredAtが期間内なら加算する
      // （オフライン滞留分の正当な遅延到着を減点しない=01のオフライン正常系の原則）。
      // 拒否するのは「既に討伐済み」か「answeredAt自体が期間外」か「7日を超えて遅延到着」のとき
      if (defeated || !inPeriod || tooLateToArrive) {
        acceptedIds.push(entry.attemptId)
        continue
      }

      // T-330（K-65）: この端末の週次累計が上限（maxHpの50%）に達していれば、
      // このpayloadは加算せず捨てる（クライアント側pendingSyncは掃除させるため
      // acceptedIdsには含める。悪意ある端末の暴走を止める用途で、正規ユーザーの
      // 学習記録自体（IndexedDB側）には一切影響しない）
      if (deviceTotal >= deviceCap) {
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
      runningTotal += entry.damage
      deviceTotal += entry.damage

      if (!defeated && runningTotal >= state.maxHp) {
        defeated = true
        this.ctx.storage.sql.exec(
          'UPDATE state SET defeatedAt = ? WHERE bossId = ?',
          receivedAt,
          state.bossId,
        )
      }
    }

    if (runningTotal !== state.totalDamage) {
      this.ctx.storage.sql.exec(
        'UPDATE state SET totalDamage = ? WHERE bossId = ?',
        runningTotal,
        state.bossId,
      )
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

  /** T-330（K-65）: 1台の端末（deviceToken）の現在の週次累計ダメージ */
  private deviceTotalDamage(deviceToken: string): number {
    return this.ctx.storage.sql
      .exec<{ total: number }>(
        'SELECT COALESCE(SUM(damage), 0) as total FROM damage_attempts WHERE deviceToken = ?',
        deviceToken,
      )
      .one().total
  }

  private getStateRow(): StateRow | undefined {
    return this.ctx.storage.sql.exec<StateRow>('SELECT * FROM state LIMIT 1').toArray()[0]
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

  /**
   * 表示名をKVから解決する（T-246・29のQ-28）。TTL内はDOインスタンスのメモリ上キャッシュを
   * 使い、貢献者数×応答回数に比例してKV getが増えるのを防ぐ。フォールバック
   * （'(不明なメンバー)'）もキャッシュする＝KVのmemberレコードが手動削除等で恒久的に
   * 無い場合に毎回引きに行き続けるのを防ぐ（TTL経過後は再度引き直すため、後から
   * メンバーが復旧すれば反映される）
   */
  private async resolveDisplayName(deviceToken: string, now: number): Promise<string> {
    const cached = this.displayNameCache.get(deviceToken)
    if (cached && now - cached.cachedAt < DISPLAY_NAME_CACHE_TTL_MS) {
      return cached.displayName
    }
    const raw = await this.env.MEMBERS.get(memberKey(deviceToken))
    const member = raw ? (JSON.parse(raw) as MemberRecord) : undefined
    // そのままエンドユーザーの貢献一覧に表示される文字列である点に注意
    const displayName = member?.displayName ?? '(不明なメンバー)'
    this.displayNameCache.set(deviceToken, { displayName, cachedAt: now })
    return displayName
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
    const hp = Math.max(0, state.maxHp - state.totalDamage)
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
      contributions.push({
        displayName: await this.resolveDisplayName(row.deviceToken, now),
        damage: row.damage,
      })
    }

    const bossType = state.bossType as BossType

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
      bossType,
      defense:
        bossType === 'ghost' && state.defenseJson
          ? (JSON.parse(state.defenseJson) as GhostDefenseEntry[])
          : undefined,
      ghost:
        bossType === 'ghost' && state.ghostJson
          ? (JSON.parse(state.ghostJson) as GhostBossInfo)
          : undefined,
    }
  }
}
