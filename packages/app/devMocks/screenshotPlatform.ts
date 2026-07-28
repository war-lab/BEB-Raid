// スクリーンショット採取用のモック注入モジュール（V-17。正本: docs/25 6節V-17・JV-8=案A）。
//
// 【本番ビルドに入らない理由（2重の遮断）】
// 1. このファイルを読み込む経路は vitePlugins/screenshotMocks.ts のプラグイン1つだけで、
//    そのプラグインは `apply: 'serve'` のため vite build のプラグインチェーンに入らない。
//    したがって production の依存グラフからこのファイルへ到達する辺が存在しない。
// 2. 仮に読み込まれても、モックが有効になるのはURLクエリ `?screenshotMock=1` が付いた
//    ときだけで、それ以外は素の platform の factory をそのまま返す。
// 完了条件（docs/25 6.3節）の機械確認は `npm run build -w @beb-raid/app` 後の dist に対する
// 識別子 grep（screenshotMock / __bebScreenshotMock）で行う。
//
// 【何をモックするか】
// - RaidApi: isConfigured()=true と現ボス（ゴースト週）を返す。S5レイド画面とホームの
//   イベントバトル導線は共有APIのシーズンデータ・登録済みdeviceTokenが前提のため
//   （docs/25 2.5節）、ここを差し替えないとスクリプトからは到達できない。
// - BattleSocket: BattleRoomDO の代わりに roomState / questionOpen / standings / result を
//   返すフェイク。イベントバトルの順位・リザルトはサーバー受信が前提のため（同2.5節）。
// - window.__bebScreenshotMock: 読解セッションの生成・レイド登録済み状態の投入・
//   バトルの各フェーズ送出をスクリプトから駆動するための操作口。
//
// アプリ実装（packages/app/src）には手を入れていない。App.tsx の `./platform` の解決先を
// dev サーバーでだけこのモジュールへ差し替えることで、同等の効果を得ている。

import type {
  BattleClientMessage,
  BattleServerMessage,
  GhostDefenseEntry,
  Question,
  RaidBossState,
} from '@beb-raid/shared-schema'
import {
  createBattleSocket as createRealBattleSocket,
  createRaidApi as createRealRaidApi,
  type BattleSocket,
  type BattleSocketCloseHandler,
  type BattleSocketMessageHandler,
  type DeviceTokenProvider,
  type RaidApi,
} from '../src/platform'
import { getDb } from '../src/db/database'
import { startSession, type SessionItem } from '../src/services/session'
import { RAID_REGISTERED_AT_KEY } from '../src/services/settingsKeys'
import { useAppStore } from '../src/store/appStore'
import { useSessionStore } from '../src/store/sessionStore'

// 素の platform の型・値をそのまま通す（App.tsx は createAudioPlayer 等もここから import する）。
// 明示的な export（下記の createRaidApi / createBattleSocket）が star export より優先される
export * from '../src/platform'

/** モックを有効にするURLクエリ。付いていなければ素の実装をそのまま返す */
const MOCK_QUERY_KEY = 'screenshotMock'

function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(MOCK_QUERY_KEY) === '1'
}

const DAY_MS = 24 * 60 * 60 * 1000

/** ゴースト週のボス（S5の弱点マップ・討伐された回数・貢献リストを埋めるための固定値） */
const GHOST_BOSS_ID = 'boss-2026-W30'

/** 弱点マップの母集団に使うパック（Part5とPart2を混ぜてPart・タグの行数を出す） */
const DEFENSE_PACK_IDS = ['pack-p5-s-001', 'pack-p2-s-001']

/** イベントバトルの出題に使うパック（音声待ちの無いPart5を選ぶ） */
const BATTLE_PACK_ID = 'pack-p5-s-001'

/** 読解画面のセッションに使うパック（Part6。空所マーカー付きの本文を持つ） */
const READING_PACK_ID = 'pack-reading-p6-s-001'

/** 順位表・表彰の見本データ（docs/25 4.1節・4.2節の図と同じ並び） */
const STANDINGS = [
  { displayName: 'さとう', totalPoints: 1240 },
  { displayName: 'たなか', totalPoints: 1080 },
  { displayName: 'すずき', totalPoints: 960 },
  { displayName: 'ビジュアル確認', totalPoints: 820 },
  { displayName: 'いとう', totalPoints: 610 },
]

async function fetchPackQuestions(packId: string): Promise<Question[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}packs/${packId}.json`)
  if (!res.ok) throw new Error(`モック用パックの取得に失敗: ${packId}`)
  const pack = (await res.json()) as { questions?: Question[] }
  return pack.questions ?? []
}

/**
 * ゴーストボスの defense（questionId別倍率）を実パックのidから組む。
 * buildGhostWeaknessMap は lookup で解決できないidを捨てるため、実在のidを使う必要がある
 */
async function buildDefense(): Promise<GhostDefenseEntry[]> {
  const perPack = await Promise.all(
    DEFENSE_PACK_IDS.map((id) => fetchPackQuestions(id).catch(() => [] as Question[])),
  )
  return perPack
    .flatMap((questions) => questions.slice(0, 9))
    .map((q) => ({ questionId: q.id, multiplier: 2 }))
}

/** スクリーンショット用のRaidApi。通信は一切行わず固定値を返す */
class ScreenshotRaidApi implements RaidApi {
  private defense: GhostDefenseEntry[] | null = null

  isConfigured(): boolean {
    return true
  }

  async register(): Promise<void> {
    // 招待コードの検証はしない（登録済み状態の再現だけが目的）
  }

  async fetchCurrentBoss(): Promise<RaidBossState | null> {
    this.defense ??= await buildDefense()
    const now = Date.now()
    return {
      bossId: GHOST_BOSS_ID,
      name: 'ゴースト: さとう',
      hp: 18_400,
      maxHp: 42_000,
      startAt: now - 2 * DAY_MS,
      endAt: now + 3 * DAY_MS,
      status: 'active',
      participantCount: 5,
      myDamage: 3_180,
      contributions: [
        { displayName: 'さとう', damage: 9_640 },
        { displayName: 'たなか', damage: 6_120 },
        { displayName: 'ビジュアル確認', damage: 3_180 },
        { displayName: 'すずき', damage: 2_460 },
        { displayName: 'いとう', damage: 1_800 },
      ],
      bossType: 'ghost',
      defense: this.defense,
      ghost: { displayName: 'さとう', defeatedCount: 12 },
    }
  }

  async syncDamage() {
    const boss = await this.fetchCurrentBoss()
    // fetchCurrentBoss は常に非nullを返すが、型のためのガードを置く
    if (!boss) throw new Error('モックのボス生成に失敗')
    return { acceptedIds: [], boss }
  }

  async sendQuestionStats(): Promise<number> {
    return 0
  }

  async sendReport(): Promise<void> {}

  async createBattleRoom(): Promise<string> {
    return 'RA1D'
  }

  async sendGhostRecord(): Promise<void> {}

  async deleteOwnGhostRecord(): Promise<void> {}
}

/**
 * BattleRoomDO の代わりに動くフェイクソケット。
 * クライアント→サーバーのメッセージに対して、DOと同じ順序でサーバー発メッセージを返す
 * （join/connect→roomState、openQuestion→questionOpen、closeQuestion→standings、finish→result）。
 * 参加者画面（S7）は自分がホストではないため questionOpen 以降が自然には来ない。
 * その分は window.__bebScreenshotMock の操作口からスクリプトが送出する
 */
class ScreenshotBattleSocket implements BattleSocket {
  private messageHandler: BattleSocketMessageHandler | null = null
  private closeHandler: BattleSocketCloseHandler | null = null
  private questionIds: string[] = []
  private questionIndex = 0

  constructor() {
    void fetchPackQuestions(BATTLE_PACK_ID)
      .then((questions) => {
        this.questionIds = questions.map((q) => q.id)
      })
      .catch(() => {
        this.questionIds = []
      })
  }

  connect(): void {
    this.emitLater({ type: 'roomState', participants: this.participants() })
  }

  send(message: BattleClientMessage): void {
    if (message.type === 'join') {
      this.emitLater({ type: 'roomState', participants: this.participants() })
      return
    }
    if (message.type === 'openQuestion') {
      this.questionIndex = message.questionIndex
      this.emitLater({
        type: 'questionOpen',
        questionIndex: message.questionIndex,
        questionId: message.questionId,
        // 締切は30秒（DOの既定と同じ）。スクリプトは締切を待たず次のフェーズを送出する
        deadlineAt: Date.now() + 30_000,
      })
      return
    }
    if (message.type === 'closeQuestion') {
      this.emitStandings()
      return
    }
    if (message.type === 'finish') {
      this.emitResult()
    }
  }

  onMessage(handler: BattleSocketMessageHandler): void {
    this.messageHandler = handler
  }

  onClose(handler: BattleSocketCloseHandler): void {
    this.closeHandler = handler
  }

  close(): void {}

  /** 参加者一覧（自分＝表示名は問わないため固定名で並べる。ロビーのチップの折返し確認も兼ねる） */
  private participants(): { displayName: string }[] {
    return STANDINGS.map((s) => ({ displayName: s.displayName }))
  }

  /** ハンドラ登録の直後に呼ばれても取りこぼさないよう、次のタスクで送出する */
  private emitLater(message: BattleServerMessage): void {
    window.setTimeout(() => this.messageHandler?.(message), 0)
  }

  emitQuestionOpen(): void {
    const questionId = this.questionIds[this.questionIndex] ?? this.questionIds[0] ?? 'unknown'
    this.emitLater({
      type: 'questionOpen',
      questionIndex: this.questionIndex,
      questionId,
      deadlineAt: Date.now() + 30_000,
    })
  }

  emitStandings(): void {
    this.emitLater({ type: 'standings', entries: STANDINGS })
  }

  emitResult(): void {
    this.emitLater({
      type: 'result',
      entries: STANDINGS,
      // 最下位でもスポットライトが当たる余地（docs/02 6.2節）を確認するため、
      // ベストグロース賞は1位以外の参加者にする
      bestGrowth: { displayName: 'いとう' },
    })
  }

  emitClose(code: number, reason: string): void {
    this.closeHandler?.({ code, reason })
  }
}

/** スクリプトから駆動するための操作口（window.__bebScreenshotMock） */
interface ScreenshotMockApi {
  /** レイド登録済み状態＋獲得バッジ2件をIndexedDBへ投入する（S5の非空状態を撮るため） */
  seedRaid: () => Promise<void>
  /** 読解パックでセッションを作り、読解画面へ遷移する（通常はドリル内の遷移でしか到達しない） */
  startReadingSession: () => Promise<void>
  battleQuestionOpen: () => void
  battleStandings: () => void
  battleResult: () => void
}

async function seedRaid(): Promise<void> {
  const db = getDb()
  await db.settings.put({ key: RAID_REGISTERED_AT_KEY, value: Date.now() })
  await db.badges.bulkPut([
    { badgeId: 'raid-first-clear', earnedAt: Date.now() - 21 * DAY_MS },
    { badgeId: `raid-clear:${GHOST_BOSS_ID}`, earnedAt: Date.now() - 7 * DAY_MS },
  ])
}

async function startReadingSession(): Promise<void> {
  const questions = await fetchPackQuestions(READING_PACK_ID)
  const first = questions[0]
  if (!first) throw new Error('読解パックに問題がありません')
  const items: SessionItem[] = [{ questionId: first.id, mode: 'solo' }]
  const snapshot = await startSession(getDb(), { items })
  useSessionStore.getState().begin(snapshot, questions, { L: 340, R: 380 })
  useAppStore.getState().navigate('reading')
}

function installMockApi(socket: ScreenshotBattleSocket): void {
  const api: ScreenshotMockApi = {
    seedRaid,
    startReadingSession,
    battleQuestionOpen: () => socket.emitQuestionOpen(),
    battleStandings: () => socket.emitStandings(),
    battleResult: () => socket.emitResult(),
  }
  ;(window as unknown as { __bebScreenshotMock: ScreenshotMockApi }).__bebScreenshotMock = api
}

export function createRaidApi(
  baseUrl: string | undefined,
  getDeviceToken: DeviceTokenProvider,
): RaidApi {
  if (!isMockEnabled()) return createRealRaidApi(baseUrl, getDeviceToken)
  console.warn('[screenshotMock] RaidApiをモックに差し替えました（devサーバー限定）')
  return new ScreenshotRaidApi()
}

export function createBattleSocket(
  baseUrl: string | undefined,
  getDeviceToken: DeviceTokenProvider,
): BattleSocket {
  if (!isMockEnabled()) return createRealBattleSocket(baseUrl, getDeviceToken)
  console.warn('[screenshotMock] BattleSocketをモックに差し替えました（devサーバー限定）')
  const socket = new ScreenshotBattleSocket()
  installMockApi(socket)
  return socket
}
