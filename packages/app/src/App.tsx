// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム（T-21）で暫定の確認画面から差し替え済み。
// 起動時、profile未作成（=P0診断未完了）なら診断画面から始める（T-20）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from './db/database'
import { getDb } from './db/database'
import type { FontSizeScale } from './fontSize'
import { setFontSizeScale } from './fontSize'
import { createAiClient, createAudioPlayer, createPackCache, type PackCache } from './platform'
import { loadPackQuestions, syncPacks } from './services/packSync'
import { hasProfile } from './services/profile'
import { resumeSession, type SessionSnapshot } from './services/session'
import { BYOK_API_KEY_KEY, FONT_SIZE_KEY, THEME_PREFERENCE_KEY } from './services/settingsKeys'
import { resolveTheme, setTheme, type ThemePreference } from './theme'
import { PrimaryButton } from './components/PrimaryButton'
import { ScreenLayout } from './components/ScreenLayout'
import { DashboardScreen } from './screens/DashboardScreen'
import { DiagnosticScreen } from './screens/DiagnosticScreen'
import { DrillScreen } from './screens/DrillScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ResultScreen } from './screens/ResultScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShadowingScreen } from './screens/ShadowingScreen'
import { VocabScreen } from './screens/VocabScreen'
import { useAppStore } from './store/appStore'

/**
 * 配布パック全12件（M1の4＋M2の8。T-32/T-64のPACK_DEFINITIONSと対応。cli側の定義を
 * appから直接importはしない——cliはビルド時ツールでappの実行時依存にしない構成のため、
 * idはここに複製する）。手動複製のため追加漏れが起きうる——App.test.tsxで
 * content/manifest.json（build成果物）のパック一覧との一致をテストで検証する
 */
export const PACK_IDS = [
  'pack-vocab-s-001',
  'pack-p2-s-001',
  'pack-p5-s-001',
  'pack-p5-similar-s-001',
  'pack-vocab-a-001',
  'pack-vocab-b-001',
  'pack-p2-s-002',
  'pack-p5-s-002',
  'pack-p34-s-001',
  'pack-dict-s-001',
  'pack-shadow-s-001',
  'pack-p5-similar-s-002',
]

/**
 * 全パックの問題を読み込み1つのプールにまとめる（T-37: ダミーパック削除・実パック配線）。
 * PackCacheファースト（loadPackQuestions）で読み、1パックの取得に失敗しても
 * 他パックは読み込みを続行する（オフラインが正常系。取得できたぶんだけで動かす）
 */
export async function loadQuestionPool(
  packCache: PackCache,
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<Question[]> {
  const results = await Promise.all(
    PACK_IDS.map((id) =>
      loadPackQuestions(packCache, `${baseUrl}packs/${id}.json`).catch((err: unknown) => {
        // オフラインが正常系のため描画はブロックしないが、原因追跡のためコンソールには残す
        console.warn(`[loadQuestionPool] パック取得に失敗: ${id}`, err)
        return [] as Question[]
      }),
    ),
  )
  return results.flat()
}

/**
 * 起動後のバックグラウンド同期（T-73）。syncPacks成功後、新規/更新パックがあれば
 * （synced.length>0）questionPoolを再読込して返す。変化が無ければnull
 * （呼び出し側はsetState不要と判断できる）
 */
export async function syncPacksAndReload(
  db: BebRaidDatabase,
  packCache: PackCache,
): Promise<Question[] | null> {
  const result = await syncPacks({ db, packCache })
  if (!result || result.synced.length === 0) return null
  return loadQuestionPool(packCache)
}

const audioPlayer = createAudioPlayer()
const packCache = createPackCache()
/** BYOK AIクライアント（M2・T-56）。APIキーはsettingsストアから都度読み出す（db直依存を避ける疎結合） */
const aiClient = createAiClient(
  async () => ((await getDb().settings.get(BYOK_API_KEY_KEY))?.value as string | undefined) ?? null,
)

export function App() {
  const screen = useAppStore((s) => s.screen)
  const navigate = useAppStore((s) => s.navigate)
  // 起動時のprofile有無チェック＋パック読み込みが終わるまで描画をブロックする
  // （HomeScreenが一瞬見えてから診断へ切り替わるチラつきを防ぐ。パック読み込みは
  // PackCacheヒット時は高速なため、起動3秒要件への影響は軽微な想定）
  const [bootChecked, setBootChecked] = useState(false)
  const [questionPool, setQuestionPool] = useState<Question[]>([])
  // T-67: 進行中セッションの中断復帰（docs/15 T-67・J-34）
  const [resumeSnapshot, setResumeSnapshot] = useState<SessionSnapshot | null>(null)
  // T-68: 起動チェック失敗時の白画面防止（14の1.2）。retryTokenを変えて同じeffectを再実行させる
  const [bootError, setBootError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)
  // T-69: テーマ・文字サイズの起動時適用（14の1.3）。themePreferenceはOS追従リスナーの要否判定に使う
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      hasProfile(getDb()),
      loadQuestionPool(packCache),
      resumeSession(getDb()),
      getDb().settings.get(THEME_PREFERENCE_KEY),
      getDb().settings.get(FONT_SIZE_KEY),
    ])
      .then(([exists, pool, resumed, themeSetting, fontSetting]) => {
        if (cancelled) return
        if (!exists) navigate('diagnostic')
        setQuestionPool(pool)
        setResumeSnapshot(resumed)
        const pref = (themeSetting?.value as ThemePreference | undefined) ?? 'system'
        setThemePreferenceState(pref)
        setTheme(resolveTheme(pref))
        setFontSizeScale((fontSetting?.value as FontSizeScale | undefined) ?? 'M')
        setBootChecked(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[App] 起動チェックに失敗', err)
        setBootError('データの読み込みに失敗しました')
      })
    return () => {
      cancelled = true
    }
  }, [navigate, retryToken])

  // OS追従（themePreference==='system'）のとき、OS側のダーク/ライト切替に追従する
  useEffect(() => {
    if (themePreference !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => setTheme(resolveTheme('system'))
    mql.addEventListener('change', handleChange)
    return () => {
      mql.removeEventListener('change', handleChange)
    }
  }, [themePreference])

  // ホームに戻るたび（起動時に加え、ドリルの「中断」ボタンからの復帰時も）に
  // 中断状態を再取得する。App自体はscreen切替では再マウントしないため、boot時点の
  // 値のままだと中断直後のセッションが再開ボタンに反映されない
  useEffect(() => {
    if (!bootChecked || screen !== 'home') return
    let cancelled = false
    void resumeSession(getDb()).then((resumed) => {
      if (!cancelled) setResumeSnapshot(resumed)
    })
    return () => {
      cancelled = true
    }
  }, [bootChecked, screen])

  // 起動時のパック配信・キャッシュ同期（T-35）。bootChecked（診断遷移判定）とは
  // 独立に走らせる（オフライン・取得失敗時は静かにスキップするため描画をブロックしない）。
  // T-73: 新規/更新パックが同期できたら（synced.length>0）questionPoolを再読込し、
  // 初回同期直後から新パックが出題対象になるようにする
  useEffect(() => {
    let cancelled = false
    void syncPacksAndReload(getDb(), packCache).then((pool) => {
      if (!cancelled && pool) setQuestionPool(pool)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // T-72: ストレージ保全（J-38）。拒否されても動作は変えない（iOS Safariはインストール済み
  // PWAで自動許可される仕様）。navigator.storage不在環境（jsdom等）でも例外にならない
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  if (bootError) {
    return (
      <ScreenLayout
        status={<p>起動エラー</p>}
        action={
          <PrimaryButton
            onClick={() => {
              setBootError(null)
              setRetryToken((n) => n + 1)
            }}
          >
            再試行
          </PrimaryButton>
        }
      >
        <p>{bootError}</p>
        <p>設定→エクスポートで学習データを退避できます</p>
      </ScreenLayout>
    )
  }

  if (!bootChecked) return null

  const vocabQuestions = questionPool.filter((q) => q.format === 'vocab_card')
  const shadowingQuestions = questionPool.filter((q) => q.format === 'shadowing')

  if (screen === 'diagnostic') {
    return <DiagnosticScreen db={getDb()} audioPlayer={audioPlayer} questionPool={questionPool} />
  }
  if (screen === 'drill') {
    return <DrillScreen db={getDb()} audioPlayer={audioPlayer} aiClient={aiClient} />
  }
  if (screen === 'result') return <ResultScreen db={getDb()} />
  if (screen === 'vocab') {
    return <VocabScreen db={getDb()} audioPlayer={audioPlayer} vocabQuestions={vocabQuestions} />
  }
  if (screen === 'shadowing') {
    return (
      <ShadowingScreen
        db={getDb()}
        audioPlayer={audioPlayer}
        shadowingQuestions={shadowingQuestions}
      />
    )
  }
  if (screen === 'dashboard') return <DashboardScreen db={getDb()} />
  if (screen === 'settings') return <SettingsScreen db={getDb()} packCache={packCache} />

  // 'home' に加え、未実装の画面もホームへフォールバックする
  return <HomeScreen db={getDb()} questionPool={questionPool} resumeSnapshot={resumeSnapshot} />
}
