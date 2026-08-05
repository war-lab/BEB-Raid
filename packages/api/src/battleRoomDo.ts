// イベントバトルの進行DO（正本: docs/22_M4実装計画.md 3.2節、docs/05 4.2節。T-124）。
// 1ルーム=1DO（idFromName(code)で解決）。BattleRoomDOはコンテンツ非依存
// （questionIdと換算点のみを扱い、問題文・選択肢・正解は一切持たない）。
//
// 【不変条件】DOの永続ストレージ（ctx.storage.sql / ctx.storage.get・put等のKV API）は
// 一切使わない（ルーム揮発の原則。docs/04 4節battleRooms行・docs/22 2.3節-3）。
// 例外はAlarms API（ctx.storage.setAlarm/deleteAlarm）のみ：2時間の強制クローズ用の
// 起床タイマーであり個人データを一切含まないため対象外と判断済み（docs/22の作業指示）。
// T-253でホスト切断の猶予期間タイマーにも同じAlarms APIを流用した（アラームは1つしか
// 予約できないため、猶予期間中は2時間タイマーを一時的に上書きし、再接続時に戻す）。
// こちらも個人データを含まない起床タイマーのため同じ扱いとする。
// ルーム状態はWebSocket Hibernation APIの流儀に従い、インスタンスフィールド＋各接続の
// serializeAttachmentのみで保持する。ルーム全体の共有メタ情報（フェーズ・現在の出題・
// deadlineAt等）は全接続のattachmentに重複して持たせる（1本のattachmentだけに置くと
// 他の接続が復元できないため。Cloudflareの推奨パターン）

import { DurableObject } from 'cloudflare:workers'

import type {
  BattleAnswerMessage,
  BattleCloseReason,
  BattleJoinMessage,
  BattleOpenQuestionMessage,
  BattleServerMessage,
  BattleStandingEntry,
} from '@beb-raid/shared-schema'
import { isBattleClientMessage } from '@beb-raid/shared-schema'

import type { Env } from './env'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000
const QUESTION_OPEN_MS = 30 * 1000
const SPEED_BONUS_RATE = 0.2
/**
 * ホスト切断時の猶予期間（T-253・29のQ-27）。通勤電車のトンネル等での瞬断1回で
 * ルーム全体が終了するのを防ぐため、切断から即クローズせずこの時間だけ再接続を待つ。
 * 60秒はトンネル通過や瞬断を吸収しつつ、ホストが本当に離脱した場合の参加者の
 * 待たされ時間を過大にしない値として暫定的に置いた（実測調整の対象）
 */
const HOST_DISCONNECT_GRACE_MS = 60 * 1000

type RoomPhase = 'lobby' | 'active' | 'result' | 'closed'
type ConnectionRole = 'host' | 'participant'

/**
 * 【T-245・29のQ-24】deviceTokenフィールドは持たない。currentAnswers（Map）のキーが
 * 既にdeviceTokenであり、値の中に同じ文字列（最大200字）を再度持たせるのは
 * attachmentサイズの純粋な無駄になる。questionIndexは、ハイバネーション復帰時に
 * 「この回答がどの設問に対するものか」をParticipantState.pendingAnswer経由で
 * 判定するために持つ（古い設問の回答を誤って現行設問の集計へ混ぜないため）
 */
interface AnswerRecord {
  questionIndex: number
  points: number
  receivedAt: number
}

/**
 * ルーム全体の共有メタ情報。個人紐づきデータ（表示名・得点等）は含まない。
 * 全接続のattachmentに同一内容を重複保持する（docs/22の作業指示）
 */
interface RoomMeta {
  roomCode: string
  hostToken: string
  phase: RoomPhase
  currentQuestionIndex: number | null
  currentQuestionId: string | null
  deadlineAt: number | null
  questionOpen: boolean
  /**
   * 現在オープン中の設問への解答。deviceToken単位で一意化する（T-184・29のQ-8）。
   * 一意化しないと、切断→再接続後の再回答で同一deviceTokenのエントリが複数積まれ、
   * closeQuestion側で二重加点できてしまう。クローズ時に速度ボーナス算出に使い、
   * クローズ後は空にする
   */
  currentAnswers: Map<string, AnswerRecord>
  /** ベストグロース賞の分母（出題数）算出用。openQuestionされた出題indexの集合 */
  openedQuestionIndexes: number[]
  createdAt: number
  /** join受信順（先着判定用）の採番カウンタ */
  nextJoinOrder: number
  /**
   * ホストが切断中で猶予期間中であることを示す起算時刻（T-253・29のQ-27）。
   * 切断していなければnull。ハイバネーション退避を挟んでも判定を継続できるよう
   * attachment経由で保持する（DO内部の状態のみで、クライアントへの新規配信は
   * 本タスクの範囲外。参加者UIへの可視化は別タスクで検討する）
   */
  hostDisconnectedAt: number | null
}

/**
 * 接続1本分の個人紐づき状態。
 * 【T-184・29のQ-8】DOインスタンスの `participantsByToken`（ルームの生存期間中メモリに保持）
 * にdeviceToken単位で永続化し、再接続時に同じオブジェクトを再利用する。
 * 切断のたびに totalPoints・answeredQuestionIndexes をゼロへ戻すと、
 * 電車内の瞬断で得点が消える不具合になるため。永続ストレージは使わない
 * （22の3.2節の設計を維持。DOインスタンス自体が破棄されればこの保持も失われるが、
 * それは「ルーム揮発の原則」の範囲内として許容する）
 */
interface ParticipantState {
  deviceToken: string
  role: ConnectionRole
  displayName: string | null
  expectedPointsPerQuestion: number | null
  totalPoints: number
  answeredQuestionIndexes: number[]
  /** join受信順。未joinはnull（ホストはjoinしないため常にnull） */
  joinOrder: number | null
  /**
   * 現在オープン中の設問への自分の回答（未回答、または既にclose集計済みならnull）。
   * 【T-245・29のQ-24】attachmentにはmeta.currentAnswers全体を含めず（attachmentMeta参照）、
   * 各参加者が「自分の回答だけ」を自分自身のattachmentに持つ形にする。これにより
   * attachment 1件あたりのサイズがルームの参加人数に比例して増えなくなる
   * （修正前はcurrentAnswers全体を毎回全員のattachmentへ複製しており、参加人数と
   * deviceToken長に比例して肥大し、Cloudflareの2,048バイト上限を超えて例外になっていた）。
   * ハイバネーション復帰時（コンストラクタ）は、questionIndexが現在の設問と一致する
   * pendingAnswerだけを集めてmeta.currentAnswersを再構築する
   */
  pendingAnswer: AnswerRecord | null
}

interface ConnectionAttachment {
  participant: ParticipantState
  meta: RoomMeta
}

interface Connection {
  ws: WebSocket
  participant: ParticipantState
}

/**
 * attachmentへ格納するためのmetaを作る（正本: docs/22_M4実装計画.md 3.2節、
 * docs/30_改修計画_全量レビュー棚卸し.md T-245・29のQ-24）。
 *
 * 【重要】currentAnswersは常に空のMapにする。currentAnswersは「現在オープン中の設問への
 * 全員分の回答」で参加人数に比例して増える値のため、これをmeta経由で毎回全員のattachmentへ
 * 複製すると、参加人数×deviceToken長に比例してattachment 1件あたりのサイズが増え、
 * Cloudflareの上限（2,048バイト）を超えて`serializeAttachment`が例外を投げる
 * （syncAttachmentsはループで全接続へ逐次呼ぶため、1件でも超過すると以降の接続への
 * 反映が止まり、attachment間の状態が不整合になっていた＝修正前の実際の不具合）。
 * 実データは各participantが自分の分だけをParticipantState.pendingAnswerとして持ち、
 * ハイバネーション復帰時（コンストラクタ）にそこから再構築する。
 * openedQuestionIndexesは設問数（最大30程度）しか無く参加人数に依存しないため、
 * 複製したままでも上限に影響しない
 */
function attachmentMeta(meta: RoomMeta): RoomMeta {
  return {
    ...meta,
    currentAnswers: new Map(),
    openedQuestionIndexes: [...meta.openedQuestionIndexes],
  }
}

/**
 * close frame の reason を shared-schema の BattleCloseReason に限定して接続を閉じる。
 * reason 文字列の正本は shared-schema 側の型ひとつであり、api側で任意の文字列を
 * 直接渡せないようにすることで、api↔app間の理由文字列のドリフトをtscで検出できる状態にする
 * （型に無い値を渡すとコンパイルエラーになる）。
 * close code は用途ごとに使い分けるため引数で受ける（1008=ポリシー違反、1000=正常終了）
 */
function closeWithReason(ws: WebSocket, code: number, reason: BattleCloseReason): void {
  ws.close(code, reason)
}

export class BattleRoomDO extends DurableObject<Env> {
  private meta: RoomMeta | null = null
  private connections = new Map<string, Connection>()
  /**
   * deviceToken単位のParticipantState roster（T-184・29のQ-8）。
   * `connections` は「今つながっているWebSocket」のみを追跡するのに対し、
   * こちらは「ルームに参加したことがあるdeviceToken」の得点・解答済み設問を
   * ルームの生存期間中メモリに保持し続ける。切断時に削除せず、再接続時（fetch内）に
   * 同じオブジェクトを再利用することでtotalPoints・answeredQuestionIndexesを維持する。
   * closeRoom（finish/ホスト切断/2時間経過）でのみクリアする
   */
  private participantsByToken = new Map<string, ParticipantState>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    // Hibernation復帰時の状態復元: コンストラクタで全WebSocketのattachmentから
    // インスタンスフィールドを再構築する（永続ストレージを使わないため、これが唯一の復元経路）
    for (const ws of ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as ConnectionAttachment | null
      if (!attachment) continue
      this.meta = attachment.meta
      this.connections.set(attachment.participant.deviceToken, {
        ws,
        participant: attachment.participant,
      })
      this.participantsByToken.set(attachment.participant.deviceToken, attachment.participant)
    }
    // 【T-245・29のQ-24】attachmentにはmeta.currentAnswersを含めていない（attachmentMeta参照）
    // ため、各参加者が持つpendingAnswerのうち現在の設問（currentQuestionIndex）に対する
    // ものだけを集めてcurrentAnswersを再構築する。古い設問のpendingAnswer（closeQuestionで
    // クリアし忘れた場合等）はquestionIndexの不一致で自然に無視される
    if (this.meta) {
      const rebuiltAnswers = new Map<string, AnswerRecord>()
      for (const [deviceToken, participant] of this.participantsByToken) {
        const pending = participant.pendingAnswer
        if (pending && pending.questionIndex === this.meta.currentQuestionIndex) {
          rebuiltAnswers.set(deviceToken, pending)
        }
      }
      this.meta.currentAnswers = rebuiltAnswers
    }
  }

  /**
   * ルーム作成（冪等な衝突チェック込み）。既存ルームが未使用またはclosed済みのときのみ
   * 新規ルームとして初期化しtrueを返す。進行中・ロビー中のルームがあればfalse（衝突）
   */
  async tryInit(code: string, hostToken: string, now: number): Promise<boolean> {
    if (this.meta && this.meta.phase !== 'closed') return false

    this.meta = {
      roomCode: code,
      hostToken,
      phase: 'lobby',
      currentQuestionIndex: null,
      currentQuestionId: null,
      deadlineAt: null,
      questionOpen: false,
      currentAnswers: new Map(),
      openedQuestionIndexes: [],
      createdAt: now,
      nextJoinOrder: 0,
      hostDisconnectedAt: null,
    }
    this.connections.clear()
    // 新規ルーム（またはclosed済みルームの再利用）なので、前回のルームの参加者roster
    // を引き継がない（T-184）
    this.participantsByToken.clear()
    // 2時間の強制タイムアウトクローズ（docs/22の作業指示。個人データを含まない起床タイマーのみ）
    await this.ctx.storage.setAlarm(now + TWO_HOURS_MS)
    return true
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected websocket', { status: 400 })
    }

    const protocolHeader = request.headers.get('Sec-WebSocket-Protocol')
    const deviceToken = extractBearerFromProtocol(protocolHeader)

    // 101応答には要求されたサブプロトコルを必ず反映する。反映しないとブラウザは
    // ハンドシェイクを失敗させ、接続が確立しないためcloseフレームのreasonが
    // クライアントへ届かない（拒否経路でこれを落としており、unauthorized /
    // room_not_found の案内が実ブラウザで汎用文に落ちていた）。
    // 成功経路・拒否経路の両方で同じヘッダを返す
    const upgradeHeaders = new Headers()
    if (protocolHeader) upgradeHeaders.set('Sec-WebSocket-Protocol', protocolHeader)

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    const registered = deviceToken ? await this.isRegisteredMember(deviceToken) : false
    const roomAvailable = this.meta !== null && this.meta.phase !== 'closed'

    this.ctx.acceptWebSocket(server)

    if (!deviceToken || !registered || !roomAvailable) {
      closeWithReason(server, 1008, !roomAvailable ? 'room_not_found' : 'unauthorized')
      return new Response(null, { status: 101, webSocket: client, headers: upgradeHeaders })
    }

    const role: ConnectionRole = this.meta!.hostToken === deviceToken ? 'host' : 'participant'

    // ホストが猶予期間中に再接続した（T-253・29のQ-27）。猶予を解除し、
    // 2時間の絶対タイムアウトへアラームを戻す（切断中はscheduleHostGraceCloseが
    // 猶予期間の短いアラームへ上書きしているため、ここで戻さないと本来の
    // 2時間より早く別の理由でクローズしてしまう経路が残る）
    if (role === 'host' && this.meta!.hostDisconnectedAt !== null) {
      this.meta!.hostDisconnectedAt = null
      this.ctx.waitUntil(this.ctx.storage.setAlarm(this.meta!.createdAt + TWO_HOURS_MS))
    }

    // 再接続（同じdeviceTokenでの再接続）なら既存のParticipantStateを再利用する。
    // 新規作成するとtotalPoints・answeredQuestionIndexesがゼロへ戻り、
    // 電車内の瞬断で得点が消える（T-184・29のQ-8）
    const participant: ParticipantState = this.participantsByToken.get(deviceToken) ?? {
      deviceToken,
      role,
      displayName: null,
      expectedPointsPerQuestion: null,
      totalPoints: 0,
      answeredQuestionIndexes: [],
      joinOrder: null,
      pendingAnswer: null,
    }
    this.connections.set(deviceToken, { ws: server, participant })
    this.participantsByToken.set(deviceToken, participant)
    server.serializeAttachment({
      participant,
      meta: attachmentMeta(this.meta!),
    } satisfies ConnectionAttachment)

    return new Response(null, { status: 101, webSocket: client, headers: upgradeHeaders })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.meta) return
    const conn = this.findConnectionByWs(ws)
    if (!conn) return

    let parsed: unknown
    try {
      parsed = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message))
    } catch {
      this.sendError(ws, 'invalid_message')
      return
    }
    if (!isBattleClientMessage(parsed)) {
      this.sendError(ws, 'invalid_message')
      return
    }

    switch (parsed.type) {
      case 'join':
        this.handleJoin(conn, parsed)
        break
      case 'answer':
        this.handleAnswer(conn, parsed)
        break
      case 'openQuestion':
        this.handleOpenQuestion(conn, parsed)
        break
      case 'closeQuestion':
        this.handleCloseQuestion(conn, parsed.questionIndex)
        break
      case 'finish':
        this.handleFinish(conn)
        break
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws)
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.handleDisconnect(ws)
  }

  /** 2時間の強制タイムアウトクローズ（docs/22 3.2節） */
  async alarm(): Promise<void> {
    this.closeRoom()
  }

  // ---------------------------------------------------------------------
  // メッセージハンドラ
  // ---------------------------------------------------------------------

  private handleJoin(conn: Connection, msg: BattleJoinMessage): void {
    if (!this.meta) return
    const expected = msg.expectedPointsPerQuestion > 0 ? msg.expectedPointsPerQuestion : 1
    conn.participant.displayName = msg.displayName
    conn.participant.expectedPointsPerQuestion = expected
    if (conn.participant.joinOrder === null) {
      conn.participant.joinOrder = this.meta.nextJoinOrder
      this.meta.nextJoinOrder += 1
    }
    this.syncAttachments()
    this.broadcastRoomState()
  }

  private handleAnswer(conn: Connection, msg: BattleAnswerMessage): void {
    if (!this.meta || conn.participant.role !== 'participant') return
    if (!this.meta.questionOpen) return
    if (this.meta.currentQuestionIndex !== msg.questionIndex) return
    if (this.meta.deadlineAt !== null && Date.now() > this.meta.deadlineAt) return
    if (conn.participant.answeredQuestionIndexes.includes(msg.questionIndex)) return

    conn.participant.answeredQuestionIndexes.push(msg.questionIndex)
    const record: AnswerRecord = {
      questionIndex: msg.questionIndex,
      points: msg.points,
      receivedAt: Date.now(),
    }
    // Map.set によりdeviceToken単位で一意化される（T-184・29のQ-8。
    // 万一同一deviceTokenで2回目の書き込みが起きても上書きにしかならず、二重加点しない）
    this.meta.currentAnswers.set(conn.participant.deviceToken, record)
    // 【T-245・29のQ-24】attachmentにはcurrentAnswers全体を含めない（attachmentMeta参照）ため、
    // ハイバネーション復帰後も自分の回答を失わないよう、自分自身のattachmentにも保持させる
    conn.participant.pendingAnswer = record
    this.syncAttachments()
  }

  private handleOpenQuestion(conn: Connection, msg: BattleOpenQuestionMessage): void {
    if (!this.meta) return
    if (!this.requireHost(conn)) return

    this.meta.phase = 'active'
    this.meta.currentQuestionIndex = msg.questionIndex
    this.meta.currentQuestionId = msg.questionId
    this.meta.questionOpen = true
    this.meta.currentAnswers = new Map()
    this.meta.deadlineAt = Date.now() + QUESTION_OPEN_MS
    if (!this.meta.openedQuestionIndexes.includes(msg.questionIndex)) {
      this.meta.openedQuestionIndexes.push(msg.questionIndex)
    }
    this.syncAttachments()
    this.broadcast({
      type: 'questionOpen',
      questionIndex: msg.questionIndex,
      questionId: msg.questionId,
      deadlineAt: this.meta.deadlineAt,
    })
  }

  private handleCloseQuestion(conn: Connection, questionIndex: number): void {
    if (!this.meta) return
    if (!this.requireHost(conn)) return
    if (this.meta.currentQuestionIndex !== questionIndex) return

    this.meta.questionOpen = false

    const participantCount = [...this.connections.values()].filter(
      (c) => c.participant.role === 'participant' && c.participant.displayName !== null,
    ).length

    const ordered = [...this.meta.currentAnswers.entries()].sort(
      ([, a], [, b]) => a.receivedAt - b.receivedAt,
    )
    ordered.forEach(([deviceToken, answer], index) => {
      const rank = index + 1
      const bonus =
        answer.points > 0 && participantCount > 0
          ? Math.round(answer.points * SPEED_BONUS_RATE * (1 - (rank - 1) / participantCount))
          : 0
      const finalPoints = answer.points + bonus
      // participantsByToken（deviceToken単位のroster）から加点する。connectionsではなく
      // こちらを見るのは、解答後クローズ前に瞬断した参加者の得点を取りこぼさないため（T-184）
      const target = this.participantsByToken.get(deviceToken)
      if (target) {
        target.totalPoints += finalPoints
        // 集計済みのため、以後のattachmentへ残す必要が無い（T-245。次の設問のpendingAnswerが
        // 上書きするまでの間、古い回答が復元対象として残り続けるのを防ぐ）
        target.pendingAnswer = null
      }
    })

    this.meta.currentAnswers = new Map()
    this.syncAttachments()
    this.broadcastStandings()
  }

  private handleFinish(conn: Connection): void {
    if (!this.meta) return
    if (!this.requireHost(conn)) return

    this.meta.phase = 'result'
    // ロスター（participantsByToken）基準にする。connectionsだけを見ると、finish送信の
    // 瞬間にたまたま瞬断中だった参加者が最終結果から丸ごと消える（T-265・29のQ-。
    // 得点はロスターに保持され続けているのに一覧にだけ出ない、という表示の欠陥だった）
    const joined = [...this.participantsByToken.values()].filter(
      (p) => p.role === 'participant' && p.displayName !== null,
    )

    const entries: BattleStandingEntry[] = [...joined]
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((p) => ({
        displayName: p.displayName!,
        totalPoints: p.totalPoints,
        connected: this.connections.has(p.deviceToken),
      }))

    const questionsAskedCount = this.meta.openedQuestionIndexes.length
    const withGrowth = joined.map((p) => {
      const denom = (p.expectedPointsPerQuestion ?? 1) * questionsAskedCount
      const growth = denom > 0 ? p.totalPoints / denom : 0
      return { p, growth }
    })
    withGrowth.sort((a, b) => b.growth - a.growth || (a.p.joinOrder ?? 0) - (b.p.joinOrder ?? 0))
    const best = withGrowth[0]?.p

    this.broadcast({
      type: 'result',
      entries,
      bestGrowth: { displayName: best?.displayName ?? '' },
    })
    this.closeRoom()
  }

  private handleDisconnect(ws: WebSocket): void {
    const conn = this.findConnectionByWs(ws)
    if (!conn) return
    this.connections.delete(conn.participant.deviceToken)
    if (conn.participant.role === 'host') {
      this.scheduleHostGraceClose()
      return
    }
    if (this.meta) {
      this.syncAttachments()
      this.broadcastRoomState()
    }
  }

  /**
   * ホスト切断時は即座にクローズせず、猶予期間（HOST_DISCONNECT_GRACE_MS）だけ待って
   * から再接続が無ければクローズする（T-253・29のQ-27）。通勤電車のトンネル等での
   * 瞬断1回でルーム全体が終了し、参加者を巻き込んで進行が失われるのを防ぐ。
   *
   * アラームは1つしか予約できない（setAlarmは既存の予約を上書きする）ため、2時間の
   * 絶対タイムアウト用アラームをこの猶予期間用アラームで一時的に上書きする。
   * 猶予期間中にホストが再接続すればfetch()側で2時間の絶対タイムアウトへ戻す。
   * 再接続が無ければこのアラームがそのまま発火し、alarm()は無条件にcloseRoom()を
   * 呼ぶため、猶予期間経過後は通常どおりクローズされる
   */
  private scheduleHostGraceClose(): void {
    if (!this.meta) return
    this.meta.hostDisconnectedAt = Date.now()
    this.syncAttachments()
    this.ctx.waitUntil(this.ctx.storage.setAlarm(Date.now() + HOST_DISCONNECT_GRACE_MS))
  }

  // ---------------------------------------------------------------------
  // クローズ処理
  // ---------------------------------------------------------------------

  /**
   * クローズ条件（finish受信・ホスト切断・2時間経過）共通の終了処理。
   * 全接続を閉じ、個人別データをメモリ上（インスタンスフィールド・attachment）からも
   * 完全に破棄する（永続ストレージには元々書いていない）
   */
  private closeRoom(): void {
    if (!this.meta || this.meta.phase === 'closed') return

    for (const conn of this.connections.values()) {
      try {
        closeWithReason(conn.ws, 1000, 'room_closed')
      } catch {
        // 既にクローズ済みの接続への close() 呼び出しは無視する
      }
    }
    this.connections.clear()
    this.participantsByToken.clear()
    this.meta = null
    this.ctx.waitUntil(this.ctx.storage.deleteAlarm())
  }

  // ---------------------------------------------------------------------
  // 補助
  // ---------------------------------------------------------------------

  private requireHost(conn: Connection): boolean {
    if (conn.participant.role === 'host') return true
    this.sendError(conn.ws, 'forbidden')
    return false
  }

  private findConnectionByWs(ws: WebSocket): Connection | undefined {
    for (const conn of this.connections.values()) {
      if (conn.ws === ws) return conn
    }
    return undefined
  }

  private async isRegisteredMember(deviceToken: string): Promise<boolean> {
    const raw = await this.env.MEMBERS.get(`member:${deviceToken}`)
    return raw !== null
  }

  /** 全接続のattachmentを現在のmeta＋各自のparticipantで再シリアライズする */
  private syncAttachments(): void {
    if (!this.meta) return
    const meta = attachmentMeta(this.meta)
    for (const conn of this.connections.values()) {
      conn.ws.serializeAttachment({
        participant: conn.participant,
        meta,
      } satisfies ConnectionAttachment)
    }
  }

  /**
   * 【T-265・29のQ-】参加者一覧はロスター（participantsByToken）基準にする。
   * connectionsだけを見ると、瞬断中の参加者が得点を保持したまま一覧から一時的に消え、
   * 復帰すると再び現れる（通勤電車のトンネル等で頻発する）。ロスターは切断時に削除せず
   * ルームの生存期間中（closeRoomまで）保持され続けるため一覧から消えない。
   *
   * 一方、ロスター基準へ単純に切り替えると「切断済みの参加者が常時『参加者』として
   * 表示され続ける」という別の挙動変化が生じる（T-184がこれを理由に一覧の更新を見送った）。
   * この方針では、`connected` フラグをBattleParticipant/BattleStandingEntryに追加して
   * 接続状態を露出することで両立させる: 一覧からは消えず（瞬断中の見え消えを解消）、
   * かつ現在の接続状態はUI側で判別できる（離脱者が常に「在席中」に見えることは無い）。
   * 順位表（standings）・最終結果（handleFinish）も同じ方針にする
   */
  private broadcastRoomState(): void {
    if (!this.meta) return
    const participants = [...this.participantsByToken.values()]
      .filter((p) => p.role === 'participant' && p.displayName !== null)
      .sort((a, b) => (a.joinOrder ?? 0) - (b.joinOrder ?? 0))
      .map((p) => ({ displayName: p.displayName!, connected: this.connections.has(p.deviceToken) }))
    this.broadcast({ type: 'roomState', participants })
  }

  private broadcastStandings(): void {
    if (!this.meta) return
    const entries: BattleStandingEntry[] = [...this.participantsByToken.values()]
      .filter((p) => p.role === 'participant' && p.displayName !== null)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((p) => ({
        displayName: p.displayName!,
        totalPoints: p.totalPoints,
        connected: this.connections.has(p.deviceToken),
      }))
    this.broadcast({ type: 'standings', entries })
  }

  private broadcast(message: BattleServerMessage): void {
    const payload = JSON.stringify(message)
    for (const conn of this.connections.values()) {
      try {
        conn.ws.send(payload)
      } catch {
        // 送信失敗（既にクローズ済み等）は無視する。webSocketClose側で接続を掃除する
      }
    }
  }

  private sendError(ws: WebSocket, code: string): void {
    try {
      ws.send(JSON.stringify({ type: 'error', code } satisfies BattleServerMessage))
    } catch {
      // ignore
    }
  }
}

/** `Sec-WebSocket-Protocol: bearer.<deviceToken>` からdeviceTokenを取り出す（docs/22 3.1節） */
export function extractBearerFromProtocol(header: string | null): string | null {
  if (!header) return null
  // ブラウザは複数候補をカンマ区切りで送ることがあるため先頭のみ見る
  const first = header.split(',')[0]?.trim() ?? ''
  const prefix = 'bearer.'
  if (!first.startsWith(prefix)) return null
  const token = first.slice(prefix.length)
  return token.length > 0 ? token : null
}
