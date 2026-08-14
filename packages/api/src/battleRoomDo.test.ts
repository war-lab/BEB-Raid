// BattleRoomDOのテスト（正本: docs/22_M4実装計画.md 3.2節、6節T-124シート）。
// WebSocket Hibernation APIはstub.fetch()経由の実WebSocketハンドシェイクで検証する
// （raidBossDo.test.tsのRPC直叩きパターンと異なり、WebSocketはfetch()のUpgradeを介する）。
//
// 【注意】broadcast()は接続中の全ソケット（ホスト含む）に送信するため、
// join/openQuestion/closeQuestion/finish はいずれも「送信者自身」にもメッセージが届く。
// nextMessage()はソケットごとのFIFOキューから取り出すため、各アクション後は
// 影響を受ける全ソケット分を明示的にdrainしてから次のアクションに進むこと
// （drainしないと後続のnextMessage()が古い未消費メッセージを誤って返す）

import type { BattleCloseReason, BattleServerMessage } from '@beb-raid/shared-schema'
import { env, evictDurableObject, runInDurableObject, SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import type { BattleRoomDO } from './battleRoomDo'

const VALID_INVITE_CODE = 'test-invite-code'

/**
 * サーバーが送出しうるクローズ理由の期待値。`satisfies Record<BattleCloseReason, BattleCloseReason>`
 * により、shared-schema側で理由が追加・改名・削除されるとこのテストがコンパイルエラーになる
 * （api実装とapp側の案内文が同じ正本を見ていることを型で担保する）。
 * 各キーは下の個別テストで1つずつ実際のclose frameと突き合わせており、
 * 「型にある理由がどれも実装から出ていない」状態を検出できる
 */
const CLOSE_REASONS = {
  unauthorized: 'unauthorized',
  room_not_found: 'room_not_found',
  room_closed: 'room_closed',
} as const satisfies Record<BattleCloseReason, BattleCloseReason>

async function registerDevice(displayName: string): Promise<string> {
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

function freshCode(): string {
  // idFromName用に一意なコードを使う（テスト間のDOインスタンス分離のため）
  return `T${crypto.randomUUID().slice(0, 3).toUpperCase()}`
}

async function createRoom(code: string, hostToken: string, now = Date.now()) {
  const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))
  const created = await stub.tryInit(code, hostToken, now)
  expect(created).toBe(true)
  return stub
}

interface QueueState {
  queue: BattleServerMessage[]
  waiters: Array<(msg: BattleServerMessage) => void>
}

const messageQueues = new WeakMap<WebSocket, QueueState>()

function attachQueue(ws: WebSocket): void {
  const state: QueueState = { queue: [], waiters: [] }
  messageQueues.set(ws, state)
  ws.addEventListener('message', (event: MessageEvent) => {
    const msg = JSON.parse(event.data as string) as BattleServerMessage
    const waiter = state.waiters.shift()
    if (waiter) waiter(msg)
    else state.queue.push(msg)
  })
}

/** ソケットごとのFIFOキューから次のメッセージを取り出す（未着なら到着まで待つ） */
function nextMessage(ws: WebSocket): Promise<BattleServerMessage> {
  const state = messageQueues.get(ws)
  if (!state) throw new Error('attachQueue()されていないWebSocketです')
  if (state.queue.length > 0) return Promise.resolve(state.queue.shift()!)
  return new Promise((resolve) => state.waiters.push(resolve))
}

async function connect(
  stub: ReturnType<typeof env.BATTLE_ROOM.get>,
  code: string,
  token: string,
): Promise<WebSocket> {
  const req = new Request(`https://battle.test/battle/rooms/${code}/ws`, {
    headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `bearer.${token}` },
  })
  const res = await stub.fetch(req)
  const ws = res.webSocket
  if (!ws) throw new Error('Upgradeレスポンスにwebsocketが含まれていません')
  ws.accept()
  attachQueue(ws)
  return ws
}

function nextClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.addEventListener(
      'close',
      (event: CloseEvent) => resolve({ code: event.code, reason: event.reason }),
      { once: true },
    )
  })
}

function send(ws: WebSocket, message: unknown) {
  ws.send(JSON.stringify(message))
}

/**
 * 条件が満たされるまでポーリングする（T-253テストの安定化）。
 *
 * WebSocketのclose（hostWs.close()）からDO側のwebSocketClose/handleDisconnectが
 * 実際に呼ばれるまでの伝播は非同期で、所要時間はランタイムの負荷に依存する
 * （固定のsetTimeout待機だと、CI等の高負荷環境で伝播が間に合わずテストが不安定になる）。
 * 固定時間待つ代わりに、条件が成立するまで短間隔でポーリングし、タイムアウト
 * （既定2秒。伝播時間として通常起こりえない上限）を超えたら明確な失敗にする
 */
async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 2000,
  intervalMs = 10,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() >= deadline) {
      throw new Error(`waitFor: 条件がタイムアウト(${timeoutMs}ms)内に満たされませんでした`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/** joinを送信し、broadcastRoomStateが届く全ソケット（送信者含む）をdrainする */
async function joinAndDrain(
  joiningWs: WebSocket,
  displayName: string,
  expectedPointsPerQuestion: number,
  allConnectedWs: WebSocket[],
): Promise<void> {
  send(joiningWs, { type: 'join', displayName, expectedPointsPerQuestion })
  for (const ws of allConnectedWs) await nextMessage(ws)
}

/** openQuestionを送信し、broadcastが届く全ソケット（ホスト含む）をdrainする */
async function openQuestionAndDrain(
  hostWs: WebSocket,
  questionIndex: number,
  questionId: string,
  allConnectedWs: WebSocket[],
): Promise<void> {
  send(hostWs, { type: 'openQuestion', questionIndex, questionId })
  for (const ws of allConnectedWs) await nextMessage(ws)
}

/** closeQuestionを送信し、broadcastStandingsが届く全ソケットからのstandingsを返す */
async function closeQuestionAndCollect(
  hostWs: WebSocket,
  questionIndex: number,
  allConnectedWs: WebSocket[],
): Promise<BattleServerMessage[]> {
  send(hostWs, { type: 'closeQuestion', questionIndex })
  const messages: BattleServerMessage[] = []
  for (const ws of allConnectedWs) messages.push(await nextMessage(ws))
  return messages
}

describe('BattleRoomDO', () => {
  it('参加→解答→順位（速度ボーナス）→result→クローズの一連が通る', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト')
    const aliceToken = await registerDevice('アリス')
    const bobToken = await registerDevice('ボブ')

    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const bobWs = await connect(stub, code, bobToken)
    const all = [hostWs, aliceWs, bobWs]

    // join（アリスが先着、ボブが後着）
    await joinAndDrain(aliceWs, 'アリス', 10, all)
    const bobRoomStates = await Promise.all([
      nextMessage(hostWs),
      nextMessage(aliceWs),
      (async () => {
        send(bobWs, { type: 'join', displayName: 'ボブ', expectedPointsPerQuestion: 10 })
        return nextMessage(bobWs)
      })(),
    ])
    expect(bobRoomStates[2]).toMatchObject({
      type: 'roomState',
      participants: [{ displayName: 'アリス' }, { displayName: 'ボブ' }],
    })

    // 出題オープン（ホストのみ）
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    // アリスが先に正答（10点）、ボブが後に誤答（0点）
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    // 受信順位を分けるため一呼吸置く
    await new Promise((r) => setTimeout(r, 5))
    send(bobWs, { type: 'answer', questionIndex: 0, points: 0 })
    await new Promise((r) => setTimeout(r, 5))

    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, all)
    const standings = standingsMsgs[0] as {
      type: 'standings'
      entries: { displayName: string; totalPoints: number }[]
    }
    expect(standings.type).toBe('standings')
    // アリス: 1位（受信順位1/2人）。ボーナス = round(10*0.2*(1-0/2)) = 2 → 12点
    // ボブ: 誤答なのでボーナスなし → 0点
    const alice = standings.entries.find((e) => e.displayName === 'アリス')
    const bob = standings.entries.find((e) => e.displayName === 'ボブ')
    expect(alice?.totalPoints).toBe(12)
    expect(bob?.totalPoints).toBe(0)

    // finish → result → クローズ
    const hostClose = nextClose(hostWs)
    const aliceClose = nextClose(aliceWs)
    const bobClose = nextClose(bobWs)
    send(hostWs, { type: 'finish' })
    const resultMsgs = await Promise.all(all.map((ws) => nextMessage(ws)))
    const result = resultMsgs[1] as {
      type: 'result'
      entries: { displayName: string; totalPoints: number }[]
      bestGrowth: { displayName: string }
    }
    expect(result.type).toBe('result')
    expect(result.bestGrowth.displayName).toBe('アリス')

    // finish後の全接続クローズは1000・room_closed（正常終了である旨をapp側に伝える）
    for (const closed of await Promise.all([hostClose, aliceClose, bobClose])) {
      expect(closed.code).toBe(1000)
      expect(closed.reason).toBe(CLOSE_REASONS.room_closed)
    }

    // クローズ後、個人別データが一切残っていないこと（メモリ上のインスタンスフィールド）
    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // 型はprivateだが実行時には到達可能。個人データを保持するフィールドが空であることを確認
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyInstance = instance as any
      expect(anyInstance.meta).toBeNull()
      expect(anyInstance.connections.size).toBe(0)
    })

    // 永続ストレージ（SQLite/KV API）を一切使っていないことの確認。
    // `_cf_`プレフィックスのテーブルはDurable Objectランタイムが常設する内部管理表
    // （本実装がCREATE TABLEを一切呼んでいないことのみを検証する）
    await runInDurableObject(stub, async (_instance, state) => {
      const listed = await state.storage.list()
      expect(listed.size).toBe(0)
      const tables = state.storage.sql
        .exec<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'",
        )
        .toArray()
      expect(tables).toEqual([])
    })
  })

  // 何を防ぐか（T-331・K-66）: joinメッセージのdisplayNameは自由入力で、以前は
  // そのまま採用していた。参加者が他メンバー（ホスト含む）の登録済み表示名を
  // そのまま名乗れると、順位表・最終結果上でなりすましが成立する
  it('joinで他メンバーの登録済み表示名を名乗っても、自分自身の登録済み表示名が採用される（なりすまし防止・T-331）', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('本物のホスト331')
    const mallory = await registerDevice('マロリー331')
    await createRoom(code, hostToken)
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))
    const hostWs = await connect(stub, code, hostToken)
    const malloryWs = await connect(stub, code, mallory)

    // マロリーはホストの登録済み表示名を名乗ってjoinしようとする
    const roomStates = await Promise.all([
      nextMessage(hostWs),
      (async () => {
        send(malloryWs, {
          type: 'join',
          displayName: '本物のホスト331',
          expectedPointsPerQuestion: 10,
        })
        return nextMessage(malloryWs)
      })(),
    ])
    // 採用されたのはマロリー自身の登録済み表示名（自称の「本物のホスト331」ではない）
    expect(roomStates[1]).toMatchObject({
      type: 'roomState',
      participants: [{ displayName: 'マロリー331' }],
    })
  })

  // 何を防ぐか（T-336・K-71）: participantCountは「現在接続中」の参加者数（connections基準）。
  // 解答してからクローズまでの間に複数人が瞬断すると、実際に解答した人数
  // （ordered.length）がparticipantCountを上回りうる。旧実装は分母にparticipantCountだけを
  // 使っており、最後発の回答者の (1 - (rank-1)/participantCount) が負になって速度ボーナスが
  // 負値になり、基礎点そのものを削っていた（=遅い回答者の得点が減る）
  it('解答後に複数人が瞬断してもparticipantCountがordered.lengthを下回らず、速度ボーナスが負値にならない（T-336）', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト336')
    const aliceToken = await registerDevice('アリス336')
    const bobToken = await registerDevice('ボブ336')
    const carolToken = await registerDevice('キャロル336')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const bobWs = await connect(stub, code, bobToken)
    const carolWs = await connect(stub, code, carolToken)
    const all = [hostWs, aliceWs, bobWs, carolWs]

    await joinAndDrain(aliceWs, 'アリス336', 10, all)
    await joinAndDrain(bobWs, 'ボブ336', 10, all)
    await joinAndDrain(carolWs, 'キャロル336', 10, all)
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    // 3人とも解答する（アリス→ボブ→キャロルの順。キャロルが最後発＝rank=3）
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    send(bobWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    send(carolWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))

    // 解答後、アリスとボブが瞬断する（残っているのはキャロルとホストのみ＝participantCount=1）
    const aliceDisconnected = Promise.all([nextMessage(hostWs), nextMessage(carolWs)])
    aliceWs.close(1000, 'client_disconnect')
    await aliceDisconnected
    const bobDisconnected = Promise.all([nextMessage(hostWs), nextMessage(carolWs)])
    bobWs.close(1000, 'client_disconnect')
    await bobDisconnected

    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, carolWs])
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    const carol = standings.entries.find((e) => e.displayName === 'キャロル336')
    // 修正前はparticipantCount=1・rank=3のため (1-(3-1)/1)=-1 となり、
    // bonus=round(10*0.2*-1)=-2 → finalPoints=8（基礎点10より減っていた）
    expect(carol?.totalPoints).toBeGreaterThanOrEqual(10)
  })

  // 何を防ぐか（T-337・K-72）: expectedPointsPerQuestionは自由入力で、旧実装は0以下だけを
  // 1へ床上げしていた。0より大きい極小値（例: 0.001）はそのまま通り、handleFinishの
  // growth算出（totalPoints / (expectedPointsPerQuestion×出題数)）の分母に入るため、
  // 実際の得点が低くても極小値のせいでgrowthが不当に膨らみ、ベストグロース賞を
  // 不正に取れてしまう
  it('expectedPointsPerQuestionに極小値を送っても、ベストグロース賞が不当に有利にならない（T-337）', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト337')
    const aliceToken = await registerDevice('アリス337')
    const bobToken = await registerDevice('ボブ337')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const bobWs = await connect(stub, code, bobToken)
    const all = [hostWs, aliceWs, bobWs]

    // アリスは正当な期待値（10）で高得点。ボブは極小の期待値（0.001）で低得点を狙う
    await joinAndDrain(aliceWs, 'アリス337', 10, all)
    await joinAndDrain(bobWs, 'ボブ337', 0.001, all)
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    send(bobWs, { type: 'answer', questionIndex: 0, points: 1 })
    await new Promise((r) => setTimeout(r, 5))
    await closeQuestionAndCollect(hostWs, 0, all)

    const hostClose = nextClose(hostWs)
    const aliceClose = nextClose(aliceWs)
    const bobClose = nextClose(bobWs)
    send(hostWs, { type: 'finish' })
    const result = (await nextMessage(hostWs)) as {
      type: 'result'
      bestGrowth: { displayName: string }
    }
    // 修正前はボブのgrowth=1/(0.001*1)=1000という異常値になり、
    // アリス（10/(10*1)=1）を押し退けて不当にベストグロース賞を取っていた
    expect(result.bestGrowth.displayName).toBe('アリス337')
    await Promise.all([hostClose, aliceClose, bobClose])
  })

  it('ホスト以外が openQuestion/closeQuestion/finish を送っても無視され、errorが返る', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト2')
    const aliceToken = await registerDevice('アリス2')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス2', 5, [hostWs, aliceWs])

    send(aliceWs, { type: 'openQuestion', questionIndex: 0, questionId: 'q-1' })
    const error = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(error).toEqual({ type: 'error', code: 'forbidden' })

    send(aliceWs, { type: 'closeQuestion', questionIndex: 0 })
    const error2 = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(error2).toEqual({ type: 'error', code: 'forbidden' })

    send(aliceWs, { type: 'finish' })
    const error3 = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(error3).toEqual({ type: 'error', code: 'forbidden' })

    // 参加者からの進行メッセージはすべて拒否され、ルームは閉じない
    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).meta?.phase).toBe('lobby')
    })
  })

  it('未登録deviceTokenの接続は1008・unauthorizedでクローズされる', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト3')
    const stub = await createRoom(code, hostToken)

    const req = new Request(`https://battle.test/battle/rooms/${code}/ws`, {
      headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'bearer.unregistered-token' },
    })
    const res = await stub.fetch(req)
    const ws = res.webSocket
    if (!ws) throw new Error('websocketが取得できません')
    // 101応答に要求サブプロトコルが反映されていること。反映されないとブラウザは
    // ハンドシェイクを失敗させ、接続が確立しないため下のreasonがUIへ届かない
    // （このアサートが無かったため、実ブラウザで案内文が汎用文に落ちる不具合を
    //  テストが検出できていなかった）
    expect(res.headers.get('Sec-WebSocket-Protocol')).toBe('bearer.unregistered-token')
    ws.accept()
    const closed = await nextClose(ws)
    expect(closed.code).toBe(1008)
    // app側（screens/battleCloseMessage.ts）がレイド未登録の案内文に分岐する理由文字列
    expect(closed.reason).toBe(CLOSE_REASONS.unauthorized)
  })

  it('存在しないルームコードへの接続は1008・room_not_foundでクローズされる', async () => {
    const code = freshCode()
    const someToken = await registerDevice('存在しない部屋テスト')
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))

    const req = new Request(`https://battle.test/battle/rooms/${code}/ws`, {
      headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `bearer.${someToken}` },
    })
    const res = await stub.fetch(req)
    const ws = res.webSocket
    if (!ws) throw new Error('websocketが取得できません')
    // 拒否経路でもサブプロトコルを反映すること（上と同じ理由）
    expect(res.headers.get('Sec-WebSocket-Protocol')).toBe(`bearer.${someToken}`)
    ws.accept()
    const closed = await nextClose(ws)
    expect(closed.code).toBe(1008)
    expect(closed.reason).toBe(CLOSE_REASONS.room_not_found)
  })

  it('deadline後の解答は無視される', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト4')
    const aliceToken = await registerDevice('アリス4')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const all = [hostWs, aliceWs]

    await joinAndDrain(aliceWs, 'アリス4', 5, all)
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    // deadlineAtを過去に書き換えて「時間切れ」を再現する（DO側タイマーが正のため、
    // ここではDOの内部状態を直接操作してdeadline経過を確定的に作る）
    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyInstance = instance as any
      anyInstance.meta.deadlineAt = Date.now() - 1
    })

    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, all)
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    expect(standings.entries.find((e) => e.displayName === 'アリス4')?.totalPoints).toBe(0)
  })

  it('同一参加者が同じ問題に二重解答しても2回目は無視される', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト5')
    const aliceToken = await registerDevice('アリス5')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const all = [hostWs, aliceWs]

    await joinAndDrain(aliceWs, 'アリス5', 5, all)
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 999 }) // 2回目（無視されるはず）
    await new Promise((r) => setTimeout(r, 5))

    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, all)
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 参加者1人なのでボーナス = round(10*0.2*(1-0/1)) = 2 → 12点（2回目の999は反映されない）
    expect(standings.entries.find((e) => e.displayName === 'アリス5')?.totalPoints).toBe(12)
  })

  it('同一コードで既存ルームがopenなら衝突扱いになり、closed後は再利用できる', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト6')
    const secondHostToken = await registerDevice('ホスト6b')
    const stub = env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(code))

    expect(await stub.tryInit(code, hostToken, Date.now())).toBe(true)
    // openなので2回目は衝突
    expect(await stub.tryInit(code, secondHostToken, Date.now())).toBe(false)

    const hostWs = await connect(stub, code, hostToken)
    const closeEvent = nextClose(hostWs)
    send(hostWs, { type: 'finish' })
    await closeEvent

    // closed後は同じコードでも再利用できる
    expect(await stub.tryInit(code, secondHostToken, Date.now())).toBe(true)
  })

  // T-253・29のQ-27: 以前はホストのWebSocket切断（webSocketClose/webSocketError）が
  // 猶予なく即座にcloseRoom()を呼んでおり、通勤電車のトンネル等での瞬断1回で
  // ルーム全体（参加者を巻き込んで）が終了していた。以下は猶予期間の3つの分岐
  // （即時クローズしない・猶予内の再接続で継続・猶予経過後はクローズ）を検証する
  describe('ホスト切断の猶予（T-253・29のQ-27）', () => {
    it('ホストが切断しても即座にはクローズされない（猶予期間中は参加者接続も維持される）', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト7')
      const aliceToken = await registerDevice('アリス7')
      const stub = await createRoom(code, hostToken)
      const hostWs = await connect(stub, code, hostToken)
      const aliceWs = await connect(stub, code, aliceToken)

      hostWs.close(1000, 'client_disconnect')
      // handleDisconnectの処理完了をポーリングで待つ（固定時間待機は高負荷環境で不安定なため）
      await waitFor(() =>
        runInDurableObject(stub, (instance: BattleRoomDO) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyInstance = instance as any
          return anyInstance.meta !== null && anyInstance.meta.hostDisconnectedAt !== null
        }),
      )

      await runInDurableObject(stub, (instance: BattleRoomDO) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyInstance = instance as any
        // 修正前はここでmetaがnullになり、ルームが終了していた
        expect(anyInstance.meta).not.toBeNull()
        expect(anyInstance.meta.phase).not.toBe('closed')
        expect(anyInstance.meta.hostDisconnectedAt).not.toBeNull()
      })
      // アリスの接続はまだ生きている（クローズされていない）
      aliceWs.close(1000, 'test_teardown')
    })

    it('猶予期間中にホストが再接続すると、猶予が解除され2時間タイマーへ戻る', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト7c')
      const stub = await createRoom(code, hostToken)
      let hostWs = await connect(stub, code, hostToken)

      hostWs.close(1000, 'client_disconnect')
      await waitFor(() =>
        runInDurableObject(stub, (instance: BattleRoomDO) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (instance as any).meta.hostDisconnectedAt !== null
        }),
      )

      await runInDurableObject(stub, (instance: BattleRoomDO) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect((instance as any).meta.hostDisconnectedAt).not.toBeNull()
      })

      // 猶予期間中にホストが再接続する
      hostWs = await connect(stub, code, hostToken)
      await waitFor(() =>
        runInDurableObject(stub, (instance: BattleRoomDO) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (instance as any).meta.hostDisconnectedAt === null
        }),
      )

      await runInDurableObject(stub, async (instance: BattleRoomDO, state) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyInstance = instance as any
        expect(anyInstance.meta.hostDisconnectedAt).toBeNull()
        expect(anyInstance.meta.phase).not.toBe('closed')

        // アラームが猶予期間（60秒後）ではなく、2時間の絶対タイムアウトへ戻っていること
        const alarmAt = await state.storage.getAlarm()
        expect(alarmAt).not.toBeNull()
        expect(alarmAt!).toBeGreaterThan(Date.now() + 60 * 60 * 1000) // 猶予期間よりずっと先
      })
      hostWs.close(1000, 'test_teardown')
    })

    it('猶予期間が満了してもホストが再接続しなければ、クローズされ参加者へroom_closedが伝わる', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト7d')
      const aliceToken = await registerDevice('アリス7d')
      const stub = await createRoom(code, hostToken)
      const hostWs = await connect(stub, code, hostToken)
      const aliceWs = await connect(stub, code, aliceToken)

      const aliceClosed = nextClose(aliceWs)
      hostWs.close(1000, 'client_disconnect')
      await new Promise((r) => setTimeout(r, 10))

      // 猶予期間の満了をalarm()の直接呼び出しでシミュレートする
      // （2時間経過のテストと同じ手法。実際のタイマー発火を待たない）
      await runInDurableObject(stub, (instance: BattleRoomDO) => instance.alarm())

      const closed = await aliceClosed
      expect(closed.code).toBe(1000)
      expect(closed.reason).toBe(CLOSE_REASONS.room_closed)

      await runInDurableObject(stub, (instance: BattleRoomDO) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyInstance = instance as any
        expect(anyInstance.meta).toBeNull()
        expect(anyInstance.connections.size).toBe(0)
      })
    })
  })

  // T-265・29のQ-: 修正前は切断中の参加者がroomStateの一覧から消えていた（[]になっていた）。
  // ロスター（deviceToken単位）は切断時に削除しないため、修正後は一覧に残り続け、
  // connectedフラグだけがfalseになる（表示上は消えず、UI側で在席/離席を区別できる）
  it('参加者（ホスト以外）が切断してもルームは閉じず、roomStateの一覧からも消えない（connected:falseで残る。T-265）', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト7b')
    const aliceToken = await registerDevice('アリス7b')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス7b', 5, [hostWs, aliceWs])

    const hostRoomState = nextMessage(hostWs) // アリス切断によるroomState再配信
    aliceWs.close(1000, 'client_disconnect')
    const afterLeave = (await hostRoomState) as {
      type: 'roomState'
      participants: { displayName: string; connected: boolean }[]
    }
    expect(afterLeave.type).toBe('roomState')
    // 修正前はここが[]になっていた（一覧から消えていた）
    expect(afterLeave.participants).toEqual([{ displayName: 'アリス7b', connected: false }])

    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).meta?.phase).toBe('lobby')
    })
  })

  // T-265・29のQ-: 出題中に参加者が瞬断しても、順位表（standings）・最終結果（result）の
  // 一覧から消えない（得点は保持されたまま一覧にも残り続ける。connectedフラグで区別する）
  describe('参加者の瞬断中も順位表・最終結果の一覧から消えない（T-265）', () => {
    it('出題クローズ前に切断した参加者も、standingsの一覧に得点付きで残る', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト265a')
      const aliceToken = await registerDevice('アリス265a')
      const bobToken = await registerDevice('ボブ265a')
      const stub = await createRoom(code, hostToken)
      const hostWs = await connect(stub, code, hostToken)
      const aliceWs = await connect(stub, code, aliceToken)
      const bobWs = await connect(stub, code, bobToken)
      const all = [hostWs, aliceWs, bobWs]

      await joinAndDrain(aliceWs, 'アリス265a', 10, all)
      await joinAndDrain(bobWs, 'ボブ265a', 10, all)
      await openQuestionAndDrain(hostWs, 0, 'q-1', all)

      send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
      await new Promise((r) => setTimeout(r, 5))

      // アリスが解答済みのまま切断する（瞬断を再現）。ボブは接続を維持する
      const disconnectBroadcasts = Promise.all([nextMessage(hostWs), nextMessage(bobWs)])
      aliceWs.close(1000, 'client_disconnect')
      await disconnectBroadcasts

      const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, bobWs])
      const standings = standingsMsgs[0] as {
        type: 'standings'
        entries: { displayName: string; totalPoints: number; connected: boolean }[]
      }
      const alice = standings.entries.find((e) => e.displayName === 'アリス265a')
      // 修正前はstandings.entriesにアリスが一切現れなかった（一覧から消えていた）
      expect(alice).toBeDefined()
      // 参加者2人なのでボーナス = round(10*0.2*(1-0/2)) = 2 → 12点（解答時点で確定済み）
      expect(alice?.totalPoints).toBe(12)
      expect(alice?.connected).toBe(false)
      const bob = standings.entries.find((e) => e.displayName === 'ボブ265a')
      expect(bob?.connected).toBe(true)
    })

    it('finish時点で切断中の参加者も、最終結果の一覧に得点付きで残る', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト265b')
      const aliceToken = await registerDevice('アリス265b')
      const stub = await createRoom(code, hostToken)
      const hostWs = await connect(stub, code, hostToken)
      const aliceWs = await connect(stub, code, aliceToken)
      const all = [hostWs, aliceWs]

      await joinAndDrain(aliceWs, 'アリス265b', 5, all)
      await openQuestionAndDrain(hostWs, 0, 'q-1', all)
      send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
      await new Promise((r) => setTimeout(r, 5))
      await closeQuestionAndCollect(hostWs, 0, all)

      // finishの前にアリスが切断する
      const aliceDisconnected = nextMessage(hostWs)
      aliceWs.close(1000, 'client_disconnect')
      await aliceDisconnected

      const hostClose = nextClose(hostWs)
      send(hostWs, { type: 'finish' })
      const result = (await nextMessage(hostWs)) as {
        type: 'result'
        entries: { displayName: string; totalPoints: number; connected: boolean }[]
        bestGrowth: { displayName: string }
      }
      // 修正前はresult.entriesにアリスが一切現れず、ベストグロース賞も空になっていた
      const alice = result.entries.find((e) => e.displayName === 'アリス265b')
      expect(alice).toBeDefined()
      expect(alice?.totalPoints).toBe(12)
      expect(alice?.connected).toBe(false)
      expect(result.bestGrowth.displayName).toBe('アリス265b')
      await hostClose
    })

    // 何を防ぐか（T-328・K-63）: participantsByTokenはDOインスタンスのメモリ上にしか無く、
    // ハイバネーション退避（evictDurableObject）後の再構築は`ctx.getWebSockets()`から
    // しか行えない。アリスのようにwebSocketCloseが発火済み（=connectionsから削除済み、
    // getWebSockets()にも含まれない）参加者は、退避後の再構築で丸ごとロスターから
    // 消えていた（修正前はこのテストが失敗する）。ホストのattachmentに退避した
    // ロスターから復元できることを確認する
    it('切断済み参加者の得点は、ハイバネーション退避（evictDurableObject）後も残る', async () => {
      const code = freshCode()
      const hostToken = await registerDevice('ホスト328')
      const aliceToken = await registerDevice('アリス328')
      const bobToken = await registerDevice('ボブ328')
      const stub = await createRoom(code, hostToken)
      const hostWs = await connect(stub, code, hostToken)
      const aliceWs = await connect(stub, code, aliceToken)
      const bobWs = await connect(stub, code, bobToken)
      const all = [hostWs, aliceWs, bobWs]

      await joinAndDrain(aliceWs, 'アリス328', 10, all)
      await joinAndDrain(bobWs, 'ボブ328', 10, all)
      await openQuestionAndDrain(hostWs, 0, 'q-1', all)

      send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
      await new Promise((r) => setTimeout(r, 5))

      // アリスが解答済みのまま切断する（webSocketCloseが発火し、connectionsから削除される）
      const disconnectBroadcasts = Promise.all([nextMessage(hostWs), nextMessage(bobWs)])
      aliceWs.close(1000, 'client_disconnect')
      await disconnectBroadcasts

      // DOインスタンスを退避させる。アリスの接続は既にcloseされているため
      // ctx.getWebSockets()には含まれず、通常の復元経路では復元できない
      await evictDurableObject(stub)

      const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, bobWs])
      const standings = standingsMsgs[0] as {
        type: 'standings'
        entries: { displayName: string; totalPoints: number; connected: boolean }[]
      }
      const alice = standings.entries.find((e) => e.displayName === 'アリス328')
      // 修正前はロスターから消え、standings.entriesにアリスが一切現れなかった
      expect(alice).toBeDefined()
      // 参加者2人なのでボーナス = round(10*0.2*(1-0/2)) = 2 → 12点
      expect(alice?.totalPoints).toBe(12)
      expect(alice?.connected).toBe(false)
    })
  })

  it('2時間経過のalarmでルームがクローズされる', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト8')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)

    const closed = nextClose(hostWs)
    await runInDurableObject(stub, (instance: BattleRoomDO) => instance.alarm())
    await closed

    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).meta).toBeNull()
    })
  })

  // T-182・29のQ-19: 修正前は isBattleClientMessage が type しか見ないため、
  // 負数・NaN・文字列の points や上限超の displayName がそのまま通り、
  // totalPoints と順位表が壊れていた
  it('answer.points に負数・NaN・文字列を送っても拒否され、接続は切られず得点も壊れない', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト9')
    const aliceToken = await registerDevice('アリス9')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)
    const all = [hostWs, aliceWs]

    await joinAndDrain(aliceWs, 'アリス9', 5, all)
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)

    send(aliceWs, { type: 'answer', questionIndex: 0, points: -999 })
    const err1 = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(err1).toEqual({ type: 'error', code: 'invalid_message' })

    send(aliceWs, { type: 'answer', questionIndex: 0, points: Number.NaN })
    const err2 = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(err2).toEqual({ type: 'error', code: 'invalid_message' })

    send(aliceWs, { type: 'answer', questionIndex: 0, points: '999' })
    const err3 = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(err3).toEqual({ type: 'error', code: 'invalid_message' })

    // 接続が切られていないこと（正当な解答が引き続き受理されることで確認する）
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, all)
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 不正な解答は一切加点に反映されず、正当な10点のみが反映される
    // （参加者1人なのでボーナス = round(10*0.2*(1-0/1)) = 2 → 12点）
    expect(standings.entries.find((e) => e.displayName === 'アリス9')?.totalPoints).toBe(12)
  })

  it('join.displayName が上限超のメッセージは拒否され、参加者一覧に載らない', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト10')
    const aliceToken = await registerDevice('アリス10')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    send(aliceWs, {
      type: 'join',
      displayName: 'あ'.repeat(1000),
      expectedPointsPerQuestion: 10,
    })
    const err = (await nextMessage(aliceWs)) as { type: 'error'; code: string }
    expect(err).toEqual({ type: 'error', code: 'invalid_message' })

    // 接続は切られていないこと（正当なjoinが引き続き受理されることで確認する）
    await joinAndDrain(aliceWs, 'アリス10', 5, [hostWs, aliceWs])
    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyInstance = instance as any
      expect(anyInstance.meta?.phase).toBe('lobby')
    })
  })

  // T-184・29のQ-8: 参加者が再接続すると ParticipantState が新規作成され、
  // totalPoints と answeredQuestionIndexes がゼロに戻っていた（電車内の瞬断で得点が消える）
  it('参加者が切断→再接続しても、既に閉じた問題のtotalPointsは保持される', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト9b')
    const aliceToken = await registerDevice('アリス9b')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    let aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス9b', 5, [hostWs, aliceWs])
    await openQuestionAndDrain(hostWs, 0, 'q-1', [hostWs, aliceWs])

    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    const standings1Msgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, aliceWs])
    const standings1 = standings1Msgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 参加者1人なのでボーナス = round(10*0.2*(1-0/1)) = 2 → 12点
    expect(standings1.entries.find((e) => e.displayName === 'アリス9b')?.totalPoints).toBe(12)

    // 瞬断: アリスの接続が切れ、同じdeviceTokenで再接続する
    const aliceDisconnected = nextMessage(hostWs) // 切断によるroomState再配信をdrain
    aliceWs.close(1000, 'client_disconnect')
    await aliceDisconnected
    aliceWs = await connect(stub, code, aliceToken)

    // 再接続後にjoinし直す（アプリの再接続導線を想定。既存参加者としてroomStateへ戻る）
    await joinAndDrain(aliceWs, 'アリス9b', 5, [hostWs, aliceWs])

    // 2問目をオープン・解答・クローズし、totalPointsが前問の12点から積み上がることを確認する
    await openQuestionAndDrain(hostWs, 1, 'q-2', [hostWs, aliceWs])
    send(aliceWs, { type: 'answer', questionIndex: 1, points: 10 })
    await new Promise((r) => setTimeout(r, 5))
    const standings2Msgs = await closeQuestionAndCollect(hostWs, 1, [hostWs, aliceWs])
    const standings2 = standings2Msgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 修正前は再接続でtotalPointsが0へ戻るため12点、修正後は前問の12点+今回の12点=24点になる
    expect(standings2.entries.find((e) => e.displayName === 'アリス9b')?.totalPoints).toBe(24)
  })

  it('参加者が出題オープン中に切断→再接続して同じ問題へ再回答しても二重加点しない', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト10b')
    const aliceToken = await registerDevice('アリス10b')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    let aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス10b', 5, [hostWs, aliceWs])
    await openQuestionAndDrain(hostWs, 0, 'q-1', [hostWs, aliceWs])

    // 出題オープン中に解答してから切断する
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 5))

    const aliceDisconnected = nextMessage(hostWs) // 切断によるroomState再配信をdrain
    aliceWs.close(1000, 'client_disconnect')
    await aliceDisconnected
    aliceWs = await connect(stub, code, aliceToken)
    await joinAndDrain(aliceWs, 'アリス10b', 5, [hostWs, aliceWs])

    // 再接続後、同じ問題（questionIndex: 0）へ再回答を試みる（二重加点の再現条件）
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 999 })
    await new Promise((r) => setTimeout(r, 5))

    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, aliceWs])
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 参加者1人なのでボーナス = round(10*0.2*(1-0/1)) = 2 → 12点（再回答の999点分は反映されない）
    expect(standings.entries.find((e) => e.displayName === 'アリス10b')?.totalPoints).toBe(12)
  })

  // T-245・29のQ-24: 修正前はcurrentAnswers全体（参加者ごとのdeviceTokenを重複保持した
  // AnswerRecord）をmeta経由で毎回「全員の」attachmentへ複製していた。参加人数が増えると
  // attachment 1件あたりのサイズがCloudflareの上限（2,048バイト）を超えて例外になり、
  // syncAttachmentsがループ途中で落ちてattachment間の状態が不整合になっていた。
  //
  // 【実測についての注記】ローカルのvitest-pool-workers（workerd）は、直接の
  // serializeAttachment()呼び出しでも、evictDurableObject()による実際のハイバネーション
  // 退避でも、2,048バイト超過時に例外を投げない（本タスクの実装時に実測して確認した既知の
  // 制約。Cloudflareの実行時バイナリには`released.data.size() <= MAX_ATTACHMENT_SIZE`という
  // チェックが実在するが、ローカル簡易実装では発火しない）。そのためこのテストでは、
  // 構造化clone実バイト数の代わりにJSON.stringify長を近似値として使う
  // （JSON化はキー名の重複を圧縮しない分、実際のバイト数より大きめに出る＝安全側の近似）。
  // Node の `v8.serialize()`（Cloudflare Workersと同じV8シリアライザ）による実測でも、
  // 同規模（参加者15人・実際のdeviceToken長）で旧実装は2,377バイトとなり上限を超え、
  // 本修正後の実装は参加人数に依存せず約1,174バイト（上限内）に収まることを別途確認済み
  // （PR本文に実測値を記載）
  it('T-245: 参加人数が多い設問でも、修正後のattachmentは2,048バイト上限に収まる（旧実装なら超過していたことも実測で確認）', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト245')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)

    // 実際のdeviceToken形式（`device-`+crypto.randomUUID()）のまま、現実的なイベント
    // バトルの規模を上回る人数で再現する（旧実装はこの規模で既に上限超過する。実測値は
    // 下のconsole.log参照。displayName等はjoin省略により最小のためNode上のv8.serialize実測
    // （PR本文記載）よりは緩やかに増えるが、この人数でも上限超過を確認できる）
    const PARTICIPANT_COUNT = 45
    const participantWsList: WebSocket[] = []
    const tokens: string[] = []
    for (let i = 0; i < PARTICIPANT_COUNT; i++) {
      const token = await registerDevice(`参加者245-${i}`)
      tokens.push(token)
      participantWsList.push(await connect(stub, code, token))
    }
    const all = [hostWs, ...participantWsList]

    // join処理（O(N^2)のdrain）はこのテストの本質と無関係のため省略する。
    // handleAnswerはrole==='participant'であれば動作し、displayName（joined）の有無は
    // 添付サイズに影響しないため、joinを省いて全員がすぐ回答できるようにする
    await openQuestionAndDrain(hostWs, 0, 'q-1', all)
    for (const ws of participantWsList) {
      send(ws, { type: 'answer', questionIndex: 0, points: 10 })
    }
    await new Promise((r) => setTimeout(r, 300))

    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyInstance = instance as any
      const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length

      // 修正後: 実際にattachmentへ書き込まれた内容（deserializeAttachment経由）を実測する
      const sampleConn = anyInstance.connections.get(tokens[0])
      const actualAttachment = sampleConn.ws.deserializeAttachment()
      const actualBytes = byteLength({
        ...actualAttachment,
        meta: {
          ...actualAttachment.meta,
          currentAnswers: [...actualAttachment.meta.currentAnswers.entries()],
        },
      })

      // 旧実装の再現: 修正後もDOインスタンスのメモリ上（this.meta.currentAnswers）には
      // 全員分の回答が実際に記録されている（attachmentへ含めなくなっただけ）。この生データを使い、
      // 「旧実装のまま全員のattachmentへ複製していたら何バイトになっていたか」を実測する
      // （旧実装はAnswerRecordにdeviceTokenを重複保持していたため、それも再現する）
      const legacyStyleAttachment = {
        participant: sampleConn.participant,
        meta: {
          ...anyInstance.meta,
          currentAnswers: [...anyInstance.meta.currentAnswers.entries()].map(
            ([deviceToken, answer]: [
              string,
              { questionIndex: number; points: number; receivedAt: number },
            ]) => [
              deviceToken,
              { deviceToken, points: answer.points, receivedAt: answer.receivedAt },
            ],
          ),
        },
      }
      const legacyBytes = byteLength(legacyStyleAttachment)

      console.log(
        `T-245実測(JSON長近似・participants=${PARTICIPANT_COUNT}・` +
          `recordedAnswers=${anyInstance.meta.currentAnswers.size}): ` +
          `legacy=${legacyBytes}bytes actual=${actualBytes}bytes`,
      )

      expect(legacyBytes).toBeGreaterThan(2048)
      expect(actualBytes).toBeLessThan(2048)
    })
  })

  // T-245: pendingAnswer方式での再構築が正しいことの確認（ハイバネーション退避からの復帰後も
  // クローズ前の回答が失われない）。evictDurableObject（cloudflare:test）で実際に
  // WebSocket HibernationのDOインスタンスを退避させ、コンストラクタでの再構築を経由させる
  it('T-245: ハイバネーション退避（evictDurableObject）を挟んでも、設問クローズ前の回答は失われない', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト245b')
    const aliceToken = await registerDevice('アリス245b')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス245b', 5, [hostWs, aliceWs])
    await openQuestionAndDrain(hostWs, 0, 'q-1', [hostWs, aliceWs])

    // クローズ前に回答する（この時点でmeta.currentAnswersとparticipant.pendingAnswerの
    // 両方に記録される）
    send(aliceWs, { type: 'answer', questionIndex: 0, points: 10 })
    await new Promise((r) => setTimeout(r, 10))

    // 実際にDOインスタンスを退避させる（WebSocket接続自体はhibernateされ、生き続ける）。
    // 退避後の次回アクセスでコンストラクタが再実行され、attachmentから状態を再構築する
    await evictDurableObject(stub)

    // クローズはホストが送信する。退避直後でもコンストラクタでmeta（および
    // pendingAnswerからのcurrentAnswers再構築）が復元されていなければ、
    // アリスの回答が消えてボーナス込みの得点が0になってしまう
    const standingsMsgs = await closeQuestionAndCollect(hostWs, 0, [hostWs, aliceWs])
    const standings = standingsMsgs[0] as {
      entries: { displayName: string; totalPoints: number }[]
    }
    // 参加者1人なのでボーナス = round(10*0.2*(1-0/1)) = 2 → 12点
    // （退避前にpendingAnswerへ複製していなければ0点になるはずの回帰ケース）
    expect(standings.entries.find((e) => e.displayName === 'アリス245b')?.totalPoints).toBe(12)
  })
})
