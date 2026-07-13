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
