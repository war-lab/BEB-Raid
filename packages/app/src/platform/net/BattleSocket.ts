// 昼バトルWebSocketの抽象化レイヤ（M4・T-125。正本: docs/22_M4実装計画.md 3.6節）。
// UI・サービス層は素の WebSocket を直接触らず、必ずこのインターフェース経由で使う
// （platform/index.ts の factory 経由。RaidApiと同じ抽象化パターン）。
// 認証は Sec-WebSocket-Protocol: `bearer.<deviceToken>`（22の3.1節。ブラウザWebSocketは
// Authorizationヘッダを付けられないため）

import {
  isBattleServerMessage,
  type BattleClientMessage,
  type BattleServerMessage,
} from '@beb-raid/shared-schema'

export type BattleSocketMessageHandler = (message: BattleServerMessage) => void
export type BattleSocketCloseHandler = (event: { code: number }) => void

export interface BattleSocket {
  /**
   * 4文字ルームコードでWebSocket接続を開始する。
   * 認証（Sec-WebSocket-Protocol）の付与は実装内で行うため、呼び出し側はコードのみ渡す
   */
  connect(code: string): void
  send(message: BattleClientMessage): void
  /** 受信メッセージのハンドラを登録する（複数回呼ぶと直近の登録で上書きされる） */
  onMessage(handler: BattleSocketMessageHandler): void
  /** クローズ（正常finish・エラー・サーバー切断のいずれも含む）のハンドラを登録する */
  onClose(handler: BattleSocketCloseHandler): void
  close(): void
}

/** deviceTokenの取得手段（settingsの読み出しは呼び出し元が担う。FetchRaidApiと同じ疎結合） */
export type DeviceTokenProvider = () => Promise<string>

export type WebSocketFactory = (url: string, protocols?: string | string[]) => WebSocket

/**
 * ブラウザ標準WebSocketによる本実装（22の2.2節: partysocket等のラッパーは使わずブラウザ標準API）。
 * UIはこのクラスを直接newせず、platform/index.ts の createBattleSocket 経由で使うこと
 */
export class WebSocketBattleSocket implements BattleSocket {
  private ws: WebSocket | null = null
  private messageHandler: BattleSocketMessageHandler | null = null
  private closeHandler: BattleSocketCloseHandler | null = null
  /**
   * connect()直後に送られたメッセージのキュー（T-126の実機通しで発見・修正）。
   * connect()はgetDeviceToken()（IndexedDB読み出し）の解決を待たずに返るため、
   * 呼び出し側（BattleScreen.handleJoin等）がconnect()の直後同期的にsend()を呼ぶと、
   * まだthis.wsが未設定（またはWebSocketがOPENに達していない）状態でsend()が素通りし、
   * 送信メッセージが黙って失われていた（optional chaining `this.ws?.send()`がno-op化。
   * さらにOPEN未達時のsend()はブラウザ実装ではInvalidStateErrorを投げる）。
   * OPEN到達まではここに溜め、onopenでFIFOに送信する
   */
  private pendingMessages: BattleClientMessage[] = []
  /**
   * connect()の世代番号。connect()はgetDeviceToken()（IndexedDB読み出し）の解決を待たずに
   * 返るため、解決前にclose()や再connect()が呼ばれると、後から生成されたWebSocketが
   * どこからも閉じられない孤立接続として残る（this.wsはonopen到達時にしか設定されない）。
   * close()/connect()のたびに世代を進め、古い世代のコールバックは接続を破棄する
   */
  private generation = 0

  constructor(
    private readonly baseUrl: string | undefined,
    private readonly getDeviceToken: DeviceTokenProvider,
    private readonly wsFactory: WebSocketFactory = (url, protocols) =>
      new WebSocket(url, protocols),
  ) {}

  connect(code: string): void {
    if (!this.baseUrl || this.baseUrl.trim() === '') {
      throw new Error('VITE_RAID_API_BASE_URLが未設定です')
    }
    const wsUrl = `${this.baseUrl.replace(/^http/, 'ws')}/battle/rooms/${code}/ws`
    const generation = ++this.generation
    void this.getDeviceToken().then((token) => {
      // token解決を待つ間にclose()／再connect()されていたら接続自体を張らない
      if (generation !== this.generation) return
      const ws = this.wsFactory(wsUrl, [`bearer.${token}`])
      ws.onopen = () => {
        // OPEN到達までの間にclose()／再connect()されていたら、この接続は即座に閉じる
        // （this.wsへ載せると新しい世代の接続を上書きしてしまう）
        if (generation !== this.generation) {
          ws.close()
          return
        }
        this.ws = ws
        for (const message of this.pendingMessages.splice(0)) {
          ws.send(JSON.stringify(message))
        }
      }
      ws.onmessage = (event: MessageEvent) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(String(event.data))
        } catch (e) {
          console.warn('[BattleSocket] JSONとして解釈できないメッセージを受信', e)
          return
        }
        if (!isBattleServerMessage(parsed)) {
          console.warn('[BattleSocket] 未知のメッセージ形式を受信', parsed)
          return
        }
        this.messageHandler?.(parsed)
      }
      ws.onclose = (event: CloseEvent) => {
        this.ws = null
        this.closeHandler?.({ code: event.code })
      }
    })
  }

  send(message: BattleClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
      return
    }
    this.pendingMessages.push(message)
  }

  onMessage(handler: BattleSocketMessageHandler): void {
    this.messageHandler = handler
  }

  onClose(handler: BattleSocketCloseHandler): void {
    this.closeHandler = handler
  }

  close(): void {
    // 世代を進めることで、token解決待ちのconnect()が後からWebSocketを張るのを止める
    this.generation += 1
    this.ws?.close()
    this.ws = null
    this.pendingMessages = []
  }
}

/**
 * テスト用フェイク（22の3.6節「テスト用フェイクを併設する」）。
 * connect()は即座に完了扱いとし、テストコードが emitMessage/emitClose で
 * サーバー→クライアントのメッセージ受信・クローズを模擬駆動する
 */
export class FakeBattleSocket implements BattleSocket {
  connectedCode: string | null = null
  sent: BattleClientMessage[] = []
  closed = false
  private messageHandler: BattleSocketMessageHandler | null = null
  private closeHandler: BattleSocketCloseHandler | null = null

  connect(code: string): void {
    this.connectedCode = code
  }

  send(message: BattleClientMessage): void {
    this.sent.push(message)
  }

  onMessage(handler: BattleSocketMessageHandler): void {
    this.messageHandler = handler
  }

  onClose(handler: BattleSocketCloseHandler): void {
    this.closeHandler = handler
  }

  close(): void {
    this.closed = true
  }

  /** テストからサーバー発のメッセージを模擬受信させる */
  emitMessage(message: BattleServerMessage): void {
    this.messageHandler?.(message)
  }

  /** テストからクローズを模擬発生させる */
  emitClose(code: number): void {
    this.closed = true
    this.closeHandler?.({ code })
  }
}
