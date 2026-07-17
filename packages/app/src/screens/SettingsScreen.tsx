// S9 設定画面（T-23。正本: docs/10 T-23行、docs/02 2.2節、docs/04 6節、docs/07 7節S9）。
// 表示名・イヤホンなしモード・テーマ切替・文字サイズ・キャッシュ使用量・
// エクスポート/インポートの「標準的なリスト」画面（07: デザイン投資は最小でよい）。
// BYOKのAPIキー欄・モデル欄はM2・T-55で追加（05の5節: 平文端末内保存・支出上限推奨の注記必須）。
import { useEffect, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { FontSizeScale } from '../fontSize'
import { getFontSizeScale, setFontSizeScale } from '../fontSize'
import { DEFAULT_BYOK_MODEL } from '../platform/ai/AnthropicAiClient'
import type { CacheUsage, PackCache, RaidApi } from '../platform'
import { exportAll, importAll } from '../services/backup'
import {
  BYOK_API_KEY_KEY,
  BYOK_MODEL_KEY,
  FONT_SIZE_KEY,
  HAPTICS_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
  RAID_SYNC_ENABLED_KEY,
  THEME_PREFERENCE_KEY,
} from '../services/settingsKeys'
import { resolveTheme, setTheme, type ThemePreference } from '../theme'
import { useAppStore } from '../store/appStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

/** 保存済みキーのマスク表示（末尾4桁のみ見せる。05の5節） */
function maskApiKey(key: string): string {
  return `sk-***...${key.slice(-4)}`
}

interface Props {
  db: BebRaidDatabase
  /** platform層のPackCache（App.tsxがモジュールスコープで生成し、audioPlayerと同様に注入する） */
  packCache: PackCache
  /** 共有API（レイド）クライアント（M3・T-96）。isConfigured()=falseならレイド設定欄を出さない */
  raidApi: RaidApi
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function SettingsScreen({ db, packCache, raidApi }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [displayName, setDisplayName] = useState('')
  const [noEarphoneMode, setNoEarphoneModeState] = useState(false)
  // T-78: ハプティクス（正解確定時の振動）。既定ON（14の2.4節）
  const [hapticsEnabled, setHapticsEnabledState] = useState(true)
  // T-96: レイドダメージ送信の有効/無効。既定OFF（レイド参加中のみ有効にする想定）
  const [raidSyncEnabled, setRaidSyncEnabledState] = useState(false)
  const [themePref, setThemePrefState] = useState<ThemePreference>('system')
  const [fontSize, setFontSizeState] = useState<FontSizeScale>(getFontSizeScale())
  const [cacheUsage, setCacheUsage] = useState<CacheUsage | null>(null)
  // T-72: ストレージ永続化状態・端末ストレージ使用量（J-38）
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  // BYOK APIキー（T-55）: 保存済みキーの実値（マスク表示の元。画面外へは出さない）
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [editingApiKey, setEditingApiKey] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [byokModel, setByokModel] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [
        profile,
        earphoneSetting,
        themeSetting,
        fontSetting,
        usage,
        apiKeySetting,
        modelSetting,
        persistedResult,
        estimateResult,
        hapticsSetting,
        raidSyncSetting,
      ] = await Promise.all([
        db.profile.get(PROFILE_ID),
        db.settings.get(NO_EARPHONE_MODE_KEY),
        db.settings.get(THEME_PREFERENCE_KEY),
        db.settings.get(FONT_SIZE_KEY),
        packCache.usage(),
        db.settings.get(BYOK_API_KEY_KEY),
        db.settings.get(BYOK_MODEL_KEY),
        navigator.storage?.persisted?.() ?? Promise.resolve(null),
        navigator.storage?.estimate?.() ?? Promise.resolve(null),
        db.settings.get(HAPTICS_ENABLED_KEY),
        db.settings.get(RAID_SYNC_ENABLED_KEY),
      ])
      if (cancelled) return
      if (profile) setDisplayName(profile.displayName)
      setNoEarphoneModeState(earphoneSetting?.value === true)
      setHapticsEnabledState(hapticsSetting?.value !== false)
      setRaidSyncEnabledState(raidSyncSetting?.value === true)
      const pref = (themeSetting?.value as ThemePreference | undefined) ?? 'system'
      setThemePrefState(pref)
      setTheme(resolveTheme(pref))
      const font = (fontSetting?.value as FontSizeScale | undefined) ?? 'M'
      setFontSizeState(font)
      setFontSizeScale(font)
      setCacheUsage(usage)
      setApiKey((apiKeySetting?.value as string | undefined) ?? null)
      setByokModel((modelSetting?.value as string | undefined) ?? DEFAULT_BYOK_MODEL)
      setPersisted(persistedResult)
      setStorageEstimate(estimateResult)
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

  async function handleToggleHaptics() {
    const next = !hapticsEnabled
    setHapticsEnabledState(next)
    await db.settings.put({ key: HAPTICS_ENABLED_KEY, value: next })
  }

  async function handleToggleRaidSync() {
    const next = !raidSyncEnabled
    setRaidSyncEnabledState(next)
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: next })
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

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (trimmed === '') return
    await db.settings.put({ key: BYOK_API_KEY_KEY, value: trimmed })
    setApiKey(trimmed)
    setApiKeyInput('')
    setEditingApiKey(false)
  }

  async function handleDeleteApiKey() {
    await db.settings.delete(BYOK_API_KEY_KEY)
    setApiKey(null)
    setEditingApiKey(false)
  }

  async function handleByokModelChange(value: string) {
    setByokModel(value)
    await db.settings.put({ key: BYOK_MODEL_KEY, value })
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

      <div className="settings-list">
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
          <label>
            <input
              type="checkbox"
              checked={hapticsEnabled}
              onChange={() => void handleToggleHaptics()}
            />
            ハプティクス（正解確定時に振動する）
          </label>
        </section>

        {raidApi.isConfigured() && (
          <section>
            <label>
              <input
                type="checkbox"
                checked={raidSyncEnabled}
                onChange={() => void handleToggleRaidSync()}
              />
              レイドダメージを送信する
            </label>
            <p>レイド参加中のみ有効にしてください</p>
          </section>
        )}

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
          <p>永続化: {persisted === null ? '取得不可' : persisted ? '有効' : '無効'}</p>
          {storageEstimate && (
            <p>
              端末ストレージ使用量: {((storageEstimate.usage ?? 0) / 1024 / 1024).toFixed(1)}MB /{' '}
              {((storageEstimate.quota ?? 0) / 1024 / 1024).toFixed(1)}MB
            </p>
          )}
        </section>

        <section>
          <p>AIに聞く（BYOK）</p>
          <p className="settings-byok-note">
            キーは端末内に平文保存され、端末外には送信されません。
          </p>
          <p className="settings-byok-note">支出上限を設定したAPIキーの利用を推奨します。</p>
          {apiKey !== null && !editingApiKey ? (
            <>
              <p>{maskApiKey(apiKey)}</p>
              <button type="button" onClick={() => setEditingApiKey(true)}>
                変更
              </button>
              <button type="button" onClick={() => void handleDeleteApiKey()}>
                削除
              </button>
            </>
          ) : (
            <>
              <label>
                APIキー
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                />
              </label>
              <button type="button" onClick={() => void handleSaveApiKey()}>
                保存
              </button>
              {apiKey !== null && (
                <button type="button" onClick={() => setEditingApiKey(false)}>
                  キャンセル
                </button>
              )}
            </>
          )}
          <label>
            モデル
            <input
              value={byokModel}
              onChange={(e) => void handleByokModelChange(e.target.value)}
              placeholder={DEFAULT_BYOK_MODEL}
            />
          </label>
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
      </div>

      {loaded && <span data-testid="settings-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
