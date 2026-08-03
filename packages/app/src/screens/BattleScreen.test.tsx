// T-125完了条件のテスト（正本: docs/22_M4実装計画.md 3.2節・3.6節、6節T-125シート）:
// - フェイクBattleSocketで join→questionOpen→解答→standings→result の一連
// - パック未取得問題が0点で流れ、進行が壊れない
// - 誤答がattempts記録・復習デッキ登録される／レート・SRSが変動しない
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import { DEFAULT_INITIAL_RATING } from '../engine/rating'
import { FakeBattleSocket } from '../platform/net/BattleSocket'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { BattleScreen } from './BattleScreen'
import { resolveBattleCloseMessage } from './battleCloseMessage'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`battle-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  useAppStore.setState({ screen: 'home' })
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function textBlankQuestion(id: string, answer = 'A'): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'A' }],
    question: `Please ___ the ${id}.`,
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer,
    explanation: '解説',
    translation: '和訳',
  }
}

async function seedProfile(db: BebRaidDatabase) {
  await db.profile.put({
    id: PROFILE_ID,
    displayName: '太郎',
    initialToeic: null,
    createdAt: Date.now(),
    deviceToken: 'token-1',
  })
}

describe('BattleScreen: join→questionOpen→解答→standings→result', () => {
  it('一連のメッセージ往復でリザルトまで到達する', async () => {
    const db = newDb()
    await seedProfile(db)
    const q1 = textBlankQuestion('q-1', 'A')
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q1]} />)

    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'abcd' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))

    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    await waitFor(() =>
      expect(socket.sent.find((m) => m.type === 'join')).toMatchObject({
        type: 'join',
        displayName: '太郎',
      }),
    )

    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    expect(await screen.findByText('ロビー')).toBeTruthy()
    expect(screen.getByText('太郎')).toBeTruthy()

    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    expect(await screen.findByText(q1.question!)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /submit$/ }))
    await waitFor(() =>
      expect(socket.sent.find((m) => m.type === 'answer')).toMatchObject({
        type: 'answer',
        questionIndex: 0,
      }),
    )
    // 正解を選んだので基礎点(>0)が即時表示される
    expect(screen.getByTestId('battle-own-points').textContent).toMatch(/獲得点: \d+点/)

    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '太郎', totalPoints: 90 }],
    })
    expect(await screen.findByTestId('battle-standings')).toBeTruthy()

    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 90 }],
      bestGrowth: { displayName: '太郎' },
    })
    expect(await screen.findByTestId('battle-result')).toBeTruthy()
    expect(screen.getByTestId('battle-best-growth').textContent).toContain('太郎')

    // 誤答は無かったので0問
    await waitFor(() =>
      expect(screen.getByTestId('battle-review-note').textContent).toContain('誤答0問'),
    )

    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ questionId: 'q-1', isCorrect: true, mode: 'battle' })
  })
})

describe('BattleScreen: パック未取得問題', () => {
  it('パック未取得は「パック未取得」表示になり、解答なしで進行できる', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'wxyz' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('WXYZ'))

    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'missing-question',
      deadlineAt: Date.now() + 30_000,
    })

    expect(await screen.findByTestId('battle-pack-missing')).toBeTruthy()

    // 進行は壊れず、次のstandings/resultへも到達できる
    socket.emitMessage({ type: 'standings', entries: [{ displayName: '太郎', totalPoints: 0 }] })
    expect(await screen.findByTestId('battle-standings')).toBeTruthy()
    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 0 }],
      bestGrowth: { displayName: '太郎' },
    })
    expect(await screen.findByTestId('battle-result')).toBeTruthy()

    // パック未取得問題は解答不能のためattemptsに記録されない
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(0)
  })
})

describe('BattleScreen: 誤答のattempts記録・復習デッキ登録・レート/SRS不変', () => {
  it('誤答を選ぶとattemptsにisCorrect:falseで記録され、keyVocabが復習デッキ(srsCards)へ登録される。レート・SRSカードの参照カウント方式は変動しない', async () => {
    const db = newDb()
    await seedProfile(db)
    const q1 = textBlankQuestion('q-1', 'A')
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q1]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'aaaa' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('AAAA'))

    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    await screen.findByText(q1.question!)

    // Bは誤答
    fireEvent.click(screen.getByRole('button', { name: /submits$/ }))
    await waitFor(() =>
      expect(socket.sent.find((m) => m.type === 'answer')).toMatchObject({
        type: 'answer',
        questionIndex: 0,
        points: 0,
      }),
    )

    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 0 }],
      bestGrowth: { displayName: '太郎' },
    })
    await screen.findByTestId('battle-result')
    await waitFor(() =>
      expect(screen.getByTestId('battle-review-note').textContent).toContain('誤答1問'),
    )

    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ questionId: 'q-1', isCorrect: false, mode: 'battle' })

    // keyVocabの復習デッキ（srsCards）登録を確認
    const srsCards = await db.srsCards.toArray()
    expect(srsCards.some((c) => c.refType === 'vocab' && c.refId === 'submit')).toBe(true)
    expect(srsCards.some((c) => c.refType === 'question' && c.refId === 'q-1')).toBe(true)

    // レート・ratingHistoryが変動しない（skip.rating=trueが機能している）ことを確認
    const ratings = await db.ratings.toArray()
    expect(ratings).toHaveLength(0)
    const ratingHistory = await db.ratingHistory.toArray()
    expect(ratingHistory).toHaveLength(0)
  })
})

// 発起人の要望（2026-08-03）: バトル後の復習タイム。誤答は復習デッキにも入るが、
// 次のSRS期限まで待つと熱量が冷めるため、その場で解き直す導線を出す
describe('BattleScreen: バトル後の復習', () => {
  it('誤答した問題をその場で復習セッションとして開始できる', async () => {
    const db = newDb()
    await seedProfile(db)
    const q1 = textBlankQuestion('q-1', 'A')
    const q2 = textBlankQuestion('q-2', 'A')
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q1, q2]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'cccc' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('CCCC'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })

    // 1問目は誤答、2問目は正解
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    fireEvent.click(await screen.findByRole('button', { name: /submits$/ }))
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 1,
      questionId: 'q-2',
      deadlineAt: Date.now() + 30_000,
    })
    fireEvent.click(await screen.findByRole('button', { name: /submit$/ }))
    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 10 }],
      bestGrowth: { displayName: '太郎' },
    })

    // 誤答した1問だけが復習対象になる
    const reviewButton = await screen.findByRole('button', { name: '間違えた1問を復習する' })
    expect(screen.getByTestId('battle-review-hint').textContent).toContain('間違えた問題')

    fireEvent.click(reviewButton)
    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
    const snapshot = useSessionStore.getState().snapshot!
    expect(snapshot.items.map((i) => i.questionId)).toEqual(['q-1'])
    // 解き直しは通常の学習なので mode='solo'（バトルのままにするとレート対象外になる）
    expect(snapshot.items[0]!.mode).toBe('solo')
  })

  it('全問正解なら復習導線を出さない', async () => {
    const db = newDb()
    await seedProfile(db)
    const q1 = textBlankQuestion('q-1', 'A')
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q1]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'dddd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('DDDD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    fireEvent.click(await screen.findByRole('button', { name: /submit$/ }))
    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 10 }],
      bestGrowth: { displayName: '太郎' },
    })

    await screen.findByTestId('battle-result')
    await waitFor(() =>
      expect(screen.getByTestId('battle-review-note').textContent).toContain('誤答0問'),
    )
    expect(screen.queryByTestId('battle-review-hint')).toBeNull()
    expect(screen.queryByRole('button', { name: /復習する/ })).toBeNull()
  })
})

describe('BattleScreen: 切断・離脱時の後始末', () => {
  // 回帰防止: attempts記録を最終リザルト受信までまとめて遅延させると、ホスト切断・通信断で
  // closedへ落ちた回の解答ログが1件も残らない（attemptsは分析の基盤＝欠落させない）
  it('resultを受け取らずに切断されても、解答済みぶんはattemptsに残る', async () => {
    const db = newDb()
    await seedProfile(db)
    const q1 = textBlankQuestion('q-1', 'A')
    const socket = new FakeBattleSocket()

    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q1]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'bbbb' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('BBBB'))

    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-1',
      deadlineAt: Date.now() + 30_000,
    })
    await screen.findByText(q1.question!)
    fireEvent.click(screen.getByRole('button', { name: /submit$/ }))

    // resultを受けずにサーバー切断
    socket.emitClose(1006)
    expect(await screen.findByText('接続が切れました')).toBeTruthy()

    await waitFor(async () => {
      const attempts = await db.attempts.toArray()
      expect(attempts).toHaveLength(1)
      expect(attempts[0]).toMatchObject({ questionId: 'q-1', isCorrect: true, mode: 'battle' })
    })
  })

  // 回帰防止: battleSocketはApp.tsxのモジュール単位シングルトンのため、画面を離れても
  // 閉じないとルーム内の参加者枠を占有したままになる
  it('アンマウント時にWebSocketをcloseする', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const { unmount } = render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'cccc' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('CCCC'))

    unmount()
    expect(socket.closed).toBe(true)
  })
})

describe('BattleScreen: ルームコードの正規化', () => {
  it('小文字・4文字超は大文字化・切り詰めされる', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)

    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'ab-cdxx' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
  })
})

describe('BattleScreen: expectedPointsPerQuestion（join時の期待点）', () => {
  it('ratingsが未初期化でも既定レートから期待点を算出してjoinを送る', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)

    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'zzzz' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))

    await waitFor(() => {
      const joinMsg = socket.sent.find((m) => m.type === 'join')
      expect(joinMsg).toBeDefined()
      if (joinMsg?.type === 'join') {
        expect(joinMsg.expectedPointsPerQuestion).toBeGreaterThan(0)
      }
    })
    expect(DEFAULT_INITIAL_RATING).toBeGreaterThan(0)
  })
})

// 切断理由ごとの案内（回帰防止）: 以前はサーバーが返すreasonを捨てて「接続が切れました」の
// 固定文しか出していなかったため、レイド未登録の人に「招待コードでの登録が必要」と伝わらなかった
describe('BattleScreen: 切断理由ごとの案内', () => {
  async function renderAndClose(code: number, reason?: string) {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)

    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'abcd' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    if (reason === undefined) socket.emitClose(code)
    else socket.emitClose(code, reason)
    return screen.findByTestId('battle-close-reason')
  }

  it('unauthorizedならレイド未登録が原因と、ホームの「レイド」で招待コード登録が必要だと案内する', async () => {
    const body = await renderAndClose(1008, 'unauthorized')
    expect(screen.getByText('イベントバトルに参加できませんでした')).toBeTruthy()
    expect(body.textContent).toContain('この端末はまだレイドに登録されていません')
    expect(body.textContent).toContain('ホーム画面の「レイド」')
    expect(body.textContent).toContain('招待コードを入力して登録すると参加できます')
  })

  it('room_not_foundならコードの確認と終了済みの可能性を案内する', async () => {
    const body = await renderAndClose(1008, 'room_not_found')
    expect(screen.getByText('ルームが見つかりませんでした')).toBeTruthy()
    expect(body.textContent).toContain('ルームコードが違っているか')
    expect(body.textContent).toContain('すでに終了している可能性')
  })

  it('room_closedならホストの終了（異常ではない）と案内する', async () => {
    const body = await renderAndClose(1000, 'room_closed')
    expect(screen.getByText('バトルが終了しました')).toBeTruthy()
    expect(body.textContent).toContain('主催者がバトルを終了しました')
  })

  it('未知の理由・理由なしなら通信断の汎用案内に落とす', async () => {
    const body = await renderAndClose(1006)
    expect(screen.getByText('接続が切れました')).toBeTruthy()
    expect(body.textContent).toContain('通信が途切れた')
  })

  it('サーバーが未知のreasonを返しても汎用案内に落とす', async () => {
    const body = await renderAndClose(1011, 'something_unexpected')
    expect(screen.getByText('接続が切れました')).toBeTruthy()
    expect(body.textContent).toContain('通信が途切れた')
  })
})

// V-13（docs/25 4.4節）: 待機系（ルームコード入力・ロビー・切断）の表層整備。
// 過剰演出を足さないタスクなので、テストは「階層が付いたこと」と
// 「文言・アクセシビリティが不変であること」を機械的に担保する範囲に留める
describe('BattleScreen: 待機系画面の表層（V-13。docs/25 4.4節）', () => {
  async function renderEntry() {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[]} />)
    return socket
  }

  it('ルームコード入力はカード内にあり、ワードマークが1つ置かれる', async () => {
    await renderEntry()
    // ワードマークは第一印象のための1つだけ（docs/25 4.4節）
    expect(screen.getAllByRole('heading', { name: 'BEB RAID' })).toHaveLength(1)
    const input = screen.getByLabelText('ルームコード（4文字）')
    expect(input.closest('.battle-entry__card')).toBeTruthy()
  })

  it('ルームコード入力欄はキーボードで操作できるまま（無効化・読み取り専用にしていない）', async () => {
    await renderEntry()
    const input = screen.getByLabelText('ルームコード（4文字）') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(input.disabled).toBe(false)
    expect(input.readOnly).toBe(false)
    input.focus()
    expect(document.activeElement).toBe(input)
    // キーボード入力が正規化されて反映される
    fireEvent.change(input, { target: { value: 'ab12' } })
    expect(input.value).toBe('AB12')
  })

  it('ロビーの参加者一覧はピル形チップの並びで、10人でも全員が表示される', async () => {
    const socket = await renderEntry()
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'abcd' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))

    const names = Array.from({ length: 10 }, (_, i) => `参加者${i + 1}`)
    socket.emitMessage({
      type: 'roomState',
      participants: names.map((displayName) => ({ displayName })),
    })
    await screen.findByText('ロビー')

    const chips = document.querySelectorAll('.battle-lobby__chip')
    expect(chips).toHaveLength(10)
    expect(Array.from(chips).map((el) => el.textContent)).toEqual(names)
  })

  it('切断画面は見出しと本文の階層を持つカードになり、文言はbattleCloseMessageの出力と一致する', async () => {
    const socket = await renderEntry()
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'abcd' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitClose(1008, 'unauthorized')

    const body = await screen.findByTestId('battle-close-reason')
    const card = body.closest('.battle-closed')
    expect(card).toBeTruthy()
    const title = card?.querySelector('.battle-closed__title')
    // 文言はV-13で1文字も変えない（battleCloseMessage.tsが正本）
    const expected = resolveBattleCloseMessage('unauthorized', 'participant')
    expect(title?.textContent).toBe(expected.title)
    expect(body.textContent).toBe(expected.body)
    // 見出しの重複表示はしない（ステータス帯からカード内へ移した）
    expect(screen.getAllByText(expected.title)).toHaveLength(1)
  })
})

// V-12（docs/25 4.4節・JV-7=案B）。防ぐもの:
// - 手元画面の形マーカーがホスト画面（S8。BattleHostScreen.test.tsx が同じ対応表を検証）と
//   ずれ、投影と手元で違う形が同じ選択肢に付くこと
// - 形が読み上げ対象になって選択肢記号が支援技術に伝わらなくなること
// - 出題中に演出（アニメーション）が足されること（07の原則3）
describe('BattleScreen: 4択の形マーカー（V-12。docs/25 4.4節）', () => {
  /** A–Dの4択を持つ設問（形マーカーの全対応を1画面で確認するため） */
  function fourChoiceQuestion(): Question {
    return {
      ...textBlankQuestion('q-4', 'A'),
      choices: [
        { key: 'A', text: 'submit' },
        { key: 'B', text: 'submits' },
        { key: 'C', text: 'submitted' },
        { key: 'D', text: 'submitting' },
      ],
    }
  }

  async function renderToQuestion(question: Question) {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const view = render(<BattleScreen db={db} battleSocket={socket} questionPool={[question]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), {
      target: { value: 'abcd' },
    })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: question.id,
      deadlineAt: Date.now() + 30_000,
    })
    await screen.findByText(question.question!)
    return { socket, view }
  }

  it('A–Dが▲■●◆に置き換わり、ホスト画面と同じ形が同じ選択肢に対応する', async () => {
    const { view } = await renderToQuestion(fourChoiceQuestion())

    const markers = Array.from(view.container.querySelectorAll('.choice-button')).map((btn) => ({
      key: btn.getAttribute('data-choice-key'),
      shape: btn.querySelector('.choice-button__marker')?.textContent,
    }))
    expect(markers).toEqual([
      { key: 'A', shape: '▲' },
      { key: 'B', shape: '■' },
      { key: 'C', shape: '●' },
      { key: 'D', shape: '◆' },
    ])
  })

  it('形マーカーはaria-hiddenの装飾で、選択肢記号と本文が支援技術に伝わる', async () => {
    const { view } = await renderToQuestion(fourChoiceQuestion())

    const buttons = Array.from(view.container.querySelectorAll('.choice-button'))
    expect(
      buttons.map((btn) =>
        btn.querySelector('.choice-button__marker')?.getAttribute('aria-hidden'),
      ),
    ).toEqual(['true', 'true', 'true', 'true'])
    // アクセシブル名は「選択肢<記号>＋本文」（形そのものは読み上げられない）
    expect(screen.getByRole('button', { name: /選択肢C\s*submitted/ })).toBeTruthy()
  })

  it('正誤フィードバックは枠色＋✓✕のまま（形マーカーは状態で変わらない）', async () => {
    const { view } = await renderToQuestion(fourChoiceQuestion())

    fireEvent.click(screen.getByRole('button', { name: /選択肢B\s*submits/ }))
    const buttons = Array.from(view.container.querySelectorAll('.choice-button'))
    // 正解=A、選んだ誤答=B、残りは減光。形マーカーは4つとも解答前と同じ
    expect(buttons.map((b) => b.getAttribute('data-state'))).toEqual([
      'correct',
      'wrong',
      'dimmed',
      'dimmed',
    ])
    expect(buttons.map((b) => b.querySelector('.choice-button__marker')?.textContent)).toEqual([
      '▲',
      '■',
      '●',
      '◆',
    ])
    expect(buttons.map((b) => b.querySelector('.choice-button__icon')?.textContent)).toEqual([
      '✓',
      '✕',
      '',
      '',
    ])
  })
})

describe('BattleScreen: 参加者画面の情報と退出導線（T-178。docs/27 のS-33〜S-36）', () => {
  /** 音声問題（question を持たない＝音声で流れる形式） */
  function audioQaQuestion(id: string): Question {
    return {
      id,
      part: 2,
      format: 'audio_qa',
      difficulty: 2,
      tags: ['意図推定'],
      keyVocab: [],
      audio: `/audio/${id}.mp3`,
      choices: [
        { key: 'A', text: 'Yesterday.' },
        { key: 'B', text: 'In the meeting room.' },
      ],
      answer: 'A',
      explanation: '解説',
      translation: '和訳',
    }
  }

  async function joinAndOpen(db: BebRaidDatabase, question: Question, socket: FakeBattleSocket) {
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[question]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    await screen.findByText('ロビー')
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: question.id,
      deadlineAt: Date.now() + 30_000,
    })
  }

  // 何を防ぐか（S-34）: audio_qa は question が未定義のため、手元には空白＋選択肢だけが並び、
  // 投影を見られない位置の参加者は何を問われているか分からないまま制限時間が減っていた
  it('音声問題では手元に指示文を出す（空白にしない）', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    await joinAndOpen(db, audioQaQuestion('p2-battle'), socket)

    expect(
      await screen.findByText('音声で質問が流れます。応答として正しい選択肢を選んでください'),
    ).toBeTruthy()
  })

  // 何を防ぐか（S-33）: 出題が始まると退出手段が無く（退出ボタンはロビーのみ）、
  // 会議・電車の都合で抜けたいときにブラウザバックしかなかった
  it('出題中に退出できる（確認あり。キャンセルでは閉じない）', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    await joinAndOpen(db, textBlankQuestion('q-leave'), socket)
    await screen.findByRole('button', { name: /submit$/ })

    // この画面は自分でscreenを設定しないため、遷移の有無を見るために現在値を明示しておく
    useAppStore.setState({ screen: 'battle' })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '退出する' }))
    expect(socket.closed).toBe(false)
    expect(useAppStore.getState().screen).toBe('battle')

    confirmSpy.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '退出する' }))
    expect(socket.closed).toBe(true)
    expect(useAppStore.getState().screen).toBe('home')
    confirmSpy.mockRestore()
  })

  // 何を防ぐか（S-36前半）: 解答後に選択肢の色と獲得点しか出ず、間違えた理由がその場で
  // 分からなかった（最終リザルトも誤答件数だけ）
  it('解答後に解説が表示される', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const q = textBlankQuestion('q-exp')
    await joinAndOpen(db, q, socket)

    fireEvent.click(await screen.findByRole('button', { name: /submit$/ }))

    expect(await screen.findByText('解説')).toBeTruthy()
  })

  // 何を防ぐか（S-36後半）: 未解答のまま締切を迎えるとattemptsに何も残らず、ソロ側が
  // isTimeout を記録・可視化しているのにバトルの時間切れだけ統計にも復習にも出なかった
  it('未解答のまま締切を迎えると isTimeout の attempt を記録する', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const q = textBlankQuestion('q-timeout')
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    await screen.findByText('ロビー')

    // 締切を至近に設定して、解答せずに通過させる
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: q.id,
      deadlineAt: Date.now() + 30,
    })

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isTimeout).toBe(true)
    expect(attempt.isCorrect).toBe(false)
    expect(attempt.mode).toBe('battle')
  })

  it('解答済みなら締切時に二重記録しない', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const q = textBlankQuestion('q-no-dup')
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    await screen.findByText('ロビー')
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: q.id,
      deadlineAt: Date.now() + 120,
    })

    fireEvent.click(await screen.findByRole('button', { name: /submit$/ }))
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))

    // 締切を過ぎても件数は増えない
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(await db.attempts.count()).toBe(1)
    expect((await db.attempts.toArray())[0]!.isTimeout).toBe(false)
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: サーバーの締切判定（standings）が
  // ローカルタイマーより先に届くと、phase遷移でカウントダウンeffectのcleanupがタイマーを
  // 解除し、未解答の時間切れが記録されないまま消えること
  it('standingsが先に届いても未解答の時間切れを記録する', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const q = textBlankQuestion('q-standings-first')
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })
    await screen.findByText('ロビー')

    // 締切はまだ先（ローカルタイマーは発火していない）
    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: q.id,
      deadlineAt: Date.now() + 30_000,
    })
    await screen.findByRole('button', { name: /submit$/ })
    expect(await db.attempts.count()).toBe(0)

    // サーバーが先に締切を判定して順位を送ってきた
    socket.emitMessage({
      type: 'standings',
      entries: [{ displayName: '太郎', totalPoints: 0 }],
    })

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isTimeout).toBe(true)
    expect(attempt.questionId).toBe(q.id)

    // 続く result 受信でも二重記録しない
    socket.emitMessage({
      type: 'result',
      entries: [{ displayName: '太郎', totalPoints: 0 }],
      bestGrowth: { displayName: '太郎' },
    })
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    expect(await db.attempts.count()).toBe(1)
  })

  it('ロビーで1問あたりの制限時間を告知する（秒数はサーバーの deadlineAt から算出）', async () => {
    const db = newDb()
    await seedProfile(db)
    const socket = new FakeBattleSocket()
    const q = textBlankQuestion('q-sec')
    render(<BattleScreen db={db} battleSocket={socket} questionPool={[q]} />)
    fireEvent.change(screen.getByLabelText('ルームコード（4文字）'), { target: { value: 'abcd' } })
    fireEvent.click(screen.getByRole('button', { name: '参加する' }))
    await waitFor(() => expect(socket.connectedCode).toBe('ABCD'))
    socket.emitMessage({ type: 'roomState', participants: [{ displayName: '太郎' }] })

    // 1問目を受けるまでは秒数が分からないので、その旨を出す
    expect(await screen.findByText('1問あたりの制限時間はホストの設定に従います')).toBeTruthy()

    socket.emitMessage({
      type: 'questionOpen',
      questionIndex: 0,
      questionId: q.id,
      deadlineAt: Date.now() + 30_000,
    })
    await screen.findByRole('button', { name: /submit$/ })
    // 順位表示を経てロビーには戻らないため、ここでは実測値が保持されることだけ確認する
    socket.emitMessage({ type: 'standings', entries: [{ displayName: '太郎', totalPoints: 0 }] })
    expect(await screen.findByTestId('battle-standings')).toBeTruthy()
  })
})
