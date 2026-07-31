// T-48 完了条件のテスト（正本: docs/13 3.5節）:
// - onPosition通知に応じて強調語（カラオケハイライト）が進む
// - 文タップ→該当文のstartMsからplayが呼ばれる
// - 実施ログがshadow:プレフィックス・isCorrect=trueで記録され、レート・tagStatsが変化しない
// - スクリプト3段階トグル・速度チップのL4ゲートが機能する
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { PlaybackOutcome, PlayOptions } from '../platform/audio/AudioPlayer'
import type { AudioPlayer } from '../platform'
import { useAppStore } from '../store/appStore'
import { ShadowingScreen } from './ShadowingScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`shadowing-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

/** AudioPlayer のフェイク。playの呼び出しを記録し、onPositionを外から発火できるようにする */
class FakeAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  playCalls: Array<{ src: string; options: PlayOptions | undefined }> = []
  /** trueならplay()が拒否される（音声404・自動再生制限等の失敗の模擬） */
  playShouldFail = false
  private pendingResolves: Array<(outcome: PlaybackOutcome) => void> = []

  play = vi.fn((src: string, options?: PlayOptions) => {
    this.playCalls.push({ src, options })
    if (this.playShouldFail) return Promise.reject(new Error('音声の取得に失敗（模擬）'))
    return new Promise<PlaybackOutcome>((resolve) => {
      this.pendingResolves.push(resolve)
    })
  })
  playSequence = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  replay = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  stop = vi.fn(() => {})

  /**
   * 直近のplay()呼び出しをまだ解決していなければ解決する。
   * 既定は 'ended'（再生完了=onendedの模擬）。'interrupted' を渡すと
   * stop()・別再生による打ち切りを模擬できる（T-155の契約）
   */
  resolveLatest(outcome: PlaybackOutcome = 'ended'): void {
    const resolve = this.pendingResolves.pop()
    resolve?.(outcome)
  }

  notifyPosition(positionMs: number): void {
    const latest = this.playCalls.at(-1)
    latest?.options?.onPosition?.(positionMs)
  }
}

beforeEach(() => {
  useAppStore.setState({ screen: 'shadowing' })
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function shadowingQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'shadow-1',
    part: 3,
    format: 'shadowing',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    audio: 'audio/shadow/shadow-1.mp3',
    audioMeta: { accent: 'US', tts: true, voice: 'piper:en_US-lessac-medium', durationMs: 2000 },
    script: 'Stop now. Go please.',
    timing: [0, 300, 700, 1100],
    translation: '今すぐ止まって。行ってください。',
    ...overrides,
  }
}

describe('ShadowingScreen: カラオケハイライト（onPosition）', () => {
  it('onPosition通知に応じて強調語が進む', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    fireEvent.click(screen.getByText('再生'))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())

    act(() => {
      audioPlayer.notifyPosition(300)
    })
    await waitFor(() => {
      const current = document.querySelector('.karaoke-current')
      expect(current?.textContent?.trim()).toBe('now.')
    })

    act(() => {
      audioPlayer.notifyPosition(1100)
    })
    await waitFor(() => {
      const current = document.querySelector('.karaoke-current')
      expect(current?.textContent?.trim()).toBe('please.')
    })
    // 先に発話された語は読了扱い（--ink）になる
    expect(document.querySelectorAll('.karaoke-read').length).toBeGreaterThan(0)
  })
})

describe('ShadowingScreen: 区間リピート（文タップ）', () => {
  it('文タップで該当文のstartMsからplayが呼ばれる', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    // karaoke-sentenceは単語ごとに子spanへ分割されるため、getByTextではなく
    // textContent（子要素をまたいだ全文）で文要素を直接特定する
    await waitFor(() => {
      const sentences = document.querySelectorAll('.karaoke-sentence')
      expect(sentences.length).toBe(2)
    })
    const secondSentence = [...document.querySelectorAll('.karaoke-sentence')].find((el) =>
      el.textContent?.trim().startsWith('Go please.'),
    )
    expect(secondSentence).toBeTruthy()
    fireEvent.click(secondSentence!)

    await waitFor(() => {
      const call = audioPlayer.playCalls.at(-1)
      expect(call?.options?.startMs).toBe(700)
      expect(call?.options?.durationMs).toBe(1300)
    })
  })
})

describe('ShadowingScreen: 実施ログ（J-13）', () => {
  it('3周の再生完了でshadow:プレフィックス・isCorrect=trueのattemptsが1件だけ記録され、レート・tagStatsは変化しない', async () => {
    const db = newDb()
    await db.ratings.put({ section: 'L', rating: 500, updatedAt: Date.now(), answerCount: 0 })
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    for (let lap = 1; lap <= 3; lap++) {
      fireEvent.click(screen.getByText('再生'))
      await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(lap))
      await act(async () => {
        audioPlayer.resolveLatest()
        await Promise.resolve()
      })
    }

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    const attempts = await db.attempts.toArray()
    expect(attempts[0]!.questionId).toBe('shadow:shadow-1')
    expect(attempts[0]!.mode).toBe('solo')
    expect(attempts[0]!.isCorrect).toBe(true)

    expect(await db.tagStats.count()).toBe(0)
    const lRating = await db.ratings.get('L')
    expect(lRating?.rating).toBe(500)
  })
})

describe('ShadowingScreen: 完了カード（T-78）', () => {
  it('全素材の完了後は完了カードを含む完了画面を表示する', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    for (let lap = 1; lap <= 3; lap++) {
      fireEvent.click(screen.getByText('再生'))
      await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(lap))
      await act(async () => {
        audioPlayer.resolveLatest()
        await Promise.resolve()
      })
    }
    await waitFor(() => expect(screen.getByText('次へ')).toBeTruthy())
    fireEvent.click(screen.getByText('次へ'))

    await screen.findByText('シャドーイングが完了しました')
    const card = await screen.findByTestId('completion-card')
    expect(card.textContent).toContain('今日の実施数 1問')
  })
})

describe('ShadowingScreen: スクリプト表示トグル', () => {
  it('非表示→英文→英文+和訳の3段階を切り替えられる', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    // 既定は英文表示
    await waitFor(() => expect(document.querySelector('.karaoke-script')).toBeTruthy())
    expect(screen.queryByText(question.translation!)).toBeNull()

    fireEvent.click(screen.getByText('非表示'))
    expect(document.querySelector('.karaoke-script')).toBeNull()

    fireEvent.click(screen.getByText('英文+和訳'))
    expect(document.querySelector('.karaoke-script')).toBeTruthy()
    expect(screen.getByText(question.translation!)).toBeTruthy()
  })
})

describe('ShadowingScreen: 速度チップのL4ゲート（3.5節）', () => {
  it('listeningStageが4未満なら1.15x/1.3xは表示されない', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    await waitFor(() => expect(screen.getByText('0.7x')).toBeTruthy())
    expect(screen.queryByText('1.15x')).toBeNull()
    expect(screen.queryByText('1.3x')).toBeNull()
  })

  it('listeningStageが4なら1.15x/1.3xも表示される', async () => {
    const db = newDb()
    await db.phase.put({ season: 'P3', criteriaJson: '{}', achievedAt: null, listeningStage: 4 })
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    await waitFor(() => expect(screen.getByText('1.15x')).toBeTruthy())
    expect(screen.getByText('1.3x')).toBeTruthy()
  })
})

describe('ShadowingScreen: 音声失敗時のスキップと脱出導線（レビュー修正E6）', () => {
  // 何を防ぐか: 「次へ」は素材完了（3周 or 最後まで再生）時のみ表示され、音声404だと
  // lapsが増えず永久にこの画面から出られない（リロードするしかない）
  it('音声再生に失敗すると「この素材をスキップ」が出て、実施ログを記録せず次の素材へ進める', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.playShouldFail = true
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2]} />)

    fireEvent.click(screen.getByText('再生'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('この素材をスキップ'))

    // 2素材目へ進み、エラー表示はリセットされる
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeTruthy())
    expect(screen.queryByText('音声を再生できませんでした')).toBeNull()
    // 再生完了していないため実施ログは記録されない
    expect(await db.attempts.count()).toBe(0)
  })

  it('進行中（素材未完了）でも「中断してホームへ」でこの画面から出られる', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const question = shadowingQuestion()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[question]} />)

    await waitFor(() => expect(screen.getByText('中断してホームへ')).toBeTruthy())
    fireEvent.click(screen.getByText('中断してホームへ'))

    expect(useAppStore.getState().screen).toBe('home')
  })
})

describe('ShadowingScreen: 素材が無い場合', () => {
  it('ホームへの導線を表示する', () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[]} />)
    expect(screen.getByText('シャドーイング素材がありません')).toBeTruthy()
  })
})

describe('ShadowingScreen: 開始位置と素材間移動（T-120・J-59）', () => {
  it('実施済み素材を飛ばして未実施の先頭から始まる', async () => {
    const db = newDb()
    await db.attempts.add({
      id: 'a-1',
      questionId: 'shadow:shadow-1',
      mode: 'solo',
      isCorrect: true,
      responseMs: 0,
      isTimeout: false,
      isGuess: false,
      answeredAt: Date.now(),
    })
    const audioPlayer = new FakeAudioPlayer()
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })
    const q3 = shadowingQuestion({ id: 'shadow-3', script: 'Third one.', timing: [0, 500] })
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2, q3]} />)

    // shadow-1は実施済みのため、未実施の先頭（2/3）から始まる
    await waitFor(() => expect(screen.getByText(/2\/3/)).toBeTruthy())
  })

  it('全素材が実施済みなら素材1から始まる（周回扱い）', async () => {
    const db = newDb()
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })
    await db.attempts.bulkAdd([
      {
        id: 'a-1',
        questionId: 'shadow:shadow-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 0,
        isTimeout: false,
        isGuess: false,
        answeredAt: Date.now(),
      },
      {
        id: 'a-2',
        questionId: 'shadow:shadow-2',
        mode: 'solo',
        isCorrect: true,
        responseMs: 0,
        isTimeout: false,
        isGuess: false,
        answeredAt: Date.now(),
      },
    ])
    const audioPlayer = new FakeAudioPlayer()
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2]} />)

    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
    await waitFor(() => expect(screen.getByText(/実施済み/)).toBeTruthy())
  })

  it('3周完了前でも「次の素材へ」で移動できる（attemptは記録されない）', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2]} />)

    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
    fireEvent.click(screen.getByText('次の素材へ'))

    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeTruthy())
    expect(await db.attempts.count()).toBe(0)
  })

  it('「前の素材へ」で戻れる（index>0のときのみ表示）', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })
    render(<ShadowingScreen db={db} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2]} />)

    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
    expect(screen.queryByText('前の素材へ')).toBeNull()

    fireEvent.click(screen.getByText('次の素材へ'))
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeTruthy())
    expect(screen.getByText('前の素材へ')).toBeTruthy()

    fireEvent.click(screen.getByText('前の素材へ'))
    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
  })

  // 開始位置の非同期確定（attempts読み込み）が利用者の移動より遅れて解決したときの競合。
  // 修正前は「移動後にindexが巻き戻る」うえ、handlePrevのガードが古いindexを見るため
  // indexが-1になりquestionがundefinedになって画面が壊れていた（CIで間欠的に落ちていた）
  it('開始位置の確定が移動より遅れても、表示中の素材を巻き戻さない（負のindexにしない）', async () => {
    const audioPlayer = new FakeAudioPlayer()
    const q1 = shadowingQuestion()
    const q2 = shadowingQuestion({ id: 'shadow-2', script: 'Second one.', timing: [0, 500] })

    // attemptsの読み込みを保留させ、利用者の移動が先に起きる順序を確定的に作る。
    // Dexieの実インスタンスへspyOnしても差し込めなかったため、マウント時に使う
    // `attempts.where(...).startsWith(...).toArray()` の経路だけをスタブに置き換える
    // （この画面の他のdb利用は再生完了時のみで、本テストでは通らない）
    let releaseAttempts: (() => void) | undefined
    let toArrayStarted = false
    let toArrayResolved = false
    const pending = new Promise<void>((resolve) => {
      releaseAttempts = resolve
    })
    const stubDb = {
      attempts: {
        where: () => ({
          startsWith: () => ({
            toArray: async () => {
              toArrayStarted = true
              await pending
              toArrayResolved = true
              // 未実施なので空配列。firstUnfinished=0 となりindexを0へ戻そうとする
              return []
            },
          }),
        }),
      },
    } as unknown as BebRaidDatabase

    render(<ShadowingScreen db={stubDb} audioPlayer={audioPlayer} shadowingQuestions={[q1, q2]} />)

    // 初期表示（index=0）のまま、読み込み未完了の段階で次へ移動する
    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
    fireEvent.click(screen.getByText('次の素材へ'))
    await waitFor(() => expect(screen.getByText(/2\/2/)).toBeTruthy())

    // 保留を仕込めていることの確認（ここが効いていないと以降が無意味なテストになる）
    expect(toArrayStarted).toBe(true)
    expect(toArrayResolved).toBe(false)

    // ここで読み込みが解決する（未実施なのでfirstUnfinished=0を返しindexを0に戻そうとする）
    await act(async () => {
      releaseAttempts?.()
      await pending
      await Promise.resolve()
    })
    expect(toArrayResolved).toBe(true)

    // 利用者の位置が尊重され、素材2の表示が維持される
    expect(screen.getByText(/2\/2/)).toBeTruthy()

    // 巻き戻っていないので「前の素材へ」も生きており、押すと素材1に戻れる（-1にならない）
    fireEvent.click(screen.getByText('前の素材へ'))
    await waitFor(() => expect(screen.getByText(/1\/2/)).toBeTruthy())
    expect(screen.queryByText('前の素材へ')).toBeNull()
  })
})
