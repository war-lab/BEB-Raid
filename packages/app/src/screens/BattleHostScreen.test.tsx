// T-126完了条件のテスト（正本: docs/22_M4実装計画.md 3.2節・3.6節、6節T-126シート）:
// - ルーム作成→抽選（比率・再抽選）→進行→表彰の一連テスト（フェイクBattleSocket・フェイクAudioPlayer）
// - 音声再生完了前に解答受付が開かないテスト
import type { Question, RaidBossState } from '@beb-raid/shared-schema'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AudioPlayer, PlaybackOutcome, RaidApi } from '../platform'
import { FakeBattleSocket } from '../platform/net/BattleSocket'
import { useAppStore } from '../store/appStore'
import { setTheme } from '../theme'
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
  playResolvers: Array<(outcome: PlaybackOutcome) => void> = []
  play = vi.fn(
    () =>
      new Promise<PlaybackOutcome>((resolve) => {
        this.playResolvers.push(resolve)
      }),
  )
  playSequence = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  replay = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  stop = vi.fn(() => {})

  /** 既定は 'ended'（再生完了の模擬）。中断を模擬する場合は 'interrupted' を渡す */
  resolveNextPlay(outcome: PlaybackOutcome = 'ended') {
    const resolve = this.playResolvers.shift()
    resolve?.(outcome)
  }
}

afterEach(() => {
  useAppStore.setState({ screen: 'home' })
  // ホスト画面は表示中だけ明地に固定する（V-11・JV-6）ため、テスト間で持ち越さない
  setTheme('dark')
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

// V-22（ロビーの投影スケール化。JV-10=案B）。docs/25 6.5節の#1
describe('BattleHostScreen: ロビーの投影レイアウト（V-22）', () => {
  it('ロビーは投影レイアウトで、ルームコードは1字ずつ読み上げられる', async () => {
    const raidApi = new FakeRaidApi()
    const socket = new FakeBattleSocket()
    const { container } = render(
      <BattleHostScreen
        raidApi={raidApi}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
        rng={() => 0.3}
      />,
    )

    // 抽選プレビュー（setup）は手元で読む画面なので投影レイアウトにしない（案B）
    expect(container.querySelector('.battle-host-stage')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    // ロビーは投影に映る（参加者がここのコードを見て入室する）ので投影レイアウトになる
    expect(container.querySelector('.battle-host-stage')).not.toBeNull()
    const code = await screen.findByTestId('battle-host-room-code')
    expect(code.textContent).toContain('ABCD')
    // 「ラッド」等と読まれると口伝えできないため1字ずつに分ける
    expect(code.getAttribute('aria-label')).toBe('A B C D')
  })

  it('参加者一覧はS7と同じチップのクラスで描かれる（見た目が独立に動かないようにする）', async () => {
    const socket = new FakeBattleSocket()
    const { container } = render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({
      type: 'roomState',
      participants: [{ displayName: '花子' }, { displayName: '太郎' }],
    })
    await screen.findByText('花子')
    const chips = container.querySelectorAll('[data-testid="battle-host-participants"] > li')
    expect(chips).toHaveLength(2)
    chips.forEach((chip) => expect(chip.className).toContain('battle-lobby__chip'))
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

    // 発起人の要望（2026-08-03）: 「開始する」「次の問題へ」を押した瞬間には流さない。
    // ホストが会場へ合図を出せるよう再生タップを1つ挟む
    expect(await screen.findByRole('button', { name: '音声を再生' })).toBeTruthy()
    expect(audioPlayer.unlock).not.toHaveBeenCalled()
    expect(audioPlayer.play).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '音声を再生' }))
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

describe('BattleHostScreen: 音声は自動再生しない（発起人の要望、2026-08-03）', () => {
  // 何を防ぐか: 「次の問題へ」を押した瞬間に音声が流れること。会場の注意がまだ前問の
  // 順位表に向いている状態で1問目の応答が過ぎてしまうため、ホストの合図を挟む
  it('2問目以降も「次の問題へ」の直後には流さず、再生タップを待つ', async () => {
    const pool = [audioQaQuestion('q-1'), audioQaQuestion('q-2')]
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()

    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={pool}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    // 1問目
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    fireEvent.click(await screen.findByRole('button', { name: '音声を再生' }))
    // unlock を待ってから play が呼ばれるので、解決させる前に呼び出しを待つ
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(1))
    audioPlayer.resolveNextPlay()
    await waitFor(() =>
      expect(socket.sent.filter((m) => m.type === 'openQuestion')).toHaveLength(1),
    )
    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '太郎', totalPoints: 10 }],
    })

    // 2問目: 「次の問題へ」だけでは再生しない
    fireEvent.click(await screen.findByRole('button', { name: '次の問題へ' }))
    expect(await screen.findByRole('button', { name: '音声を再生' })).toBeTruthy()
    expect(audioPlayer.play).toHaveBeenCalledTimes(1)
    expect(socket.sent.filter((m) => m.type === 'openQuestion')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '音声を再生' }))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(2))
    audioPlayer.resolveNextPlay()
    await waitFor(() =>
      expect(socket.sent.filter((m) => m.type === 'openQuestion')[1]).toMatchObject({
        questionIndex: 1,
        questionId: 'q-2',
      }),
    )
  })

  // 何を防ぐか: 再生ボタンの連打で openQuestion が2回送られること（DO側の締切が
  // 2回開くと残り時間の表示が飛ぶ）
  it('再生ボタンを連打してもopenQuestionは1回だけ送る', async () => {
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()

    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={[audioQaQuestion('q-1')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))

    const button = await screen.findByRole('button', { name: '音声を再生' })
    // 再レンダーを待たない連打を再現する（1回目で状態が変わる前に2回目が来る）
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledTimes(1))
    audioPlayer.resolveNextPlay()

    await waitFor(() =>
      expect(socket.sent.filter((m) => m.type === 'openQuestion')).toHaveLength(1),
    )
    expect(audioPlayer.play).toHaveBeenCalledTimes(1)
  })
})

describe('BattleHostScreen: 抽選プレビューでもscriptを出さない', () => {
  // ルーム作成前のホストの下見だが、プレビューを映したまま参加者が居ると正答が漏れる。
  // 音声問題は行を区別できる必要があるため種別とidで示す（V-17の確認で再指摘された）
  it('音声問題の行にscriptを出さず、種別とidを出す', () => {
    const leaky = audioQaQuestion('q-leak')
    leaky.script = 'When should I submit the report? — By the end of this week.'
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={new FakeBattleSocket()}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[
          leaky,
          ...Array.from({ length: 20 }, (_, i) => textBlankQuestion(`p5-${i}`)),
        ]}
        rng={() => 0.3}
      />,
    )

    const preview = screen.getByTestId('battle-host-lottery-preview')
    expect(preview.textContent).not.toContain('By the end of this week')
    expect(preview.textContent).toContain('音声問題（q-leak）')
  })
})

describe('BattleHostScreen: 音声問題のscriptを投影しない', () => {
  // scriptは読み上げ原稿で質問文と正答の両方を含むため、投影すると
  // リスニングが読解になるだけでなく正答が画面に出る。
  // T-126がaudioMeta.questionEndMsで音声を打ち切って正答リークを防いでいるのと
  // 同じ理由で、テキスト側でも漏らしてはならない（実機確認で検出した不具合の回帰防止）
  it('presenting・question の両フェーズでscriptを表示せず、音声問題のプロンプトを出す', async () => {
    const leaky = audioQaQuestion('q-leak')
    leaky.script = 'When should I submit the report? — By the end of this week.'
    const raidApi = new FakeRaidApi()
    const socket = new FakeBattleSocket()
    const audioPlayer = new ControllableAudioPlayer()

    render(
      <BattleHostScreen
        raidApi={raidApi}
        battleSocket={socket}
        audioPlayer={audioPlayer}
        questionPool={[leaky]}
        rng={() => 0.3}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    fireEvent.click(await screen.findByRole('button', { name: '音声を再生' }))
    await waitFor(() => expect(screen.getByText(/音声再生中/)).toBeTruthy())

    // 再生中（投影されている状態）でscriptが出ていないこと
    expect(screen.queryByText(/By the end of this week/)).toBeNull()
    expect(screen.getByText(/音声で質問が流れます/)).toBeTruthy()

    // 解答受付中も同様
    audioPlayer.resolveNextPlay()
    await waitFor(() => expect(socket.sent.find((m) => m.type === 'openQuestion')).toBeDefined())
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-leak',
      deadlineAt: Date.now() + 30_000,
    })
    await waitFor(() => expect(screen.getByText(/参加者が解答中です/)).toBeTruthy())
    expect(screen.queryByText(/By the end of this week/)).toBeNull()
    expect(screen.getByText(/音声で質問が流れます/)).toBeTruthy()
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

// V-11 投影用意匠（docs/25 4.3節・JV-5・JV-6）。防ぐもの:
// - 投影フェーズがモバイル用の縦3分割（ScreenLayout）に戻ること
// - 明地固定（JV-6）が外れて暗地のまま投影されること・離脱後にテーマが戻らないこと
// - 選択肢の三重符号化の器（キーごとの色を当てる data-choice-key と、V-12が形マーカーを
//   載せる .battle-host-choice__marker）が失われること
describe('BattleHostScreen: 投影用意匠（V-11）', () => {
  /** 出題中（questionフェーズ）まで進める */
  async function renderToQuestion() {
    const socket = new FakeBattleSocket()
    const view = render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1'), textBlankQuestion('q-2')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 20_000,
    })
    await screen.findByTestId('battle-host-timer')
    return { socket, view }
  }

  it('出題中は縦3分割を使わず、外周リング付きの投影レイアウトで問題文と選択肢を出す', async () => {
    const { view } = await renderToQuestion()

    expect(view.container.querySelector('.screen-layout')).toBeNull()
    expect(view.container.querySelector('.battle-host-stage')).not.toBeNull()
    expect(screen.getByTestId('battle-host-ring')).toBeTruthy()
    expect(view.container.querySelector('.battle-host-question')?.textContent).toContain(
      'Please ___ the q-1.',
    )

    // 選択肢はキーごとに色を当てられる器（data-choice-key）と、V-12が形マーカーを載せた
    // マーカー要素を持つ
    const choices = Array.from(view.container.querySelectorAll('.battle-host-choice'))
    expect(choices.map((c) => c.getAttribute('data-choice-key'))).toEqual(['A', 'B'])
    expect(choices[0]?.querySelector('.battle-host-choice__marker')?.textContent).toBe('▲')
  })

  // V-12（docs/25 4.4節・JV-7=案B）。防ぐもの: 投影の形マーカーが手元画面（S7）と
  // ずれること（S7側は BattleScreen.test.tsx が同じ対応表で検証する）と、
  // 形が装飾でなく読み上げ対象になって記号が伝わらなくなること
  it('投影の形マーカーは記号A–Dと1対1で対応し、aria-hiddenの装飾として置かれる', async () => {
    const { view } = await renderToQuestion()

    const markers = Array.from(view.container.querySelectorAll('.battle-host-choice')).map((c) => ({
      key: c.getAttribute('data-choice-key'),
      shape: c.querySelector('.battle-host-choice__marker')?.textContent,
      ariaHidden: c.querySelector('.battle-host-choice__marker')?.getAttribute('aria-hidden'),
      // 記号は形に置き換わるため、支援技術向けにはvisually-hiddenで残す
      hiddenText: c.querySelector('.visually-hidden')?.textContent,
    }))
    expect(markers).toEqual([
      { key: 'A', shape: '▲', ariaHidden: 'true', hiddenText: 'A' },
      { key: 'B', shape: '■', ariaHidden: 'true', hiddenText: 'B' },
    ])
  })

  it('途中順位・最終リザルトも投影レイアウトで、進行ボタンは画面下端の操作帯に置く', async () => {
    const { socket, view } = await renderToQuestion()

    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: 'テスト1', totalPoints: 90 }],
    })
    await screen.findByTestId('battle-host-standings')
    expect(view.container.querySelector('.screen-layout')).toBeNull()
    // 順位表は投影用スケールを持つ .battle-host 配下に入る（サイズ差は親クラスで上書きする）
    expect(view.container.querySelector('.battle-host .standings')).not.toBeNull()
    const foot = view.container.querySelector('.battle-host-stage__foot')
    expect(foot?.querySelector('button')?.textContent).toBe('次の問題へ')
    // 出題中でないフェーズにはリング（残り時間）を出さない
    expect(screen.queryByTestId('battle-host-ring')).toBeNull()
  })

  it('ホスト画面の表示中だけ明地（ライトテーマ）に固定し、離脱で元のテーマへ戻す（JV-6）', () => {
    setTheme('dark')
    const { unmount } = render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={new FakeBattleSocket()}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
      />,
    )
    expect(document.documentElement.dataset.theme).toBe('light')
    unmount()
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

// T-217（Q-51）: ホストは出題中・順位表示中に中止・退出導線が無く、中止するにはブラウザバック
// 頼みだった（socket切断で全参加者が落ちる=battleRoomDo.tsのcloseRoom）。ロビーの「やめる」も
// 参加者が入室済みでも確認なしでルームを閉じていた。中止導線と確認を追加する
describe('BattleHostScreen: 中止・退出導線（T-217）', () => {
  it('ロビーの「やめる」は確認を経てから閉じる（参加者が入室済みでも無confirmで閉じない）', async () => {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '花子' }] })
    await screen.findByText('花子')

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    // 確認ダイアログを経るまでソケットは閉じない
    expect(socket.closed).toBe(false)
    expect(await screen.findByRole('alertdialog')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '終了する' }))
    expect(socket.closed).toBe(true)
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('出題中は中止ボタンが出て、確認後に終了する（参加者全員が切断される契機）', async () => {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1'), textBlankQuestion('q-2')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 20_000,
    })
    await screen.findByTestId('battle-host-timer')

    fireEvent.click(screen.getByRole('button', { name: '中止' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '終了する' }))
    expect(socket.closed).toBe(true)
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('途中順位フェーズでも中止ボタンが出る', async () => {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1'), textBlankQuestion('q-2')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '花子', totalPoints: 90 }],
    })
    await screen.findByTestId('battle-host-standings')

    expect(screen.getByRole('button', { name: '中止' })).toBeTruthy()
  })

  it('確認ダイアログで「続ける」を選ぶとソケットを閉じずに進行を続ける', async () => {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    fireEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(socket.closed).toBe(false)
  })
})

// 切断理由ごとの案内（回帰防止）: 参加画面と同じく、以前は理由を捨てて固定文しか出していなかった。
// ホストもレイド登録済みの端末でなければルームを開けない
describe('BattleHostScreen: 切断理由ごとの案内', () => {
  async function renderAndClose(code: number, reason?: string) {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1')]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    if (reason === undefined) socket.emitClose(code)
    else socket.emitClose(code, reason)
    return screen.findByTestId('battle-host-close-reason')
  }

  it('unauthorizedならレイド未登録が原因と、ホームの「レイド」で招待コード登録が必要だと案内する', async () => {
    const body = await renderAndClose(1008, 'unauthorized')
    expect(screen.getByText('イベントバトルに参加できませんでした')).toBeTruthy()
    expect(body.textContent).toContain('この端末はまだレイドに登録されていません')
    expect(body.textContent).toContain('ホーム画面の「レイド」')
    expect(body.textContent).toContain('招待コードを入力して登録すると主催できます')
  })

  it('room_not_foundならルームの再作成を案内する', async () => {
    const body = await renderAndClose(1008, 'room_not_found')
    expect(screen.getByText('ルームが見つかりませんでした')).toBeTruthy()
    expect(body.textContent).toContain('ルームをもう一度作成してください')
  })

  it('room_closedならバトル終了として案内する', async () => {
    const body = await renderAndClose(1000, 'room_closed')
    expect(screen.getByText('バトルが終了しました')).toBeTruthy()
    expect(body.textContent).toContain('バトルを終了しました')
  })

  it('未知の理由・理由なしなら通信断の汎用案内に落とす', async () => {
    const body = await renderAndClose(1006)
    expect(screen.getByText('接続が切れました')).toBeTruthy()
    expect(body.textContent).toContain('通信が途切れた')
  })
})

// 何を防ぐか（T-224。docs/29 Q-62・J-108）: 抽選プレビュー・投影中の設問文・選択肢本文
// （英文）に lang="en" が無く、lang="ja" の文書内で日本語の音声として読み上げられていたこと
describe('BattleHostScreen: 英文要素のlang="en"（T-224・J-108）', () => {
  it('抽選プレビューはquestion.questionがある行だけlang="en"が付く（音声問題の行は付かない）', () => {
    const leaky = audioQaQuestion('q-leak-lang')
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={new FakeBattleSocket()}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[
          leaky,
          ...Array.from({ length: 20 }, (_, i) => textBlankQuestion(`p5-lang-${i}`)),
        ]}
        rng={() => 0.3}
      />,
    )

    const preview = screen.getByTestId('battle-host-lottery-preview')
    const textEl = screen.getByText('Please ___ the p5-lang-0.')
    expect(textEl.getAttribute('lang')).toBe('en')
    const audioRow = screen.getByText('音声問題（q-leak-lang）')
    expect(audioRow.getAttribute('lang')).toBeNull()
    expect(preview).toBeTruthy()
  })

  it('投影中の設問文にlang="en"が付く', async () => {
    const socket = new FakeBattleSocket()
    render(
      <BattleHostScreen
        raidApi={new FakeRaidApi()}
        battleSocket={socket}
        audioPlayer={new ControllableAudioPlayer()}
        questionPool={[textBlankQuestion('q-1-lang')]}
        rng={() => 0.3}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'ルームを作成' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    fireEvent.click(screen.getByRole('button', { name: '開始する' }))
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1-lang',
      deadlineAt: Date.now() + 20_000,
    })
    await screen.findByTestId('battle-host-timer')

    const questionEl = await screen.findByText('Please ___ the q-1-lang.')
    expect(questionEl.getAttribute('lang')).toBe('en')
    // 選択肢本文（投影専用の描画。ChoiceButtonを使わないため個別に検証する）
    expect(screen.getByText('submit').getAttribute('lang')).toBe('en')
  })
})
