// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム（T-21）で暫定の確認画面から差し替え済み。
// 起動時、profile未作成（=P0診断未完了）なら診断画面から始める（T-20）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import { getDb } from './db/database'
import { createAiClient, createAudioPlayer, createPackCache, type PackCache } from './platform'
import { loadPackQuestions, syncPacks } from './services/packSync'
import { hasProfile } from './services/profile'
import { BYOK_API_KEY_KEY } from './services/settingsKeys'
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

  useEffect(() => {
    let cancelled = false
    void Promise.all([hasProfile(getDb()), loadQuestionPool(packCache)]).then(([exists, pool]) => {
      if (cancelled) return
      if (!exists) navigate('diagnostic')
      setQuestionPool(pool)
      setBootChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  // 起動時のパック配信・キャッシュ同期（T-35）。bootChecked（診断遷移判定）とは
  // 独立に走らせる（オフライン・取得失敗時は静かにスキップするため描画をブロックしない）
  useEffect(() => {
    void syncPacks({ db: getDb(), packCache })
  }, [])

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
  return <HomeScreen db={getDb()} questionPool={questionPool} />
}
