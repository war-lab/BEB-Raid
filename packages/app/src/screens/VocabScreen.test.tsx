// T-19 完了条件のテスト:
// - スワイプとボタンの両方で仕分けでき、「知らない」だけがsrsCardsに入る
// - 復習3段階評価でstageが遷移しattemptsにmode='srsが記録される
// - フレーズ音声は既定で自動再生され、イヤホンなしモードならplayが呼ばれない
// - SRS5問完了時にevaluateStreakが呼ばれストリーク成立が返る
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { evaluateStreak } from '../engine/streak'
import type { AudioPlayer } from '../platform'
import { NO_EARPHONE_MODE_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { VocabScreen } from './VocabScreen'

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
  const db = new BebRaidDatabase(`vocab-screen-test-${++seq}`)
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

beforeEach(() => {
  useAppStore.setState({ screen: 'vocab' })
})

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

function vocabQuestion(word: string, freqRank: 'S' | 'A' | 'B' | 'C' = 'S'): Question {
  return {
    id: `vocab-${word}`,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: word,
    phrase: `I will ${word} it.`,
    phraseAudio: `/dev-audio/${word}.mp3`,
    back: `${word} の意味`,
    freqRank,
    levelBand: 600,
  }
}

async function seedDueCard(db: BebRaidDatabase, word: string, now = Date.now()) {
  await db.srsCards.put({
    id: `vocab:${word}`,
    refType: 'vocab',
    refId: word,
    stage: 2,
    dueAt: now - 1000,
    lapses: 0,
    introducedDate: '2026-07-01',
    graduatedAt: null,
    sourceQuestionId: null,
  })
}

describe('VocabScreen: 仕分けモード（新規語彙のスワイプ仕分け）', () => {
  it('スワイプ「知らない」で未卒業カードが追加され、「知ってる」（ボタン）では卒業済みカードが追加される（T-119）', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('beta')]
    const audioPlayer = new FakeAudioPlayer()

    const { container } = render(
      <VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />,
    )

    await waitFor(() => expect(screen.getByText(phraseMatcher('I will alpha it.'))).toBeTruthy())
    const card = container.querySelector('.swipe-card')!
    fireEvent.pointerDown(card, { clientX: 200, clientY: 100 })
    fireEvent.pointerMove(card, { clientX: 80, clientY: 105 }) // dx=-120 → 左スワイプ
    fireEvent.pointerUp(card, { clientX: 80, clientY: 105 })

    await waitFor(async () => expect(await db.srsCards.get('vocab:alpha')).toBeDefined())
    expect((await db.srsCards.get('vocab:alpha'))?.graduatedAt).toBeNull()

    // 2件目（beta）は「知ってる」ボタンで仕分ける
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will beta it.'))).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))

    await waitFor(() => expect(screen.getByText('語彙SRSが終了しました')).toBeTruthy())
    // J-58: 「知ってる」は卒業済みカードとして永続化する（次回入店時に仕分けキューへ再度出さないため）
    const betaCard = await db.srsCards.get('vocab:beta')
    expect(betaCard).toBeDefined()
    expect(betaCard?.graduatedAt).not.toBeNull()
  })

  it('「知らない」ボタンでも同様に srsCards に追加される', async () => {
    const db = newDb()
    const questions = [vocabQuestion('gamma')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('知らない')).toBeTruthy())
    fireEvent.click(screen.getByText('知らない'))

    await waitFor(async () => expect(await db.srsCards.get('vocab:gamma')).toBeDefined())
  })
})

describe('VocabScreen: 復習モード（4択リコールテスト→自己評価3段階）', () => {
  it('正解を選びOK評価でstageが進み、attemptsにmode=srs・isCorrect=trueで記録される', async () => {
    const db = newDb()
    await seedDueCard(db, 'delta')
    // decoyを混ぜて4択にダミーが混ざるようにする（distractor供給元）
    const questions = [vocabQuestion('delta'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will delta it.'))).toBeTruthy())
    expect(screen.getByText('この単語の意味は？')).toBeTruthy()
    fireEvent.click(screen.getByText('delta の意味'))
    fireEvent.click(screen.getByText('OK'))

    // handleGrade（attempt記録→reviewSrsCard→evaluateStreak→setReviewIndex）の完了を、
    // その最後のsetState由来である仕分けフェーズへの画面遷移で待つ（T-71注記参照）
    await screen.findByText(/仕分け \d/)
    const card = await db.srsCards.get('vocab:delta')
    expect(card?.stage).toBe(3) // stage2→OK(+1)=3

    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.mode).toBe('srs')
    expect(attempt.questionId).toBe('vocab-delta')
    expect(attempt.isCorrect).toBe(true)
  })

  it('不正解を選ぶとattemptsにisCorrect=falseで記録される（グレードは自己申告のまま独立）', async () => {
    const db = newDb()
    await seedDueCard(db, 'epsilon')
    const questions = [vocabQuestion('epsilon'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will epsilon it.'))).toBeTruthy())
    fireEvent.click(screen.getByText('decoy の意味')) // わざと不正解を選ぶ
    fireEvent.click(screen.getByText('もう一回'))

    await screen.findByText(/仕分け \d/)
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(false)
    const card = await db.srsCards.get('vocab:epsilon')
    expect(card?.stage).toBe(0) // もう一回はstage0へリセット（グレードによる間隔調整は従来どおり）
  })

  it('選択済みの4択は再クリックしても選択が変わらない（disabled）', async () => {
    const db = newDb()
    await seedDueCard(db, 'theta')
    const questions = [vocabQuestion('theta'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will theta it.'))).toBeTruthy())
    fireEvent.click(screen.getByText('theta の意味'))
    fireEvent.click(screen.getByText('decoy の意味')) // 選択済みなので無視されるはず
    fireEvent.click(screen.getByText('OK'))

    // handleGrade（attempt記録→reviewSrsCard→evaluateStreak→setReviewIndex）が完全に
    // 終わるまで待つ。attemptsの件数だけを見ると（T-71でpipelineがattemptを先に書くため）
    // reviewSrsCard/evaluateStreak完了前にテストが進み、DB切断後の書き込みで
    // Unhandled Rejectionになりうる。仕分けフェーズへの画面遷移は一連の最後の
    // setState由来のため、これを待てば全書き込みの完了を保証できる
    await screen.findByText(/仕分け \d/)
    expect(await db.attempts.count()).toBe(1)
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(true) // 最初の正解選択のまま
    expect((await db.srsCards.get('vocab:theta'))?.stage).toBe(3)
  })
})

describe('VocabScreen: フレーズ音声自動再生（既定ON。イヤホンなしモードでのみ止める）', () => {
  it('既定（イヤホンなしモード未設定）では自動再生される', async () => {
    const db = newDb()
    await seedDueCard(db, 'eta')
    const questions = [vocabQuestion('eta')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/eta.mp3'))
  })

  it('イヤホンなしモードがONなら play は呼ばれない', async () => {
    const db = newDb()
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: true })
    await seedDueCard(db, 'zeta')
    const questions = [vocabQuestion('zeta')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will zeta it.'))).toBeTruthy())

    expect(audioPlayer.play).not.toHaveBeenCalled()
    expect(audioPlayer.unlock).not.toHaveBeenCalled()
  })
})

describe('VocabScreen: ストリーク成立（02の7節）', () => {
  it('SRS5問完了時に evaluateStreak がストリーク成立を返す', async () => {
    const db = newDb()
    const words = ['w1', 'w2', 'w3', 'w4', 'w5']
    for (const w of words) await seedDueCard(db, w)
    const questions = words.map((w) => vocabQuestion(w))
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    for (let i = 0; i < words.length; i++) {
      await waitFor(() => expect(screen.getByText(`復習 ${i + 1}/${words.length}`)).toBeTruthy())
      fireEvent.click(screen.getByText(`${words[i]} の意味`))
      fireEvent.click(screen.getByText('OK'))
    }
    // 最終問のhandleGrade完了（attempt記録→reviewSrsCard→evaluateStreak→setReviewIndex）を
    // 終了画面への遷移で待つ（attempts件数だけを見ると内部のreviewSrsCard/evaluateStreakの
    // 完了前にテストが進み、DB切断後の書き込みでUnhandled Rejectionになりうるため。T-71注記参照）
    await screen.findByText('語彙SRSが終了しました')
    expect(await db.attempts.count()).toBe(words.length)

    const status = await evaluateStreak(db)
    expect(status.todayCompleted).toBe(true)
    expect(status.currentDays).toBeGreaterThanOrEqual(1)
  })
})

describe('VocabScreen: 出題不能なSRSカードの除外と脱出導線（レビュー修正E5）', () => {
  // 何を防ぐか: processWrongAnswerが作るrefType='question'カードや、パック撤去・別端末復元で
  // 語が引けないカードが復習キュー先頭に居座ると、4択も自己評価ボタンも出ずactionゾーンが空、
  // リロードしても同カードに再到達して語彙SRSが恒久的に使用不能になる
  it('refType=questionのカードや対応するvocab_card問題が無いカードは復習対象から除外され、詰まらない', async () => {
    const db = newDb()
    // processWrongAnswer相当のrefType='question'カード（VocabScreenでは出題不能）
    await db.srsCards.put({
      id: 'question:q-1',
      refType: 'question',
      refId: 'q-1',
      stage: 0,
      dueAt: Date.now() - 2000,
      lapses: 0,
      introducedDate: '2026-07-01',
      graduatedAt: null,
      sourceQuestionId: null,
    })
    // パック撤去等で対応するvocab_card問題が無い語彙カード
    await seedDueCard(db, 'ghost', Date.now() - 1000)
    // 正常に出題可能な語彙カード
    await seedDueCard(db, 'alpha')
    const questions = [vocabQuestion('alpha'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    // 出題可能なalphaだけが復習対象になる（1/1）＝出題不能カードで先頭が詰まらない
    await waitFor(() => expect(screen.getByText('復習 1/1')).toBeTruthy())
    expect(screen.getByText('alpha の意味')).toBeTruthy()

    // 除外したカードは削除されず残る（パック再取得で対応問題が復活しうるため）
    expect(await db.srsCards.get('question:q-1')).toBeDefined()
    expect(await db.srsCards.get('vocab:ghost')).toBeDefined()
  })

  // 何を防ぐか: 初回ロード失敗時にreviewQueue/triageQueueがnullのまま永久にreturn nullが続き、
  // 何も描画されない白画面で固まる
  it('初回ロード失敗時はエラーメッセージと「ホームへ」導線を表示する', async () => {
    const db = newDb()
    db.close() // getSrsQueue（DBアクセス）を失敗させる
    const audioPlayer = new FakeAudioPlayer()

    render(
      <VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={[vocabQuestion('alpha')]} />,
    )

    expect(await screen.findByText('語彙データを読み込めませんでした')).toBeTruthy()
    fireEvent.click(screen.getByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')

    await db.open() // afterEachのdelete()が失敗しないよう復旧する
  })

  it('復習の進行中に「中断」でホームへ戻れる', async () => {
    const db = newDb()
    await seedDueCard(db, 'alpha')
    const questions = [vocabQuestion('alpha'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('復習 1/1')).toBeTruthy())

    fireEvent.click(screen.getByText('中断'))
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('仕分けの進行中にも「中断」でホームへ戻れる', async () => {
    const db = newDb()
    // SRSカードなし→復習キュー空→仕分けモードから始まる
    const questions = [vocabQuestion('alpha')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/1')).toBeTruthy())

    fireEvent.click(screen.getByText('中断'))
    expect(useAppStore.getState().screen).toBe('home')
  })
})

describe('VocabScreen: 語彙仕分けの既知永続化と区切り（T-119）', () => {
  it('「知ってる」で仕分けた語は、再マウント後の仕分け候補にも復習キューにも出ない', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha')]
    const audioPlayer = new FakeAudioPlayer()

    const first = render(
      <VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />,
    )
    await waitFor(() => expect(screen.getByText('仕分け 1/1')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))
    await screen.findByText('語彙SRSが終了しました')
    first.unmount()

    // 再マウント: 卒業済みカードのため仕分け候補（未登録語のみ）にも復習キュー
    // （active=未卒業カードのみ）にも出ず、即座に終了画面になる
    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await screen.findByText('語彙SRSが終了しました')
    expect((await db.srsCards.get('vocab:alpha'))?.graduatedAt).not.toBeNull()
  })

  it('20語仕分けるごとに中間画面が出て、「続けて仕分ける」で再開できる', async () => {
    const db = newDb()
    const words = Array.from({ length: 21 }, (_, i) => `word${i}`)
    const questions = words.map((w) => vocabQuestion(w))
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    for (let i = 0; i < 20; i++) {
      await waitFor(() => expect(screen.getByText(`仕分け ${i + 1}/21`)).toBeTruthy())
      fireEvent.click(screen.getByText('知ってる'))
    }

    expect(await screen.findByText('仕分けを20語終えました')).toBeTruthy()
    expect(screen.getByText('続けて仕分ける（残り1語）')).toBeTruthy()
    // 21件目はまだ未着手のまま（中間画面の間は消化されない）
    expect(await db.srsCards.count()).toBe(20)

    fireEvent.click(screen.getByText('続けて仕分ける（残り1語）'))
    await waitFor(() => expect(screen.getByText('仕分け 21/21')).toBeTruthy())
  })

  it('復習画面の「仕分けへ」で、復習キューを消化せず仕分けフェーズへ直行できる', async () => {
    const db = newDb()
    await seedDueCard(db, 'alpha')
    const questions = [vocabQuestion('alpha'), vocabQuestion('beta')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('復習 1/1')).toBeTruthy())

    fireEvent.click(screen.getByText('仕分けへ'))

    await waitFor(() => expect(screen.getByText('仕分け 1/1')).toBeTruthy())
    // 仕分け候補はbetaのみ（alphaは既にSRS登録済みのため候補から除外される）
    expect(screen.getByText(phraseMatcher('I will beta it.'))).toBeTruthy()
    // 復習キューはDB上未消化のまま（次回入店時にまた復習から始まる）
    expect((await db.srsCards.get('vocab:alpha'))?.stage).toBe(2)
  })
})

describe('VocabScreen: 完了カード（T-78）', () => {
  it('全復習・仕分けが終わると今日の実施数・ストリークを含む完了カードを表示する', async () => {
    const db = newDb()
    const words = ['w1', 'w2', 'w3', 'w4', 'w5']
    for (const w of words) await seedDueCard(db, w)
    const questions = words.map((w) => vocabQuestion(w))
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    for (let i = 0; i < words.length; i++) {
      await waitFor(() => expect(screen.getByText(`復習 ${i + 1}/${words.length}`)).toBeTruthy())
      fireEvent.click(screen.getByText(`${words[i]} の意味`))
      fireEvent.click(screen.getByText('OK'))
    }
    await screen.findByText('語彙SRSが終了しました')

    const card = await screen.findByTestId('completion-card')
    expect(card.textContent).toContain(`今日の実施数 ${words.length}問`)
    expect(card.textContent).toContain('🔥')
  })
})
