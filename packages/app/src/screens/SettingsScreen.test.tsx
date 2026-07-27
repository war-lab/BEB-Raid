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
import { getTheme } from '../theme'
import { SettingsScreen } from './SettingsScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`settings-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

class FakePackCache implements PackCache {
  private stored = new Set<string>(['a.mp3', 'b.mp3'])
  has = vi.fn(async (url: string) => this.stored.has(url))
  get = vi.fn(async () => null)
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

  it('キャッシュ使用量が表示され、削除で0件になる', async () => {
    const db = newDb()
    const cache = new FakePackCache()
    render(<SettingsScreen db={db} packCache={cache} raidApi={new FakeRaidApi()} />)
    await flushLoad()

    expect(screen.getByText(/2件/)).toBeTruthy()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('キャッシュを削除'))

    expect(await screen.findByText(/0件/)).toBeTruthy()
    expect(cache.clear).toHaveBeenCalled()
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

describe('SettingsScreen: エクスポート/インポート', () => {
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

    await screen.findByText('復元しました。')
    expect((await db.profile.get(PROFILE_ID))?.displayName).toBe('たろう')
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
    await screen.findByText('復元しました。')
    expect((screen.getByLabelText(/イヤホンなしモード/) as HTMLInputElement).checked).toBe(true)

    // インポート後の初回トグル操作は新しいベースライン(true)からの反転でfalseへ書き込まれる
    fireEvent.click(screen.getByLabelText(/イヤホンなしモード/))
    await vi.waitFor(async () => {
      expect((await db.settings.get('noEarphoneMode'))?.value).toBe(false)
    })
  })
})

describe('SettingsScreen: BYOK設定（T-55）', () => {
  it('APIキーを保存するとマスク表示になり、削除すると入力欄に戻る', async () => {
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
    await vi.waitFor(() => expect(screen.getByPlaceholderText('sk-...')).toBeTruthy())
    expect(await db.settings.get('byokApiKey')).toBeUndefined()
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
