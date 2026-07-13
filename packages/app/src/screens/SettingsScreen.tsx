// S9 設定画面（T-23。正本: docs/10 T-23行、docs/02 2.2節、docs/04 6節、docs/07 7節S9）。
// 表示名・イヤホンなしモード・テーマ切替・文字サイズ・キャッシュ使用量・
// エクスポート/インポートの「標準的なリスト」画面（07: デザイン投資は最小でよい）。
// BYOKのAPIキー欄はM2のため置かない（実装指示5。docs/07表のS9説明とは範囲が異なる）。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { FontSizeScale } from '../fontSize'
import { getFontSizeScale, setFontSizeScale } from '../fontSize'
import type { CacheUsage, PackCache } from '../platform'
import { exportAll, importAll } from '../services/backup'
import { FONT_SIZE_KEY, NO_EARPHONE_MODE_KEY, THEME_PREFERENCE_KEY } from '../services/settingsKeys'
import type { Theme } from '../theme'
import { setTheme } from '../theme'
import { useAppStore } from '../store/appStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /** platform層のPackCache（App.tsxがモジュールスコープで生成し、audioPlayerと同様に注入する） */
  packCache: PackCache
}

/** テーマ設定は「OS追従」を含む3値（実際に適用されるのはTheme=dark/light） */
export type ThemePreference = 'system' | Theme

function resolveTheme(pref: ThemePreference): Theme {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function SettingsScreen({ db, packCache }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [displayName, setDisplayName] = useState('')
  const [noEarphoneMode, setNoEarphoneModeState] = useState(false)
  const [themePref, setThemePrefState] = useState<ThemePreference>('system')
  const [fontSize, setFontSizeState] = useState<FontSizeScale>(getFontSizeScale())
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [profile, earphoneSetting, themeSetting, fontSetting, usage] = await Promise.all([
        db.profile.get(PROFILE_ID),
        db.settings.get(NO_EARPHONE_MODE_KEY),
        db.settings.get(THEME_PREFERENCE_KEY),
        db.settings.get(FONT_SIZE_KEY),
        packCache.usage(),
      ])
      if (cancelled) return
      if (profile) setDisplayName(profile.displayName)
      setNoEarphoneModeState(earphoneSetting?.value === true)
      const pref = (themeSetting?.value as ThemePreference | undefined) ?? 'system'
      setThemePrefState(pref)
      setTheme(resolveTheme(pref))
      const font = (fontSetting?.value as FontSizeScale | undefined) ?? 'M'
      setFontSizeState(font)
      setFontSizeScale(font)
      setCacheUsage(usage)
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [db, packCache])

  async function handleDisplayNameBlur() {
    const profile = await db.profile.get(PROFILE_ID)
    if (!profile) return
    const trimmed = displayName.trim()
    if (trimmed === '' || trimmed === profile.displayName) return
    await db.profile.put({ ...profile, displayName: trimmed })
  }

  async function handleToggleEarphone() {
    const next = !noEarphoneMode
    setNoEarphoneModeState(next)
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: next })
  }

  async function handleThemeChange(pref: ThemePreference) {
    setThemePrefState(pref)
    setTheme(resolveTheme(pref))
    await db.settings.put({ key: THEME_PREFERENCE_KEY, value: pref })
  }

  async function handleFontSizeChange(scale: FontSizeScale) {
    setFontSizeState(scale)
    setFontSizeScale(scale)
    await db.settings.put({ key: FONT_SIZE_KEY, value: scale })
  }

  async function handleClearCache() {
    const confirmed = window.confirm(
      'キャッシュ済みの問題パック・音声を削除します。解答履歴・レート・SRSなどの学習データには一切触れません。よろしいですか？',
    )
    if (!confirmed) return
    await packCache.clear()
    setCacheUsage(await packCache.usage())
  }

  async function handleExport() {
    const backup = await exportAll(db)
    const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const date = new Date(now()).toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `beb-raid-backup-${date}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportFile(file: File) {
    setMessage(null)
    try {
      const text = await file.text()
      const data: unknown = JSON.parse(text)
      await importAll(db, data)
      setMessage('復元しました。')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '復元に失敗しました。')
    }
  }

  return (
    <ScreenLayout action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}>
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>設定</h1>

      <section>
        <label>
          表示名
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={() => void handleDisplayNameBlur()}
          />
        </label>
      </section>

      <section>
        <label>
          <input
            type="checkbox"
            checked={noEarphoneMode}
            onChange={() => void handleToggleEarphone()}
          />
          イヤホンなしモード（リスニング問題をリーディング系に差し替える）
        </label>
      </section>

      <section>
        <p>テーマ</p>
        {(['system', 'dark', 'light'] as const).map((pref) => (
          <label key={pref}>
            <input
              type="radio"
              name="theme"
              checked={themePref === pref}
              onChange={() => void handleThemeChange(pref)}
            />
            {pref === 'system' ? 'OS追従' : pref === 'dark' ? 'ダーク' : 'ライト'}
          </label>
        ))}
      </section>

      <section>
        <p>文字サイズ（英文問題文）</p>
        {(['S', 'M', 'L'] as const).map((scale) => (
          <label key={scale}>
            <input
              type="radio"
              name="fontSize"
              checked={fontSize === scale}
              onChange={() => void handleFontSizeChange(scale)}
            />
            {scale}
          </label>
        ))}
      </section>

      <section>
        <p>
          キャッシュ使用量:{' '}
          {cacheUsage
            ? `${(cacheUsage.bytes / 1024 / 1024).toFixed(1)}MB（${cacheUsage.entries}件）`
            : '取得中…'}
        </p>
        <button type="button" onClick={() => void handleClearCache()}>
          キャッシュを削除
        </button>
      </section>

      <section>
        <button type="button" onClick={() => void handleExport()}>
          エクスポート
        </button>
        <label>
          インポート
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleImportFile(file)
              e.target.value = ''
            }}
          />
        </label>
        {message && <p role="status">{message}</p>}
      </section>

      {loaded && <span data-testid="settings-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
