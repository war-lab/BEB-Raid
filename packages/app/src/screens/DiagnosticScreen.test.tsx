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
import type { AudioPlayer, PlaybackOutcome } from '../platform'
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
  play = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  playSequence = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  replay = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
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

  // T-187（Q-36）: 何を防ぐか。桁誤り（6500円のつもりで入力等）がNaNチェックを素通りして
  // そのままR=TOEIC×1000/990の初期レートへ確定するのを防ぐ。スキップ経路は30問診断を
  // 経ずにレートを確定させるため、範囲外は「診断を始める」「スキップ」の両方で入力時に拒否する
  it('TOEICスコアが990を超えると診断開始・スキップの両方が無効になる', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '6500' } })

    const startButton = screen.getByText('診断を始める') as HTMLButtonElement
    const skipButton = screen.getByText('自己申告スコアで診断をスキップ') as HTMLButtonElement
    expect(startButton.disabled).toBe(true)
    expect(skipButton.disabled).toBe(true)
  })

  it('TOEICスコアが10未満だと診断開始・スキップの両方が無効になる', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '6' } })

    const startButton = screen.getByText('診断を始める') as HTMLButtonElement
    const skipButton = screen.getByText('自己申告スコアで診断をスキップ') as HTMLButtonElement
    expect(startButton.disabled).toBe(true)
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

// T-218（Q-55）: リスニング15問が毎問「タップして開始」を要していた。アプリの最初の体験
// （診断）で15回の追加タップが入っていたため、DrillScreenのT-110（初回成功後は自動再生）と
// 同じ方式を適用する
describe('DiagnosticScreen: リスニング設問の自動再生（T-218。T-110相当）', () => {
  it('1問目は開始タップが必要だが、2問目以降のリスニング設問はタップなしで自動再生する', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    render(<DiagnosticScreen db={db} audioPlayer={audioPlayer} questionPool={buildPool()} />)
    await startDiagnostic('')

    // turn0（1/30）はL（audio_qa）。初回は開始タップが必要
    await screen.findByText('1/30')
    expect(screen.getByText('タップして開始')).toBeTruthy()
    fireEvent.click(screen.getByText('タップして開始'))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByText('a'))

    // turn1（2/30）はR（text_blank）。音声ゲート自体が無い
    await screen.findByText('2/30')
    fireEvent.click(screen.getByText('a'))

    // turn2（3/30）は2問目のL。「タップして開始」を出さずに自動再生する
    await screen.findByText('3/30')
    expect(screen.queryByText('タップして開始')).toBeNull()
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(2))
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
    // 何を防ぐか（レビュー指摘、2026-08-03）: 振り返り一覧が再開後の分だけになること。
    // 中断前の2問を含めて30問そろっている必要がある
    expect(screen.getByText(/解答の振り返り（正解 \d+\/30）/)).toBeTruthy()
    const list = screen.getByTestId('diagnostic-review-list')
    expect(list.querySelectorAll('.result-list__item').length).toBe(30)
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

describe('DiagnosticScreen: 解答の連打防止（T-159。docs/27 のS-3）', () => {
  // 何を防ぐか: 反応待ちの連打で recordAttempt が2件・updateDiagnosticRating が2回走ること。
  // turn は同じ値から計算されるため進むのは1問分で、レートだけが二重に動く
  // （＝診断結果が実力と乖離し、以降のすべての出題難易度に影響する）
  it('同一問題で連打してもattemptsは1件だけ記録される', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')
    await screen.findByText('1/30')

    const startButton = screen.queryByText('タップして開始')
    if (startButton) fireEvent.click(startButton)
    const choiceA = await screen.findByText('a')
    fireEvent.click(choiceA)
    fireEvent.click(choiceA)
    fireEvent.click(choiceA)

    await screen.findByText('2/30')
    // 3問目まで飛んでいない＝1回分しか処理されていない
    expect(screen.queryByText('3/30')).toBeNull()
    expect(await db.attempts.count()).toBe(1)
  })

  it('解答処理中は選択肢が無効化される', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')
    await screen.findByText('1/30')

    const startButton = screen.queryByText('タップして開始')
    if (startButton) fireEvent.click(startButton)
    const choiceA = await screen.findByText('a')
    // 解答前は有効
    expect(choiceA.closest('button')?.disabled).toBe(false)

    fireEvent.click(choiceA)
    // 次の問題へ進んだ後は再び有効に戻る（処理中フラグが解放される）
    await screen.findByText('2/30')
    const nextChoiceA = await screen.findByText('a')
    expect(nextChoiceA.closest('button')?.disabled).toBe(false)
  })
})

describe('DiagnosticScreen: 完了画面の振り返り（T-174。J-95。docs/27 のS-25）', () => {
  // 何を防ぐか: 30問すべて「当たったか外れたか分からないまま」答えるだけの初回体験。
  // 一方で診断中に正誤を出すと後続問題に学習効果が乗り、レートの測定精度が落ちる（J-95）。
  // そこで「診断中は出さず、完了画面でまとめて開示する」を両方まとめて固定する
  it('診断中は正誤を出さず、その旨の注記を出す', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')
    await screen.findByText('1/30')

    expect(screen.getByText('正誤は最後にまとめて表示します')).toBeTruthy()

    const startButton = screen.queryByText('タップして開始')
    if (startButton) fireEvent.click(startButton)
    fireEvent.click(await screen.findByText('a'))
    await screen.findByText('2/30')

    // 解答しても正誤の状態は付かない（ChoiceButtonにstateを渡していない）
    expect(document.querySelector('.choice-button.is-correct')).toBeNull()
    expect(document.querySelector('.choice-button.is-wrong')).toBeNull()
  })

  it('完了画面に30問の振り返り一覧が出て、誤答には選択と正解が併記される', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')

    // 全問「b」を選ぶ（buildPoolの正解は 'A' = 'a' なので全問誤答になる）
    for (let i = 1; i <= 30; i++) {
      await screen.findByText(`${i}/30`)
      const startButton = screen.queryByText('タップして開始')
      if (startButton) fireEvent.click(startButton)
      fireEvent.click(await screen.findByText('b'))
      if (i < 30) await screen.findByText(`${i + 1}/30`)
    }
    await screen.findByText('診断完了')

    const list = await screen.findByTestId('diagnostic-review-list')
    expect(list.querySelectorAll('.result-list__item').length).toBe(30)
    expect(screen.getByText(/解答の振り返り（正解 0\/30）/)).toBeTruthy()
    // 誤答なので選択と正解の併記が出る
    expect(list.querySelectorAll('.result-list__note').length).toBe(30)
    expect(list.textContent).toContain('選択: b')
    expect(list.textContent).toContain('正解: a')
  })

  it('正解した問題には選択と正解の併記を出さない（一覧が読めなくなるため）', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    await startDiagnostic('')

    for (let i = 1; i <= 30; i++) {
      await answerOneTurn(i) // 常に正解（'a'）を選ぶ
    }
    await screen.findByText('診断完了')

    const list = await screen.findByTestId('diagnostic-review-list')
    expect(list.querySelectorAll('.result-list__item').length).toBe(30)
    expect(screen.getByText(/解答の振り返り（正解 30\/30）/)).toBeTruthy()
    expect(list.querySelectorAll('.result-list__note').length).toBe(0)
  })

  it('自己申告スキップでは振り返り一覧を出さない（解答がないため）', async () => {
    const db = newDb()
    render(
      <DiagnosticScreen db={db} audioPlayer={new FakeAudioPlayer()} questionPool={buildPool()} />,
    )
    fireEvent.change(await screen.findByPlaceholderText('表示名'), { target: { value: 'てすと' } })
    fireEvent.change(screen.getByPlaceholderText('例: 650'), { target: { value: '650' } })
    fireEvent.click(screen.getByText('自己申告スコアで診断をスキップ'))

    await screen.findByText('診断完了')
    expect(screen.queryByTestId('diagnostic-review-list')).toBeNull()
  })
})
