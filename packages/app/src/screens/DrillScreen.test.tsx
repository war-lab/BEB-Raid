// T-16 完了条件のテスト:
// - 出題→解答→正誤→解説→次問→リザルト遷移、が通る
// - 誤答で srsCards（問題＋key語彙）が追加され、tagStats・ratings が更新される
// - SRS由来item（srsCardIdあり）の解答で reviewSrsCard が呼ばれる
// - 中断復帰: answeredCount > 0 のスナップショットから再開すると続きの問題が表示される
// T-17 完了条件のテスト（audio_qa。docs/10 T-17）:
// - タイマー0で自動的にisTimeout記録＋正誤表示に遷移する
// - 連続正解数がセッション内で増減する
// - 冒頭再生モードでplayがdurationMs付きで呼ばれる
// - 15秒タイマー中に解答すると残り時間に関係なく即確定する
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import type { AudioPlayer, PlaybackOutcome } from '../platform'
import {
  ACTIVE_SESSION_KEY,
  advanceSession,
  answerCurrentQuestion,
  resumeSession,
  startSession,
  type SessionItem,
} from '../services/session'
import {
  AUTO_PLAY_ENABLED_KEY,
  HAPTICS_ENABLED_KEY,
  MISTAP_UNDO_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
} from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { DrillScreen } from './DrillScreen'

/** HighlightedPhraseで単語部分が別要素に分かれるため、フレーズ全文はp要素のtextContentで照合する */
function phraseMatcher(phrase: string) {
  return (_content: string, element: Element | null) =>
    element?.tagName === 'P' &&
    element.classList.contains('vocab-card__phrase') &&
    element.textContent === phrase
}

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`drill-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

/** AudioPlayer のフェイク（テスト用に呼び出しを記録する） */
class FakeAudioPlayer implements AudioPlayer {
  unlock = vi.fn(async () => {})
  play = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  playSequence = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  replay = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  stop = vi.fn(() => {})
}

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
  vi.useRealTimers()
})

function part5Question(
  id: string,
  answer: string,
  word: string,
  tags: string[] = ['品詞'],
): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags,
    keyVocab: [{ word, sense: `${word} の意味`, freqRank: 'S' }],
    question: `Please ___ (${word}) the report.`,
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
      { key: 'C', text: 'c' },
      { key: 'D', text: 'd' },
    ],
    answer,
    explanation: '解説テキスト',
    translation: '和訳テキスト',
  }
}

const QUESTIONS = [part5Question('q-1', 'A', 'submit'), part5Question('q-2', 'B', 'attend')]

async function setupSession(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
  // 誤タップの取り消し猶予（ADR 0009。既定ON）をOFFにする。ONだと解答から記録まで
  // 400ms入り、answerAndSettle を使う既存テスト40箇所以上が一律に遅く・不安定になる。
  // 猶予そのものの検証は専用describeで明示的にONにして行う
  await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: false })
  const snapshot = await startSession(db, { items })
  useSessionStore.getState().begin(snapshot, questions, { L: 400, R: 400 })
  return snapshot
}

/**
 * 選択肢をクリックし、非同期の解答処理チェーン（DB書き込み＋recordAnswer）が
 * 完全に完了するまで待つ。UIの正誤表示は setResult の同期更新で即座に出るため、
 * それだけを待つと answerCurrentQuestion 以降の await が終わる前に次の操作をしてしまい、
 * 「スナップショットが古い」エラーを引き起こす（recordAnswer はチェーンの最後に呼ばれる）
 */
async function answerAndSettle(choiceText: string, expectedAnsweredCount: number) {
  fireEvent.click(screen.getByText(choiceText))
  await waitFor(() =>
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(expectedAnsweredCount),
  )
}

describe('DrillScreen: 出題→解答→正誤→解説→次問→リザルト', () => {
  it('誤答すると解説カードが表示され、srsCards・tagStats・ratingsが更新される', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // q-1 の正解は A。B(誤答)を選ぶ
    await answerAndSettle('b', 1)

    expect(screen.getByText('不正解')).toBeTruthy()
    expect(screen.getByText('解説テキスト')).toBeTruthy()
    expect(await screen.findByText('次へ')).toBeTruthy()

    // 誤答問題そのものと key語彙 が srsCards に追加されている
    expect(await db.srsCards.get('question:q-1')).toBeDefined()
    expect(await db.srsCards.get('vocab:submit')).toBeDefined()

    // タグ統計が更新されている
    const tagStat = await db.tagStats.get('品詞')
    expect(tagStat).toBeDefined()
    expect(tagStat!.windowTotal).toBeGreaterThan(0)

    // レートが更新されている（part5 → R セクション）
    const rating = await db.ratings.get('R')
    expect(rating).toBeDefined()
  })

  it('正解した場合は srsCards に問題カードが追加されない', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // q-1 の正解

    expect(screen.getByText('正解')).toBeTruthy()
    expect(await db.srsCards.get('question:q-1')).toBeUndefined()
  })

  it('解答済みの選択肢ボタンは再度クリックできない（二重解答防止）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1)

    expect(await db.attempts.count()).toBe(1)
    fireEvent.click(screen.getByText('b'))
    // disabled のため attempts は増えない
    expect(await db.attempts.count()).toBe(1)
  })

  it('「次へ」で次の問題に進み、最終問題後はリザルト画面へ遷移する', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1)
    fireEvent.click(await screen.findByText('次へ'))

    // 2問目（q-2）が表示される
    expect(screen.getByText(/attend/)).toBeTruthy()

    await answerAndSettle('b', 2) // q-2 の正解
    fireEvent.click(await screen.findByText('次へ'))

    expect(useAppStore.getState().screen).toBe('result')
  })

  // 何を防ぐか（T-320・K-53）: snapshotはあるがitemが無い（=全item解答済み）状態での
  // finishSession()呼び出しが、レンダー本体（return null直前）に書かれていた。
  // このケースは通常、最終問の「次へ」ボタン（onClick={finishSession}、イベント
  // ハンドラなので問題ない）を経由するが、中断復帰などでsnapshot自体が
  // 「既に全問解答済み」の状態のままDrillScreenが最初にレンダーされることもある
  // （ボタンクリックを経由せずレンダー本体のガードが初回レンダーで直接実行される経路）。
  // レンダー本体からnavigate/completeSessionを直接呼ぶのはReactのレンダー純粋性に反するため
  // useEffectへ移した（T-320）。この経路が退行してリザルトへ進まなくなることを防ぐ
  it('既に全問解答済みのsnapshotで初回レンダーされた場合もリザルトへ進み、セッションが完了する（T-320・K-53）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await startSession(db, { items })
    const answeredSnapshot = { ...snapshot, answeredCount: items.length }
    useSessionStore.getState().begin(answeredSnapshot, QUESTIONS, { L: 400, R: 400 })

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const active = await db.settings.get(ACTIVE_SESSION_KEY)
    expect(active).toBeUndefined()
  })

  it('全問完走してリザルトへ進んだ時点でDB上のセッションを完了させる（T-267・Q-5）', async () => {
    // 何を防ぐか: 途中終了ボタン（T-196）だけでなく、通常どおり全問解いて
    // 「次へ」でリザルトへ進む正規完走の経路でも、ResultScreenの「ホームへ」を
    // 待たずにこの時点でDBのアクティブセッションを消す。完走の方が途中終了より
    // 通過頻度が高いため、ここが直っていないとQ-5の症状（終了したはずのセッションが
    // 進行中として残る）が日常的に発生する
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1)
    fireEvent.click(await screen.findByText('次へ'))
    await answerAndSettle('b', 2) // q-2（最終問）の正解
    fireEvent.click(await screen.findByText('次へ'))

    expect(useAppStore.getState().screen).toBe('result')
    await waitFor(async () => expect(await resumeSession(db)).toBeNull())
  })

  it('SRS由来item（srsCardIdあり）の解答で reviewSrsCard が呼ばれる', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'question:q-1',
      refType: 'question',
      refId: 'q-1',
      stage: 0,
      dueAt: Date.now(),
      lapses: 0,
      introducedDate: null,
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const items: SessionItem[] = [{ questionId: 'q-1', mode: 'srs', srsCardId: 'question:q-1' }]
    await setupSession(db, items, [QUESTIONS[0]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // 正解 → good

    const card = await db.srsCards.get('question:q-1')
    expect(card?.introducedDate).not.toBeNull()
    expect(card?.stage).toBe(0) // good: 未導入(-1) → 0
  })

  it('中断復帰: answeredCount > 0 のスナップショットから続きの問題が表示される', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    let snapshot = await startSession(db, { items })
    // 1問目を解答済みにしてから「再開」を模擬
    snapshot = await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })
    useSessionStore.getState().begin(snapshot, QUESTIONS, { L: 400, R: 400 })

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    // 2問目（q-2）から再開する
    expect(screen.getByText(/attend/)).toBeTruthy()
  })

  it('「中断」ボタンでホームへ戻る（T-67。スナップショットは破棄しない）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('中断'))
    fireEvent.click(screen.getByText('中断してホームへ'))

    expect(useAppStore.getState().screen).toBe('home')
    // 進行中セッションはDB上に残っている（中断=破棄ではない）
    expect(await db.settings.get('activeSession')).toBeTruthy()
  })

  // T-221（Q-15）: 「中断してホームへ」はaudioPlayer.stop()を呼ばず、Part3/4の
  // 約30秒音声の再生中に中断するとホーム画面で音声が流れ続けていた
  it('「中断してホームへ」でaudioPlayer.stop()が呼ばれる', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('中断'))
    fireEvent.click(screen.getByText('中断してホームへ'))

    expect(audioPlayer.stop).toHaveBeenCalled()
  })
})

describe('DrillScreen: Part5ドリル（text_blank。T-18）', () => {
  it('文法タグ（品詞・動詞の形）が問題ごとに異なっていても、それぞれ tagStats に反映される', async () => {
    const db = newDb()
    const questions = [
      part5Question('p5-1', 'A', 'submit', ['品詞']),
      part5Question('p5-2', 'B', 'attend', ['動詞の形']),
    ]
    const items: SessionItem[] = questions.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, questions)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // p5-1 正解
    fireEvent.click(await screen.findByText('次へ'))
    await answerAndSettle('b', 2) // p5-2 正解

    const posStat = await db.tagStats.get('品詞')
    const verbFormStat = await db.tagStats.get('動詞の形')
    expect(posStat?.windowTotal).toBeGreaterThan(0)
    expect(verbFormStat?.windowTotal).toBeGreaterThan(0)

    // 応答時間（タイマーなし＝音声なしのため即座に記録される）が記録されている
    const logs = await db.attempts.toArray()
    expect(logs.every((a) => typeof a.responseMs === 'number')).toBe(true)
    expect(logs.every((a) => a.isTimeout === false)).toBe(true) // Part5はタイマーなし
  })
})

function audioQaQuestion(id: string, answer: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/dev-audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script: 'When did you submit the report? — I submitted it yesterday.',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'In the meeting room.' },
      { key: 'C', text: 'By email.' },
    ],
    answer,
    explanation: '解説テキスト',
    translation: '和訳テキスト',
  }
}

/** 音声のみモード対応のPart2問題（応答音声が生成済み＝responseOffsetsMs あり。T-154） */
function audioOnlyQuestion(id: string, answer: string): Question {
  const q = audioQaQuestion(id, answer)
  q.audioMeta = {
    accent: 'US',
    tts: false,
    voice: 'dev',
    durationMs: 12000,
    questionEndMs: 2700,
    responseOffsetsMs: [2900, 5300, 7900],
  }
  return q
}

/** 音声のみモードでセッションを開始する（sessionStoreのフラグを立てる） */
async function setupAudioOnlySession(
  db: BebRaidDatabase,
  items: SessionItem[],
  questions: Question[],
) {
  const snapshot = await startSession(db, { items })
  useSessionStore
    .getState()
    .begin(snapshot, questions, { L: 400, R: 400 }, { audioOnlyPart2: true })
  return snapshot
}

// T-154: 本試験のPart2は3応答すべてを音声で流す。従来形式（設問だけ音声・応答はテキスト）は
// リスニングと読解の混成になっていた（docs/14 3.6-3）。ADR 0008でトグル併存と決定
describe('DrillScreen: Part2音声のみモード（ADR 0008・T-154）', () => {
  it('解答前は記号だけを出し、選択肢テキストをDOMに出さない', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    const { container } = render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(container.querySelectorAll('.is-marker-only').length).toBe(3))

    // 記号は見えるがテキストは無い（見えていたらリスニングにならない）
    expect(container.textContent).not.toContain('Yesterday.')
    expect(container.textContent).not.toContain('In the meeting room.')
    // 支援技術には記号を名前として伝える
    expect(screen.getByLabelText('選択肢A')).toBeTruthy()
  })

  it('解答前の再生は打ち切らない（3応答すべてを聞かせる）', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    // questionEndMs による打ち切り（durationMs オプション）を付けない
    await waitFor(() =>
      expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/p2-1.mp3', undefined),
    )
  })

  it('再生中でも解答できる（記号には情報が無いのでリークしない）', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    // 再生完了させないFakeにする（playを解決させない＝playing状態を維持）
    const audioPlayer = new FakeAudioPlayer()
    // オブジェクトに入れて保持する（let + コールバック内代入では TS が null に絞り込む）
    const pending: { resolve?: (outcome: PlaybackOutcome) => void } = {}
    audioPlayer.play.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    // 再生中でも記号ボタンが押せる
    const choice = await screen.findByLabelText('選択肢A')
    fireEvent.click(choice)

    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    // 解答したら残りの応答を流し続けない
    expect(audioPlayer.stop).toHaveBeenCalled()
    // 解答による stop() で打ち切られた再生なので中断として解決する（T-155の契約）
    pending.resolve?.('interrupted')
  })

  it('タイマーは再生終了後6秒から始まり、0で時間切れとして記録される', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    // 再生完了後にタイマーが出る（従来の15秒ではなく6秒）
    await vi.waitFor(() => expect(screen.getByText('残り6秒')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(6000)
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    const logs = await db.attempts.toArray()
    expect(logs[0]!.isTimeout).toBe(true)
  })

  it('解答後はテキストを開示し、応答ごとのリプレイが区間指定で呼ばれる', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    fireEvent.click(await screen.findByLabelText('選択肢A'))
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    // 音声だけでは復習にならないので解答後はテキストを出す
    expect(screen.getByText('Yesterday.')).toBeTruthy()
    fireEvent.click(screen.getByText('B を再生'))
    await waitFor(() =>
      expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/p2-1.mp3', {
        startMs: 5300,
        durationMs: 2600,
      }),
    )
  })

  it('選択肢はkey昇順で表示する（読み上げ順が音声に焼き込まれているためシャッフルしない）', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(container.querySelectorAll('.is-marker-only').length).toBe(3))

    const markers = [...container.querySelectorAll('.choice-button__marker')].map(
      (el) => el.textContent,
    )
    expect(markers).toEqual(['A', 'B', 'C'])
  })

  it('未対応の問題（応答音声なし）が混ざると、その問題だけ従来のテキスト選択肢に落ちる', async () => {
    const db = newDb()
    // 音声のみモードのセッションに従来形式の問題を入れる（プール抽出漏れ・混入時の自衛）
    const q = audioQaQuestion('p2-legacy', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    // 従来どおり questionEndMs 無しで全長再生され、テキスト選択肢が出る
    expect(await screen.findByText('Yesterday.')).toBeTruthy()
    expect(document.querySelectorAll('.is-marker-only').length).toBe(0)
  })

  it('音声エラー時は「音声なしで解答する」ではなく「この問題をスキップ」を出す', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play.mockRejectedValue(new Error('boom'))

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    // 記号だけでは解答できないので「音声なしで解答する」は出さない（永久に進めなくなる）
    expect(await screen.findByText('この問題をスキップ')).toBeTruthy()
    expect(screen.queryByText('音声なしで解答する')).toBeNull()
  })
})

describe('DrillScreen: audio_qa（Part2瞬発。T-17）', () => {
  it('開始タップでunlock→playが呼ばれ、再生後に3択が解答可能になる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    // 再生前は選択肢が出ない
    expect(screen.queryByText('Yesterday.')).toBeNull()

    fireEvent.click(screen.getByText('音声を再生'))
    expect(audioPlayer.unlock).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, undefined)
  })

  it('questionEndMs があれば解答前の再生は質問部までにクリップされる（正答リーク対策）', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    q.audioMeta = { ...q.audioMeta!, questionEndMs: 1800 }
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, { durationMs: 1800 })
  })

  it('解答後の「全体を再生（質問と応答）」で全長再生される（オプション無しのplay）', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    q.audioMeta = { ...q.audioMeta!, questionEndMs: 1800 }
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    fireEvent.click(screen.getByText('Yesterday.'))
    const fullButton = await screen.findByText('全体を再生（質問と応答）')

    audioPlayer.play.mockClear()
    fireEvent.click(fullButton)
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio)
    // 解答保存パイプラインの完走を待ってから終了する（afterEachのdb.deleteと
    // 進行中Dexieトランザクションが競合し、CIでDatabaseClosedErrorになるため）
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
  })

  it('冒頭再生モード（partialAudioMode）では play が durationMs 付きで呼ばれる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    const snapshot = await startSession(db, { items: [{ questionId: q.id, mode: 'solo' }] })
    useSessionStore.getState().begin(snapshot, [q], { L: 400, R: 400 }, { partialAudioMode: true })
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, { durationMs: 2500 })
  })

  it('もう一度再生ボタンで audioPlayer.replay が呼ばれる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('もう一度再生')).toBeTruthy())

    fireEvent.click(screen.getByText('もう一度再生'))
    expect(audioPlayer.replay).toHaveBeenCalledTimes(1)
  })

  it('連続正解でストリークが増え、誤答でリセットされる', async () => {
    const db = newDb()
    const questions = [audioQaQuestion('p2-1', 'A'), audioQaQuestion('p2-2', 'A')]
    await setupSession(
      db,
      questions.map((q) => ({ questionId: q.id, mode: 'solo' })),
      questions,
    )
    const audioPlayer = new FakeAudioPlayer()
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1) // 正解
    expect(screen.getByText('🔥1')).toBeTruthy()

    fireEvent.click(await screen.findByText('次へ'))
    // T-110: 1問目で再生済み（unlock成功）のため、2問目は自動再生されタップ不要になる
    await waitFor(() => expect(screen.getByText('In the meeting room.')).toBeTruthy())
    await answerAndSettle('In the meeting room.', 2) // 誤答（正解はA）
    expect(screen.queryByText('🔥1')).toBeNull() // ストリークがリセットされる
  })

  it('15秒タイマーが0になると自動的にisTimeout誤答として記録され、正誤表示に遷移する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    // setInterval/clearInterval のみをフェイク化する（Dexie/fake-indexeddb が
    // 内部で使う setTimeout・Promise はリアルタイムのまま動かし、デッドロックを避ける）
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    // handlePlayStart 内の await audioPlayer.unlock()/play()（リアルタイムのマイクロタスク）を解決させる
    await vi.waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(15_000)
    // finalizeAnswer の一連（DB書き込み含む）が完了するまで待つ（answerAndSettle と同じ理由）
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    expect(screen.getByText('不正解')).toBeTruthy()
    expect(screen.getByText('時間切れ')).toBeTruthy()
    const logs = await db.attempts.toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]!.isTimeout).toBe(true)
    expect(logs[0]!.isCorrect).toBe(false)
  })

  it('15秒タイマー中に解答すると残り時間に関係なく即確定する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(3000) // タイマーはまだ残っている状態
    fireEvent.click(screen.getByText('Yesterday.'))
    // finalizeAnswer の一連（DB書き込み含む）が完了するまで待つ（answerAndSettle と同じ理由）
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    expect(await db.attempts.count()).toBe(1)
    expect(screen.getByText('正解')).toBeTruthy()
    const logs = await db.attempts.toArray()
    expect(logs[0]!.isTimeout).toBe(false)
  })
})

// 誤タップの取り消し猶予（ADR 0009）。何を防ぐか: 揺れる車内での誤タップが即・不可逆に
// 誤答として記録され、レート・SRS・弱点統計・レイドダメージに残ること。
// attempts は追記専用なので「書く前に遅らせる」以外の取り消し手段は無い
describe('DrillScreen: 誤タップの取り消し猶予（ADR 0009）', () => {
  /** 猶予をONにしたセッション（setupSessionが既定OFFにするため上書きする） */
  async function setupWithUndo(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
    const snapshot = await setupSession(db, items, questions)
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: true })
    return snapshot
  }

  // T-160で意図的に変更した挙動: 猶予中も解説は出す（従来は解説・次へ・途中終了のすべてを
  // 出さず、対象formatの全問に400msの空白待ちが入っていた=docs/27 のS-8）。
  // 取り消しは「記録せずに次の問題へ進む」なので、解説を先に見せても正誤の測定精度は変わらない。
  // 「次へ」と途中終了は据え置き（未確定のまま進む・flushとnavigateの競走を防ぐ）
  it('猶予中は attempts を書かず、解説は出すが「次へ」と途中終了は出さない', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a')) // q-1の正解
    // 視覚フィードバックは即時（テンポを変えない）
    expect(await screen.findByText('取り消し')).toBeTruthy()
    expect(screen.getByText('a').closest('button')?.dataset.state).toBe('correct')
    // 猶予中は記録しない
    expect(await db.attempts.count()).toBe(0)
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(0)
    // T-160: 解説は猶予中も即時に出す（空白待ちを作らない）
    expect(screen.getByText('解説テキスト')).toBeTruthy()
    // 未確定のまま進める導線は出さない
    expect(screen.queryByText('次へ')).toBeNull()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
  })

  it('猶予が過ぎると記録され、解説と「次へ」が出る', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a'))
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    expect(await db.attempts.count()).toBe(1)
    expect(screen.getByText('解説テキスト')).toBeTruthy()
    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.queryByText('取り消し')).toBeNull()
  })

  it('取り消しで記録せず次の問題へ進み、ストリークが戻り通知が出る', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a')) // 正解＝ストリークが1になる
    expect(screen.getByText('🔥1')).toBeTruthy()
    fireEvent.click(await screen.findByText('取り消し'))

    // attemptは作らないが、itemは消化して次の問題へ進む（同じ問題の再解答は許さない:
    // 正解が既に見えているため isCorrect が偽陽性になる）
    await waitFor(() => expect(screen.getByTestId('drill-undo-notice')).toBeTruthy())
    expect(await db.attempts.count()).toBe(0)
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1)
    expect(screen.getByText(/attend/)).toBeTruthy()
    // 即時に進めたストリークは戻す
    expect(screen.queryByText('🔥1')).toBeNull()
  })

  it('最終問での取り消しでリザルトへ遷移し、attemptIds に余分なIDが入らない', async () => {
    const db = newDb()
    const q = QUESTIONS[0]!
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a'))
    fireEvent.click(await screen.findByText('取り消し'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    expect(await db.attempts.count()).toBe(0)
    expect(useSessionStore.getState().snapshot?.attemptIds).toEqual([])
  })

  it('当て勘判定はタップ時刻基準（猶予分の400msが乗って判定が変わらない）', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 即タップの誤答＝当て勘（GUESS_THRESHOLD_MS=2000）。commit時刻で responseMs を
    // 計算していると猶予分が乗り、閾値付近で判定が変わる
    fireEvent.click(await screen.findByText('b')) // q-1の正解はA
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    const logs = await db.attempts.toArray()
    expect(logs[0]!.isGuess).toBe(true)
    expect(logs[0]!.responseMs).toBeLessThan(2000)
  })

  it('audio_qa の時間切れは猶予なしで即記録する（タイマー切れの抜け道にしない）', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(15_000)
    await vi.waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    // 時間切れは猶予を挟まないので取り消しボタンは出ず、二重記録もしない
    expect(screen.queryByText('取り消し')).toBeNull()
    expect(await db.attempts.count()).toBe(1)
    expect(screen.getByText('時間切れ')).toBeTruthy()
  })

  it('猶予中にアンマウントすると記録される（解答は実際に行われたため捨てない）', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    const view = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a'))
    // 猶予中であることの確認はDOMだけで行う。ここで await db.attempts.count() を挟むと
    // DB往復の間に400msの猶予が経過し、「まだ書いていない」という前提自体が崩れて
    // 並列実行時にflushではなくタイマー確定を検証してしまう（猶予中に書かないことは
    // 「猶予中は attempts を書かず…」のテストが担保する）
    expect(await screen.findByText('取り消し')).toBeTruthy()

    view.unmount()

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1)
  })

  // 何を防ぐか: アンマウント時のflushはクリーンアップ関数から commitAnswer を呼ぶが、その関数は
  // effectを登録したレンダー（=初回）のクロージャなので、question/item/snapshot をクロージャから
  // 読むと「2問目の解答を1問目のIDで記録しようとして保存が失敗し、解答が失われる」。
  // 1問目で離脱するテストだけでは差が出ないため、2問目で離脱して questionId を確認する
  it('2問目の猶予中にアンマウントしても、2問目のIDで正しく記録される', async () => {
    const db = newDb()
    await setupWithUndo(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    const view = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 1問目を確定させてから2問目へ進む
    fireEvent.click(await screen.findByText('a'))
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    fireEvent.click(await screen.findByText('次へ'))

    // 2問目（q-2。正解はB）を猶予中のまま離脱する
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    fireEvent.click(screen.getByText('b'))
    expect(await screen.findByText('取り消し')).toBeTruthy()
    view.unmount()

    await waitFor(async () => expect(await db.attempts.count()).toBe(2))
    const logs = (await db.attempts.toArray()).sort((x, y) => x.answeredAt - y.answeredAt)
    expect(logs.map((l) => l.questionId)).toEqual(['q-1', 'q-2'])
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(2)
  })

  it('設定OFFなら従来どおり即記録する（回帰）', async () => {
    const db = newDb()
    // setupSession が OFF にするのでそのまま使う
    await setupSession(
      db,
      QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' })),
      QUESTIONS,
    )
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('a'))
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    expect(screen.queryByText('取り消し')).toBeNull()
    expect(screen.getByText('解説テキスト')).toBeTruthy()
  })

  // vocab_card の猶予の起点は**自己評価タップ**（T-160）。4択タップの時点ではまだ
  // 書き込みではないため、ここで取り消しを出す必要はない
  it('vocab_card の4択タップでは猶予に入らない（記録は自己評価タップ時）', async () => {
    const db = newDb()
    await seedVocabSrsCard(db)
    const q = vocabCardQuestion('submit')
    await setupWithUndo(db, [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }], [q])
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    // 自己評価3段階が出て、取り消しは出ない
    expect(screen.getByText('OK')).toBeTruthy()
    expect(screen.queryByText('取り消し')).toBeNull()
  })
})

/** vocab_card の猶予テスト用に、期限到来のSRSカードを1件仕込む */
async function seedVocabSrsCard(db: BebRaidDatabase) {
  await db.srsCards.put({
    id: 'vocab:submit',
    refType: 'vocab',
    refId: 'submit',
    stage: 0,
    dueAt: Date.now() - 1000,
    lapses: 0,
    introducedDate: '2026-07-01',
    graduatedAt: null,
    sourceQuestionId: null,
  })
}

describe('DrillScreen: 語彙カード自己評価の取り消し猶予（T-160。docs/27 のS-5）', () => {
  async function setupVocab(db: BebRaidDatabase) {
    await seedVocabSrsCard(db)
    const q = vocabCardQuestion('submit')
    await setupSession(db, [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }], [q])
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: true })
  }

  // 何を防ぐか: フレーズや正解を読む前に評価ボタンを押すと即カードが消え、戻る手段が
  // なかったこと（操作ゾーンに評価3段階＋フレーズ再生＋わからないが縦積みで誤タップしやすい）
  it('自己評価タップで猶予に入り、記録もカード送りもまだ起きない', async () => {
    const db = newDb()
    await setupVocab(db)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    fireEvent.click(screen.getByText('OK'))

    expect(await screen.findByText('取り消し')).toBeTruthy()
    // 猶予中は評価ボタンを引っ込める（二重評価を防ぐ）
    expect(screen.queryByText('OK')).toBeNull()
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(0)
    expect(await db.attempts.count()).toBe(0)
    // SRSの間隔もまだ動かさない
    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(0)
  })

  it('猶予が過ぎると記録され、SRSの間隔が動く', async () => {
    const db = newDb()
    await setupVocab(db)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    fireEvent.click(screen.getByText('OK'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(1) // stage0→OK(+1)
  })

  it('取り消すと記録せずSRSも動かさないまま、次へ進む', async () => {
    const db = newDb()
    await setupVocab(db)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    fireEvent.click(screen.getByText('OK'))
    fireEvent.click(await screen.findByText('取り消し'))

    // 1問セッションなのでリザルトへ抜ける（itemは消化するが記録は作らない）
    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    expect(await db.attempts.count()).toBe(0)
    expect((await db.srsCards.get('vocab:submit'))?.stage).toBe(0)
  })

  it('猶予中にアンマウントされると記録される（解答は実際に行われたため捨てない）', async () => {
    const db = newDb()
    await setupVocab(db)
    const view = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    fireEvent.click(screen.getByText('OK'))
    // DB往復を挟まない（挟むと400msが経過してflushではなくタイマー確定を検証してしまう）
    expect(await screen.findByText('取り消し')).toBeTruthy()

    view.unmount()

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
  })

  it('設定OFFなら従来どおり即記録して次へ進む（回帰）', async () => {
    const db = newDb()
    await seedVocabSrsCard(db)
    const q = vocabCardQuestion('submit')
    // setupSession が猶予設定をOFFにする
    await setupSession(db, [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }], [q])
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    fireEvent.click(await screen.findByText('submit の意味'))
    fireEvent.click(screen.getByText('OK'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    expect(screen.queryByText('取り消し')).toBeNull()
  })
})

describe('DrillScreen: リスニングの自動再生（T-110）', () => {
  it('2問目以降は自動再生される（「音声を再生」の再タップ不要）', async () => {
    const db = newDb()
    const questions = [audioQaQuestion('p2-1', 'A'), audioQaQuestion('p2-2', 'A')]
    await setupSession(
      db,
      questions.map((q) => ({ questionId: q.id, mode: 'solo' })),
      questions,
    )
    const audioPlayer = new FakeAudioPlayer()
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1)

    fireEvent.click(await screen.findByText('次へ'))

    // 2問目は自動再生され、「音声を再生」ボタンをタップしなくても選択肢が表示される
    await waitFor(() => expect(screen.getByText('In the meeting room.')).toBeTruthy())
    expect(audioPlayer.play).toHaveBeenCalledTimes(2)
  })

  // T-166（J-93。docs/27 のS-14）: 自動再生は既定ONのままopt-outできる。従来は準備の間も
  // 停止手段も無く、設定でOFFにもできなかった
  it('autoPlayEnabled=false なら2問目以降も自動再生しない（タップ開始UIに戻る）', async () => {
    const db = newDb()
    const questions = [audioQaQuestion('p2-1', 'A'), audioQaQuestion('p2-2', 'A')]
    await setupSession(
      db,
      questions.map((q) => ({ questionId: q.id, mode: 'solo' })),
      questions,
    )
    await db.settings.put({ key: AUTO_PLAY_ENABLED_KEY, value: false })
    const audioPlayer = new FakeAudioPlayer()
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(await screen.findByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1)
    fireEvent.click(await screen.findByText('次へ'))

    // 2問目はタップ開始UIのまま（自動再生されない）
    await waitFor(() => expect(screen.getByText('音声を再生')).toBeTruthy())
    expect(audioPlayer.play).toHaveBeenCalledTimes(1)
  })

  it('再生中は停止ボタンが出て、押すと再生が止まり解答へ進める', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    const pending: { resolve?: (outcome: PlaybackOutcome) => void } = {}
    audioPlayer.play.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    const stopButton = await screen.findByText('停止')
    fireEvent.click(stopButton)
    expect(audioPlayer.stop).toHaveBeenCalled()

    await act(async () => {
      pending.resolve?.('interrupted')
      await Promise.resolve()
    })
    // 停止後は解答できる（音声ゲートを抜ける）
    expect(await screen.findByText('Yesterday.')).toBeTruthy()
    // 中断なのでタイマーは開始しない（T-158の判定に乗る）
    expect(document.querySelector('.drill-timer')).toBeNull()
  })

  it('自動再生が拒否された場合は、その問題からタップ開始UIへフォールバックする', async () => {
    const db = newDb()
    const questions = [audioQaQuestion('p2-1', 'A'), audioQaQuestion('p2-2', 'A')]
    await setupSession(
      db,
      questions.map((q) => ({ questionId: q.id, mode: 'solo' })),
      questions,
    )
    const audioPlayer = new FakeAudioPlayer()
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1)

    // 2問目の自動再生だけ失敗させる
    audioPlayer.play.mockRejectedValueOnce(new Error('boom'))
    fireEvent.click(await screen.findByText('次へ'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    expect(screen.getByText('もう一度試す')).toBeTruthy()

    fireEvent.click(screen.getByText('もう一度試す'))
    await waitFor(() => expect(screen.getByText('In the meeting room.')).toBeTruthy())
  })
})

describe('DrillScreen: 音声再生失敗リカバリ（T-70）', () => {
  it('audio_qa: 再生失敗でボタンが「もう一度試す」に変わり、再試行すると再生が復帰する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play.mockRejectedValueOnce(new Error('boom')).mockResolvedValue('ended')

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    expect(screen.getByText('もう一度試す')).toBeTruthy()

    fireEvent.click(screen.getByText('もう一度試す'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    expect(screen.queryByText('音声を再生できませんでした')).toBeNull()
  })

  it('audio_qa: 「音声なしで解答する」でタイマーを起動せず選択肢が解放され、解答できる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play.mockRejectedValue(new Error('boom'))

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await screen.findByText('音声なしで解答する')

    fireEvent.click(screen.getByText('音声なしで解答する'))
    expect(screen.getByText('Yesterday.')).toBeTruthy()
    // 15秒タイマーは開始していない（表示自体が出ない）
    expect(screen.queryByText('15')).toBeNull()

    await answerAndSettle('Yesterday.', 1)
    expect(screen.getByText('正解')).toBeTruthy()
  })

  it('audio_set: unlock失敗でidleへ戻り、再試行できる', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-1')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.unlock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined)

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('もう一度試す'))

    await waitFor(() => expect(screen.getByText('もう再生する')).toBeTruthy())
  })
})

describe('DrillScreen: 解答保存失敗リカバリ（T-76。J-35のpipeline失敗伝播＋UI側の再同期）', () => {
  it('recordAnswerPipeline失敗時にエラーバナーが出て、DBの実状態に再同期し次の解答を継続できる', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 画面が持つsnapshot(answeredCount=0)を裏でstaleにする（複数タブ・二重解答と同じ状況を模擬）。
    // answerCurrentQuestion内部の「スナップショットが古い」検知を経由してpipelineが失敗する
    await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })

    fireEvent.click(screen.getByText('b')) // q-1（正解はA）に解答を試みる

    // T-207（Q-41）: 保存先はローカルのIndexedDBで通信は無関係。「通信状態」への言及は
    // 圏外利用者に誤った原因究明をさせるため外す（空き容量への言及は残す）
    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()

    // 再同期後、DB上で既に解答済みの1問目はスキップされ、2問目（attend）が表示される
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    // 誤って重複記録されていない（DB経由の1件のみ）
    expect(await db.attempts.count()).toBe(1)
  })
})

function vocabCardQuestion(word: string, phraseAudio?: string): Question {
  return {
    id: `vocab-${word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: word,
    phrase: `Please ${word} it.`,
    phraseAudio,
    back: `${word} の意味`,
    freqRank: 'S',
    levelBand: 730,
  }
}

describe('DrillScreen: vocab_card混在（T-21。クイックパックにkind=srsVocabが含まれる場合）', () => {
  it('4択で正解を選び自己評価で、正誤確認のポーズなしに即座に次へ進む', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    // 2026-07-29: 解答前は単語のみ（フレーズは解答後に開示する）
    expect(screen.getByText('この単語の意味は？')).toBeTruthy()
    expect(screen.queryByText(phraseMatcher('Please submit it.'))).toBeNull()

    fireEvent.click(screen.getByText('submit の意味'))
    expect(screen.getByText(phraseMatcher('Please submit it.'))).toBeTruthy()

    fireEvent.click(screen.getByText('OK'))
    // 「正解」表示や「次へ」ボタンを経由せず、1件しかないので即リザルトへ遷移する
    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    expect(screen.queryByText('正解')).toBeNull()

    const card = await db.srsCards.get('vocab:submit')
    expect(card?.stage).toBe(1) // good: stage0→1
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.mode).toBe('srs')
    expect(attempt.isCorrect).toBe(true)
  })

  // T-210(Q-39・J-107): 頻出度ランク・SRS間隔（もう一回/OK/余裕）の意味はtitle属性のみ
  // （hover専用）で提供されており、タッチ端末では説明に到達できなかった
  it('T-210: 頻出度ランクの意味をタップで確認できる（titleはhoverでしか読めないため）', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    // 説明は既定で閉じている
    expect(screen.queryByText(/頻出度ランク（Sが最も頻出/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '頻出度ランク Sの説明を表示' }))
    expect(screen.getByText(/頻出度ランク（Sが最も頻出/)).toBeTruthy()
  })

  it('T-210: SRS間隔（もう一回/OK/余裕）の意味をタップで確認できる（titleはhoverでしか読めないため）', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('submit の意味'))
    expect(screen.getByText('もう一回')).toBeTruthy()

    // 説明は既定で閉じている
    expect(screen.queryByText(/間隔を短くしてすぐに復習／OK＝通常の間隔で復習/)).toBeNull()
    fireEvent.click(screen.getByText('間隔について'))
    expect(
      screen.getByText(
        /間隔を短くしてすぐに復習／OK＝通常の間隔で復習／余裕＝間隔を大きく広げて復習/,
      ),
    ).toBeTruthy()
  })

  it('解答前はフレーズがDOMに存在しない（文脈からの推測を防ぐ。2026-07-29）', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    expect(container.querySelector('.vocab-card__word')?.textContent).toBe('submit')
    expect(container.querySelector('.vocab-card__phrase')).toBeNull()
    expect(container.textContent).not.toContain('Please submit it.')

    // 「わからない」でもフレーズは開示される
    fireEvent.click(screen.getByText('わからない'))
    expect(screen.getByText(phraseMatcher('Please submit it.'))).toBeTruthy()
  })

  it('phraseAudioがあれば解答後にフレーズ音声が自動再生される（金フレ型体験。解答前は鳴らさない）', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit', '/dev-audio/submit.mp3')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    // 解答前に鳴らすと音声から意味を推測できる（VocabScreenと同一仕様）
    expect(audioPlayer.play).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('submit の意味'))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/submit.mp3'))
  })

  it('イヤホンなしモードがONなら解答後もフレーズ音声は自動再生されない', async () => {
    const db = newDb()
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: true })
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit', '/dev-audio/submit.mp3')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('submit の意味'))
    await waitFor(() => expect(screen.getByText(phraseMatcher('Please submit it.'))).toBeTruthy())

    expect(audioPlayer.play).not.toHaveBeenCalled()
  })

  it('4択で不正解を選ぶとattemptsにisCorrect=falseで記録される（グレードは自己申告のまま独立）', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:attend',
      refType: 'vocab',
      refId: 'attend',
      stage: 2,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('attend')
    // decoyを混ぜて不正解の選択肢を用意する
    const decoy = vocabCardQuestion('decoy')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:attend' }]
    await setupSession(db, items, [q, decoy])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('decoy の意味')) // わざと不正解を選ぶ
    fireEvent.click(screen.getByText('もう一回'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    const card = await db.srsCards.get('vocab:attend')
    expect(card?.stage).toBe(0) // もう一回はstage0へリセット
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(false)
  })

  it('「わからない」で正解提示→次へでisCorrect=false・SRSはagain（stage0）で記録される', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:attend',
      refType: 'vocab',
      refId: 'attend',
      stage: 2,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('attend')
    const decoy = vocabCardQuestion('decoy')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:attend' }]
    await setupSession(db, items, [q, decoy])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('わからない'))
    // 正解（attend の意味）がcorrect表示
    await waitFor(() =>
      expect(screen.getByText('attend の意味').closest('button')?.dataset.state).toBe('correct'),
    )
    expect(screen.queryByText('OK')).toBeNull()
    fireEvent.click(await screen.findByText('次へ'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(false)
    expect((await db.srsCards.get('vocab:attend'))?.stage).toBe(0)
  })

  it('T-76: 自己評価時の解答保存失敗もエラーバナーが出て、DBの実状態に再同期する', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const q2 = part5Question('q-2', 'A', 'attend')
    const items: SessionItem[] = [
      { questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' },
      { questionId: q2.id, mode: 'solo' },
    ]
    const snapshot = await setupSession(db, items, [q, q2])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    expect(screen.getByText('この単語の意味は？')).toBeTruthy()
    fireEvent.click(screen.getByText('submit の意味'))
    expect(screen.getByText(phraseMatcher('Please submit it.'))).toBeTruthy()

    // 画面が持つsnapshot(answeredCount=0)を裏でstaleにする
    await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })

    fireEvent.click(screen.getByText('OK'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // 再同期後、DB上で既に解答済みの1問目はスキップされ、2問目（attend）が表示される
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    expect(await db.attempts.count()).toBe(1)
  })

  it('vocab_cardとドリル問題が混在するセッションを最後まで進行できる', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:negotiate',
      refType: 'vocab',
      refId: 'negotiate',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const vocabQ = vocabCardQuestion('negotiate')
    const drillQ = part5Question('p5-mix', 'A', 'submit')
    const items: SessionItem[] = [
      { questionId: vocabQ.id, mode: 'srs', srsCardId: 'vocab:negotiate' },
      { questionId: drillQ.id, mode: 'solo' },
    ]
    await setupSession(db, items, [vocabQ, drillQ])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('negotiate の意味'))
    fireEvent.click(screen.getByText('OK'))

    // ドリル問題（p5-mix）に進む
    await waitFor(() => expect(screen.getByText(/submit/)).toBeTruthy())
    await answerAndSettle('a', 2)
    fireEvent.click(await screen.findByText('次へ'))

    expect(useAppStore.getState().screen).toBe('result')
    expect(await db.attempts.count()).toBe(2)
  })
})

function dictationQuestion(
  id: string,
  script: string,
  blanks: { index: number; answer: string }[],
): Question {
  return {
    id,
    part: 2,
    format: 'dictation',
    difficulty: 2,
    tags: ['弱形・連結'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 3000 },
    script,
    blanks,
    explanation: 'ディクテーション解説',
    translation: '和訳テキスト',
  }
}

describe('DrillScreen: dictation（M2・T-47）', () => {
  it('音声を再生→再生→ワードバンクで穴埋め→確定→正誤・解説表示の一連が通る', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-1', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    fireEvent.click(screen.getByText('音声を再生'))
    expect(audioPlayer.unlock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())

    fireEvent.click(screen.getByText('submit'))
    fireEvent.click(screen.getByText('確定'))

    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    expect(screen.getByText('正解')).toBeTruthy()
    expect(screen.getByText('ディクテーション解説')).toBeTruthy()
    expect((await db.attempts.toArray())[0]?.isCorrect).toBe(true)
  })

  it('不正解の語を選んで確定すると不正解表示になり、keyVocabがSRSに追加される', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-2', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('やり直す')).toBeTruthy())

    // ワードバンクの中から不正解の語（submit以外）をタップする
    const bankButtons = screen
      .getAllByRole('button')
      .filter((b) => b.parentElement?.className === 'dictation-word-bank')
    fireEvent.click(bankButtons.find((b) => b.textContent !== 'submit')!)
    fireEvent.click(screen.getByText('確定'))

    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    expect(screen.getByText('不正解')).toBeTruthy()
    expect(await db.srsCards.get('vocab:submit')).toBeDefined()
  })

  it('レート更新の対象外（ratings.answerCountが増えない=J-29）で、tagStatsは更新される', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-3', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())
    fireEvent.click(screen.getByText('submit'))
    fireEvent.click(screen.getByText('確定'))

    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))
    expect(screen.getByText('正解')).toBeTruthy()
    expect(await db.ratings.get('L')).toBeUndefined()
    expect(await db.ratings.get('R')).toBeUndefined()
    const tagStat = await db.tagStats.get('弱形・連結')
    expect(tagStat?.windowTotal).toBe(1)
  })

  it('「やり直す」で穴の記入をリセットできる', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-4', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())

    fireEvent.click(screen.getByText('submit'))
    expect(screen.queryByText('確定')).toBeTruthy()

    fireEvent.click(screen.getByText('やり直す'))
    expect(screen.queryByText('確定')).toBeNull()
  })

  it('「やり直す」ボタンがタップ領域44px以上を確保するクラスを持つ（T-116(5)）', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-tapzone', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())

    // .dictation-reset は --tap-min(48px)のmin-heightを持つクラス（jsdomは実レイアウトを
    // 計算しないため、タップ目標を保証するクラスの付与を構造面で確認する）
    expect(screen.getByText('やり直す').className).toContain('dictation-reset')
  })

  it('0.85x/等倍の速度チップを選んでから開始できる（再生自体はT-45まで等倍のまま=予約のみ）', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-5', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('0.85x'))
    fireEvent.click(screen.getByText('音声を再生'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
    expect(audioPlayer.play).toHaveBeenCalledWith(q.audio, { rate: 0.85 })
  })

  it('T-76: 確定時の解答保存失敗もエラーバナーが出て、DBの実状態に再同期する', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-fail', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    const q2 = part5Question('q-2', 'A', 'attend')
    const items: SessionItem[] = [
      { questionId: q.id, mode: 'solo' },
      { questionId: q2.id, mode: 'solo' },
    ]
    const snapshot = await setupSession(db, items, [q, q2])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())
    fireEvent.click(screen.getByText('submit'))

    // 画面が持つsnapshot(answeredCount=0)を裏でstaleにする
    await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })

    fireEvent.click(screen.getByText('確定'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // 再同期後、DB上で既に解答済みの1問目はスキップされ、2問目（attend）が表示される
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    expect(await db.attempts.count()).toBe(1)
  })
})

function audioSetQuestion(id: string, subCount = 3): Question {
  return {
    id,
    part: 3,
    format: 'audio_set',
    difficulty: 2,
    tags: ['意図推定'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: `/audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: false, voice: 'dev', durationMs: 6000 },
    script: 'A conversation about submitting a report.',
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `設問${i}`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: `設問${i}の解説`,
      translation: `設問${i}の和訳`,
    })),
  }
}

describe('DrillScreen: audio_set（M2・T-49）', () => {
  /** 音声を再生→先読みフェーズ→「もう再生する」で早期に再生フェーズへ進める共通操作 */
  async function startAndSkipPreReading() {
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('もう再生する')).toBeTruthy())
    fireEvent.click(screen.getByText('もう再生する'))
    await waitFor(() => expect(screen.queryByText('もう再生する')).toBeNull())
  }

  it('1セット3問の順次解答がattemptsにサブ設問IDで3件記録される', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-1')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText(`設問${i}の解説`)).toBeTruthy())
      fireEvent.click(await screen.findByText(i < 2 ? '次の設問へ' : '次へ'))
      if (i < 2) {
        await waitFor(() => expect(screen.getByText(`設問${i + 1}`)).toBeTruthy())
      }
    }

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(3)
    expect(attempts.map((a) => a.questionId).sort()).toEqual(['set-1-q0', 'set-1-q1', 'set-1-q2'])
    expect(attempts.every((a) => a.isCorrect)).toBe(true)
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: セットの途中で中断すると解答済みのサブ設問が
  // 再開後に再出題され、attempt・レート・タグ統計が重複すること。あわせてサブ設問の
  // attemptがsnapshot.attemptIdsに積まれ、リザルトの全体集計（T-109）に入ること
  it('セット途中で中断しても解答済みサブ設問は再出題されず、attemptIdsに積まれる', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-resume')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // 1回目: 3問中2問だけ解答して離脱する
    const first = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText(`設問${i}の解説`)).toBeTruthy())
      fireEvent.click(await screen.findByText('次の設問へ'))
    }
    await waitFor(async () => expect(await db.attempts.count()).toBe(2))
    first.unmount()

    // 2回目: DBのスナップショットから復元して再開する（アプリ再起動の模擬）
    const resumed = await resumeSession(db)
    expect(resumed!.answeredCount).toBe(0) // 親itemはまだ進んでいない
    expect(resumed!.attemptIds).toHaveLength(2)
    useSessionStore.getState().begin(resumed!, [q], { L: 400, R: 400 })

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await startAndSkipPreReading()

    // 未解答の3問目から始まる（設問0・1へ戻らない）
    await waitFor(() => expect(screen.getByText('設問2')).toBeTruthy())
    fireEvent.click(screen.getByText('a'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(3))
    const attempts = await db.attempts.toArray()
    expect(attempts.map((a) => a.questionId).sort()).toEqual([
      'set-resume-q0',
      'set-resume-q1',
      'set-resume-q2',
    ])
  })

  it('2/3問正解（セット正解）でも1/3問正解（セット不正解）でも解説・進行は壊れない', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-2')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())

    // 設問0: 誤答(b) → 設問1: 正解(a) → 設問2: 正解(a)
    fireEvent.click(screen.getByText('b'))
    await waitFor(() => expect(screen.getByText('不正解')).toBeTruthy())
    fireEvent.click(await screen.findByText('次の設問へ'))
    await waitFor(() => expect(screen.getByText('設問1')).toBeTruthy())

    fireEvent.click(screen.getByText('a'))
    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    fireEvent.click(await screen.findByText('次の設問へ'))
    await waitFor(() => expect(screen.getByText('設問2')).toBeTruthy())

    fireEvent.click(screen.getByText('a'))
    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    fireEvent.click(await screen.findByText('次へ'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(3)
    expect(attempts.filter((a) => a.isCorrect)).toHaveLength(2) // 2/3正解=セット正解
  })

  it('誤答した設問のkeyVocabがSRSに追加される（既存結線の回帰）', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-3', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())
    fireEvent.click(screen.getByText('b')) // 誤答

    await waitFor(() => expect(screen.getByText('不正解')).toBeTruthy())
    await waitFor(async () => expect(await db.srsCards.get('vocab:submit')).toBeDefined())
    // レート更新まで完全に完了するのを待ってからテストを終える（afterEachのdb.deleteとの競合防止）
    await waitFor(async () => expect(await db.ratings.get('L')).toBeDefined())
  })

  it('タグ統計・レートが選択式問題として通常どおり更新される', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-4', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())
    fireEvent.click(screen.getByText('a')) // 正解

    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    await waitFor(async () => {
      const tagStat = await db.tagStats.get('意図推定')
      expect(tagStat?.windowTotal).toBeGreaterThan(0)
    })
    const rating = await db.ratings.get('L') // part3はLセクション
    expect(rating).toBeDefined()
  })

  it('T-76: サブ設問の解答保存失敗時もエラーバナーが出て、同じ設問のまま再試行できる（snapshot再同期の対象外）', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-fail')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    await startAndSkipPreReading()
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())

    db.close() // recordAttempt（DB書き込み）を強制的に失敗させる

    fireEvent.click(screen.getByText('a'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // サブ設問はsnapshot経由でないため進行せず、同じ設問のまま（選択肢もまだ見える）
    expect(screen.getByText('設問0')).toBeTruthy()
    expect(screen.getByText('a')).toBeTruthy()

    await db.open() // afterEachのdb.delete()が失敗しないよう復旧する
  })
})

describe('DrillScreen: 先読みトレーナー（M2・T-50）', () => {
  it('音声を再生後は先読みフェーズになり、選択肢は選べない', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-5', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())
    expect(screen.getByText('もう再生する')).toBeTruthy()
    // 先読み中は音声再生されない（choicesが無効化されている）
    expect(audioPlayer.play).not.toHaveBeenCalled()
    expect(screen.getByText('a').closest('button')).toHaveProperty('disabled', true)
  })

  it('「もう再生する」タップで早期に再生フェーズへ進める', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-6', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('もう再生する')).toBeTruthy())

    fireEvent.click(screen.getByText('もう再生する'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith(q.audio))
    await waitFor(() =>
      expect(screen.getByText('a').closest('button')).toHaveProperty('disabled', false),
    )
  })

  it('先読みタイマーが0になると自動的に再生フェーズへ進む', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-7', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('もう再生する')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(15_000)
    // 最後のtickでのplay呼び出し（非同期チェーン）が確定するまでもう一段flushする
    await vi.advanceTimersByTimeAsync(0)

    await vi.waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith(q.audio))
  })

  it('再生フェーズ中は一時停止・巻き戻しの操作UIが出ない', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-8', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    // playが解決しないPromiseを返すフェイクにして「再生中」状態を観測する
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play = vi.fn(() => new Promise(() => {}))

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('もう再生する')).toBeTruthy())
    fireEvent.click(screen.getByText('もう再生する'))

    await waitFor(() => expect(screen.getAllByText('再生中…').length).toBeGreaterThan(0))
    expect(screen.queryByText('もう一度再生')).toBeNull()
    expect(screen.queryByText('もう再生する')).toBeNull()
  })
})

describe('DrillScreen: 選択肢ランタイムシャッフル（T-79。J-36）', () => {
  it('決定的なrng注入で、選択肢の表示順が元の並び（A/B/C/D）と変わりうる', async () => {
    const db = newDb()
    const q = part5Question('q-shuffle', 'A', 'submit')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    try {
      const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      // .choice-button__label はDOM出現順で並ぶため、そのまま表示順として検証できる
      const order = [...container.querySelectorAll('.choice-button__label')].map(
        (el) => el.textContent,
      )
      // rngが常に0を返すFisher-Yatesでは [a,b,c,d] → [b,c,d,a] になる（shuffle.test.tsで検証済みの手順）
      expect(order).toEqual(['b', 'c', 'd', 'a'])
    } finally {
      randomSpy.mockRestore()
    }
  })

  it('表示順が変わっても正誤判定はchoice.key基準のまま（シャッフル後も正解選択で正解表示になる）', async () => {
    const db = newDb()
    const q = part5Question('q-shuffle-2', 'A', 'submit')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    try {
      render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      // シャッフル後の表示順は b,c,d,a だが、正解キーAに対応するテキスト'a'を選べば正解になる
      await answerAndSettle('a', 1)
      expect(screen.getByText('正解')).toBeTruthy()
    } finally {
      randomSpy.mockRestore()
    }
  })
})

function shadowingFormatQuestion(id: string): Question {
  return {
    id,
    part: 3,
    format: 'shadowing',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    audio: `/audio/${id}.mp3`,
    audioMeta: { accent: 'US', tts: true, voice: 'dev', durationMs: 2000 },
    script: 'Stop now. Go please.',
    timing: [0, 300, 700, 1100],
  }
}

describe('DrillScreen: 描画分岐の無いformatのスキップと脱出導線（レビュー修正E1/E2/E3）', () => {
  // 何を防ぐか: shadowing形式（描画分岐なし）がセッションに混入すると問題文もボタンも出ない
  // 空白になり、中断→再開しても同位置で詰まる（実機のデイリークエストで再現済み）
  it('E1: shadowing形式のitemはattemptを記録せずスキップされ、次の問題が表示される', async () => {
    const db = newDb()
    const shadowQ = shadowingFormatQuestion('shadow-p3-02')
    const items: SessionItem[] = [
      { questionId: shadowQ.id, mode: 'solo' },
      { questionId: 'q-2', mode: 'solo' },
    ]
    await setupSession(db, items, [shadowQ, QUESTIONS[1]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 空白で固まらず、2問目（attend）へ自動的に進む
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1)
    expect(await db.attempts.count()).toBe(0) // スキップはattemptを記録しない
    // T-108: 非モーダル通知が出て、セッションストアのskippedCountが増える
    expect(screen.getByTestId('drill-skip-notice')).toBeTruthy()
    // T-177で件数入りの文言になった（4秒で消さず累計を出し続ける）
    expect(screen.getByText('表示できない問題を1件スキップしました')).toBeTruthy()
    expect(useSessionStore.getState().skippedCount).toBe(1)
  })

  // 何を防ぐか: スキップのadvanceSession失敗が握りつぶされると、renderがnullのまま固定され
  // 「中断ボタンすら無い白画面」で固まる（effect依存が変わらず再試行もされない）
  it('E2: スキップ処理が失敗した場合はエラーと「ホームへ戻る」を表示し、白画面で固まらない', async () => {
    const db = newDb()
    const items: SessionItem[] = [
      { questionId: 'missing-q', mode: 'solo' }, // questionsに無いID→スキップ経路に入る
      { questionId: 'q-2', mode: 'solo' },
    ]
    const snapshot = await setupSession(db, items, [QUESTIONS[1]!])
    // 裏でDB上のスナップショットだけ進めてstaleにし、スキップのadvanceSessionを失敗させる
    await advanceSession(db, snapshot)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    expect(await screen.findByText('セッションを進められませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('ホームへ戻る'))
    expect(useAppStore.getState().screen).toBe('home')
  })

  // 何を防ぐか: dictationは音声なしでは解答が成立せず、音声404等が続くとそのitemを突破できず
  // セッション完了不能（中断→新規セッションで進捗破棄しか無い）になる
  it('E3: dictationで音声再生に失敗し続けても「この問題をスキップ」で次へ進める（attemptは記録しない）', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-skip', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    const items: SessionItem[] = [
      { questionId: q.id, mode: 'solo' },
      { questionId: 'q-2', mode: 'solo' },
    ]
    await setupSession(db, items, [q, QUESTIONS[1]!])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.play.mockRejectedValue(new Error('404'))

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('この問題をスキップ'))

    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    expect(await db.attempts.count()).toBe(0)
  })

  it('E3: audio_setでも音声準備（unlock）に失敗したら「この問題をスキップ」で次へ進める', async () => {
    const db = newDb()
    const q = audioSetQuestion('set-skip')
    const items: SessionItem[] = [
      { questionId: q.id, mode: 'solo' },
      { questionId: 'q-2', mode: 'solo' },
    ]
    await setupSession(db, items, [q, QUESTIONS[1]!])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.unlock.mockRejectedValue(new Error('boom'))

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    expect(await screen.findByText('音声を再生できませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('この問題をスキップ'))

    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    expect(await db.attempts.count()).toBe(0)
  })
})

describe('DrillScreen: レイド挑戦セッションのヘッダ（T-116(10)）', () => {
  it('item.mode="raid"のとき、出題理由の代わりに「レイド」ヘッダが表示される', async () => {
    const db = newDb()
    const items: SessionItem[] = [{ questionId: 'q-1', mode: 'raid' }]
    await setupSession(db, items, [QUESTIONS[0]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    expect(await screen.findByTestId('drill-raid-header')).toBeTruthy()
    expect(screen.getByTestId('drill-raid-header').textContent).toBe('レイド')
    expect(screen.queryByText('今日のドリル')).toBeNull()
  })

  it('item.mode="solo"（通常ドリル）では従来どおり出題理由が表示される（回帰確認）', async () => {
    const db = newDb()
    const items: SessionItem[] = [
      { questionId: 'q-1', mode: 'solo', reason: { type: 'allocation' } },
    ]
    await setupSession(db, items, [QUESTIONS[0]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    expect(await screen.findByText('今日のドリル')).toBeTruthy()
    expect(screen.queryByTestId('drill-raid-header')).toBeNull()
  })
})

describe('DrillScreen: パート名の英字タグ（docs/20 3.4節S2）', () => {
  it('question.partからPART Nタグを表示する（出題理由の表示内容は変えない）', async () => {
    const db = newDb()
    const items: SessionItem[] = [
      { questionId: 'q-1', mode: 'solo', reason: { type: 'allocation' } },
    ]
    await setupSession(db, items, [QUESTIONS[0]!]) // part5Question → part: 5

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    expect(await screen.findByText('PART 5')).toBeTruthy()
    // 出題理由の表示は従来どおり残る（表示追加であり置き換えではないことの確認）
    expect(screen.getByText('今日のドリル')).toBeTruthy()
  })
})

describe('DrillScreen: ハプティクス（T-78。正解確定時のnavigator.vibrate）', () => {
  it('正解確定時、設定ONならnavigator.vibrateが呼ばれる', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })

    try {
      render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      // q-1 の正解は A
      await answerAndSettle('a', 1)
      expect(vibrate).toHaveBeenCalledWith(15)
    } finally {
      Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    }
  })

  it('設定OFFなら正解確定時でもnavigator.vibrateが呼ばれない', async () => {
    const db = newDb()
    await db.settings.put({ key: HAPTICS_ENABLED_KEY, value: false })
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })

    try {
      render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      // DrillScreen起動時のsettings読み込み（非同期）が解決してhapticsEnabled=falseが
      // stateに反映されるのを待ってからクリックする（先にクリックするとstate初期値=true
      // のままfinalizeAnswerが評価してしまい、falseとの競合レースになる）
      await screen.findByTestId('drill-settings-loaded')
      await answerAndSettle('a', 1)
      expect(vibrate).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    }
  })

  it('誤答時はnavigator.vibrateが呼ばれない', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })

    try {
      render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
      // q-1 の正解はA。誤答のbを選ぶ
      await answerAndSettle('b', 1)
      expect(vibrate).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })
    }
  })
})

describe('DrillScreen: セッション途中終了導線（T-122・J-61）', () => {
  it('解説表示中（残り1問以上）に「ここで終了して結果を見る」が出て、タップでリザルトへ遷移し解答済み分が集計される', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await setupSession(db, items, QUESTIONS)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    await answerAndSettle('a', 1) // q-1に正解（残りq-2の1問）

    const exitButton = screen.getByText('ここで終了して結果を見る')
    expect(exitButton).toBeTruthy()
    fireEvent.click(exitButton)

    expect(useAppStore.getState().screen).toBe('result')
    // セッションは破棄されず、解答済み1件分のattemptIdsがそのまま残る（ResultScreenの
    // attemptIds基準集計=T-109で正しく反映されるための前提）
    expect(useSessionStore.getState().snapshot?.attemptIds).toHaveLength(1)
    expect(useSessionStore.getState().snapshot?.sessionId).toBe(snapshot.sessionId)
  })

  it('「ここで終了して結果を見る」をタップした時点でDB上のセッションを完了させる（T-196・Q-5）', async () => {
    // 何を防ぐか: 「終了」を選んだのにDB上は中断（進行中）扱いのまま残ると、ResultScreenで
    // 「ホームへ」をタップする前にタブを閉じる／アプリを離れるだけでホームに
    // 「続きから再開」バナーが残り続ける。文言（終了）と状態（中断扱い）が矛盾する。
    // 「終了」を選んだ時点でDBのアクティブセッションを確実に消す（ResultScreenの
    // 「ホームへ」を待たない）のが正しい挙動
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    await answerAndSettle('a', 1) // q-1に正解（残りq-2の1問）
    fireEvent.click(screen.getByText('ここで終了して結果を見る'))

    expect(useAppStore.getState().screen).toBe('result')
    await waitFor(async () => expect(await resumeSession(db)).toBeNull())
  })

  it('最終問の解説では「ここで終了して結果を見る」は出ない（「次へ」自体がリザルトへ進むため）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)
    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    await answerAndSettle('a', 1)
    fireEvent.click(await screen.findByText('次へ'))
    expect(screen.getByText(/attend/)).toBeTruthy() // q-2（最終問）が表示される

    await answerAndSettle('b', 2) // q-2に正解
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
  })
})

describe('DrillScreen: 読解（text_passage）混在時のreading画面への自動切替（T-105。24の3.3節・3.5節）', () => {
  function readingQuestion(id: string): Question {
    return {
      id,
      part: 7,
      format: 'text_passage',
      difficulty: 3,
      tags: [],
      keyVocab: [{ word: `${id}-word`, sense: '意味', freqRank: 'S' }],
      passages: [{ id: `${id}-p1`, kind: 'email', text: `${id}の本文` }],
      subQuestions: [
        { id: `${id}-q0`, question: '設問0', choices: [{ key: 'A', text: 'a' }], answer: 'A' },
      ],
    }
  }

  it('現在itemがtext_passageだとreading画面へ切り替わり、DrillScreenは何も描画しない', async () => {
    const db = newDb()
    const q = readingQuestion('read-1')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    await waitFor(() => expect(useAppStore.getState().screen).toBe('reading'))
    // セッション状態自体は進めない（このitemはまだ未解答。スキップとは異なる）
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(0)
  })

  it('通常item→text_passage itemの順で混在するパックでも、1問目は通常どおり解答できてから切り替わる', async () => {
    const db = newDb()
    const q1 = part5Question('q-mixed-1', 'A', 'submit')
    const q2 = readingQuestion('read-mixed-2')
    const items: SessionItem[] = [
      { questionId: q1.id, mode: 'solo' },
      { questionId: q2.id, mode: 'solo' },
    ]
    await setupSession(db, items, [q1, q2])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    await answerAndSettle('a', 1) // q1に正解
    fireEvent.click(await screen.findByText('次へ'))

    await waitFor(() => expect(useAppStore.getState().screen).toBe('reading'))
    expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1) // q2はまだ未解答
  })
})

describe('DrillScreen: タイマーと中断（T-158。docs/27 のS-2・S-9）', () => {
  // 何を防ぐか: 解答済みなのにヘッダに残秒が固着し、時間切れだったのか判別できなくなること。
  // 従来のガードは再生開始時レンダーのクロージャ値（result=null）を見ていたため機能せず、
  // 再生中に解答すると停止した秒数が表示されたまま残っていた
  it('再生中に解答すると、確定後にタイマーが表示されない', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    const pending: { resolve?: (outcome: PlaybackOutcome) => void } = {}
    audioPlayer.play.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    fireEvent.click(await screen.findByLabelText('選択肢A'))
    await waitFor(() => expect(useSessionStore.getState().snapshot?.answeredCount).toBe(1))

    // 解答による stop() で再生が打ち切られる（T-155の契約で 'interrupted'）
    expect(audioPlayer.stop).toHaveBeenCalled()
    await act(async () => {
      pending.resolve?.('interrupted')
      await Promise.resolve()
    })

    expect(document.querySelector('.drill-timer')).toBeNull()
  })

  it('再生が完走した場合はタイマーが始まる（中断ガードが完走を巻き込まない）', async () => {
    const db = newDb()
    const q = audioOnlyQuestion('p2-1', 'A')
    await setupAudioOnlySession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))

    await waitFor(() => expect(screen.getByText('残り6秒')).toBeTruthy())
  })

  // 何を防ぐか: 聞き直しが解答時間の減少というペナルティになること（J-91）
  it('もう一度再生の再生中はカウントダウンが止まり、終了後に残り時間から再開する', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    const pending: { resolve?: (outcome: PlaybackOutcome) => void } = {}
    audioPlayer.replay.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('残り15秒')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(3000)
    await vi.waitFor(() => expect(screen.getByText('残り12秒')).toBeTruthy())

    fireEvent.click(screen.getByText('もう一度再生'))
    await vi.waitFor(() => expect(screen.getByText('再生中は停止')).toBeTruthy())

    // リプレイ中は何秒経ってもカウントが進まない
    await vi.advanceTimersByTimeAsync(5000)
    expect(screen.getByText('残り12秒')).toBeTruthy()

    await act(async () => {
      pending.resolve?.('ended')
      await Promise.resolve()
    })
    // 再生終了後は残り時間（12秒）から再開する。リセットされて15秒に戻ることはない
    await vi.waitFor(() => expect(screen.queryByText('再生中は停止')).toBeNull())
    await vi.advanceTimersByTimeAsync(2000)
    await vi.waitFor(() => expect(screen.getByText('残り10秒')).toBeTruthy())
  })

  it('リプレイを複数回してもタイマーはリセットされない', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('残り15秒')).toBeTruthy())

    await vi.advanceTimersByTimeAsync(4000)
    await vi.waitFor(() => expect(screen.getByText('残り11秒')).toBeTruthy())

    // replay は即座に 'ended' で解決するフェイクなので、押した分だけ停止→再開が起きる。
    // 再開（setIsReplaying(false)）はawait後＝act外で起きるため、actで囲んで
    // 再レンダーとタイマーeffectの張り直しまでを確定させる
    for (let i = 1; i <= 2; i++) {
      await act(async () => {
        fireEvent.click(screen.getByText('もう一度再生'))
        await Promise.resolve()
      })
      expect(audioPlayer.replay).toHaveBeenCalledTimes(i)
      expect(screen.queryByText('再生中は停止')).toBeNull()
    }

    // 残り時間は据え置き（15秒に巻き戻らない）
    expect(screen.getByText('残り11秒')).toBeTruthy()
    // 再開後はカウントが進む。なおリプレイのたびにintervalを張り直すため1秒未満の端数は
    // 切り捨てられる（学習者に有利な方向のずれなので許容する）
    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(screen.getByText('残り10秒')).toBeTruthy())
  })

  it('リプレイが失敗してもタイマーは再開する（停止したまま固まらない）', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-1', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()
    audioPlayer.replay.mockRejectedValue(new Error('boom'))

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await vi.waitFor(() => expect(screen.getByText('残り15秒')).toBeTruthy())

    fireEvent.click(screen.getByText('もう一度再生'))
    await vi.waitFor(() => expect(screen.getByText('音声を再生できませんでした')).toBeTruthy())

    expect(screen.queryByText('再生中は停止')).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.waitFor(() => expect(screen.getByText('残り14秒')).toBeTruthy())
  })
})

describe('DrillScreen: 進捗表示の実解答回数化と保存失敗の再試行（T-175・T-176）', () => {
  // 何を防ぐか（T-175・docs/27 のS-26）: 進捗の分母がitem数のままで、audio_setを含む
  // セッションで「表示より実際の解答回数がずっと多い」「1item内で答えても進捗が動かない」
  // 状態が続くこと
  it('audio_setを含むセッションの分母がサブ設問数の合計になり、サブ設問ごとに進む', async () => {
    const db = newDb()
    const single = part5Question('q-single', 'A', 'submit')
    const set = audioSetQuestion('s-1', 3)
    await setupSession(
      db,
      [
        { questionId: single.id, mode: 'solo' },
        { questionId: set.id, mode: 'solo' },
      ],
      [single, set],
    )

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // item数は2だが、解答回数は 1（Part5）+ 3（サブ設問）= 4
    expect(await screen.findByLabelText('進捗 1/4')).toBeTruthy()

    await answerAndSettle('a', 1) // Part5に解答
    fireEvent.click(await screen.findByText('次へ'))

    // audio_setの1問目。前のitemが1回消費しているので 2/4
    await waitFor(() => expect(screen.getByLabelText('進捗 2/4')).toBeTruthy())
  })

  // 何を防ぐか（T-176・docs/27 のS-27）: 正解を見せた後に解答を取り消して選び直させること。
  // 選び直しは正解が見えている状態で行われるため操作の意味がない
  it('保存失敗時は正誤表示を保持して再試行導線を出し、再試行の成功で次へ進める', async () => {
    const db = newDb()
    const q = part5Question('q-retry', 'A', 'submit')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 1回だけ保存を失敗させる（ストレージ側の一時的な異常の模擬）
    const original = db.attempts.add.bind(db.attempts)
    const addSpy = vi
      .spyOn(db.attempts, 'add')
      .mockRejectedValueOnce(new Error('boom（模擬）'))
      .mockImplementation(original)

    fireEvent.click(await screen.findByText('a'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // 正誤表示は保持する（再解答を求めない）
    expect(screen.getByText('a').closest('button')?.dataset.state).toBe('correct')
    expect(await db.attempts.count()).toBe(0)

    fireEvent.click(screen.getByText('保存を再試行する'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    await waitFor(() =>
      expect(
        screen.queryByText('解答を保存できませんでした。空き容量を確認してください'),
      ).toBeNull(),
    )
    expect(screen.queryByText('保存を再試行する')).toBeNull()
    addSpy.mockRestore()
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: 保存の完了前に「次へ」で進めること。
  // 正誤表示は保存処理より先に出るため、保存中でも進行導線が出ていた
  it('保存が完了するまで「次へ」「ここで終了」を出さない', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    // 保存を保留させる（解決するまでUIは「保存中」のまま）。
    // 待ちを入れるのは**トランザクションの開始前**にする——Dexieのトランザクション内で
    // 非Dexieのpromiseをawaitすると、そのトランザクションが先にコミットされてしまう
    // （ADR 0010 の制約）
    let release: (() => void) | null = null
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const originalTx = db.transaction.bind(db)
    const txSpy = vi
      .spyOn(db, 'transaction')
      .mockImplementation(((...args: unknown[]) =>
        gate.then(() =>
          originalTx(...(args as Parameters<typeof originalTx>)),
        )) as unknown as typeof db.transaction)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(await screen.findByText('a'))

    // 正誤表示は出ているが、進行導線はまだ出さない
    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    expect(screen.queryByText('次へ')).toBeNull()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()

    txSpy.mockRestore()
    release!()
    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.getByText('ここで終了して結果を見る')).toBeTruthy()
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: q1の保存が失敗したままq2へ進めること。
  // DBのsnapshotはq1のままなので、q2を解答すると attempt は q1 のIDで記録されつつ
  // タグ・レートには q2 の情報が使われる（answerCurrentQuestion はsnapshotの現在itemを見る）
  it('保存失敗後は再試行するまで次の問題へ進めない', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    const original = db.attempts.add.bind(db.attempts)
    const addSpy = vi
      .spyOn(db.attempts, 'add')
      .mockRejectedValueOnce(new Error('boom（模擬）'))
      .mockImplementation(original)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(await screen.findByText('a'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // 進行導線は出さず、再試行だけが前進手段になる
    expect(screen.queryByText('次へ')).toBeNull()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
    expect(screen.getByText('保存を再試行する')).toBeTruthy()

    fireEvent.click(screen.getByText('保存を再試行する'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))

    // 再試行が成功したら通常どおり進める
    fireEvent.click(await screen.findByText('次へ'))
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    // 1問目のIDで記録されているのは1件だけ（q2の解答が q1 として記録されていない）
    const attempts = await db.attempts.toArray()
    expect(attempts.map((a) => a.questionId)).toEqual([QUESTIONS[0]!.id])
    addSpy.mockRestore()
  })

  it('スナップショット不整合は再試行導線を出さず、従来どおり再同期する（二重解答は直せない）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    // 画面のsnapshotを裏でstaleにする（複数タブ・二重解答と同じ状況）
    await answerCurrentQuestion(db, snapshot, { isCorrect: true, responseMs: 1000 })

    fireEvent.click(screen.getByText('b'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // やり直しても同じ検知で弾かれるため再試行は出さない
    expect(screen.queryByText('保存を再試行する')).toBeNull()
    // 従来どおり再同期して次の問題へ進む
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
  })
})

describe('DrillScreen: スキップ通知の持続と累計（T-177。docs/27 のS-30）', () => {
  // 何を防ぐか: 通知が4秒で消えるため、選んだ問数より少ない問題数で終わっても
  // その場では理由に気づけなかったこと（累計はResultScreenまで見えなかった）
  it('スキップ通知は時間経過で消えず、複数スキップで累計が増える', async () => {
    const db = newDb()
    const shadow1 = shadowingFormatQuestion('shadow-x1')
    const shadow2 = shadowingFormatQuestion('shadow-x2')
    const items: SessionItem[] = [
      { questionId: shadow1.id, mode: 'solo' },
      { questionId: shadow2.id, mode: 'solo' },
      { questionId: 'q-2', mode: 'solo' },
    ]
    await setupSession(db, items, [shadow1, shadow2, QUESTIONS[1]!])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    // 2件スキップして3問目へ進む
    await waitFor(() => expect(screen.getByText(/attend/)).toBeTruthy())
    await waitFor(() =>
      expect(screen.getByText('表示できない問題を2件スキップしました')).toBeTruthy(),
    )
    expect(useSessionStore.getState().skippedCount).toBe(2)

    // 4秒経っても消えない（ResultScreenの「表示できなかった問題: N件」と同じ数え方で
    // セッション中も件数が分かる）
    await new Promise((resolve) => setTimeout(resolve, 4200))
    expect(screen.getByTestId('drill-skip-notice')).toBeTruthy()
    expect(screen.getByText('表示できない問題を2件スキップしました')).toBeTruthy()
  })
})

describe('DrillScreen: 再生中の設問文表示（T-167。docs/27 のS-15）', () => {
  // 何を防ぐか: 「音声を聞きながら設問を目で追う」がPart3/4の基本動作なのに、再生中だけ
  // 設問文が「再生中…」に置き換わり、先読みフェーズで読んだ内容を記憶で保持させていたこと
  it('audio_set は再生中もサブ設問文を表示する', async () => {
    const db = newDb()
    const set = audioSetQuestion('s-visible', 3)
    await setupSession(db, [{ questionId: set.id, mode: 'solo' }], [set])
    const audioPlayer = new FakeAudioPlayer()
    const pending: { resolve?: (outcome: PlaybackOutcome) => void } = {}
    audioPlayer.playSequence.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )
    audioPlayer.play.mockImplementation(
      () =>
        new Promise<PlaybackOutcome>((resolve) => {
          pending.resolve = resolve
        }),
    )

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)

    // 先読みフェーズを飛ばして再生フェーズへ入る
    fireEvent.click(await screen.findByText('音声を再生'))
    fireEvent.click(await screen.findByText('もう再生する'))

    // 再生中（操作ゾーンに「再生中…」が出ている状態）でもサブ設問文が読める
    await waitFor(() => expect(screen.getByText('再生中…')).toBeTruthy())
    expect(screen.getByText(set.subQuestions![0]!.question)).toBeTruthy()

    await act(async () => {
      pending.resolve?.('ended')
      await Promise.resolve()
    })
  })
})

describe('DrillScreen: 進捗の上限（レビュー指摘）', () => {
  // 何を防ぐか: 3問セット（audio_set）の最終解答後に 4/3 と出ること。
  // バー幅はSessionProgress内で100%に丸められるが、表示文字とaria-valuenowは超過する
  it('audio_setの最終サブ設問を解答しても進捗が総数を超えない', async () => {
    const db = newDb()
    const set = audioSetQuestion('s-progress', 3)
    await setupSession(db, [{ questionId: set.id, mode: 'solo' }], [set])

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)

    expect(await screen.findByLabelText('進捗 1/3')).toBeTruthy()

    fireEvent.click(screen.getByText('音声を再生'))
    fireEvent.click(await screen.findByText('もう再生する'))
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())

    // 3問のサブ設問を順に解答する（既存のaudio_setテストと同じ操作）
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText(`設問${i}の解説`)).toBeTruthy())
      if (i < 2) {
        fireEvent.click(await screen.findByText('次の設問へ'))
        await waitFor(() => expect(screen.getByLabelText(`進捗 ${i + 2}/3`)).toBeTruthy())
      }
    }

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-label')).toBe('進捗 3/3')
  })
})

// 何を防ぐか（T-224。docs/29 Q-62・J-108）: 問題文・語彙単語・ディクテーションのスクリプトに
// lang="en" が無く、lang="ja" の文書内でスクリーンリーダーが日本語の音声で読み上げていたこと
describe('DrillScreen: 英文要素のlang="en"（T-224・J-108）', () => {
  it('text_blank（Part5）の設問文にlang="en"が付く', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    expect(container.querySelector('.question-text')?.getAttribute('lang')).toBe('en')
  })

  it('選択肢本文にもlang="en"が付く（ChoiceButton経由）', async () => {
    const db = newDb()
    const items: SessionItem[] = QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    await setupSession(db, items, QUESTIONS)

    render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    expect(screen.getByText('a').getAttribute('lang')).toBe('en')
  })

  it('vocab_cardの対象語（単語）にlang="en"が付く', async () => {
    const db = newDb()
    await db.srsCards.put({
      id: 'vocab:submit',
      refType: 'vocab',
      refId: 'submit',
      stage: 0,
      dueAt: Date.now() - 1000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    const q = vocabCardQuestion('submit')
    const items: SessionItem[] = [{ questionId: q.id, mode: 'srs', srsCardId: 'vocab:submit' }]
    await setupSession(db, items, [q])

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    expect(container.querySelector('.vocab-card__word')?.getAttribute('lang')).toBe('en')
  })

  it('dictationの語バンクの単語にlang="en"が付く', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-lang', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())

    const bankButtons = screen
      .getAllByRole('button')
      .filter((b) => b.parentElement?.className === 'dictation-word-bank')
    expect(bankButtons.length).toBeGreaterThan(0)
    for (const b of bankButtons) expect(b.getAttribute('lang')).toBe('en')
  })

  it('dictationの確定後、スクリプト全文にlang="en"が付く', async () => {
    const db = newDb()
    const q = dictationQuestion('dict-lang-2', 'Please submit the report today', [
      { index: 1, answer: 'submit' },
    ])
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    const { container } = render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('submit')).toBeTruthy())
    fireEvent.click(screen.getByText('submit'))
    fireEvent.click(screen.getByText('確定'))

    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    const script = container.querySelector('.dictation-script [lang="en"]')
    expect(script?.textContent).toBe('Please submit the report today')
  })

  it('audio_setのサブ設問文（再生中～解答前）にlang="en"が付く', async () => {
    const db = newDb()
    const set = audioSetQuestion('s-lang', 3)
    await setupSession(db, [{ questionId: set.id, mode: 'solo' }], [set])

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('音声を再生'))
    fireEvent.click(await screen.findByText('もう再生する'))
    await waitFor(() => expect(screen.getByText('設問0')).toBeTruthy())

    const span = container.querySelector('.question-text [lang="en"]')
    expect(span?.textContent).toBe('設問0')
  })

  it('audio_qaの解答後、scriptにlang="en"が付く', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-lang', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    const { container } = render(<DrillScreen db={db} audioPlayer={new FakeAudioPlayer()} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())
    await answerAndSettle('Yesterday.', 1)

    const span = container.querySelector('.question-text [lang="en"]')
    expect(span?.textContent).toBe(q.script)
  })
})

// 何を防ぐか（T-315・K-48）: T-221は「画面離脱時に音声を停止」を中断導線とpopstateハンドラ
// のみで実装しており、useEffectのunmount cleanupでの停止が1件も無かった。最終問で再生中に
// リザルトへ進むと、再生中の音声がリザルト画面まで流れ続ける
describe('DrillScreen: unmount時の音声停止（T-315・K-48）', () => {
  it('アンマウント時にaudioPlayer.stop()が呼ばれる', async () => {
    const db = newDb()
    const q = audioQaQuestion('p2-unmount', 'A')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const audioPlayer = new FakeAudioPlayer()

    const view = render(<DrillScreen db={db} audioPlayer={audioPlayer} />)
    fireEvent.click(screen.getByText('音声を再生'))
    await waitFor(() => expect(screen.getByText('Yesterday.')).toBeTruthy())

    view.unmount()

    expect(audioPlayer.stop).toHaveBeenCalled()
  })
})
