// App.tsx は起動時にprofile有無（T-20 P0診断）をチェックし、未診断ならDiagnosticScreen、
// 診断済みなら'home'画面でHomeScreen（T-21）を描画する。どちらも実際にIndexedDBを読むため
// fake-indexeddb が必要
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import 'fake-indexeddb/auto'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionPack } from '@beb-raid/shared-schema'
import {
  App,
  PACK_IDS,
  createOnlineResyncHandler,
  loadQuestionPool,
  syncPacksAndReload,
} from './App'
import { getDb } from './db/database'
import type { PackCache } from './platform'
import { WebAudioPlayer } from './platform/audio/WebAudioPlayer'
import { createProfile } from './services/profile'
import { startSession } from './services/session'
import { GHOST_BOSS_PENDING_RESULT_KEY } from './services/settingsKeys'
import { useAppStore } from './store/appStore'
import { useSessionStore } from './store/sessionStore'

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
})

afterEach(async () => {
  await getDb().profile.clear()
  await getDb().settings.clear()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.fontSize
  useSessionStore.getState().reset()
  vi.restoreAllMocks()
})

describe('App（配線確認）', () => {
  it('未診断（初回起動）の場合はDiagnosticScreenから始まる', async () => {
    render(<App />)
    expect(await screen.findByText('診断を始める')).toBeTruthy()
  })

  it('診断済みの場合はホーム画面（HomeScreen）を描画できる', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    render(<App />)
    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
    expect(screen.getByText('今日のクエスト')).toBeTruthy()
  })

  // T-211(Q-40): 起動チェック完了（hasProfile・パック読込等のPromise.all解決）まで
  // return nullだと、index.htmlの静的スプラッシュがReactマウントの瞬間に#rootごと
  // 消え、以降は完全な白画面になる。マウント直後（起動チェック完了前）の同期描画を
  // 確認して白画面でないことを保証する
  it('T-211: 起動チェック完了前は白画面ではなく読み込み中の表示を出す', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    const { container } = render(<App />)
    // 起動チェックのPromiseはまだ解決していないはずの、マウント直後の同期描画を見る
    expect(container.textContent).not.toBe('')
    expect(screen.getByText('読み込み中…')).toBeTruthy()
    // 起動チェック完了後は通常どおりホーム画面まで到達できる
    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
  })
})

describe('App: 結果画面の振り分け（M4・T-128）', () => {
  it('isGhostBossSessionがtrueならGhostBossResultScreenを描画する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    useSessionStore.setState({ isGhostBossSession: true, results: [], questions: new Map() })
    useAppStore.setState({ screen: 'result' })

    render(<App />)

    expect(await screen.findByText('ボス役の記録')).toBeTruthy()
  })

  it('isGhostBossSessionがfalse（既定）なら通常のResultScreenを描画する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    useSessionStore.setState({ isGhostBossSession: false, results: [], questions: new Map() })
    useAppStore.setState({ screen: 'result' })

    render(<App />)

    expect(await screen.findByText('リザルト')).toBeTruthy()
    expect(screen.queryByText('ボス役の記録')).toBeNull()
  })
})

// T-272（docs/30 17節）: ボス役リザルトの保持がReact state（useSessionStore）のみだと、
// 送信成功前にアプリを終了・再読み込みすると解き切った結果が失われていた。
// settingsに一時保存された未送信結果があれば、起動時にGhostBossResultScreenへ
// 自動的に復帰させることでこの経路を塞ぐ
describe('App: 未送信のボス役結果からの起動時復帰（T-272）', () => {
  it('起動時にsettingsへ未送信のボス役結果があれば、GhostBossResultScreenへ自動復帰する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    await getDb().settings.put({
      key: GHOST_BOSS_PENDING_RESULT_KEY,
      value: {
        records: [
          { questionId: 'q-1', correct: true },
          { questionId: 'q-2', correct: false },
        ],
        savedAt: Date.now(),
      },
    })
    // 直前にどの画面にいたかに関わらず復帰させる（起動時の判定のため'home'から始める）
    useAppStore.setState({ screen: 'home' })

    render(<App />)

    expect(await screen.findByText('ボス役の記録')).toBeTruthy()
    expect(screen.getByText('正解 1 / 2')).toBeTruthy()
    expect(useSessionStore.getState().isGhostBossSession).toBe(true)
  })

  it('未送信のボス役結果が無ければ、通常どおりホーム画面から始まる', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    useAppStore.setState({ screen: 'home' })

    render(<App />)

    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
    expect(screen.queryByText('ボス役の記録')).toBeNull()
  })
})

describe('App: History API最小統合（T-114）', () => {
  it('navigateで履歴が積まれ、popstateで前画面へ戻る', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    render(<App />)
    await screen.findByRole('heading', { name: /BEB RAID/ })

    // ダッシュボードへ遷移する（設定画面は実PackCache.usage()がjsdomのcaches未実装で
    // 例外になるため、このテストでは避ける）
    const pushStateSpy = vi.spyOn(window.history, 'pushState')
    fireEvent.click(screen.getByText('ダッシュボード'))
    await screen.findByText('ダッシュボード', { selector: 'h1' })
    expect(pushStateSpy).toHaveBeenCalledWith({ screen: 'dashboard' }, '')

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'home' } }))
    })

    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
  })

  it('ドリル中のpopは確認なしで中断扱いになり、ホームで「続きから再開」できる', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    const snapshot = await startSession(getDb(), {
      items: [
        { questionId: 'q-1', mode: 'solo' },
        { questionId: 'q-2', mode: 'solo' },
      ],
    })
    render(<App />)
    await screen.findByRole('heading', { name: /BEB RAID/ })

    act(() => {
      useAppStore.getState().navigate('drill')
    })

    // 確認ダイアログを一切経由せずpopstateだけでホームへ戻る
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'home' } }))
    })

    expect(await screen.findByText(`続きから再開（残り${snapshot.items.length}問）`)).toBeTruthy()
  })

  // T-221（Q-15）: audioPlayerはApp.tsxのモジュールスコープ・シングルトンで、Part3/4の
  // 約30秒音声の再生中にブラウザバックで離脱しても止まらず、ホーム画面で流れ続けていた
  it('ドリル進行中のpopstateでaudioPlayer.stop()が呼ばれる', async () => {
    const stopSpy = vi.spyOn(WebAudioPlayer.prototype, 'stop')
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    await startSession(getDb(), { items: [{ questionId: 'q-1', mode: 'solo' }] })
    render(<App />)
    await screen.findByRole('heading', { name: /BEB RAID/ })

    act(() => {
      useAppStore.getState().navigate('drill')
    })
    stopSpy.mockClear()

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { screen: 'home' } }))
    })

    expect(stopSpy).toHaveBeenCalled()
  })
})

describe('App（起動チェック失敗時のエラー表示。T-68）', () => {
  it('起動チェックが失敗すると白画面ではなくエラー画面と再試行ボタンを表示する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    getDb().close()

    render(<App />)

    expect(await screen.findByText('データの読み込みに失敗しました')).toBeTruthy()
    expect(screen.getByText('再試行')).toBeTruthy()

    // 他テストへ影響しないようDB接続を戻す
    await getDb().open()
  })

  it('再試行に成功すると通常どおりホーム画面まで復帰する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    getDb().close()

    render(<App />)
    await screen.findByText('データの読み込みに失敗しました')

    await getDb().open()
    fireEvent.click(screen.getByText('再試行'))

    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
  })

  it('エラー画面から直接エクスポートでき、DBが開けない間はエラーメッセージを出す（レビューF6(b)）', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    getDb().close()

    const createObjectURL = vi.fn((blob: Blob) => `blob:mock:${blob.size}`)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<App />)
    await screen.findByText('データの読み込みに失敗しました')

    // DBが開けない間は縮退（エラーメッセージ表示）
    fireEvent.click(screen.getByText('学習データをエクスポート'))
    expect(
      await screen.findByText('エクスポートに失敗しました（データベースを開けません）'),
    ).toBeTruthy()
    expect(createObjectURL).not.toHaveBeenCalled()

    // DBが開ければエラー画面のままでもダウンロードが動く
    await getDb().open()
    fireEvent.click(screen.getByText('学習データをエクスポート'))
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalled())
    expect(clickSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})

describe('App（テーマ・文字サイズの起動時適用。T-69）', () => {
  it('保存済みのテーマ・文字サイズ設定が起動時に即適用される', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    await getDb().settings.put({ key: 'themePreference', value: 'light' })
    await getDb().settings.put({ key: 'fontSizeScale', value: 'L' })

    render(<App />)
    await screen.findByRole('heading', { name: /BEB RAID/ })

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.documentElement.dataset.fontSize).toBe('L')
  })

  it('テーマ設定がsystemのとき、OS側のダーク/ライト切替に追従する', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    await getDb().settings.put({ key: 'themePreference', value: 'system' })

    const state = { matches: false }
    const listeners: (() => void)[] = []
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          get matches() {
            return state.matches
          },
          media: query,
          addEventListener: (_event: string, handler: () => void) => {
            listeners.push(handler)
          },
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )

    render(<App />)
    await screen.findByRole('heading', { name: /BEB RAID/ })
    expect(document.documentElement.dataset.theme).toBe('light')

    state.matches = true
    listeners.forEach((handler) => handler())

    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('App（ストレージ保全。T-72）', () => {
  it('navigator.storage が存在しない環境（jsdom既定）でも例外にならず起動できる', async () => {
    expect(navigator.storage).toBeUndefined() // jsdomの既定確認（前提が崩れていないか）
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })

    render(<App />)

    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()
  })

  it('navigator.storage.persist() が拒否されても起動を妨げない', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: async () => Promise.reject(new Error('denied')) },
    })

    render(<App />)

    expect(await screen.findByRole('heading', { name: /BEB RAID/ })).toBeTruthy()

    // @ts-expect-error テスト後にjsdom既定へ戻す
    delete navigator.storage
  })
})

describe('loadQuestionPool（T-37: 実パック配線）', () => {
  function pack(id: string, questions: QuestionPack['questions']): QuestionPack {
    return {
      schemaVersion: 2,
      pack: {
        id,
        title: id,
        license: 'internal-original',
        origin: 'test',
        targetLevel: [600, 600],
      },
      questions,
    }
  }

  function fakePackCache(get: PackCache['get']): PackCache {
    return {
      has: vi.fn(async () => false),
      get,
      put: vi.fn(async () => {}),
      addAll: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(async () => []),
      usage: vi.fn(async () => ({ bytes: 0, entries: 0 })),
      clear: vi.fn(async () => {}),
    }
  }

  const CACHED_PACK_IDS = [
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
   * T-325: loadQuestionPoolは対象パックID一覧をmanifest.json経由（cache-first→fetch）で
   * 解決する。このfetchImplはmanifest.jsonにCACHED_PACK_IDSを返す（実fetchへの
   * フォールバックを起こさせないため。manifest.json自体はpackCacheに無い前提でよい）
   */
  function manifestFetchImpl(): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') {
        return {
          ok: true,
          json: async () => ({
            schemaVersion: 2,
            packs: CACHED_PACK_IDS.map((id) => ({
              id,
              title: id,
              targetLevel: [600, 600],
              sizeBytes: 10,
              hash: `h-${id}`,
            })),
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch
  }

  /** 12パック全てにcacheヒットするPackCache（実fetchへのフォールバックを起こさせないため） */
  function allPacksCached(overrides: Record<string, () => Promise<Blob | null>> = {}) {
    return fakePackCache(async (url) => {
      if (url === '/manifest.json') return null
      const id = CACHED_PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (!id) throw new Error(`unexpected url: ${url}`)
      if (overrides[id]) return overrides[id]!()
      return new Blob([JSON.stringify(pack(id, []))])
    })
  }

  it('12パック分の問題を1つのプールにまとめる（cache-first）', async () => {
    const packCache = allPacksCached({
      'pack-vocab-s-001': async () =>
        new Blob([JSON.stringify(pack('pack-vocab-s-001', [{ id: 'v-1' } as never]))]),
      'pack-p2-s-001': async () =>
        new Blob([JSON.stringify(pack('pack-p2-s-001', [{ id: 'p2-1' } as never]))]),
    })
    const pool = await loadQuestionPool(packCache, '/', manifestFetchImpl())
    expect(pool.map((q) => q.id)).toEqual(['v-1', 'p2-1'])
  })

  it('1パックの取得に失敗しても他パックは読み込みを続行する', async () => {
    const packCache = allPacksCached({
      'pack-vocab-s-001': async () => {
        throw new Error('cache read error')
      },
      'pack-p2-s-001': async () =>
        new Blob([JSON.stringify(pack('pack-p2-s-001', [{ id: 'p2-1' } as never]))]),
    })
    const pool = await loadQuestionPool(packCache, '/', manifestFetchImpl())
    expect(pool.map((q) => q.id)).toEqual(['p2-1'])
  })

  // 何を防ぐか（T-325・K-60）: PACK_IDSはcli側パック定義の手動複製のため、新パック追加時に
  // 追記を忘れると出題プールから静かに漏れる。manifest.json由来で解決すれば、
  // PACK_IDSに載っていない新パックでもmanifestに載っていれば読み込まれる
  it('PACK_IDSに含まれない新パックでも、manifestに載っていれば読み込まれる', async () => {
    const newPackId = 'pack-not-in-PACK_IDS-001'
    const packCache = fakePackCache(async (url) => {
      if (url === '/manifest.json') return null
      if (url === `/packs/${newPackId}.json`) {
        return new Blob([JSON.stringify(pack(newPackId, [{ id: 'new-pack-question' } as never]))])
      }
      throw new Error(`unexpected url: ${url}`)
    })
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') {
        return {
          ok: true,
          json: async () => ({
            schemaVersion: 2,
            packs: [
              {
                id: newPackId,
                title: newPackId,
                targetLevel: [600, 600],
                sizeBytes: 10,
                hash: 'h',
              },
            ],
          }),
        } as Response
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    const pool = await loadQuestionPool(packCache, '/', fetchImpl)
    expect(pool.map((q) => q.id)).toEqual(['new-pack-question'])
  })

  // 何を防ぐか: manifestが全く読めない（PackCacheにも無く、fetchも失敗する）完全オフライン
  // 初回起動でパック一覧が空にならないよう、PACK_IDSへフォールバックする
  it('manifestが読めない場合はPACK_IDSへフォールバックする', async () => {
    const packCache = fakePackCache(async () => null)
    const fetchImpl = vi.fn(async () => {
      throw new Error('network error')
    }) as unknown as typeof fetch

    const pool = await loadQuestionPool(packCache, '/', fetchImpl)
    // PACK_IDSの各パックはcacheにも無くfetchも失敗するため、プールは空になる
    // （フォールバックのID一覧自体は使われている＝各IDでloadPackQuestionsが試行される）
    expect(pool).toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith('/manifest.json')
    expect(fetchImpl).toHaveBeenCalledWith(`/packs/${PACK_IDS[0]}.json`)
  })
})

describe('syncPacksAndReload（T-73: 同期後のプール即時反映）', () => {
  function pack(id: string, questions: QuestionPack['questions']): QuestionPack {
    return {
      schemaVersion: 2,
      pack: {
        id,
        title: id,
        license: 'internal-original',
        origin: 'test',
        targetLevel: [600, 600],
      },
      questions,
    }
  }

  function fakePackCache(get: PackCache['get']): PackCache {
    return {
      has: vi.fn(async () => false),
      get,
      put: vi.fn(async () => {}),
      addAll: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(async () => []),
      usage: vi.fn(async () => ({ bytes: 0, entries: 0 })),
      clear: vi.fn(async () => {}),
    }
  }

  it('synced.length>0のとき、同期後の内容でquestionPoolを再読込して返す', async () => {
    // PackCache.get は「既にピン留め済みの内容」役（loadQuestionPool側のcache-first読み込み用）。
    // 1件だけ問題入りにし、再読込後のプールに反映されることを確認する
    const packCache = fakePackCache(async (url) => {
      const id = PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (!id) throw new Error(`unexpected url: ${url}`)
      const questions = id === PACK_IDS[0] ? [{ id: 'new-question' } as never] : []
      return new Blob([JSON.stringify(pack(id, questions))])
    })

    const manifestBody = {
      schemaVersion: 2,
      packs: PACK_IDS.map((id) => ({
        id,
        title: id,
        targetLevel: [600, 600] as [number, number],
        sizeBytes: 10,
        hash: `h-${id}`,
      })),
    }
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') {
        return { ok: true, json: async () => manifestBody } as Response
      }
      const id = PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (id) return { ok: true, json: async () => pack(id, []) } as Response
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    try {
      const pool = await syncPacksAndReload(getDb(), packCache)
      expect(pool).not.toBeNull()
      expect(pool?.map((q) => q.id)).toEqual(['new-question'])
    } finally {
      global.fetch = originalFetch
    }
  })

  it('syncPacksがsynced=0（変化なし）のとき、nullを返しプールを再読込しない', async () => {
    await getDb().settings.put({
      key: 'packSyncState',
      value: {
        packHashes: Object.fromEntries(PACK_IDS.map((id) => [id, `h-${id}`])),
        totalSizeBytes: 0,
        lastSyncedAt: 0,
      },
    })
    const packCache = fakePackCache(async () => null)
    const manifestBody = {
      schemaVersion: 2,
      packs: PACK_IDS.map((id) => ({
        id,
        title: id,
        targetLevel: [600, 600] as [number, number],
        sizeBytes: 10,
        hash: `h-${id}`, // 前回と同一ハッシュ=全件skip
      })),
    }
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') return { ok: true, json: async () => manifestBody } as Response
      throw new Error(`unexpected fetch (skip対象のはず): ${url}`)
    }) as unknown as typeof fetch

    try {
      const pool = await syncPacksAndReload(getDb(), packCache)
      expect(pool).toBeNull()
    } finally {
      global.fetch = originalFetch
      await getDb().settings.delete('packSyncState')
    }
  })

  it('createOnlineResyncHandler: 呼ぶとsyncPacksAndReloadが実行され、poolが更新される（T-107a）', async () => {
    const packCache = fakePackCache(async (url) => {
      const id = PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (!id) throw new Error(`unexpected url: ${url}`)
      const questions = id === PACK_IDS[0] ? [{ id: 'online-question' } as never] : []
      return new Blob([JSON.stringify(pack(id, questions))])
    })
    const manifestBody = {
      schemaVersion: 2,
      packs: PACK_IDS.map((id) => ({
        id,
        title: id,
        targetLevel: [600, 600] as [number, number],
        sizeBytes: 10,
        hash: `h-${id}`,
      })),
    }
    const originalFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') return { ok: true, json: async () => manifestBody } as Response
      const id = PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (id) return { ok: true, json: async () => pack(id, []) } as Response
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    try {
      const onPoolLoaded = vi.fn()
      const handler = createOnlineResyncHandler(getDb(), packCache, onPoolLoaded)
      handler()

      await vi.waitFor(() => expect(onPoolLoaded).toHaveBeenCalled())
      expect(onPoolLoaded.mock.calls[0]![0].map((q: { id: string }) => q.id)).toEqual([
        'online-question',
      ])
    } finally {
      global.fetch = originalFetch
    }
  })

  it('createOnlineResyncHandler: 完了前に重ねて呼んでも多重実行されない（T-107a）', async () => {
    let manifestFetchCount = 0
    let resolveManifest: (value: Response) => void = () => {}
    const manifestPromise = new Promise<Response>((resolve) => {
      resolveManifest = resolve
    })
    const manifestBody = {
      schemaVersion: 2,
      packs: PACK_IDS.map((id) => ({
        id,
        title: id,
        targetLevel: [600, 600] as [number, number],
        sizeBytes: 10,
        hash: `h-${id}`,
      })),
    }
    const packCache = fakePackCache(async () => null)
    const originalFetch = global.fetch
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') {
        manifestFetchCount++
        return manifestPromise
      }
      throw new Error(`unexpected fetch: ${url}`)
    }) as unknown as typeof fetch

    try {
      const onPoolLoaded = vi.fn()
      const handler = createOnlineResyncHandler(getDb(), packCache, onPoolLoaded)
      handler()
      handler() // 1回目のsyncPacksAndReload完了前に重ねて呼ぶ

      // 2回目はinFlightガードで即returnされるため、manifest fetchは1回しか走らない
      expect(manifestFetchCount).toBe(1)

      resolveManifest({ ok: true, json: async () => manifestBody } as Response)
      await vi.waitFor(() => expect(manifestFetchCount).toBe(1))
    } finally {
      global.fetch = originalFetch
    }
  })
})

// T-284（K-7）: マウント時同期（起動直後の背後同期）とonline再同期（オンライン復帰時）が
// それぞれ独立したinFlightフラグを持っていたため、圏外遷移からの復帰直後などで両方が
// 並行して走り、manifest・パックへの二重fetchが発生しうる状態だった
describe('App: マウント時同期とonline再同期のinFlight共有（T-284・K-7）', () => {
  it('マウント時同期のmanifest取得が完了する前にonlineが発火しても、manifestは1回しかfetchされない', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    let manifestFetchCount = 0
    let resolveManifest: (value: Response) => void = () => {}
    const manifestPromise = new Promise<Response>((resolve) => {
      resolveManifest = resolve
    })
    const originalFetch = global.fetch
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url === '/manifest.json') {
        manifestFetchCount++
        return manifestPromise
      }
      // パック本体・その他のfetchは無関係（loadPackQuestionsが例外を捕捉し[]へ落とす）
      return Promise.reject(new Error(`unexpected fetch: ${url}`))
    }) as unknown as typeof fetch

    try {
      render(<App />)
      await screen.findByRole('heading', { name: /BEB RAID/ })

      // マウント時同期のmanifest fetchが発行されるまで待つ
      await vi.waitFor(() => expect(manifestFetchCount).toBe(1))

      // マウント時同期がまだ完了していない間にオンライン復帰が発火する
      act(() => {
        window.dispatchEvent(new Event('online'))
      })
      await Promise.resolve()

      // inFlightを共有していれば、online側は即returnしmanifestは再fetchされない
      expect(manifestFetchCount).toBe(1)

      resolveManifest({ ok: true, json: async () => ({ schemaVersion: 2, packs: [] }) } as Response)
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('PACK_IDS（手動複製の追加漏れ検知）', () => {
  it('content/manifest.json（build成果物）のパック一覧と一致する', () => {
    // PACK_IDSはcli側のPACK_DEFINITIONSを手動複製したものなので、新パック追加時に
    // ここへの追記を忘れると出題プールから静かに漏れる（レビューで発見したバグの再発防止）。
    // content/manifest.jsonが無い（buildコマンド未実行）環境ではスキップする
    const manifestPath = join(__dirname, '../../../content/manifest.json')
    let manifest: { packs: { id: string }[] }
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    } catch {
      return
    }
    const manifestIds = new Set(manifest.packs.map((p) => p.id))
    expect(new Set(PACK_IDS)).toEqual(manifestIds)
  })
})
