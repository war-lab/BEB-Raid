// M4・T-125: 昼バトルWebSocket抽象化レイヤのテスト。
// - WebSocketBattleSocket: connect時にSec-WebSocket-Protocolでbearerトークンを付与すること、
//   受信JSONの正規化（未知メッセージの棄却）、送信・クローズの委譲
// - FakeBattleSocket: emitMessage/emitCloseでハンドラが駆動されること
import { describe, expect, it, vi } from 'vitest'
import { FakeBattleSocket, WebSocketBattleSocket } from './BattleSocket'

/**
 * T-126の実機通しで発見: connect()直後にsend()すると、getDeviceToken()解決前は
 * this.wsが未設定（＝送信メッセージが黙って失われる）、解決後もWebSocketがOPENに
 * 達する前にsend()すると実ブラウザではInvalidStateErrorになる。このStubは
 * readyState・onopenを模擬し、その修正（onopen後にキューをflush）を検証できるようにする
 */
class StubWebSocket {
  static instances: StubWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  sent: string[] = []
  closed = false
  readyState = 0 // CONNECTING

  constructor(
    public url: string,
    public protocols?: string | string[],
  ) {
    StubWebSocket.instances.push(this)
  }

  /** テストからOPENへ遷移させる（実WebSocketのopenイベントに相当） */
  open() {
    this.readyState = 1 // OPEN
    this.onopen?.()
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }
}

describe('WebSocketBattleSocket', () => {
  it('connect時にws(s) URLとSec-WebSocket-Protocol(bearer.<deviceToken>)を組み立てる', async () => {
    StubWebSocket.instances = []
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'device-token-1',
      factory,
    )
    socket.connect('ABCD')
    await Promise.resolve()
    await Promise.resolve()

    expect(factory).toHaveBeenCalledWith('wss://api.example.com/battle/rooms/ABCD/ws', [
      'bearer.device-token-1',
    ])
  })

  it('baseUrl未設定ならconnect()が例外を投げる', () => {
    const socket = new WebSocketBattleSocket(undefined, async () => 'token')
    expect(() => socket.connect('ABCD')).toThrow()
  })

  it('受信JSONが既知typeならonMessageハンドラへ渡す。未知typeは無視する', async () => {
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'token',
      factory,
    )
    const handler = vi.fn()
    socket.onMessage(handler)
    socket.connect('ABCD')
    await Promise.resolve()
    await Promise.resolve()

    const stub = StubWebSocket.instances.at(-1)!
    stub.onmessage?.({ data: JSON.stringify({ type: 'roomState', participants: [] }) })
    stub.onmessage?.({ data: JSON.stringify({ type: 'unknownType' }) })
    stub.onmessage?.({ data: 'not-json{{{' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ type: 'roomState', participants: [] })
  })

  it('send/closeがWebSocketへ委譲される（OPEN後は即送信）', async () => {
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'token',
      factory,
    )
    socket.connect('ABCD')
    await Promise.resolve()
    await Promise.resolve()
    const stub = StubWebSocket.instances.at(-1)!
    stub.open()

    socket.send({ type: 'join', displayName: '太郎', expectedPointsPerQuestion: 80 })
    expect(stub.sent).toEqual([
      JSON.stringify({ type: 'join', displayName: '太郎', expectedPointsPerQuestion: 80 }),
    ])

    socket.close()
    expect(stub.closed).toBe(true)
  })

  it('connect()直後・OPEN前のsend()はキューされ、OPEN到達時にflushされる（T-126実機通しで発見した欠陥の回帰）', async () => {
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'token',
      factory,
    )
    // getDeviceToken()解決前（this.ws未設定）に送信を試みても失われない
    socket.connect('ABCD')
    socket.send({ type: 'join', displayName: '太郎', expectedPointsPerQuestion: 80 })
    await Promise.resolve()
    await Promise.resolve()
    const stub = StubWebSocket.instances.at(-1)!

    // OPEN到達前はまだ送信されない
    expect(stub.sent).toEqual([])

    stub.open()
    expect(stub.sent).toEqual([
      JSON.stringify({ type: 'join', displayName: '太郎', expectedPointsPerQuestion: 80 }),
    ])
  })

  // 回帰防止: connect()はdeviceToken解決（IndexedDB読み出し）を待たずに返るため、
  // 解決前にclose()された場合にWebSocketを張ってしまうと、どこからも閉じられない
  // 孤立接続がルームに残り続ける（ホーム遷移後も参加者枠を占有する）
  it('deviceToken解決前にclose()されたらWebSocketを張らない', async () => {
    StubWebSocket.instances = []
    let resolveToken: ((token: string) => void) | undefined
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      () =>
        new Promise<string>((resolve) => {
          resolveToken = resolve
        }),
      factory,
    )
    socket.connect('ABCD')
    socket.close()
    resolveToken!('token')
    await Promise.resolve()
    await Promise.resolve()

    expect(factory).not.toHaveBeenCalled()
    expect(StubWebSocket.instances).toHaveLength(0)
  })

  // 回帰防止: token解決後・OPEN到達前にclose()された場合も、開いた接続を放置しない
  it('OPEN到達前にclose()されたら、OPEN時にその接続を即座に閉じる', async () => {
    StubWebSocket.instances = []
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'token',
      factory,
    )
    socket.connect('ABCD')
    await Promise.resolve()
    await Promise.resolve()
    const stub = StubWebSocket.instances.at(-1)!

    socket.close()
    stub.open()

    expect(stub.closed).toBe(true)
    // 閉じた接続にキュー済みメッセージをflushしない
    expect(stub.sent).toEqual([])
  })

  it('onCloseハンドラがWebSocketのcloseイベントで呼ばれる', async () => {
    const factory = vi.fn(
      (url: string, protocols?: string | string[]) =>
        new StubWebSocket(url, protocols) as unknown as WebSocket,
    )
    const socket = new WebSocketBattleSocket(
      'https://api.example.com',
      async () => 'token',
      factory,
    )
    const closeHandler = vi.fn()
    socket.onClose(closeHandler)
    socket.connect('ABCD')
    await Promise.resolve()
    await Promise.resolve()
    const stub = StubWebSocket.instances.at(-1)!

    stub.onclose?.({ code: 1008 })
    expect(closeHandler).toHaveBeenCalledWith({ code: 1008 })
  })
})

describe('FakeBattleSocket', () => {
  it('connect/sendを記録し、emitMessage/emitCloseでハンドラを駆動する', () => {
    const fake = new FakeBattleSocket()
    const messages: unknown[] = []
    const closes: unknown[] = []
    fake.onMessage((m) => messages.push(m))
    fake.onClose((e) => closes.push(e))

    fake.connect('WXYZ')
    expect(fake.connectedCode).toBe('WXYZ')

    fake.send({ type: 'answer', questionIndex: 0, points: 90 })
    expect(fake.sent).toEqual([{ type: 'answer', questionIndex: 0, points: 90 }])

    fake.emitMessage({ type: 'roomState', participants: [{ displayName: 'A' }] })
    expect(messages).toEqual([{ type: 'roomState', participants: [{ displayName: 'A' }] }])

    fake.emitClose(1000)
    expect(closes).toEqual([{ code: 1000 }])
    expect(fake.closed).toBe(true)

    fake.close()
    expect(fake.closed).toBe(true)
  })
})
