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
import {
  exportAll,
  importAll,
  validateBackup,
  type BackupFile,
  type BackupStores,
} from '../services/backup'
import { PACK_SYNC_STATE_KEY } from '../services/packSync'
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
import { ConfirmDialog } from '../components/ConfirmDialog'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

/** 保存済みキーのマスク表示（末尾4桁のみ見せる。05の5節） */
function maskApiKey(key: string): string {
  return `sk-***...${key.slice(-4)}`
}

/**
 * インポート確認用のストア表示名（T-202・Q-35）。件数だけでなく何のデータかも示すことで、
 * 古いファイルの誤選択に実行前に気づけるようにする
 */
const STORE_LABELS: Record<keyof BackupStores, string> = {
  profile: 'プロフィール',
  attempts: '解答履歴',
  srsCards: '語彙SRSカード',
  ratings: 'レーティング',
  ratingHistory: 'レーティング履歴',
  tagStats: '弱点タグ統計',
  phase: 'フェーズ状態',
  streak: 'ストリーク',
  badges: 'バッジ',
  pendingSync: '同期待ちレイドダメージ',
  settings: '設定',
  examScores: '実試験スコア',
  raidState: 'レイド状態',
}

/** バックアップ内の各ストアの件数を確認ダイアログ用の行にまとめる（T-202・Q-35） */
function summarizeBackupStores(backup: BackupFile): string[] {
  return (Object.keys(STORE_LABELS) as (keyof BackupStores)[]).map((name) => {
    const rows = backup.stores[name]
    return `${STORE_LABELS[name]}: ${Array.isArray(rows) ? rows.length : 0}件`
  })
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
  // T-202（docs/29 Q-35・J-105）: ファイル選択後に対象ストアと件数を提示してから実行の
  // 可否を問う（検証済みのバックアップと、確認ダイアログ用の件数一覧をセットで保持する）
  const [pendingImport, setPendingImport] = useState<{
    backup: BackupFile
    summaryLines: string[]
  } | null>(null)
  // T-202（Q-46）: キャッシュ削除のwindow.confirmをConfirmDialogへ置換
  const [cacheClearConfirm, setCacheClearConfirm] = useState(false)
  // T-202（Q-33〜Q-35と同種の不可逆操作）: BYOKキーの削除は確認なしの1タップだった
  const [apiKeyDeleteConfirm, setApiKeyDeleteConfirm] = useState(false)
  // T-106: マウント時の初回読込とインポート後の再読込を同じ関数で行う。アンマウント後の
  // setState回避には、コールバック間で共有できるrefで判定する（effect内ローカル変数だと
  // handleImportFile側から参照できない）
  const cancelledRef = useRef(false)

  /**
   * T-208（Q-52）: 失敗時は呼び出し元（マウント時effect・handleImportFile）に
   * 例外を伝播させる（従来どおり自身では握らない）。マウント時effect側は`.catch()`で
   * 受けて日本語の案内を出し、`loaded`をtrueにしないことで各トグルのdisabledガード
   * （`!loaded`）を効かせる。ここで自前にtry/catchを持つと、react-hooks/set-state-in-effect
   * が「catch節はawait前でも到達しうる」と保守的に判定し誤検知するため、
   * 呼び出し元のPromiseチェーン側でハンドリングする形にしている
   */
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
    // T-208（Q-52）: load()にcatchが無いと、読込失敗時にトグル類がReactの初期値
    // （既定値。DBの実値と一致するとは限らない）のまま描画される。ここで拾って
    // `loaded`をfalseのままにしておくことで各トグルのdisabledガード（`!loaded`）が効き、
    // 「既定値の反転」でDBの実値を上書きする事故を防ぐ（T-106と同型の経路の残り）
    load().catch((e: unknown) => {
      if (cancelledRef.current) return
      console.error('[SettingsScreen] 設定の読み込みに失敗', e)
      setMessage('設定の読み込みに失敗しました。ページを再読み込みしてください。')
    })
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

  // T-202（Q-46）: window.confirmはPWAでネイティブダイアログが出て文脈が切れる
  // （ConfirmDialog導入の理由そのもの。T-162時点で置換漏れていた2箇所の1つ）
  function handleClearCache() {
    setCacheClearConfirm(true)
  }

  async function confirmClearCache() {
    setCacheClearConfirm(false)
    await packCache.clear()
    // T-183 Q-11の対: 実体を消してもpackSyncState（packHashes）を残すと、ハッシュ一致のみで
    // skip判定するsyncPacksが「同期済み」と誤認し、削除後も再同期されない
    await db.settings.delete(PACK_SYNC_STATE_KEY)
    setCacheUsage(await packCache.usage())
  }

  // T-107(c): 初回起動のパックDL進行中は使用量表示が増えないため、明示的な再計算手段を設ける
  async function handleRecalculateCache() {
    setCacheUsage(await packCache.usage())
  }

  async function handleExport() {
    // T-208（Q-52）: catchが無いと失敗時に無反応のうえunhandled rejectionになる
    // （onClickは`void handleExport()`で呼ばれ、失敗が誰にも伝わらない）
    try {
      const backup = await exportAll(db)
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const date = new Date(now()).toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `beb-raid-backup-${date}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage('エクスポートしました。')
    } catch (e) {
      console.error('[SettingsScreen] エクスポートに失敗', e)
      setMessage('エクスポートに失敗しました。')
    }
  }

  async function handleSaveApiKey() {
    const trimmed = apiKeyInput.trim()
    if (trimmed === '') return
    await db.settings.put({ key: BYOK_API_KEY_KEY, value: trimmed })
    setApiKey(trimmed)
    setApiKeyInput('')
    setEditingApiKey(false)
  }

  // T-202（docs/29 Q-33〜Q-35と同種の不可逆操作）: 確認なしの1タップで削除されていた
  function handleDeleteApiKey() {
    setApiKeyDeleteConfirm(true)
  }

  async function confirmDeleteApiKey() {
    setApiKeyDeleteConfirm(false)
    await db.settings.delete(BYOK_API_KEY_KEY)
    setApiKey(null)
    setEditingApiKey(false)
  }

  async function handleByokModelChange(value: string) {
    setByokModel(value)
    await db.settings.put({ key: BYOK_MODEL_KEY, value })
  }

  /**
   * ファイル選択直後は検証と件数の集計のみ行い、まだ復元しない（T-202・Q-35）。
   * 件数の提示がないと、古いファイルの誤選択に実行前に気づけない。
   * dbVersionの新旧チェックはimportAll内部でも行うが（多層防御・唯一の正）、ここで
   * 弾いておかないと「確認して復元する」を選んだ直後に失敗する体験になるため先に判定する
   */
  async function handleImportFile(file: File) {
    setMessage(null)
    const text = await file.text()
    // T-207（Q-45）: JSON.parseの失敗はSyntaxError（英語メッセージ）で、importAll由来の
    // 検証エラー（日本語）と同じcatchで拾うとe.messageが英語のまま生表示されていた。
    // JSON.parseだけを先に分離し、日本語の案内に置き換える
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      setMessage('ファイルの形式が正しくありません（JSONとして読み込めません）。')
      return
    }
    try {
      // T-207（Q-45）のJSON.parse分離は上で済んでいるため、ここでは再読込・再parseしない
      const problems = validateBackup(data)
      if (problems.length > 0) {
        setMessage(`バックアップが不正: ${problems.join(' / ')}`)
        return
      }
      const backup = data as BackupFile
      if (backup.dbVersion > db.verno) {
        // importAll側の文言と一致させる（同じ判定を先出しするだけで正はimportAll側）
        setMessage(
          `バックアップの dbVersion(${backup.dbVersion}) が現在のDB(${db.verno})より新しい。アプリを更新してから復元してください。`,
        )
        return
      }
      setPendingImport({ backup, summaryLines: summarizeBackupStores(backup) })
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '復元に失敗しました。')
    }
  }

  /** 確認後の実際の復元（T-202）。importAll側でも検証するが、検証はすでに済んでいる */
  async function confirmImport() {
    if (!pendingImport) return
    const { backup } = pendingImport
    setPendingImport(null)
    setMessage(null)
    try {
      await importAll(db, backup)
      // T-106: インポート成功後にこの画面のstateを再読込しないと、全トグル・表示名・
      // テーマ/文字サイズが復元前の値のまま表示され、以降のトグル操作が古い値の反転で
      // DBを上書きしてしまう（表示バグではなくデータ破壊経路）
      await load()
      setMessage('復元しました。')
    } catch (e) {
      // importAllが投げるエラーは検証済みで常に日本語（バックアップ不正・dbVersion不一致等）
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
              disabled={!loaded}
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
              disabled={!loaded}
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
              disabled={!loaded}
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
              disabled={!loaded}
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
                disabled={!loaded}
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
              {/* 未登録だとBearer必須のAPIに送信できないため、トグル自体を無効化する（レビューF3(b)）。
                  T-208（Q-52）: !loadedのときも同様に無効化し、読込失敗時の既定値反転書き込みを防ぐ */}
              <input
                type="checkbox"
                checked={questionStatsEnabled}
                disabled={!loaded || !raidRegistered}
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
          <button type="button" onClick={handleClearCache}>
            キャッシュを削除
          </button>
          <button type="button" onClick={() => void handleRecalculateCache()}>
            再計算
          </button>
          {/* T-202（Q-46）: window.confirmをConfirmDialogへ置換 */}
          {cacheClearConfirm && (
            <ConfirmDialog
              message="キャッシュ済みの問題パック・音声を削除します。解答履歴・レート・SRSなどの学習データには一切触れません。よろしいですか？"
              onDismiss={() => setCacheClearConfirm(false)}
              actions={[
                { label: '削除する', primary: true, onSelect: () => void confirmClearCache() },
                { label: 'キャンセル', onSelect: () => setCacheClearConfirm(false) },
              ]}
            />
          )}
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
              <button type="button" onClick={handleDeleteApiKey}>
                削除
              </button>
              {/* T-202（Q-33〜Q-35と同種の不可逆操作）: 確認なしの1タップで削除されていた */}
              {apiKeyDeleteConfirm && (
                <ConfirmDialog
                  message="保存済みのAPIキーを削除しますか？（この端末から削除され、元に戻せません）"
                  onDismiss={() => setApiKeyDeleteConfirm(false)}
                  actions={[
                    {
                      label: '削除する',
                      primary: true,
                      onSelect: () => void confirmDeleteApiKey(),
                    },
                    { label: 'キャンセル', onSelect: () => setApiKeyDeleteConfirm(false) },
                  ]}
                />
              )}
            </>
          ) : (
            // T-220（Q-58）: password inputがform外にあるとChromeが「Password field is not
            // contained in a form」と警告し、パスワードマネージャの保存・自動入力も効かない。
            // formで括り、送信はEnterキーでも保存ボタンでも同じhandleSaveApiKeyに流す
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSaveApiKey()
              }}
            >
              <label>
                APIキー
                <input
                  type="password"
                  autoComplete="new-password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="sk-..."
                />
              </label>
              <button type="submit">保存</button>
              {apiKey !== null && (
                <button type="button" onClick={() => setEditingApiKey(false)}>
                  キャンセル
                </button>
              )}
            </form>
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
          {/* T-202（Q-35）: ファイル選択後に対象ストアと件数を提示してから実行の可否を問う。
              件数の提示がないと、古いファイルの誤選択に実行前に気づけない */}
          {pendingImport && (
            <ConfirmDialog
              message={`このファイルを復元しますか？（attemptsは追記、他のストアは現在の内容を置き換えます）\n\n${pendingImport.summaryLines.join('\n')}`}
              onDismiss={() => setPendingImport(null)}
              actions={[
                { label: '復元する', primary: true, onSelect: () => void confirmImport() },
                { label: 'キャンセル', onSelect: () => setPendingImport(null) },
              ]}
            />
          )}
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
