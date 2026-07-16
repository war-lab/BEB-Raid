// T-76完了条件の結合テスト（14の1.8優先順5）:
// packSync→loadQuestionPool→HomeScreen→DrillScreen の一連を、fetchが全rejectする
// （オフライン）状態でも、PackCacheに既にピン留め済みのパックだけで最後まで完走できることを確認する。
// 個々の層（syncPacks/loadQuestionPool/HomeScreen/DrillScreen）は各ユニットテストで
// カバー済みだが、層をまたいだ結合経路自体はT-37以降テストの空白地帯だった。
import 'fake-indexeddb/auto'
import type { Question, QuestionPack } from '@beb-raid/shared-schema'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { loadQuestionPool, PACK_IDS, syncPacksAndReload } from '../App'
import { BebRaidDatabase } from '../db/database'
import type { AudioPlayer, PackCache } from '../platform'
import { createProfile } from '../services/profile'
import { DrillScreen } from '../screens/DrillScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`offline-flow-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

class FakeAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  play = vi.fn(async () => {})
  playSequence = vi.fn(async () => {})
  replay = vi.fn(async () => {})
  stop = vi.fn(() => {})
}

function pack(id: string, questions: QuestionPack['questions']): QuestionPack {
  return {
    schemaVersion: 2,
    pack: { id, title: id, license: 'internal-original', origin: 'test', targetLevel: [600, 600] },
    questions,
  }
}

const CACHED_QUESTION: Question = {
  id: 'p5-1',
  part: 5,
  format: 'text_blank',
  difficulty: 2,
  tags: ['品詞'],
  keyVocab: [{ word: 'attend', sense: '出席する', freqRank: 'A' }],
  question: 'Please ___ the meeting.',
  choices: [
    { key: 'A', text: 'attend' },
    { key: 'B', text: 'attends' },
  ],
  answer: 'A',
  explanation: '解説',
  translation: '和訳',
}

/**
 * 全12パックが既にピン留め済み（cache常時ヒット）のPackCache。
 * fetchへは一切フォールバックしないため、ネットワークが全rejectでも影響を受けない
 */
function offlinePinnedPackCache(): PackCache {
  return {
    has: vi.fn(async () => true),
    get: vi.fn(async (url: string) => {
      const id = PACK_IDS.find((i) => url === `/packs/${i}.json`)
      if (!id) return null
      const questions = id === 'pack-p5-s-001' ? [CACHED_QUESTION] : []
      return new Blob([JSON.stringify(pack(id, questions))])
    }),
    addAll: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    keys: vi.fn(async () => []),
    usage: vi.fn(async () => ({ bytes: 0, entries: 0 })),
    clear: vi.fn(async () => {}),
  }
}

describe('オフライン結合通し: packSync→loadQuestionPool→HomeScreen→DrillScreen', () => {
  it('fetchが全rejectでも、ピン留め済みキャッシュだけでクエスト開始→解答→リザルトまで完走する', async () => {
    const db = newDb()
    await createProfile(db, { displayName: 'てすと', initialToeic: null })
    const packCache = offlinePinnedPackCache()

    const originalFetch = global.fetch
    global.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch

    try {
      // ① syncPacks: manifest取得からオフラインで失敗し、例外を投げずnull（再読込なし）
      const syncedPool = await syncPacksAndReload(db, packCache)
      expect(syncedPool).toBeNull()

      // ② loadQuestionPool: cache-firstのため、fetchが死んでいてもピン留め済み内容を読める
      const pool = await loadQuestionPool(packCache, '/')
      expect(pool.map((q) => q.id)).toContain('p5-1')

      // ③ HomeScreen: 単独モード（Part5）でこのプールからセッションを開始できる
      const homeRender = render(<HomeScreen db={db} questionPool={pool} resumeSnapshot={null} />)
      await screen.findByTestId('home-loaded')
      fireEvent.click(screen.getByText('Part5'))
      await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
      homeRender.unmount()
      cleanup()

      // ④ DrillScreen: セッションが完走し、attemptsに記録されリザルトへ遷移する
      const drillRender = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      await screen.findByText('Please ___ the meeting.')
      fireEvent.click(screen.getByText('attend'))
      // 「正解」表示はsetResultの即時反映で先に出るため、これだけを待つとrecordAnswerPipeline
      // （DB書き込み）の完了を待たずに次の操作に進んでしまう。answeredCountの更新
      // （pipeline完了後のrecordAnswer呼び出しで反映される）を待つ
      await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
      fireEvent.click(screen.getByText('次へ')) // 唯一の問題のため、次へタップでリザルトへ
      await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))

      const logs = await db.attempts.toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]!.isCorrect).toBe(true)
      expect(logs[0]!.questionId).toBe('p5-1')

      // dbがまだ開いているうちにアンマウントし、保留中のeffectがdb削除後に発火しないようにする
      drillRender.unmount()
    } finally {
      global.fetch = originalFetch
    }
  })
})
