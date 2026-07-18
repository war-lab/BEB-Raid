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
import type { PlayOptions } from '../platform/audio/AudioPlayer'
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
  private pendingResolves: Array<() => void> = []

  play = vi.fn((src: string, options?: PlayOptions) => {
    this.playCalls.push({ src, options })
    if (this.playShouldFail) return Promise.reject(new Error('音声の取得に失敗（模擬）'))
    return new Promise<void>((resolve) => {
      this.pendingResolves.push(resolve)
    })
  })
  playSequence = vi.fn(async () => {})
  replay = vi.fn(async () => {})
  stop = vi.fn(() => {})

  /** 直近のplay()呼び出しをまだ解決していなければ解決する（再生完了=onendedの模擬） */
  resolveLatest(): void {
    const resolve = this.pendingResolves.pop()
    resolve?.()
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
