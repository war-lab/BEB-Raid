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
import { env, runInDurableObject, SELF } from 'cloudflare:test'
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
  const deviceToken = `device-${crypto.randomUUID()}`
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

  it('ホストのWebSocket切断でルームがクローズされ、参加者へroom_closedが伝わる', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト7')
    const aliceToken = await registerDevice('アリス7')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    const aliceClosed = nextClose(aliceWs)
    hostWs.close(1000, 'client_disconnect')
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

  it('参加者（ホスト以外）の切断ではルームは閉じない', async () => {
    const code = freshCode()
    const hostToken = await registerDevice('ホスト7b')
    const aliceToken = await registerDevice('アリス7b')
    const stub = await createRoom(code, hostToken)
    const hostWs = await connect(stub, code, hostToken)
    const aliceWs = await connect(stub, code, aliceToken)

    await joinAndDrain(aliceWs, 'アリス7b', 5, [hostWs, aliceWs])

    const hostRoomState = nextMessage(hostWs) // アリス切断によるroomState再配信
    aliceWs.close(1000, 'client_disconnect')
    const afterLeave = (await hostRoomState) as { type: 'roomState'; participants: unknown[] }
    expect(afterLeave.type).toBe('roomState')
    expect(afterLeave.participants).toEqual([])

    await runInDurableObject(stub, (instance: BattleRoomDO) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((instance as any).meta?.phase).toBe('lobby')
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
})
