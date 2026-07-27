// T-126完了条件のテスト（正本: docs/22_M4実装計画.md 3.2節・3.6節、6節T-126シート）:
// - ルーム作成→抽選（比率・再抽選）→進行→表彰の一連テスト（フェイクBattleSocket・フェイクAudioPlayer）
// - 音声再生完了前に解答受付が開かないテスト
import type { Question, RaidBossState } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AudioPlayer, RaidApi } from '../platform'
import { FakeBattleSocket } from '../platform/net/BattleSocket'
import { useAppStore } from '../store/appStore'
import { BattleHostScreen } from './BattleHostScreen'

const BOSS: RaidBossState = {
  bossId: 'boss-test',
  name: 'テストボス',
  hp: 100,
  maxHp: 100,
  startAt: 0,
  endAt: 0,
  status: 'active',
  participantCount: 0,
  myDamage: 0,
  contributions: [],
}

class FakeRaidApi implements RaidApi {
  isConfigured = () => true
  register = vi.fn(async () => {})
  fetchCurrentBoss = vi.fn(async () => null)
  syncDamage = vi.fn(async () => ({ acceptedIds: [], boss: BOSS }))
  sendQuestionStats = vi.fn(async () => 0)
  sendReport = vi.fn(async () => {})
  createBattleRoom = vi.fn(async (): Promise<string> => 'ABCD')
  sendGhostRecord = vi.fn(async () => {})
  deleteOwnGhostRecord = vi.fn(async () => {})
}

class ControllableAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  playResolvers: Array<() => void> = []
  play = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        this.playResolvers.push(resolve)
      }),
  )
  playSequence = vi.fn(async () => {})
  replay = vi.fn(async () => {})
  stop = vi.fn(() => {})

  resolveNextPlay() {
    const resolve = this.playResolvers.shift()
    resolve?.()
  }
}

afterEach(() => {
  useAppStore.setState({ screen: 'home' })
})

function textBlankQuestion(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: `Please ___ the ${id}.`,
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

function audioQaQuestion(id: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    audio: '/dev-audio/dummy.mp3',
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'dummy',
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
    ],
    answer: 'A',
    explanation: '',
    translation: '',
  }
}

describe('BattleHostScreen: 出題セット抽選（比率・再抽選）', () => {
  it('Part2:Part5=6:6の12問が抽選プレビューに表示される', () => {
    const pool: Question[] = [
      ...Array.from({ length: 20 }, (_, i) => audioQaQuestion(`p2-${i}`)),
      ...Array.from({ length: 20 }, (_, i) => textBlankQuestion(`p5-${i}`)),
    ]
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={new FakeBattleSocket()}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={pool}
        rng={() => 0.3}
      />,
    )

    expect(screen.getByTestId('battle-host-lottery-summary').textContent).toContain(
      'Part2 6問 / Part5 6問（計12問）',
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(12)
  })

  it('再抽選ボタンで出題セットを引き直せる（在庫不足時は他方で補填）', () => {
    // part2を2問しか用意しない→在庫不足時の補填(J-65正文)により12問に達する
    const pool: Question[] = [
      audioQaQuestion('p2-0'),
      audioQaQuestion('p2-1'),
      ...Array.from({ length: 20 }, (_, i) => textBlankQuestion(`p5-${i}`)),
    ]
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={new FakeBattleSocket()}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={pool}
        rng={() => 0.3}
      />,
    )

    expect(screen.getByTestId('battle-host-lottery-summary').textContent).toContain(
      'Part2 2問 / Part5 10問（計12問）',
    )
    fireEvent.click(screen.getByRole('button', { name: '再抽選' }))
    expect(screen.getByTestId('battle-host-lottery-summary').textContent).toContain(
      'Part2 2問 / Part5 10問（計12問）',
    )
  })
})

describe('BattleHostScreen: ルーム作成→進行→表彰の一連', () => {
  it('作成→ロビー→出題（Part5は音声無しで即送信）→締切→標準→次問→表彰まで到達する', async () => {
    const pool = [textBlankQuestion('q-1'), textBlankQuestion('q-2')]
    const raidApi = new FakeRaidApi()
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()

    render(
      <BattleHostScreen
        raidApi={raidApi}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={pool}
        rng={() => 0.3}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(raidApi.createBattleRoom).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    expect((await screen.findByTestId('battle-host-room-code')).textContent).toContain('ABCD')

    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '花子' }] })
    expect(await screen.findByText('花子')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    // Part5は音声を持たないため、unlockを呼ばず即座にopenQuestionを送る
    await waitFor(() =>
      expect(socket.sent.find((m) => m.type === 'openQuestion')).toMatchObject({
        type: 'openQuestion',
        questionIndex: 0,
      }),
    )
    expect(audioPlayer.unlock).not.toHaveBeenCalled()

    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    expect(await screen.findByTestId('battle-host-timer')).toBeTruthy()

    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '花子', totalPoints: 90 }],
    })
    expect(await screen.findByTestId('battle-host-standings')).toBeTruthy()

    // 2問目（最後の問題）へ
    fireEvent.click(screen.getByRole('button', { name: '次の問題へ' }))
    await waitFor(() =>
      expect(socket.sent.filter((m) => m.type === 'openQuestion')).toHaveLength(2),
    )
    const secondOpen = socket.sent.filter((m) => m.type === 'openQuestion')[1]
    expect(secondOpen).toMatchObject({ type: 'openQuestion', questionIndex: 1 })

    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 1,
      questionId: 'q-2',
      deadlineAt: Date.now() + 30_000,
    })
    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '花子', totalPoints: 150 }],
    })
    // 最終問終了後は「次の問題へ」ではなく「結果発表」になる
    const finishButton = await screen.findByRole('button', { name: '結果発表' })
    fireEvent.click(finishButton)
    await waitFor(() => expect(socket.sent.some((m) => m.type === 'finish')).toBe(true))

    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '花子', totalPoints: 150 }],
      bestGrowth: { displayName: '花子' },
    })
    expect(await screen.findByTestId('battle-host-result')).toBeTruthy()
    expect(screen.getByTestId('battle-host-best-growth').textContent).toContain('花子')
  })
})

describe('BattleHostScreen: 音声再生完了前は解答受付が開かない', () => {
  it('Part2（音声あり）は再生完了イベントまでopenQuestionを送らない', async () => {
    const pool = [audioQaQuestion('q-1')]
    const raidApi = new FakeRaidApi()
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()

    render(
      <BattleHostScreen
        raidApi={raidApi}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={pool}
        rng={() => 0.3}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    await waitFor(() => expect(audioPlayer.unlock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(1))

    // 再生完了前はopenQuestionが送られていないこと
    expect(socket.sent.find((m) => m.type === 'openQuestion')).toBeUndefined()
    expect(screen.getByText(/音声再生中/)).toBeTruthy()

    // 再生完了イベントを発火する
    audioPlayer.resolveNextPlay()

    await waitFor(() =>
      expect(socket.sent.find((m) => m.type === 'openQuestion')).toMatchObject({
        type: 'openQuestion',
        questionIndex: 0,
        questionId: 'q-1',
      }),
    )
  })
})

describe('BattleHostScreen: 離脱時の後始末', () => {
  // 回帰防止: battleSocketはApp.tsxのモジュール単位シングルトンのため、画面を離れても
  // 閉じないとホスト接続が残り続ける
  it('アンマウント時にWebSocketをcloseする', async () => {
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()
    const { unmount } = render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={[textBlankQuestion('q-1')]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    unmount()
    expect(socket.closed).toBe(true)
  })
})
