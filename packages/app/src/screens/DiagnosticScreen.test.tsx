// T-20 完了条件のテスト（画面層）:
// - 自己申告あり/なしの両方で初期レートが設定される（K=32の更新幅を経て初期化される）
// - 30問完了で initializeRatings と createProfile が呼ばれ、完了画面→ホーム遷移が動く
// - 診断中の解答も attempts に記録される
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { AudioPlayer } from '../platform'
import { DIAGNOSTIC_PROGRESS_KEY } from '../services/settingsKeys'
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
      audioMeta: {
        accent: 'US',
        tts: false,
        voice: 'dev',
        durationMs: 1000,
        // 設問部の終端。解答前の再生はここまでで止め、正答応答の読み上げを漏らさない
        questionEndMs: 400,
      },
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
  // T-113: 途中経過確認（settingsの非同期読み込み）が完了するまでintroフォームは出ない
  const nameInput = await screen.findByPlaceholderText('表示名')
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

describe('DiagnosticScreen: オンボーディングのラベルレイアウト（T-116(1)）', () => {
  it('「表示名」ラベルがブロック配置のコンテナ（settings-list）内にあり、入力欄と同一行に詰まらない', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    const nameInput = await screen.findByPlaceholderText('表示名')

    // settings-list（label { display: block }）に入っていることを構造面で確認する
    // （jsdomは実レイアウトを計算しないため、崩れの直接検証の代わりにブロック配置を
    // 保証するコンテナへの所属を見る）
    const label = nameInput.closest('label')
    expect(label?.closest('.settings-list')).toBeTruthy()
  })
})

describe('DiagnosticScreen: 診断スキップ（ユーザー指示による機能追加）', () => {
  it('自己申告スコア未入力ではスキップボタンが出ない', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await screen.findByPlaceholderText('表示名')
    expect(screen.queryByText('自己申告スコアで診断をスキップ')).toBeNull()
  })

  it('表示名未入力の間はスキップボタンが無効', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await screen.findByPlaceholderText('表示名')
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '650' } })
    const skipButton = screen.getByText('自己申告スコアで診断をスキップ') as HTMLButtonElement
    expect(skipButton.disabled).toBe(true)
  })

  it('自己申告スコアでスキップすると30問答えずにR=TOEIC×1000/990でratings/profileが確定する', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '650' } })
    fireEvent.click(screen.getByText('自己申告スコアで診断をスキップ'))

    await screen.findByText('診断完了')
    expect(await db.attempts.count()).toBe(0)

    const expectedRating = (650 * 1000) / 990
    const l = await db.ratings.get('L')
    const r = await db.ratings.get('R')
    expect(l?.rating).toBeCloseTo(expectedRating)
    expect(r?.rating).toBeCloseTo(expectedRating)

    const profile = await db.profile.get(PROFILE_ID)
    expect(profile?.initialToeic).toBe(650)

    fireEvent.click(screen.getByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })
})

describe('DiagnosticScreen: 完了カード（T-78）', () => {
  it('診断完了時に今日の実施数を含む完了カードを表示する', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '650' } })
    fireEvent.click(screen.getByText('自己申告スコアで診断をスキップ'))

    await screen.findByText('診断完了')

    const card = await screen.findByTestId('completion-card')
    expect(card.textContent).toContain('今日の実施数 0問')
  })
})

// 何を防ぐか: audio_qa の音声は「設問＋正答応答」の連結なので、全長再生すると
// 解答前に正答が聞こえてしまう（診断のスコア推定が甘くなる）。DrillScreen は
// questionEndMs で打ち切っていたが、DiagnosticScreen はこれを無視していた
describe('DiagnosticScreen: audio_qa の正答応答リーク防止', () => {
  it('解答前の再生は questionEndMs で打ち切る', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    render(<DiagnosticScreen db={db} audioPlayer={audioPlayer} questionPool={buildPool()} />)
    await startDiagnostic('')

    await screen.findByText('1/30')
    fireEvent.click(screen.getByText('タップして開始'))

    await waitFor(() =>
      expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/dummy.mp3', { durationMs: 400 }),
    )
  })

  it('questionEndMs が無い旧生成分は従来どおり全長再生する', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const pool = buildPool().map((q) =>
      q.format === 'audio_qa'
        ? { ...q, audioMeta: { ...q.audioMeta!, questionEndMs: undefined } }
        : q,
    )
    render(<DiagnosticScreen db={db} audioPlayer={audioPlayer} questionPool={pool} />)
    await startDiagnostic('')

    await screen.findByText('1/30')
    fireEvent.click(screen.getByText('タップして開始'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/dummy.mp3', {}))
  })
})

describe('DiagnosticScreen: 音声再生失敗リカバリ（T-70）', () => {
  it('再生失敗でボタンが「もう一度試す」に変わり、「音声なしで解答する」で解答へ進める', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play.mockRejectedValue(new Error('boom'))
    render(<DiagnosticScreen db={db} audioPlayer={audioPlayer} questionPool={buildPool()} />)
    await startDiagnostic('')

    await screen.findByText('1/30')
    fireEvent.click(screen.getByText('タップして開始'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    expect(screen.getByText('もう一度試す')).toBeTruthy()

    fireEvent.click(screen.getByText('音声なしで解答する'))
    const choiceA = await screen.findByText('a')
    fireEvent.click(choiceA)
    await screen.findByText('2/30')
  })
})

describe('DiagnosticScreen: 途中保存・離脱確認（T-113）', () => {
  it('途中保存→再マウントで再開できる', async () => {
    const db = newDb()
    const pool = buildPool()
    const first = render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />,
    )
    await startDiagnostic('')
    await answerOneTurn(1)
    await answerOneTurn(2)
    first.unmount()

    render(<DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />)

    expect(await screen.findByText('続きから再開（3問目から）')).toBeTruthy()
    fireEvent.click(screen.getByText('続きから再開（3問目から）'))

    await screen.findByText('3/30')
    for (let i = 3; i <= 30; i++) {
      await answerOneTurn(i)
    }
    expect(screen.getByText('診断完了')).toBeTruthy()
    // 中断前2問＋再開後28問=30問。再開ボタンで振り出しに戻っていない
    expect(await db.attempts.count()).toBe(30)
  }, 20000)

  it('完了時に途中経過（settingsの一時キー）が消える', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')
    for (let i = 1; i <= 30; i++) {
      await answerOneTurn(i)
    }
    expect(await db.settings.get(DIAGNOSTIC_PROGRESS_KEY)).toBeUndefined()
  }, 20000)

  it('スキップ時に途中経過が消える', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '650' } })
    fireEvent.click(screen.getByText('自己申告スコアで診断をスキップ'))

    await screen.findByText('診断完了')
    expect(await db.settings.get(DIAGNOSTIC_PROGRESS_KEY)).toBeUndefined()
  })

  it('「最初からやり直す」で途中経過が消え、通常のintroフォームに戻る', async () => {
    const db = newDb()
    const pool = buildPool()
    const first = render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />,
    )
    await startDiagnostic('')
    await answerOneTurn(1)
    first.unmount()

    render(<DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={pool} />)
    await screen.findByRole('button', { name: /続きから再開/ })
    fireEvent.click(screen.getByText('最初からやり直す'))

    expect(await screen.findByPlaceholderText('表示名')).toBeTruthy()
    await vi.waitFor(async () => {
      expect(await db.settings.get(DIAGNOSTIC_PROGRESS_KEY)).toBeUndefined()
    })
  })

  it('「中断」でホームへ戻れる（プロフィール未作成のままでよい）', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')
    await screen.findByText('1/30')

    fireEvent.click(screen.getByText('中断'))

    expect(useAppStore.getState().screen).toBe('home')
    expect(await db.profile.get(PROFILE_ID)).toBeUndefined()
  })
})
