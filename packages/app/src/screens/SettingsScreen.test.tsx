// T-23 完了条件のテスト（画面層）:
// - 表示名・イヤホンなしモード・テーマ・文字サイズが settings/profile ストアに永続化される
// - エクスポート→インポート往復がUI経由で動く（ファイルダウンロードはモック）
// - dbVersionが新しいバックアップはUI経由でも拒否される
import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { CacheUsage, PackCache } from '../platform'
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
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    fireEvent.click(screen.getByLabelText(/イヤホンなしモード/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('noEarphoneMode'))?.value).toBe(true)
    })
  })

  it('ハプティクスのトグルがsettingsストアに永続化される（T-78。既定はON）', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    expect((screen.getByLabelText(/ハプティクス/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByLabelText(/ハプティクス/))

    await vi.waitFor(async () => {
      expect((await db.settings.get('hapticsEnabled'))?.value).toBe(false)
    })
  })

  it('テーマ切替がsettingsストアに永続化され、data-themeが反映される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    fireEvent.click(screen.getByLabelText('ライト'))

    await vi.waitFor(async () => {
      expect((await db.settings.get('themePreference'))?.value).toBe('light')
    })
    expect(getTheme()).toBe('light')
  })

  it('文字サイズ切替がsettingsストアに永続化され、data-font-sizeが反映される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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
    render(<SettingsScreen db={db} packCache={cache} />)
    await flushLoad()

    expect(screen.getByText(/2件/)).toBeTruthy()

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByText('キャッシュを削除'))

    expect(await screen.findByText(/0件/)).toBeTruthy()
    expect(cache.clear).toHaveBeenCalled()
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
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    expect(screen.getByText('永続化: 有効')).toBeTruthy()
    expect(screen.getByText(/5\.0MB \/ 100\.0MB/)).toBeTruthy()

    // @ts-expect-error テスト後にjsdom既定へ戻す
    delete navigator.storage
  })

  it('T-72: navigator.storageが無い環境では「取得不可」表示になり破綻しない', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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

    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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

    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    const fileInput = screen.getByLabelText('インポート') as HTMLInputElement
    const file = new File([JSON.stringify(tooNew)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [file] })
    fireEvent.change(fileInput)

    expect(await screen.findByText(/dbVersion/)).toBeTruthy()
  })
})

describe('SettingsScreen: BYOK設定（T-55）', () => {
  it('APIキーを保存するとマスク表示になり、削除すると入力欄に戻る', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()

    expect(screen.getByText('キーは端末内に平文保存され、端末外には送信されません。')).toBeTruthy()
    expect(screen.getByText('支出上限を設定したAPIキーの利用を推奨します。')).toBeTruthy()
  })

  it('モデル欄は既定値がplaceholderに出て、変更するとsettingsに保存される', async () => {
    const db = newDb()
    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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

    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
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

    render(<SettingsScreen db={db} packCache={new FakePackCache()} />)
    await flushLoad()
    fireEvent.change(screen.getByPlaceholderText('sk-...'), {
      target: { value: 'sk-ant-abcd1234' },
    })
    fireEvent.click(screen.getByText('保存'))

    await vi.waitFor(async () => expect(await client.isConfigured()).toBe(true))
  })
})
