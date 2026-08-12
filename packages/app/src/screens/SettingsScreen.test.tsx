// T-23 完了条件のテスト（画面層）:
// - 表示名・イヤホンなしモード・テーマ・文字サイズが settings/profile ストアに永続化される
// - エクスポート→インポート往復がUI経由で動く（ファイルダウンロードはモック）
// - dbVersionが新しいバックアップはUI経由でも拒否される
import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { CacheUsage, PackCache, RaidApi } from '../platform'
import { getFontSizeScale } from '../fontSize'
import { AnthropicAiClient, DEFAULT_BYOK_MODEL } from '../platform/ai/AnthropicAiClient'
import { PACK_SYNC_STATE_KEY } from '../services/packSync'
import { getTheme } from '../theme'
import { SettingsScreen } from './SettingsScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`settings-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

/**
 * インポートの確認ダイアログ（T-202・Q-35）で「復元する」を押す。
 * ファイル選択後は対象ストアと件数を提示してから実行の可否を問うようになったため、
 * 従来の「選択→即復元」だったテストはこの1手順を挟む
 */
async function confirmImport() {
  fireEvent.click(await screen.findByText('復元する', { selector: '.confirm-dialog__primary' }))
}

class FakePackCache implements PackCache {
  private stored = new Set<string>(['a.mp3', 'b.mp3'])
  has = vi.fn(async (url: string) => this.stored.has(url))
  get = vi.fn(async () => null)
  put = vi.fn(async () => {})
  addAll = vi.fn(async () => {})
  delete = vi.fn(async () => {})
  keys = vi.fn(async () => [...this.stored])
  usage = vi.fn(async (): Promise<CacheUsage> => ({
    bytes: this.stored.size * 1024,
    entries: this.stored.size,
  }))
  clear = vi.fn(async () => {
    this.stored.clear()
  })
}

const FAKE_BOSS = {
  bossId: 'boss-test',
  name: 'テストボス',
  hp: 100,
  maxHp: 100,
  startAt: 0,
  endAt: 0,
  status: 'active' as const,
  participantCount: 0,
  myDamage: 0,
  contributions: [],
}

class FakeRaidApi implements RaidApi {
  constructor(private readonly configured = false) {}
  isConfigured = () => this.configured
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: FAKE_BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  createBattleRoom = vi.fn(async () => 'ABCD')
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
}

const flushLoad = () => screen.findByTestId('settings-loaded')

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
  delete document.documentElement.dataset.fontSize
  delete document.documentElement.dataset.theme
  vi.restoreAllMocks()
})

describe('SettingsScreen: 永続化', () => {
  it('表示名の変更がblur時にprofileへ保存される', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'もとの名前',
      initialToeic: null,
      createdAt: 1000,
      deviceToken: 'token',
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const nameInput = screen.getByDisplayValue('もとの名前')
    fireEvent.change(nameInput, { target: { value: '新しい名前' } })
    fireEvent.blur(nameInput)

    await vi.waitFor(async () => {
      expect((await db.profile.get(PROFILE_ID))?.displayName).toBe('新しい名前')
    })
  })

  it('イヤホンなしモードのトグルがsettingsストアに永続化される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByLabelText(/イヤホンなしモード/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('noEarphoneMode'))?.value).toBe(true)
    })
  })

  it('ハプティクスのトグルがsettingsストアに永続化される（T-78。既定はON）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect((screen.getByLabelText(/ハプティクス/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText(/ハプティクス/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('hapticsEnabled'))?.value).toBe(false)
    })
  })

  it('誤タップの取り消し猶予のトグルがsettingsストアに永続化される（ADR 0009。既定はON）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect((screen.getByLabelText(/誤タップの取り消し猶予/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText(/誤タップの取り消し猶予/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('mistapUndoEnabled'))?.value).toBe(false)
    })
  })

  it('テーマ切替がsettingsストアに永続化され、data-themeが反映される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByLabelText('ライト'))

    await vi.waitFor(async () => {
      expect((await db.settings.get('themePreference'))?.value).toBe('light')
    })
    expect(getTheme()).toBe('light')
  })

  it('文字サイズ切替がsettingsストアに永続化され、data-font-sizeが反映される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByLabelText('L'))

    await vi.waitFor(async () => {
      expect((await db.settings.get('fontSizeScale'))?.value).toBe('L')
    })
    expect(getFontSizeScale()).toBe('L')
  })

  // T-202（Q-46）: window.confirmはPWAでネイティブダイアログが出て文脈が切れるため、
  // ConfirmDialogへ置換した（T-162時点で置換漏れていた2箇所の1つ）
  it('キャッシュ使用量が表示され、確認後の削除で0件になる（キャンセルでは消えない）', async () => {
    const db = newDb()
    const cache = new FakePackCache()
    render(<SettingsScreen db={db} packCache={cache} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText(/2件/)).toBeTruthy()

    fireEvent.click(screen.getByText('キャッシュを削除'))
    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()

    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(cache.clear).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('キャッシュを削除'))
    fireEvent.click(await screen.findByText('削除する'))

    expect(await screen.findByText(/0件/)).toBeTruthy()
    expect(cache.clear).toHaveBeenCalled()
  })

  it('T-183 Q-11の対: キャッシュ削除は同期状態（packSyncState）もリセットする', async () => {
    const db = newDb()
    await db.settings.put({
      key: PACK_SYNC_STATE_KEY,
      value: { packHashes: { 'pack-a': 'h1' }, totalSizeBytes: 100, lastSyncedAt: 0 },
    })
    const cache = new FakePackCache()
    render(<SettingsScreen db={db} packCache={cache} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('キャッシュを削除'))
    fireEvent.click(await screen.findByText('削除する'))
    await screen.findByText(/0件/)

    // 実体だけでなく同期状態も消えていないと、ハッシュ一致のみを見るsyncPacksが
    // 「同期済み」と誤認し、削除後も再同期されない（Q-11の対の症状）
    expect(await db.settings.get(PACK_SYNC_STATE_KEY)).toBeUndefined()
  })

  it('再計算ボタンでキャッシュ使用量が再取得される（T-107c）', async () => {
    const db = newDb()
    const cache = new FakePackCache()
    render(<SettingsScreen db={db} packCache={cache} raidApi={new FakeRaidApi()} />)
    await flushLoad()
    expect(screen.getByText(/2件/)).toBeTruthy()

    // 初回起動のパックDL進行中を模擬: バックグラウンドでキャッシュへ1件追加されても表示は自動更新されない
    ;(cache as unknown as { stored: Set<string> }).stored.add('c.mp3')
    expect(screen.getByText(/2件/)).toBeTruthy()

    fireEvent.click(screen.getByText('再計算'))

    expect(await screen.findByText(/3件/)).toBeTruthy()
  })

  it('T-72: 永続化状態・端末ストレージ使用量が表示される', async () => {
    const db = newDb()
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: async () => true,
        estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }),
      },
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText('永続化: 有効')).toBeTruthy()
    expect(screen.getByText(/5\.0MB \/ 100\.0MB/)).toBeTruthy()

    // @ts-expect-error テスト後にjsdom既定へ戻す
    delete navigator.storage
  })

  it('T-72: navigator.storageが無い環境では「取得不可」表示になり破綻しない', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText('永続化: 取得不可')).toBeTruthy()
  })
})

// T-296（K-22）: persisted()拒否時の告知もバックアップ督促も無かった
// （非インストールのSafariタブ等では7日間開かないとIndexedDBごと退避されうる）
describe('SettingsScreen: 永続化拒否時のエクスポート導線とエクスポート督促（T-296・K-22）', () => {
  afterEach(() => {
    // @ts-expect-error テスト後にjsdom既定へ戻す
    delete navigator.storage
  })

  it('persisted=falseのとき、注意表示に加えてエクスポート導線（ボタン）が出る', async () => {
    const db = newDb()
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => false, estimate: async () => null },
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText('永続化: 無効')).toBeTruthy()
    expect(screen.getByText('今すぐエクスポート')).toBeTruthy()
  })

  it('一度もエクスポートしていない状態で解答が1件でもあると督促メッセージが出る', async () => {
    const db = newDb()
    await db.attempts.add({
      id: 'a-1',
      questionId: 'q-1',
      mode: 'solo',
      isCorrect: true,
      responseMs: 1000,
      isTimeout: false,
      isGuess: false,
      answeredAt: Date.now(),
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText(/エクスポートしていません/)).toBeTruthy()
  })

  it('解答が0件（診断直後）なら督促しない', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.queryByText(/エクスポートしていません/)).toBeNull()
  })

  it('督促表示中に「今すぐエクスポート」を押すと督促が消える（lastExportedAtが記録される）', async () => {
    const db = newDb()
    await db.attempts.add({
      id: 'a-1',
      questionId: 'q-1',
      mode: 'solo',
      isCorrect: true,
      responseMs: 1000,
      isTimeout: false,
      isGuess: false,
      answeredAt: Date.now(),
    })
    const createObjectURL = vi.fn((blob: Blob) => `blob:mock:${blob.size}`)
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()
    expect(screen.getByText(/エクスポートしていません/)).toBeTruthy()

    fireEvent.click(screen.getByText('今すぐエクスポート'))
    await screen.findByText('エクスポートしました。')

    expect(screen.queryByText(/エクスポートしていません/)).toBeNull()
    expect(await db.settings.get('lastExportedAt')).toBeDefined()
  })
})

// T-297（K-23）: アンマウント時flush失敗の退避は、次回起動時に気づける通知が無ければ
// 記録するだけで実際には誰にも見えない（画面ごと消えた後の話なので、その場のエラー表示は
// 効かない）。設定画面で通知が出るか・確認で消えるかを検証する
describe('SettingsScreen: アンマウント時flush失敗の通知（T-297・K-23）', () => {
  it('退避が無ければ通知は出ない', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.queryByText(/保存できなかった解答/)).toBeNull()
  })

  it('退避があれば通知が出て、確認すると消える（settingsから削除される）', async () => {
    const db = newDb()
    await db.settings.put({ key: 'pendingCommitFailedAt', value: Date.now() })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText(/保存できなかった解答/)).toBeTruthy()

    fireEvent.click(screen.getByText('確認した'))

    await vi.waitFor(() => expect(screen.queryByText(/保存できなかった解答/)).toBeNull())
    expect(await db.settings.get('pendingCommitFailedAt')).toBeUndefined()
  })
})

describe('SettingsScreen: エクスポート/インポート', () => {
  // T-279（K-2）: バックアップに共有APIの認証情報（deviceToken）が含まれないことをUIで明示する
  it('エクスポート/インポートの説明に、学習データを含み共有APIの認証情報を含まない旨が表示される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText(/このファイルは学習データを含みます/)).toBeTruthy()
    expect(screen.getByText(/共有APIの認証情報は含まれません/)).toBeTruthy()
  })

  it('エクスポート→インポート往復がUI経由で動く', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'たろう',
      initialToeic: 600,
      createdAt: 1000,
      deviceToken: 'token',
    })

    const createObjectURL = vi.fn((blob: Blob) => `blob:mock:${blob.size}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('エクスポート'))
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    expect(clickSpy).toHaveBeenCalled()

    // ダウンロードされたBlobの中身を取り出す（jsdomのBlob.text()で復元）
    const blobArg = createObjectURL.mock.calls[0]?.[0] as Blob
    const backupText = await blobArg.text()

    // 「機種変・iOS退避後」を模擬: 同一db内のprofileを一旦消してからUI経由でインポートする
    await db.profile.clear()
    expect(await db.profile.get(PROFILE_ID)).toBeUndefined()

    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([backupText], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await confirmImport()

    await screen.findByText('復元しました。')
    expect((await db.profile.get(PROFILE_ID))?.displayName).toBe('たろう')
  })

  // T-202（docs/29 Q-35・J-105）: ファイル選択後に確認もプレビューもなく即実行されていた。
  // 件数の提示がないと古いファイルの誤選択に実行前に気づけない
  it('ファイル選択後は対象ストアと件数を提示し、キャンセルすれば復元されない', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'もとの名前',
      initialToeic: null,
      createdAt: 0,
      deviceToken: 'token',
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const backup = emptyBackup(db.verno, {
      profile: [
        {
          id: PROFILE_ID,
          displayName: '復元後の名前',
          initialToeic: null,
          createdAt: 0,
          deviceToken: 'token',
        },
      ],
      attempts: [
        {
          id: 'a1',
          questionId: 'q1',
          mode: 'solo',
          isCorrect: true,
          responseMs: 1000,
          isTimeout: false,
          isGuess: false,
          answeredAt: 0,
        },
      ],
    })
    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)

    // 対象ストアと件数を提示する（まだ実行しない）
    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()
    expect(screen.getByText(/プロフィール: 1件/)).toBeTruthy()
    expect(screen.getByText(/解答履歴: 1件/)).toBeTruthy()
    expect(screen.getByText(/語彙SRSカード: 0件/)).toBeTruthy()
    // インポートはまだ実行されていない
    expect(screen.getByDisplayValue('もとの名前')).toBeTruthy()

    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(screen.getByDisplayValue('もとの名前')).toBeTruthy()
    expect(await db.profile.get(PROFILE_ID)).toMatchObject({ displayName: 'もとの名前' })
  })

  it('dbVersionが新しいバックアップはUI経由でも拒否される', async () => {
    const db = newDb()
    const tooNew = {
      formatVersion: 1,
      dbVersion: db.verno + 1,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [],
        ratings: [],
        ratingHistory: [],
        tagStats: [],
        phase: [],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
        examScores: [],
        raidState: [],
      },
    }

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(tooNew)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)

    expect(await screen.findByText(/dbVersion/)).toBeTruthy()
  })

  // T-207（Q-45）: JSONでないファイルを選ぶとJSON.parseの英語メッセージ
  // （"Unexpected token..."）がそのまま表示されていた。importAll由来のメッセージは
  // 既に日本語のため、JSON.parse失敗時だけが英語のまま生表示される不整合があった
  it('JSONとして読み込めないファイルは日本語のエラーになる（英語のJSON.parseメッセージを出さない）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File(['これはJSONではない'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)

    const message = await screen.findByRole('status')
    expect(message.textContent).not.toMatch(/Unexpected token/i)
    expect(message.textContent).toMatch(/[ぁ-んァ-ヶ一-龠]/) // 日本語であること
  })

  function emptyBackup(dbVersion: number, overrides: Record<string, unknown[]> = {}) {
    return {
      formatVersion: 1,
      dbVersion,
      exportedAt: 0,
      stores: {
        profile: [],
        attempts: [],
        srsCards: [],
        ratings: [],
        ratingHistory: [],
        tagStats: [],
        phase: [],
        streak: [],
        badges: [],
        pendingSync: [],
        settings: [],
        examScores: [],
        raidState: [],
        ...overrides,
      },
    }
  }

  it('インポート後、トグル・表示名・テーマ選択がインポートした値で表示される（T-106）', async () => {
    const db = newDb()
    await db.profile.put({
      id: PROFILE_ID,
      displayName: 'インポート前',
      initialToeic: null,
      createdAt: 0,
      deviceToken: 'token',
    })
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()
    expect(screen.getByDisplayValue('インポート前')).toBeTruthy()
    expect((screen.getByLabelText(/イヤホンなしモード/) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('OS追従') as HTMLInputElement).checked).toBe(true)

    const backup = emptyBackup(db.verno, {
      profile: [
        {
          id: PROFILE_ID,
          displayName: 'インポート後',
          initialToeic: null,
          createdAt: 0,
          deviceToken: 'token',
        },
      ],
      settings: [
        { key: 'noEarphoneMode', value: true },
        { key: 'themePreference', value: 'light' },
      ],
    })
    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await confirmImport()

    await screen.findByText('復元しました。')
    expect(screen.getByDisplayValue('インポート後')).toBeTruthy()
    expect((screen.getByLabelText(/イヤホンなしモード/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('ライト') as HTMLInputElement).checked).toBe(true)
    expect(getTheme()).toBe('light')
  })

  it('インポート後にApp側へテーマ変更が通知される（T-106: onThemePreferenceChange）', async () => {
    const db = newDb()
    const onThemePreferenceChange = vi.fn()
    render(
      <SettingsScreen
        db={db}
        packCache={new FakePackCache()}
        raidApi={new FakeRaidApi()}
        onThemePreferenceChange={onThemePreferenceChange}
      />,
    )
    await flushLoad()
    onThemePreferenceChange.mockClear() // マウント時の初回通知は対象外にする

    const backup = emptyBackup(db.verno, { settings: [{ key: 'themePreference', value: 'dark' }] })
    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await confirmImport()

    await screen.findByText('復元しました。')
    expect(onThemePreferenceChange).toHaveBeenCalledWith('dark')
  })

  it('インポート直後のトグル操作が新値基準で書き込まれる（T-106）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()
    expect((screen.getByLabelText(/イヤホンなしモード/) as HTMLInputElement).checked).toBe(false)

    const backup = emptyBackup(db.verno, { settings: [{ key: 'noEarphoneMode', value: true }] })
    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)
    await confirmImport()
    await screen.findByText('復元しました。')
    expect((screen.getByLabelText(/イヤホンなしモード/) as HTMLInputElement).checked).toBe(true)

    // インポート後の初回トグル操作は新しいベースライン(true)からの反転でfalseへ書き込まれる
    fireEvent.click(screen.getByLabelText(/イヤホンなしモード/))
    await vi.waitFor(async () => {
      expect((await db.settings.get('noEarphoneMode'))?.value).toBe(false)
    })
  })
})

describe('SettingsScreen: 読込失敗時のガードとエクスポート失敗ハンドリング（T-208・Q-52）', () => {
  // 何を防ぐか: load()にcatchが無いと、読込失敗時にトグルがReactの初期値（既定値）の
  // まま描画される。この状態でユーザーがトグルを操作すると「既定値の反転」がDBの実際の値を
  // 確認せずに書き込まれ、実際の設定値（この試験ではDB上は false）を静かに上書きしてしまう
  // （T-106で塞いだ経路と同型の残り）。読込失敗時はトグルを無効化し、書き込み自体を防ぐ
  it('load()が失敗すると既定値を表示したままトグルは無効化され、操作してもDBを上書きしない', async () => {
    const db = newDb()
    // DB上の実際の値はfalse（Reactの初期値=trueとは食い違わせる）
    await db.settings.put({ key: 'hapticsEnabled', value: false })
    const cache = new FakePackCache()
    cache.usage.mockRejectedValueOnce(new Error('boom'))

    render(<SettingsScreen db={db} packCache={cache} raidApi={new FakeRaidApi()} />)

    // 読込失敗時はsettings-loadedマーカーが立たないため、無効化を直接待つ
    await vi.waitFor(() => {
      expect((screen.getByLabelText(/ハプティクス/) as HTMLInputElement).disabled).toBe(true)
    })

    // 無効化されたチェックボックスはクリックしても操作を受け付けない
    fireEvent.click(screen.getByLabelText(/ハプティクス/))
    expect((await db.settings.get('hapticsEnabled'))?.value).toBe(false)
  })

  it('エクスポート失敗時はエラーメッセージを出す（無反応・unhandled rejectionにしない）', async () => {
    const db = newDb()
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => {
        throw new Error('boom')
      },
      revokeObjectURL: vi.fn(),
    })

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('エクスポート'))

    const message = await screen.findByRole('status')
    expect(message.textContent).toContain('失敗')
  })

  it('エクスポート成功時に完了メッセージを出す', async () => {
    const db = newDb()
    const createObjectURL = vi.fn((blob: Blob) => `blob:mock:${blob.size}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('エクスポート'))

    expect(await screen.findByText('エクスポートしました。')).toBeTruthy()
  })
})

describe('SettingsScreen: BYOK設定（T-55）', () => {
  // T-202（docs/29 Q-33〜Q-35と同種の不可逆操作）: 確認なしの1タップで削除されていた
  it('APIキーを保存するとマスク表示になり、確認後の削除で入力欄に戻る（キャンセルでは消えない）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-ant-abcd1234' },
    })
    fireEvent.click(screen.getByText('保存'))

    await vi.waitFor(() => expect(screen.getByText('sk-***...1234')).toBeTruthy())
    expect((await db.settings.get('byokApiKey'))?.value).toBe('sk-ant-abcd1234')
    // マスク表示中は生のキーが画面に出ない
    expect(screen.queryByText('sk-ant-abcd1234')).toBeNull()

    fireEvent.click(screen.getByText('削除'))
    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()

    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(await db.settings.get('byokApiKey')).toBeDefined()

    fireEvent.click(screen.getByText('削除'))
    fireEvent.click(await screen.findByText('削除する'))

    await vi.waitFor(() => expect(screen.getByPlaceholderText('sk-...')).toBeTruthy())
    expect(await db.settings.get('byokApiKey')).toBeUndefined()
  })

  // T-220（Q-58）: APIキー入力欄がform外にあり、Chromeが「Password field is not contained
  // in a form」と警告していた（パスワードマネージャ連携も効かない）。formで括る
  it('APIキー入力欄はform内にあり、Enter送信でも保存できる', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const input = screen.getByPlaceholderText('sk-...')
    expect(input.closest('form')).not.toBeNull()

    fireEvent.change(input, { target: { value: 'sk-ant-formtest' } })
    fireEvent.submit(input.closest('form')!)

    await vi.waitFor(() => expect(screen.getByText('sk-***...test')).toBeTruthy())
    expect((await db.settings.get('byokApiKey'))?.value).toBe('sk-ant-formtest')
  })

  it('注記2点（端末内平文保存・支出上限推奨）が常に表示される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText('キーは端末内に平文保存され、端末外には送信されません。')).toBeTruthy()
    expect(screen.getByText('支出上限を設定したAPIキーの利用を推奨します。')).toBeTruthy()
  })

  it('モデル欄は既定値がplaceholderに出て、変更するとsettingsに保存される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    const modelInput = screen.getByLabelText('モデル') as HTMLInputElement
    expect(modelInput.placeholder).toBe(DEFAULT_BYOK_MODEL)

    fireEvent.change(modelInput, { target: { value: 'claude-opus-4-8' } })
    await vi.waitFor(async () => {
      expect((await db.settings.get('byokModel'))?.value).toBe('claude-opus-4-8')
    })
  })

  it('エクスポートJSONにbyokApiKeyが含まれない（T-42の除外がUI経由でも効く）', async () => {
    const db = newDb()
    await db.settings.put({ key: 'byokApiKey', value: 'sk-ant-secret9999' })

    const createObjectURL = vi.fn((blob: Blob) => `blob:mock:${blob.size}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    fireEvent.click(screen.getByText('エクスポート'))
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled())

    const blobArg = createObjectURL.mock.calls[0]?.[0] as Blob
    const backupText = await blobArg.text()
    expect(backupText).not.toContain('sk-ant-secret9999')
    expect(backupText).not.toContain('byokApiKey')
  })

  it('キー未設定時はAnthropicAiClient.isConfigured()がfalseを返し、保存後はtrueになる（結線テスト）', async () => {
    const db = newDb()
    const getApiKey = async () =>
      ((await db.settings.get('byokApiKey'))?.value as string | undefined) ?? null
    const client = new AnthropicAiClient(getApiKey)
    expect(await client.isConfigured()).toBe(false)

    render(<SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi()} />)
    await flushLoad()
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-ant-abcd1234' },
    })
    fireEvent.click(screen.getByText('保存'))

    await vi.waitFor(async () => expect(await client.isConfigured()).toBe(true))
  })
})

describe('SettingsScreen: レイドダメージ送信トグル（T-96）', () => {
  it('raidApi.isConfigured()=falseなら欄自体が表示されない', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(false)} />,
    )
    await flushLoad()

    expect(screen.queryByText('レイドダメージを送信する')).toBeNull()
  })

  it('raidApi.isConfigured()=trueなら欄が表示され、既定はOFF', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    const toggle = screen.getByLabelText(/レイドダメージを送信する/) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('トグルでsettingsストアのraidSyncEnabledが永続化される', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    fireEvent.click(screen.getByLabelText(/レイドダメージを送信する/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('raidSyncEnabled'))?.value).toBe(true)
    })
  })

  it('プライバシー境界を説明する文言が表示される（レビューF3(a)）', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    expect(
      screen.getByText(
        'レイド参加中、ダメージ換算値と表示名のみをサーバーへ送信します（解答内容や正誤は送信されません）',
      ),
    ).toBeTruthy()
    // joinedゲートで未参加時は送信されないため、旧文言の注意は不要
    expect(screen.queryByText('レイド参加中のみ有効にしてください')).toBeNull()
  })
})

describe('SettingsScreen: 問題別正誤統計トグル（レビューF3(b)）', () => {
  it('レイド未登録の間はトグルがdisabledで、登録条件の説明が出る', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    const toggle = screen.getByLabelText(/問題別の正誤統計を送信する/) as HTMLInputElement
    expect(toggle.disabled).toBe(true)
    expect(
      screen.getByText(
        '問題の難易度調整のための匿名統計です（レイド登録済みの場合のみ送信されます）',
      ),
    ).toBeTruthy()
  })

  it('レイド登録済み（raidRegisteredAtあり）ならトグルが有効で永続化できる', async () => {
    const db = newDb()
    await db.settings.put({ key: 'raidRegisteredAt', value: 1000 })
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    const toggle = screen.getByLabelText(/問題別の正誤統計を送信する/) as HTMLInputElement
    expect(toggle.disabled).toBe(false)
    fireEvent.click(toggle)

    await vi.waitFor(async () => {
      expect((await db.settings.get('questionStatsEnabled'))?.value).toBe(true)
    })
  })
})

describe('SettingsScreen: 表示名とレイド表示名の関係の注記（レビューF3(c)）', () => {
  it('レイド登録済みなら「レイドの表示名には反映されません」の注記が出る', async () => {
    const db = newDb()
    await db.settings.put({ key: 'raidRegisteredAt', value: 1000 })
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    expect(
      screen.getByText(
        'レイドの表示名には反映されません（レイド画面から再登録すると反映されます）',
      ),
    ).toBeTruthy()
  })

  it('レイド未登録なら注記は出ない', async () => {
    const db = newDb()
    render(
      <SettingsScreen db={db} packCache={new FakePackCache()} raidApi={new FakeRaidApi(true)} />,
    )
    await flushLoad()

    expect(screen.queryByText(/レイドの表示名には反映されません/)).toBeNull()
  })
})
