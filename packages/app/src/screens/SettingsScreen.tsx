// S9 設定画面（T-23。正本: docs/10 T-23行、docs/02 2.2節、docs/04 6節、docs/07 7節S9）。
// 表示名・イヤホンなしモード・テーマ切替・文字サイズ・キャッシュ使用量・
// エクスポート/インポートの「標準的なリスト」画面（07: デザイン投資は最小でよい）。
// BYOKのAPIキー欄・モデル欄はM2・T-55で追加（05の5節: 平文端末内保存・支出上限推奨の注記必須）。
import { useEffect, useRef, useState } from 'react'
// docs/20 V-6: Aboutブロックのバージョン表示用（package.jsonが正本。二重管理を避ける）
import { version as appVersion } from '../../package.json'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { FontSizeScale } from '../fontSize'
import { getFontSizeScale, setFontSizeScale } from '../fontSize'
import { DEFAULT_BYOK_MODEL } from '../platform/ai/AnthropicAiClient'
import type { CacheUsage, PackCache, RaidApi } from '../platform'
import { exportAll, importAll } from '../services/backup'
import {
  BYOK_API_KEY_KEY,
  AUTO_PLAY_ENABLED_KEY,
  BYOK_MODEL_KEY,
  FONT_SIZE_KEY,
  HAPTICS_ENABLED_KEY,
  MISTAP_UNDO_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
  QUESTION_STATS_ENABLED_KEY,
  RAID_REGISTERED_AT_KEY,
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
  /**
   * テーマ設定の変更をApp.tsxへ通知する（T-106）。App.tsxはOS追従リスナーの要否判定に
   * themePreference stateを持っており、ここで通知しないとインポート復元やテーマ切替後も
   * 古いpreferenceのままOS追従が誤動作する（例: 手動でdark固定にした後にOS側テーマが変わると
   * 上書きされてしまう）
   */
  onThemePreferenceChange?: (pref: ThemePreference) => void
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function SettingsScreen({ db, packCache, raidApi, onThemePreferenceChange }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [displayName, setDisplayName] = useState('')
  const [noEarphoneMode, setNoEarphoneModeState] = useState(false)
  // T-78: ハプティクス（正解確定時の振動）。既定ON（14の2.4節）
  const [hapticsEnabled, setHapticsEnabledState] = useState(true)
  // 誤タップの取り消し猶予（ADR 0009）。既定ON
  const [mistapUndoEnabled, setMistapUndoEnabledState] = useState(true)
  // T-166（J-93）: 2問目以降の音声自動再生。既定ON（T-110の意図を変えない）
  const [autoPlayEnabled, setAutoPlayEnabledState] = useState(true)
  // T-96: レイドダメージ送信の有効/無効。既定OFF（レイド参加中のみ有効にする想定）
  const [raidSyncEnabled, setRaidSyncEnabledState] = useState(false)
  // T-100: questionStats（匿名問題別正誤集計）送信の有効/無効。既定OFF
  const [questionStatsEnabled, setQuestionStatsEnabledState] = useState(false)
  // レビューF3: レイド登録済みか（questionStatsはBearer必須のため未登録だと送信されない。
  // ExplanationCard/T-101と同じくraidRegisteredAtの有無で判定する）
  const [raidRegistered, setRaidRegistered] = useState(false)
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
  // T-106: マウント時の初回読込とインポート後の再読込を同じ関数で行う。アンマウント後の
  // setState回避には、コールバック間で共有できるrefで判定する（effect内ローカル変数だと
  // handleImportFile側から参照できない）
  const cancelledRef = useRef(false)

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
      questionStatsSetting,
      raidRegisteredSetting,
      mistapUndoSetting,
      autoPlaySetting,
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
      db.settings.get(QUESTION_STATS_ENABLED_KEY),
      db.settings.get(RAID_REGISTERED_AT_KEY),
      db.settings.get(MISTAP_UNDO_ENABLED_KEY),
      db.settings.get(AUTO_PLAY_ENABLED_KEY),
    ])
    if (cancelledRef.current) return
    setDisplayName(profile ? profile.displayName : '')
    setNoEarphoneModeState(earphoneSetting?.value === true)
    setHapticsEnabledState(hapticsSetting?.value !== false)
    setMistapUndoEnabledState(mistapUndoSetting?.value !== false)
    setAutoPlayEnabledState(autoPlaySetting?.value !== false)
    setRaidSyncEnabledState(raidSyncSetting?.value === true)
    setQuestionStatsEnabledState(questionStatsSetting?.value === true)
    setRaidRegistered(raidRegisteredSetting?.value != null)
    const pref = (themeSetting?.value as ThemePreference | undefined) ?? 'system'
    setThemePrefState(pref)
    setTheme(resolveTheme(pref))
    onThemePreferenceChange?.(pref)
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

  useEffect(() => {
    cancelledRef.current = false
    void load()
    return () => {
      cancelledRef.current = true
    }
    // loadはprops(db/packCache)のみに依存し、インポート後の再読込はhandleImportFileから
    // 直接呼ぶ（このeffectの再実行対象ではない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function handleToggleAutoPlay() {
    const next = !autoPlayEnabled
    setAutoPlayEnabledState(next)
    await db.settings.put({ key: AUTO_PLAY_ENABLED_KEY, value: next })
  }

  async function handleToggleMistapUndo() {
    const next = !mistapUndoEnabled
    setMistapUndoEnabledState(next)
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: next })
  }

  async function handleToggleRaidSync() {
    const next = !raidSyncEnabled
    setRaidSyncEnabledState(next)
    await db.settings.put({ key: RAID_SYNC_ENABLED_KEY, value: next })
  }

  async function handleToggleQuestionStats() {
    const next = !questionStatsEnabled
    setQuestionStatsEnabledState(next)
    await db.settings.put({ key: QUESTION_STATS_ENABLED_KEY, value: next })
  }

  async function handleThemeChange(pref: ThemePreference) {
    setThemePrefState(pref)
    setTheme(resolveTheme(pref))
    onThemePreferenceChange?.(pref)
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

  // T-107(c): 初回起動のパックDL進行中は使用量表示が増えないため、明示的な再計算手段を設ける
  async function handleRecalculateCache() {
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
      // T-106: インポート成功後にこの画面のstateを再読込しないと、全トグル・表示名・
      // テーマ/文字サイズが復元前の値のまま表示され、以降のトグル操作が古い値の反転で
      // DBを上書きしてしまう（表示バグではなくデータ破壊経路）
      await load()
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
          {raidRegistered && (
            <p className="settings-note">
              レイドの表示名には反映されません（レイド画面から再登録すると反映されます）
            </p>
          )}
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

        <section>
          <label>
            <input
              type="checkbox"
              checked={mistapUndoEnabled}
              onChange={() => void handleToggleMistapUndo()}
            />
            誤タップの取り消し猶予（選択直後に取り消せるようにする）
          </label>
        </section>

        {/* T-166（J-93）: 2問目以降の自動再生をOFFにできるようにする。既定はONのままで、
            18のT-110で入れた挙動そのものは変えない（心の準備・音量調整の間が要る場合の逃げ道） */}
        <section>
          <label>
            <input
              type="checkbox"
              checked={autoPlayEnabled}
              onChange={() => void handleToggleAutoPlay()}
            />
            音声の自動再生（2問目以降はタップなしで再生する）
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
            <p className="settings-note">
              レイド参加中、ダメージ換算値と表示名のみをサーバーへ送信します（解答内容や正誤は送信されません）
            </p>
          </section>
        )}

        {raidApi.isConfigured() && (
          <section>
            <label>
              {/* 未登録だとBearer必須のAPIに送信できないため、トグル自体を無効化する（レビューF3(b)） */}
              <input
                type="checkbox"
                checked={questionStatsEnabled}
                disabled={!raidRegistered}
                onChange={() => void handleToggleQuestionStats()}
              />
              問題別の正誤統計を送信する
            </label>
            <p className="settings-note">
              問題の難易度調整のための匿名統計です（レイド登録済みの場合のみ送信されます）
            </p>
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
          <button type="button" onClick={() => void handleRecalculateCache()}>
            再計算
          </button>
          <p>永続化: {persisted === null ? '取得不可' : persisted ? '有効' : '無効'}</p>
          {persisted === false && (
            <p className="settings-note">
              端末の空き容量逼迫時にデータが削除される可能性があります。アプリをホーム画面に追加すると有効になりやすくなります
            </p>
          )}
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
            BYOK（Bring Your Own Key）: ご自身のAIサービスAPIキーを使って解説を生成する仕組みです。
          </p>
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

        {/* docs/20 V-6: Aboutブロック（logo.png小・アプリ名・バージョン）。既存生成済みの
            アプリアイコン（--bgタイル合成済みで理論と同じ見た目のためテーマ非依存）を流用し、
            新規バイナリは追加しない */}
        <section className="settings-about">
          <img
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt=""
            width={40}
            height={40}
            className="settings-about__logo"
          />
          <div className="settings-about__text">
            <p className="settings-about__name">BEB Raid</p>
            <p className="settings-about__version">v{appVersion}</p>
          </div>
        </section>
      </div>

      {loaded && <span data-testid="settings-loaded" style={{ display: 'none' }} />}
    </ScreenLayout>
  )
}
