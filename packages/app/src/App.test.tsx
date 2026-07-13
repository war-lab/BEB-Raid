// App.tsx は起動時にprofile有無（T-20 P0診断）をチェックし、未診断ならDiagnosticScreen、
// 診断済みなら'home'画面でHomeScreen（T-21）を描画する。どちらも実際にIndexedDBを読むため
// fake-indexeddb が必要
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionPack } from '@beb-raid/shared-schema'
import { App, loadQuestionPool } from './App'
import { getDb } from './db/database'
import type { PackCache } from './platform'
import { createProfile } from './services/profile'
import { useAppStore } from './store/appStore'

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
})

afterEach(async () => {
  await getDb().profile.clear()
})

describe('App（配線確認）', () => {
  it('未診断（初回起動）の場合はDiagnosticScreenから始まる', async () => {
    render(<App />)
    expect(await screen.findByText('診断を始める')).toBeTruthy()
  })

  it('診断済みの場合はホーム画面（HomeScreen）を描画できる', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'BEB Raid' })).toBeTruthy()
    expect(screen.getByText('今日のクエスト')).toBeTruthy()
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
      addAll: vi.fn(async () => {}),
      delete: vi.fn(async () => {}),
      keys: vi.fn(async () => []),
      usage: vi.fn(async () => ({ bytes: 0, entries: 0 })),
      clear: vi.fn(async () => {}),
    }
  }

  /** 4パック全てにcacheヒットするfetchImpl（実fetchへのフォールバックを起こさせないため） */
  function allPacksCached(overrides: Record<string, () => Promise<Blob | null>> = {}) {
    const ids = ['pack-vocab-s-001', 'pack-p2-s-001', 'pack-p5-s-001', 'pack-p5-similar-s-001']
    return fakePackCache(async (url) => {
      const id = ids.find((i) => url === `/packs/${i}.json`)
      if (!id) throw new Error(`unexpected url: ${url}`)
      if (overrides[id]) return overrides[id]!()
      return new Blob([JSON.stringify(pack(id, []))])
    })
  }

  it('4パック分の問題を1つのプールにまとめる（cache-first）', async () => {
    const packCache = allPacksCached({
      'pack-vocab-s-001': async () =>
        new Blob([JSON.stringify(pack('pack-vocab-s-001', [{ id: 'v-1' } as never]))]),
      'pack-p2-s-001': async () =>
        new Blob([JSON.stringify(pack('pack-p2-s-001', [{ id: 'p2-1' } as never]))]),
    })
    const pool = await loadQuestionPool(packCache, '/')
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
    const pool = await loadQuestionPool(packCache, '/')
    expect(pool.map((q) => q.id)).toEqual(['p2-1'])
  })
})
