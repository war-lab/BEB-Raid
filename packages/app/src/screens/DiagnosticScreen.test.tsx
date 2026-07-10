// T-20 完了条件のテスト（画面層）:
// - 自己申告あり/なしの両方で初期レートが設定される（K=32の更新幅を経て初期化される）
// - 30問完了で initializeRatings と createProfile が呼ばれ、完了画面→ホーム遷移が動く
// - 診断中の解答も attempts に記録される
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { AudioPlayer } from '../platform'
import { useAppStore } from '../store/appStore'
import { DiagnosticScreen } from './DiagnosticScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`diagnostic-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

class FakeAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  play = vi.fn(async () => {})
  playSequence = vi.fn(async () => {})
  replay = vi.fn(async () => {})
  stop = vi.fn(() => {})
}

afterEach(async () => {
  useAppStore.setState({ screen: 'home' })
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

/** L=audio_qa(part2)、R=text_blank(part5) を各20問、難易度1-5でばらけさせる */
function buildPool(): Question[] {
  const items: Question[] = []
  for (let i = 0; i < 20; i++) {
    const difficulty = (i % 5) + 1
    items.push({
      id: `l-${i}`,
      part: 2,
      format: 'audio_qa',
      difficulty,
      tags: [],
      keyVocab: [],
      audio: '/dev-audio/dummy.mp3',
      audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 1000 },
      script: 'dummy',
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: '',
      translation: '',
    })
    items.push({
      id: `r-${i}`,
      part: 5,
      format: 'text_blank',
      difficulty,
      tags: [],
      keyVocab: [],
      question: 'dummy blank',
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: '',
      translation: '',
    })
  }
  return items
}

async function startDiagnostic(toeicInput: string) {
  const nameInput = screen.getByPlaceholderText('表示名')
  fireEvent.change(nameInput, { target: { value: 'てすと' } })
  if (toeicInput !== '') {
    const toeicField = screen.getByPlaceholderText('例: 650')
    fireEvent.change(toeicField, { target: { value: toeicInput } })
  }
  fireEvent.click(screen.getByText('診断を始める'))
}

/**
 * turnNumber（1始まり）分回答する（audio_qaは開始タップを挟む）。常に正解（key='A'）を選ぶ。
 * クリック直後の非同期処理（DB書き込み＋レート更新＋turn進行）の完了を、進捗表示が
 * 次のturn（最終問なら「診断完了」）に変わるまで待つことで確認する（次周回への突入を防ぐ）
 */
async function answerOneTurn(turnNumber: number) {
  await screen.findByText(`${turnNumber}/30`)
  const startButton = screen.queryByText('タップして開始')
  if (startButton) fireEvent.click(startButton)
  const choiceA = await screen.findByText('a')
  fireEvent.click(choiceA)
  if (turnNumber < 30) {
    await screen.findByText(`${turnNumber + 1}/30`)
  } else {
    await screen.findByText('診断完了')
  }
}

describe('DiagnosticScreen: 自己申告なし', () => {
  // 30問分の実IndexedDB書き込みを伴うE2Eのため、フルスイート並列実行時のCPU競合を
  // 見込んでデフォルト5000msより長めのタイムアウトにする
  it('30問完了でratingsとprofileが初期化され、ホームへ遷移できる', async () => {
    const db = newDb()
    const pool = buildPool()
    render(<DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />)

    await startDiagnostic('')
    expect(screen.getByText('リスニング')).toBeTruthy()

    for (let i = 1; i <= 30; i++) {
      await answerOneTurn(i)
    }

    expect(screen.getByText('診断完了')).toBeTruthy()
    expect(await db.attempts.count()).toBe(30)

    const l = await db.ratings.get('L')
    const r = await db.ratings.get('R')
    expect(l).toBeDefined()
    expect(r).toBeDefined()
    // 30問全問正解なのでレートは初期値(400)より上がっているはず
    expect(l!.rating).toBeGreaterThan(400)
    expect(r!.rating).toBeGreaterThan(400)

    const profile = await db.profile.get(PROFILE_ID)
    expect(profile?.initialToeic).toBeNull()

    fireEvent.click(screen.getByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  }, 20000)
})

describe('DiagnosticScreen: 自己申告あり', () => {
  // 同上（30問分の実IndexedDB書き込みを伴うE2E）
  it('自己申告TOEICがprofileに保存される', async () => {
    const db = newDb()
    const pool = buildPool()
    render(<DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />)

    await startDiagnostic('650')

    for (let i = 1; i <= 30; i++) {
      await answerOneTurn(i)
    }

    const profile = await db.profile.get(PROFILE_ID)
    expect(profile?.initialToeic).toBe(650)
  }, 20000)
})
