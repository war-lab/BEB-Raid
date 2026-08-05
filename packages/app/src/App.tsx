// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム（T-21）で暫定の確認画面から差し替え済み。
// 起動時、profile未作成（=P0診断未完了）なら診断画面から始める（T-20）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from './db/database'
import { getDb } from './db/database'
import { PROFILE_ID } from './db/schema'
import type { FontSizeScale } from './fontSize'
import { setFontSizeScale } from './fontSize'
import {
  createAiClient,
  createAudioPlayer,
  createBattleSocket,
  createPackCache,
  createRaidApi,
  type PackCache,
} from './platform'
import { exportAll } from './services/backup'
import { loadPendingGhostBossResult } from './services/ghostBoss'
import { loadPackQuestions, syncPacks } from './services/packSync'
import { hasProfile } from './services/profile'
import { sendQuestionStats } from './services/questionStats'
import { syncRaidDamage } from './services/raidSync'
import { resumeSession, type SessionSnapshot } from './services/session'
import { BYOK_API_KEY_KEY, FONT_SIZE_KEY, THEME_PREFERENCE_KEY } from './services/settingsKeys'
import { resolveTheme, setTheme, type ThemePreference } from './theme'
import { PrimaryButton } from './components/PrimaryButton'
import { ScreenLayout } from './components/ScreenLayout'
import { BattleHostScreen } from './screens/BattleHostScreen'
import { BattleScreen } from './screens/BattleScreen'
import { DashboardScreen } from './screens/DashboardScreen'
import { DiagnosticScreen } from './screens/DiagnosticScreen'
import { DrillScreen } from './screens/DrillScreen'
import { GhostBossResultScreen } from './screens/GhostBossResultScreen'
import { HomeScreen } from './screens/HomeScreen'
import { RaidScreen } from './screens/RaidScreen'
import { ReadingScreen } from './screens/ReadingScreen'
import { ResultScreen } from './screens/ResultScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { ShadowingScreen } from './screens/ShadowingScreen'
import { VocabScreen } from './screens/VocabScreen'
import { WrongAnswersScreen } from './screens/WrongAnswersScreen'
import { useAppStore, type ScreenName } from './store/appStore'
import { useSessionStore } from './store/sessionStore'

/**
 * 配布パック全20件（M1の4＋M2の8＋T-83の1＋T-84の2＋T-85の2＋初級追加の1＋読解R-1の2。
 * T-32/T-64/T-83〜T-85/T-107のPACK_DEFINITIONSと対応。cli側の定義を
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
  'pack-p5-similar-s-003',
  'pack-p34-s-002',
  'pack-dict-s-002',
  'pack-p5-s-003',
  'pack-p34-s-003',
  'pack-vocab-s-002',
  'pack-reading-p6-s-001',
  'pack-reading-p7single-s-001',
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

/**
 * オンライン復帰時のパック再同期ハンドラを作る（T-107a。正本: docs/18 T-107シート）。
 * オフライン起動でパック取得に失敗した後、オンライン復帰しても再同期されず
 * 「開き直してください」のまま固まる問題への対処。'online'イベントにバインドする想定で、
 * 内部のinFlightフラグにより多重実行（矢継ぎ早のonline発火の重複）を防ぐ
 */
export function createOnlineResyncHandler(
  db: BebRaidDatabase,
  packCache: PackCache,
  onPoolLoaded: (pool: Question[]) => void,
): () => void {
  let inFlight = false
  return () => {
    if (inFlight) return
    inFlight = true
    void syncPacksAndReload(db, packCache)
      .then((pool) => {
        if (pool) onPoolLoaded(pool)
      })
      .catch((e: unknown) => {
        console.warn('[App] オンライン復帰時のパック再同期に失敗', e)
      })
      .finally(() => {
        inFlight = false
      })
  }
}

const audioPlayer = createAudioPlayer()
const packCache = createPackCache()
/** BYOK AIクライアント（M2・T-56）。APIキーはsettingsストアから都度読み出す（db直依存を避ける疎結合） */
const aiClient = createAiClient(
  async () => ((await getDb().settings.get(BYOK_API_KEY_KEY))?.value as string | undefined) ?? null,
)
/**
 * 共有API（レイド）クライアント（M3・T-96）。baseUrl未設定なら isConfigured()=false で
 * 以降のsyncRaidDamage呼び出しは即returnする（縮退設計）。deviceTokenはprofileストアから
 * 都度読み出す（aiClientと同じ疎結合パターン）
 */
const raidApi = createRaidApi(
  import.meta.env.VITE_RAID_API_BASE_URL as string | undefined,
  async () => (await getDb().profile.get(PROFILE_ID))?.deviceToken ?? '',
)

/**
 * イベントバトル（M4・T-125）のWebSocketクライアント。raidApiと同じbaseUrl/deviceToken疎結合パターン。
 * 画面を離れる際はBattleScreen側でclose()を呼ぶ（次回参加時にconnect()が新規WebSocketを張り直す）
 */
const battleSocket = createBattleSocket(
  import.meta.env.VITE_RAID_API_BASE_URL as string | undefined,
  async () => (await getDb().profile.get(PROFILE_ID))?.deviceToken ?? '',
)

export function App() {
  const screen = useAppStore((s) => s.screen)
  // M4・T-128: 'result' 画面をボス役セッション（ゴースト記録プレビュー）か
  // 通常のResultScreenかで振り分ける（同意の構造的強制。GhostBossResultScreen冒頭コメント参照）
  const isGhostBossSession = useSessionStore((s) => s.isGhostBossSession)
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
  // レビューF6: 起動エラー画面からの緊急エクスポートが失敗したときの表示
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      hasProfile(getDb()),
      loadQuestionPool(packCache),
      resumeSession(getDb()),
      getDb().settings.get(THEME_PREFERENCE_KEY),
      getDb().settings.get(FONT_SIZE_KEY),
      loadPendingGhostBossResult(getDb()),
    ])
      .then(([exists, pool, resumed, themeSetting, fontSetting, pendingGhostBoss]) => {
        if (cancelled) return
        if (!exists) {
          navigate('diagnostic')
        } else if (pendingGhostBoss) {
          // T-272: 送信成功前にアプリを終了・再読み込みした未送信のボス役結果があれば、
          // 送信/破棄の画面へ復帰させる（次回起動が唯一の再試行機会のため、黙って
          // 通常のホームへ進ませない）
          useSessionStore.getState().hydrateGhostBossResults(pendingGhostBoss.records, pool)
          navigate('result')
        }
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

  // T-114（docs/18 3.5節・J-55）: ブラウザバック・Androidの戻るジェスチャーへの最小対応。
  // popstateではnavigate()を呼ばずnavigateFromPopStateを直接呼ぶ（history.pushStateを
  // 積まないことで、pushState→popstate→pushStateの無限ループを防ぐ）。
  // ドリル進行中のpopも確認なしで中断扱いにする（activeSessionは保存済みのため
  // 「続きから再開」で復帰できる。データは失われない）。home表示中の戻るはリスナーが
  // 拾わないため、ブラウザ既定（アプリ終了）に任せる
  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      // T-221（Q-15）: audioPlayerはモジュールスコープのシングルトンで、popstateで
      // 画面を離れても再生中の音声が止まらなかった（Part3/4の約30秒音声がホーム画面で
      // 流れ続ける）。再生していなければ no-op なので、画面を問わず常に呼んでよい
      audioPlayer.stop()
      const state = event.state as { screen?: ScreenName } | null
      useAppStore.getState().navigateFromPopState(state?.screen ?? 'home')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

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
  //
  // T-201（docs/29 Q-57）: 実機の開発ビルドでパックJSON・音声ファイルへの同一URL GETが
  // 複数回記録された所見の調査結果。原因は本エフェクトの実装ではなく、main.tsxの
  // <StrictMode> が開発時のみマウント→アンマウント→再マウントを行うこと（cancelledガードは
  // setState を止めるだけで、既に発行済みのfetch自体は中断しない）。本番ビルド
  // （`vite build` + `vite preview`）でPlaywrightから実機同等の操作を行い、パックJSON・
  // audioとも同一URLへのGETは1回のみであることを確認済み（2026-08-04）。モバイル回線の
  // 初回コスト倍増という懸念は本番では発生しない。再現しないため修正はしない
  useEffect(() => {
    let cancelled = false
    void syncPacksAndReload(getDb(), packCache).then((pool) => {
      if (!cancelled && pool) setQuestionPool(pool)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // T-107(a): オフライン起動でパック取得に失敗した後、オンライン復帰しても再同期されず
  // 「開き直してください」のまま固まる問題への対処。online復帰のたびに再同期を試みる
  useEffect(() => {
    let cancelled = false
    const handleOnline = createOnlineResyncHandler(getDb(), packCache, (pool) => {
      if (!cancelled) setQuestionPool(pool)
    })
    window.addEventListener('online', handleOnline)
    return () => {
      cancelled = true
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  // 起動時のレイドダメージ送信（M3・T-96）。失敗しても起動は妨げない（syncRaidDamage内部で
  // 通信失敗はcatch済み。ここに来るのはDB例外等の想定外だけなので、原因追跡用にログは残す）
  useEffect(() => {
    void syncRaidDamage(getDb(), raidApi).catch((e: unknown) => {
      console.warn('[raidSync] 起動時同期に失敗', e)
    })
  }, [])

  // 起動時のquestionStats送信（M3・T-100）。raidSyncと同じトリガーに相乗り。失敗してもログのみ
  useEffect(() => {
    void sendQuestionStats(getDb(), raidApi).catch((e: unknown) => {
      console.warn('[questionStats] 起動時送信に失敗', e)
    })
  }, [])

  // T-72: ストレージ保全（J-38）。拒否されても動作は変えない（iOS Safariはインストール済み
  // PWAで自動許可される仕様）。navigator.storage不在環境（jsdom等）でも例外にならない
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {})
  }, [])

  // レビューF6: 起動エラー時の緊急エクスポート。設定画面へ遷移できない状況のため、
  // このボタンから直接ダウンロードさせる。DBが開けない失敗ではエラーメッセージを出す縮退でよい
  async function handleEmergencyExport() {
    setExportError(null)
    try {
      const backup = await exportAll(getDb())
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      anchor.href = url
      anchor.download = `beb-raid-backup-${date}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[App] 緊急エクスポートに失敗', e)
      setExportError('エクスポートに失敗しました（データベースを開けません）')
    }
  }

  if (bootError) {
    return (
      <ScreenLayout
        status={<p>起動エラー</p>}
        action={
          <>
            <PrimaryButton
              onClick={() => {
                setBootError(null)
                setRetryToken((n) => n + 1)
              }}
            >
              再試行
            </PrimaryButton>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void handleEmergencyExport()}
            >
              学習データをエクスポート
            </button>
            {exportError && <p className="drill-error">{exportError}</p>}
          </>
        }
      >
        <p>{bootError}</p>
        <p>学習データはエクスポートで退避できます</p>
      </ScreenLayout>
    )
  }

  // T-211(Q-40): 起動チェック完了までreturn nullだと、index.htmlの静的スプラッシュが
  // Reactマウントの瞬間に#rootごと消え、以降は完全な白画面になる（低速回線ではPromise.all
  // で20パックの取得を待つため数秒間続く）。RaidScreenの読み込み中表示と揃える
  if (!bootChecked) {
    return (
      <ScreenLayout status={<p>BEB Raid</p>} action={null}>
        <p>読み込み中…</p>
      </ScreenLayout>
    )
  }

  const vocabQuestions = questionPool.filter((q) => q.format === 'vocab_card')
  const shadowingQuestions = questionPool.filter((q) => q.format === 'shadowing')

  if (screen === 'diagnostic') {
    return <DiagnosticScreen db={getDb()} audioPlayer={audioPlayer} questionPool={questionPool} />
  }
  if (screen === 'drill') {
    return (
      <DrillScreen db={getDb()} audioPlayer={audioPlayer} aiClient={aiClient} raidApi={raidApi} />
    )
  }
  if (screen === 'result') {
    if (isGhostBossSession) return <GhostBossResultScreen db={getDb()} raidApi={raidApi} />
    return <ResultScreen db={getDb()} raidApi={raidApi} />
  }
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
  if (screen === 'dashboard') return <DashboardScreen db={getDb()} questionPool={questionPool} />
  if (screen === 'wrongAnswers') {
    return (
      <WrongAnswersScreen
        db={getDb()}
        questionPool={questionPool}
        aiClient={aiClient}
        raidApi={raidApi}
      />
    )
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        db={getDb()}
        packCache={packCache}
        raidApi={raidApi}
        onThemePreferenceChange={setThemePreferenceState}
      />
    )
  }
  if (screen === 'raid') {
    return (
      <RaidScreen
        db={getDb()}
        raidApi={raidApi}
        questionPool={questionPool}
        resumeSnapshot={resumeSnapshot}
      />
    )
  }
  if (screen === 'reading') {
    return <ReadingScreen db={getDb()} aiClient={aiClient} raidApi={raidApi} />
  }
  if (screen === 'battle') {
    return <BattleScreen db={getDb()} battleSocket={battleSocket} questionPool={questionPool} />
  }
  if (screen === 'battleHost') {
    return (
      <BattleHostScreen
        raidApi={raidApi}
        battleSocket={battleSocket}
        audioPlayer={audioPlayer}
        questionPool={questionPool}
      />
    )
  }

  // 'home' に加え、未実装の画面もホームへフォールバックする
  return (
    <HomeScreen
      db={getDb()}
      questionPool={questionPool}
      resumeSnapshot={resumeSnapshot}
      raidApi={raidApi}
    />
  )
}
