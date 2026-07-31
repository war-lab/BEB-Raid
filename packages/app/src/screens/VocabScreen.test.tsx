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
import type { AudioPlayer, PlaybackOutcome } from '../platform'
import {
  AUTO_PLAY_ENABLED_KEY,
  MISTAP_UNDO_ENABLED_KEY,
  NO_EARPHONE_MODE_KEY,
} from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { VocabScreen } from './VocabScreen'

/** HighlightedPhraseで単語部分が別要素に分かれるため、フレーズ全文はp要素のtextContentで照合する */
function phraseMatcher(phrase: string) {
  return (_content: string, element: Element | null) =>
    element?.tagName === 'P' &&
    element.classList.contains('vocab-card__phrase') &&
    element.textContent === phrase
}

/**
 * 復習カードの表示を待つ（2026-07-29以降、解答前にフレーズは出ないため
 * フレーズ待ちは使えない）。「この単語の意味は？」は解答後に消える
 */
async function waitForReviewCard(word: string) {
  await waitFor(() => expect(screen.getByText('この単語の意味は？')).toBeTruthy())
  expect(screen.getByText(word)).toBeTruthy()
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
  play = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  playSequence = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
  replay = vi.fn(async (): Promise<PlaybackOutcome> => 'ended')
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
    await waitForReviewCard('delta')
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
    await waitForReviewCard('epsilon')
    fireEvent.click(screen.getByText('decoy の意味')) // わざと不正解を選ぶ
    fireEvent.click(screen.getByText('もう一回'))

    await screen.findByText(/仕分け \d/)
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(false)
    const card = await db.srsCards.get('vocab:epsilon')
    expect(card?.stage).toBe(0) // もう一回はstage0へリセット（グレードによる間隔調整は従来どおり）
  })

  it('「わからない」で正解を提示し、次へでisCorrect=false・SRSはagain（stage0）で記録される', async () => {
    const db = newDb()
    await seedDueCard(db, 'iota')
    const questions = [vocabQuestion('iota'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('iota')

    fireEvent.click(screen.getByText('わからない'))
    // 正解（iota の意味）がcorrect表示になっている＝答えを提示している
    await waitFor(() =>
      expect(screen.getByText('iota の意味').closest('button')?.dataset.state).toBe('correct'),
    )
    // 自己評価3段階は出さず「次へ」だけ
    expect(screen.queryByText('OK')).toBeNull()
    expect(screen.queryByText('余裕')).toBeNull()
    fireEvent.click(screen.getByText('次へ'))

    await screen.findByText(/仕分け \d/)
    const attempt = (await db.attempts.toArray())[0]!
    expect(attempt.isCorrect).toBe(false)
    // 「わからない」は間隔をagain（stage0リセット）にする
    expect((await db.srsCards.get('vocab:iota'))?.stage).toBe(0)
  })

  it('選択済みの4択は再クリックしても選択が変わらない（disabled）', async () => {
    const db = newDb()
    await seedDueCard(db, 'theta')
    const questions = [vocabQuestion('theta'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('theta')
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

// 2026-07-29: 解答前に例文を見せると文脈から意味が推測でき、4択の正答率が実力を過大評価する。
// 単語のみを提示し、フレーズと音声は解答後に開示する
describe('VocabScreen: 復習カードの提示順（単語のみ→解答後にフレーズ）', () => {
  it('解答前は単語とプロンプトだけで、フレーズはDOMに存在しない', async () => {
    const db = newDb()
    await seedDueCard(db, 'kappa')
    const questions = [vocabQuestion('kappa'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    const { container } = render(
      <VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />,
    )
    await waitForReviewCard('kappa')

    expect(container.querySelector('.vocab-card__word')?.textContent).toBe('kappa')
    // visibility:hidden ではなくDOMから出さない（残すとtextContent一致で退行を検出できない）
    expect(container.querySelector('.vocab-card__phrase')).toBeNull()
    expect(container.textContent).not.toContain('I will kappa it.')
  })

  it('4択を選ぶとフレーズが開示される', async () => {
    const db = newDb()
    await seedDueCard(db, 'lambda')
    const questions = [vocabQuestion('lambda'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('lambda')
    fireEvent.click(screen.getByText('lambda の意味'))

    await waitFor(() => expect(screen.getByText(phraseMatcher('I will lambda it.'))).toBeTruthy())
    // 解答後はプロンプトを出さない（既に答えを見せているため）
    expect(screen.queryByText('この単語の意味は？')).toBeNull()
  })

  it('「わからない」でもフレーズが開示される', async () => {
    const db = newDb()
    await seedDueCard(db, 'mu')
    const questions = [vocabQuestion('mu'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('mu')
    fireEvent.click(screen.getByText('わからない'))

    await waitFor(() => expect(screen.getByText(phraseMatcher('I will mu it.'))).toBeTruthy())
  })
})

describe('VocabScreen: フレーズ音声自動再生（既定ON。解答後のみ。イヤホンなしモードでは止める）', () => {
  it('解答前は自動再生されず、解答後に再生される', async () => {
    const db = newDb()
    await seedDueCard(db, 'eta')
    const questions = [vocabQuestion('eta'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('eta')
    // 解答前に鳴らすと音声から意味を推測できる
    expect(audioPlayer.play).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('eta の意味'))
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/eta.mp3'))
  })

  it('仕分けモードは従来どおり即再生する（解答段階が無いため）', async () => {
    const db = newDb()
    const questions = [vocabQuestion('nu')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/nu.mp3'))
  })

  it('イヤホンなしモードがONなら解答後も play は呼ばれない', async () => {
    const db = newDb()
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: true })
    await seedDueCard(db, 'zeta')
    const questions = [vocabQuestion('zeta'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('zeta')
    fireEvent.click(screen.getByText('zeta の意味'))
    await waitFor(() => expect(screen.getByText(phraseMatcher('I will zeta it.'))).toBeTruthy())

    expect(audioPlayer.play).not.toHaveBeenCalled()
    expect(audioPlayer.unlock).not.toHaveBeenCalled()
  })

  it('解答後の「フレーズを再生」は replay() ではなく play() を呼ぶ（別問題の音声を指さないため）', async () => {
    const db = newDb()
    await db.settings.put({ key: NO_EARPHONE_MODE_KEY, value: true })
    await seedDueCard(db, 'xi')
    const questions = [vocabQuestion('xi'), vocabQuestion('decoy')]
    const audioPlayer = new FakeAudioPlayer()

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitForReviewCard('xi')
    // 解答前は再生ボタンを出さない
    expect(screen.queryByText('フレーズを再生')).toBeNull()

    fireEvent.click(screen.getByText('xi の意味'))
    fireEvent.click(await screen.findByText('フレーズを再生'))

    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalledWith('/dev-audio/xi.mp3'))
    expect(audioPlayer.replay).not.toHaveBeenCalled()
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
    // T-161の取り消し猶予をOFFにする（ADR 0009の先例と同じ扱い）。このテストの対象は
    // 20語区切りであって猶予ではなく、ONのままだと20回×400msでタイムアウトする
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: false })
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

describe('VocabScreen: 仕分けスワイプの取り消し猶予（T-161。docs/27 のS-4）', () => {
  // 何を防ぐか: 「知ってる」は markVocabKnown で卒業済みカードを作り、その語を仕分け候補からも
  // 復習キューからも恒久的に外す。ドリルの選択肢タップより不可逆なのに、従来はスワイプ1回で
  // 即確定し取り消せなかった
  it('「知ってる」タップで猶予に入り、まだ永続化されない', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))

    expect(await screen.findByText('取り消し（知ってる）')).toBeTruthy()
    expect(await db.srsCards.count()).toBe(0)
    // 猶予中は仕分けボタンを引っ込める（二重確定の防止）
    expect(screen.queryByText('知らない')).toBeNull()
    // カードは保持されたまま（次のカードへ進めない）
    expect(screen.getByText('仕分け 1/2')).toBeTruthy()
  })

  it('取り消すと永続化されず、同じカードを選び直せる', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))
    fireEvent.click(await screen.findByText('取り消し（知ってる）'))

    // 正解を見せる画面ではないので、同じカードへの再操作を許す
    expect(await screen.findByText('知らない')).toBeTruthy()
    expect(screen.getByText('仕分け 1/2')).toBeTruthy()
    expect(await db.srsCards.count()).toBe(0)

    // 選び直して「知らない」で確定すると、未卒業カードになる
    fireEvent.click(screen.getByText('知らない'))
    await waitFor(async () => expect(await db.srsCards.count()).toBe(1))
    expect((await db.srsCards.get('vocab:alpha'))?.graduatedAt).toBeNull()
  })

  it('猶予が過ぎると永続化され、次のカードへ進む', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))

    await waitFor(() => expect(screen.getByText('仕分け 2/2')).toBeTruthy())
    expect((await db.srsCards.get('vocab:alpha'))?.graduatedAt).not.toBeNull()
  })

  it('スワイプでも猶予に入る（ボタンと同じ扱い）', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    const { container } = render(
      <VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />,
    )
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())

    const card = container.querySelector('.swipe-card')!
    fireEvent.pointerDown(card, { clientX: 200, clientY: 100 })
    fireEvent.pointerMove(card, { clientX: 80, clientY: 105 }) // dx=-120 → 左（知らない）
    fireEvent.pointerUp(card, { clientX: 80, clientY: 105 })

    expect(await screen.findByText('取り消し（知らない）')).toBeTruthy()
    expect(await db.srsCards.count()).toBe(0)
  })

  it('猶予中にアンマウントされると永続化される（操作は実際に行われたため捨てない）', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    const view = render(
      <VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />,
    )
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))
    // DB往復を挟まない（挟むと400msの猶予が経過し、flushではなくタイマー確定を
    // 検証してしまう。猶予中に書かないことは上のテストが担保する）
    expect(await screen.findByText('取り消し（知ってる）')).toBeTruthy()

    view.unmount()

    await waitFor(async () => expect(await db.srsCards.count()).toBe(1))
    expect((await db.srsCards.get('vocab:alpha'))?.graduatedAt).not.toBeNull()
  })

  it('設定OFFなら従来どおり即確定する（回帰）', async () => {
    const db = newDb()
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: false })
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())
    fireEvent.click(screen.getByText('知ってる'))

    await waitFor(async () => expect(await db.srsCards.count()).toBe(1))
    expect(screen.queryByText('取り消し（知ってる）')).toBeNull()
  })
})

describe('VocabScreen: 連打防止と保存失敗の表示（T-159。docs/27 のS-3・S-28）', () => {
  // 何を防ぐか: 反応が遅い端末での連打で setReviewIndex が2回走り、未評価のカードが
  // 1枚無言でスキップされること（SRS間隔も更新されないまま残る）
  it('自己評価を連打してもカードは1枚しか進まない', async () => {
    const db = newDb()
    const words = ['alpha', 'bravo', 'charlie']
    for (const w of words) await seedDueCard(db, w)
    const questions = words.map((w) => vocabQuestion(w))

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('復習 1/3')).toBeTruthy())
    fireEvent.click(screen.getByText('alpha の意味'))

    const ok = screen.getByText('OK')
    fireEvent.click(ok)
    fireEvent.click(ok)
    fireEvent.click(ok)

    await waitFor(() => expect(screen.getByText('復習 2/3')).toBeTruthy())
    // 3枚目まで飛んでいない＝1回分しか処理されていない
    expect(screen.queryByText('復習 3/3')).toBeNull()
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
  })

  it('仕分けのスワイプ相当の操作を連打しても1語しか進まない', async () => {
    const db = newDb()
    const questions = ['alpha', 'bravo', 'charlie'].map((w) => vocabQuestion(w))

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/3')).toBeTruthy())

    const known = screen.getByText('知ってる')
    fireEvent.click(known)
    fireEvent.click(known)

    await waitFor(() => expect(screen.getByText('仕分け 2/3')).toBeTruthy())
    expect(screen.queryByText('仕分け 3/3')).toBeNull()
    // 卒業済みカードは1件だけ作られる
    expect(await db.srsCards.count()).toBe(1)
  })

  // 何を防ぐか: ストレージ枯渇時に「押しても何も起きない」画面になり、原因も次の行動も
  // 分からなくなること（DrillScreenにはsaveErrorバナーがあるのに不統一だった）
  it('復習の記録が失敗するとエラーを表示し、カードを進めない', async () => {
    const db = newDb()
    await seedDueCard(db, 'alpha')
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('復習 1/1')).toBeTruthy())
    fireEvent.click(screen.getByText('alpha の意味'))

    // 記録の書き込みを失敗させる（DBクローズ＝ストレージ側の異常の模擬）
    db.close()
    fireEvent.click(screen.getByText('OK'))

    await screen.findByText(/記録を保存できませんでした/)
    // 進めていない（カードが残っている＝解答が記録されないまま次へ流れない）
    expect(screen.getByText('復習 1/1')).toBeTruthy()
  })

  it('仕分けの記録が失敗するとエラーを表示し、語を進めない', async () => {
    const db = newDb()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={new FakeAudioPlayer()} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())

    db.close()
    fireEvent.click(screen.getByText('知ってる'))

    await screen.findByText(/記録を保存できませんでした/)
    expect(screen.getByText('仕分け 1/2')).toBeTruthy()
  })
})

describe('VocabScreen: 自動再生のopt-outと画面内の音声コントロール（T-166。docs/27 のS-16）', () => {
  // 何を防ぐか: 仕分けはカード表示のたびに自動再生するため、公共の場で音が鳴り続ける状態から
  // その場で逃げられなかったこと（イヤホンなしモードのトグルは設定画面にしか無かった）
  it('autoPlayEnabled=false なら仕分けカードのフレーズ音声を自動再生しない', async () => {
    const db = newDb()
    await db.settings.put({ key: AUTO_PLAY_ENABLED_KEY, value: false })
    const audioPlayer = new FakeAudioPlayer()
    const questions = [vocabQuestion('alpha')]

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/1')).toBeTruthy())

    expect(audioPlayer.play).not.toHaveBeenCalled()
  })

  it('既定では自動再生される（T-166は既定を変えない＝回帰）', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const questions = [vocabQuestion('alpha')]

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(audioPlayer.play).toHaveBeenCalled())
  })

  it('「音声を止める」で再生中のフレーズ音声を止められる', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const questions = [vocabQuestion('alpha')]

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/1')).toBeTruthy())

    fireEvent.click(screen.getByText('音声を止める'))
    expect(audioPlayer.stop).toHaveBeenCalled()
  })

  it('画面内のイヤホンなしモードトグルで音を止め、設定にも永続化する', async () => {
    const db = newDb()
    const audioPlayer = new FakeAudioPlayer()
    const questions = [vocabQuestion('alpha'), vocabQuestion('bravo')]

    render(<VocabScreen db={db} audioPlayer={audioPlayer} vocabQuestions={questions} />)
    await waitFor(() => expect(screen.getByText('仕分け 1/2')).toBeTruthy())

    const toggle = screen.getByLabelText('イヤホンなしモード（音声を鳴らさない）')
    fireEvent.click(toggle)

    // 鳴っている音を即座に止める（公共の場での事故を止める用途）
    await waitFor(() => expect(audioPlayer.stop).toHaveBeenCalled())
    // 設定画面と同じキーに永続化する
    await waitFor(async () =>
      expect((await db.settings.get(NO_EARPHONE_MODE_KEY))?.value).toBe(true),
    )
    // ONの間は停止ボタンを出さない（鳴らないので不要）
    expect(screen.queryByText('音声を止める')).toBeNull()
  })
})
