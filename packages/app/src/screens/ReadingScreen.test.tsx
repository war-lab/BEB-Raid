// T-104（改番後はT-139）完了条件のテスト（正本: docs/24 3.5節・4節T-139）:
// - Part6（4空所）が表示され、空所をタップして該当設問へジャンプできる
// - 空所を解答すると本文の該当箇所に選択結果が反映される
// - Part7単一（マーカーなし）を順に解答するとattemptsにサブ設問IDで記録され、
//   2/3ルールを使わずRセクションのレートが更新される
// - 中断復帰: 完了済みの1問目（パッセージ）をスキップして2問目から表示される
// - ペース表示（15秒タイマーではない柔らかい目安）が出る
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { applyRatingUpdate } from '../engine/rating'
import {
  ACTIVE_SESSION_KEY,
  advanceSession,
  resumeSession,
  startSession,
  type SessionItem,
} from '../services/session'
import { MISTAP_UNDO_ENABLED_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { readingPaceLabel, ReadingScreen } from './ReadingScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`reading-screen-test-${++seq}`)
  dbs.push(db)
  return db
}

beforeEach(() => {
  useAppStore.setState({ screen: 'reading' })
  useSessionStore.getState().reset()
})

afterEach(async () => {
  // フェイクタイマーを使ったテストの後始末（未解除だと後続テストのwaitForが進まない）
  vi.useRealTimers()
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

async function setupSession(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
  const snapshot = await startSession(db, { items })
  useSessionStore.getState().begin(snapshot, questions, { L: 400, R: 400 })
  // 誤タップの取り消し猶予（T-268。ADR 0009。既定ON）をOFFにする。ONだと解答から記録まで
  // 400ms空くため、猶予そのものを検証しない既存テストが軒並み待ちを必要とし遅く不安定になる
  // （DrillScreen.test.tsx・VocabScreen.test.tsxと同じ対処）
  await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: false })
  return snapshot
}

/** Part6: 本文に [[1]]…[[4]] の空所マーカーを持つ問題（docs/24 3.1節） */
function part6Question(id: string): Question {
  const subCount = 4
  return {
    id,
    part: 6,
    format: 'text_passage',
    difficulty: 2,
    tags: ['文法'],
    keyVocab: [{ word: 'meeting', sense: '会議', freqRank: 'S' }],
    passages: [
      {
        id: `${id}-p1`,
        kind: 'notice',
        text:
          'Dear Team, [[1]] the meeting has been moved. [[2]] Please [[3]] your calendars ' +
          'accordingly. [[4]] Thank you for your understanding.',
      },
    ],
    subQuestions: Array.from({ length: subCount }, (_, i) => ({
      id: `${id}-q${i}`,
      question: `空所(${i + 1})に入る最も適切な語は？`,
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

/** Part7単一: マーカーを持たない1文書＋複数設問 */
function part7Question(id: string, subCount = 3, passageText?: string): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: ['パラフレーズ照合'],
    keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'S' }],
    passages: [
      {
        id: `${id}-p1`,
        kind: 'email',
        text: passageText ?? `${id}という請求書に関するメール本文。`,
      },
    ],
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

describe('ReadingScreen: Part6（T-104）', () => {
  it('本文に4つの空所プレースホルダーと現在の設問・ペース目安が表示される', async () => {
    const db = newDb()
    const q = part6Question('p6-1')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-blank-1').textContent).toBe('___(1)___')
    expect(screen.getByTestId('passage-blank-4').textContent).toBe('___(4)___')
    expect(screen.getByTestId('reading-question').textContent).toContain('設問1/4')
    expect(screen.getByText(/目安1問\/分/)).toBeTruthy()
  })

  it('空所を解答すると本文の該当箇所に選択結果が反映され、他の空所へジャンプできる', async () => {
    const db = newDb()
    const q = part6Question('p6-2')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))

    await waitFor(() => expect(screen.getByTestId('passage-blank-1').textContent).toBe('(1) a'))
    expect(screen.getByTestId('passage-blank-1').className).toContain('is-correct')
    // 未解答のまま残る空所はプレースホルダーのまま
    expect(screen.getByTestId('passage-blank-2').textContent).toBe('___(2)___')

    // 空所3を直接タップすると設問3へジャンプする（線形進行を強制しない=3.5節）
    fireEvent.click(screen.getByTestId('passage-blank-3'))
    await waitFor(() =>
      expect(screen.getByTestId('reading-question').textContent).toContain('設問3/4'),
    )
  })
})

describe('ReadingScreen: Part7単一（T-104）', () => {
  it('順に解答するとattemptsにサブ設問IDで記録され、Rセクションのレートが更新される', async () => {
    const db = newDb()
    const q = part7Question('p7-1', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
      fireEvent.click(await screen.findByText('次へ'))
      if (i < 2) {
        await waitFor(() =>
          expect(screen.getByTestId('reading-question').textContent).toContain(`設問${i + 2}/3`),
        )
      }
    }

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(3)
    expect(attempts.map((a) => a.questionId).sort()).toEqual(['p7-1-q0', 'p7-1-q1', 'p7-1-q2'])
    expect(attempts.every((a) => a.isCorrect)).toBe(true)

    const rating = await db.ratings.get('R')
    expect(rating).toBeDefined()
  })

  it('全問完走してリザルトへ進んだ時点でDB上のセッションを完了させる（T-267・Q-5）', async () => {
    // 何を防ぐか: DrillScreenと同じ理由（同ファイルの同名テスト参照）。読解でも
    // 全問（全サブ設問）を解いて最終itemを終えると自動的にリザルトへ遷移するが、
    // その時点でDBのアクティブセッションを消しておかないと、ResultScreenの
    // 「ホームへ」を待つ間にアプリを離れただけでホームに再開バナーが残る
    const db = newDb()
    const q = part7Question('p7-complete', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
      fireEvent.click(await screen.findByText('次へ'))
    }

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    await waitFor(async () => expect(await resumeSession(db)).toBeNull())
  })

  it('T-106: 正誤混在（正・誤・正）でも各設問が独立採点され、computeSetResultの2/3ルールに基づく一括判定を経由しない', async () => {
    const db = newDb()
    const q = part7Question('p7-mixed', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    // 正・誤・正（3問中2問正解=2/3ルールなら「セット正解」となる分布だが、
    // ここではセット単位の合否判定ではなく設問ごとの独立したElo更新のみで説明できることを確かめる）
    const pattern = ['a', 'b', 'a']
    for (let i = 0; i < pattern.length; i++) {
      fireEvent.click(screen.getByText(pattern[i]!))
      await waitFor(() =>
        expect(screen.getByText(pattern[i] === 'a' ? '正解' : '不正解')).toBeTruthy(),
      )
      // recordAnswerPipelineはUIの正誤表示（activeAnswerの楽観的更新）より後にDB書き込みが
      // 完了する（rating更新が最後のステップ）。次の設問へ進む前にratings.answerCountの
      // 増分を待ち、後続クリックのrecordAnswerPipeline呼び出しと競合させない
      // （この待機が無いとElo更新の実行順序が意図した正誤順と入れ替わりうる＝Eloは順序依存のため）
      await waitFor(async () => expect((await db.ratings.get('R'))?.answerCount).toBe(i + 1))
      fireEvent.click(await screen.findByText('次へ'))
      if (i < pattern.length - 1) {
        await waitFor(() =>
          expect(screen.getByTestId('reading-question').textContent).toContain(`設問${i + 2}/3`),
        )
      }
    }

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))

    // 期待値はengine/rating.tsのapplyRatingUpdateを正誤パターンどおりに3回独立適用した軌跡。
    // computeSetResult（audioSet.ts）は一切importしておらず、セット単位の合否で
    // まとめて1回更新するような別経路が無いことを、この一致で担保する
    const refDb = newDb()
    for (const c of pattern) {
      await applyRatingUpdate(refDb, {
        part: q.part,
        difficulty: q.difficulty,
        isCorrect: c === 'a',
        mode: 'solo',
      })
    }
    const actualRating = await db.ratings.get('R')
    const expectedRating = await refDb.ratings.get('R')
    expect(expectedRating).toBeDefined()
    expect(actualRating?.rating).toBeCloseTo(expectedRating!.rating, 6)
    expect(actualRating?.answerCount).toBe(3)
  })

  it('誤答した設問はkeyVocabがSRSに追加される（2/3ルールは使わず1問ごとに独立採点）', async () => {
    const db = newDb()
    const q = part7Question('p7-2', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('b')) // 誤答

    await waitFor(() => expect(screen.getByText('不正解')).toBeTruthy())
    await waitFor(async () => expect(await db.srsCards.get('vocab:invoice')).toBeDefined())
    const attempts = await db.attempts.toArray()
    expect(attempts).toHaveLength(1)
    expect(attempts[0]?.isCorrect).toBe(false)
  })
})

// 何を防ぐか（T-224。docs/29 Q-62・J-108）: パッセージ・設問文（英文）に lang="en" が無く、
// lang="ja" の文書内でスクリーンリーダーが日本語の音声で読み上げていたこと
describe('ReadingScreen: 英文要素のlang="en"（T-224・J-108）', () => {
  it('Part7単一のパッセージ本文にlang="en"が付く', async () => {
    const db = newDb()
    const q = part7Question('p7-lang', 1, 'This invoice is due on the 15th.')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-text').getAttribute('lang')).toBe('en')
  })

  it('Part6の空所付きパッセージ本文にもlang="en"が付く', async () => {
    const db = newDb()
    const q = part6Question('p6-lang')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-text').getAttribute('lang')).toBe('en')
  })

  it('設問文（英文）の部分だけlang="en"が付き、「設問n/m:」ラベルは付かない', async () => {
    const db = newDb()
    const q = part7Question('p7-lang-q', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    const questionEl = screen.getByTestId('reading-question')
    // ラベル部分（「設問n/m:」）自体には付かない。英文だけを括った子spanに付く
    expect(questionEl.getAttribute('lang')).toBeNull()
    const englishSpan = questionEl.querySelector('[lang="en"]')
    expect(englishSpan?.textContent).toBe('設問0')
  })

  it('選択肢本文にもlang="en"が付く（ChoiceButton経由）', async () => {
    const db = newDb()
    const q = part7Question('p7-lang-choice', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByText('a').getAttribute('lang')).toBe('en')
  })
})

describe('ReadingScreen: 読解の解法タグがtagStats・弱点判定に乗る（T-106・docs/24 3.4節）', () => {
  /**
   * subQuestion単位の解法タグ（'推論'）は親questionのtags（'パラフレーズ照合'）とは別に
   * 設問側にだけ付与する（T-103のSubQuestion.tags想定運用）。10問すべて誤答させ、
   * 当て勘重み（応答<2秒の誤答=0.5倍。03の7.2節）を踏まえてもwindowTotal（弱点判定に
   * 必要な最小標本数=5）に届く数だけ用意する
   */
  function taggedPassageQuestion(id: string, subCount: number): Question {
    return {
      id,
      part: 7,
      format: 'text_passage',
      difficulty: 2,
      tags: ['パラフレーズ照合'],
      keyVocab: [],
      passages: [{ id: `${id}-p1`, kind: 'article', text: `${id}の本文。` }],
      subQuestions: Array.from({ length: subCount }, (_, i) => ({
        id: `${id}-q${i}`,
        question: `設問${i}`,
        choices: [
          { key: 'A', text: 'a' },
          { key: 'B', text: 'b' },
        ],
        answer: 'A',
        tags: ['推論'],
      })),
    }
  }

  it('subQuestion.tagsの解法タグが弱点判定（正答率60%未満）に反映される', async () => {
    const db = newDb()
    const subCount = 10
    const q = taggedPassageQuestion('p7-tagged', subCount)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    for (let i = 0; i < subCount; i++) {
      fireEvent.click(screen.getByText('b')) // 全問誤答
      await waitFor(() => expect(screen.getByText('不正解')).toBeTruthy())
      // recordAnswerPipelineの完了（tagStats再構築を含む）を待ってから次へ進む。
      // rating更新（ratings.answerCountの増分）がパイプラインの最終ステップのため、
      // これを完了マーカーに使う。待たないと後続クリックのrecomputeTagStatsが先に走り、
      // 直近の誤答が未反映のままwindowTotalが実際より少なく記録されうる（フレーク要因）
      await waitFor(async () => expect((await db.ratings.get('R'))?.answerCount).toBe(i + 1))
      fireEvent.click(await screen.findByText('次へ'))
      if (i < subCount - 1) {
        await waitFor(() =>
          expect(screen.getByTestId('reading-question').textContent).toContain(
            `設問${i + 2}/${subCount}`,
          ),
        )
      }
    }
    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))

    // subQuestion固有の解法タグ（'推論'）がtagStatsに現れる（親のtagsだけを見る実装だと
    // このキー自体が存在しない= tagStats.get('推論') が undefined のままになる）
    const inferenceStat = await db.tagStats.get('推論')
    expect(inferenceStat).toBeDefined()
    expect(inferenceStat!.windowTotal).toBeGreaterThanOrEqual(5)
    expect(inferenceStat!.windowCorrect / inferenceStat!.windowTotal).toBeLessThan(0.6)

    // 親questionのtags（'パラフレーズ照合'）も従来どおり反映され続ける（回帰なし）
    const paraphraseStat = await db.tagStats.get('パラフレーズ照合')
    expect(paraphraseStat).toBeDefined()
  })
})

describe('ReadingScreen: 読解以外item混在時のdrill画面への自動切替（T-105。24の3.3節・3.5節）', () => {
  function part5Question(id: string): Question {
    return {
      id,
      part: 5,
      format: 'text_blank',
      difficulty: 2,
      tags: ['品詞'],
      keyVocab: [],
      question: `${id}の設問文`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
    }
  }

  it('現在itemがtext_passageでなければdrill画面へ切り替わり、ReadingScreenは何も描画しない', async () => {
    const db = newDb()
    const q1 = part7Question('read-3', 1)
    const q2 = part5Question('p5-4')
    let snapshot = await startSession(db, {
      items: [
        { questionId: q1.id, mode: 'solo' },
        { questionId: q2.id, mode: 'solo' },
      ],
    })
    // 1問目（読解）は解答済みで、現在itemはq2（通常形式）を模擬する
    snapshot = await advanceSession(db, snapshot)
    useSessionStore.getState().begin(snapshot, [q1, q2], { L: 400, R: 400 })

    render(<ReadingScreen db={db} />)

    await waitFor(() => expect(useAppStore.getState().screen).toBe('drill'))
  })
})

describe('ReadingScreen: 中断復帰（T-104）', () => {
  it('完了済みの1問目（パッセージ）をスキップして2問目から表示される', async () => {
    const db = newDb()
    const q1 = part7Question('p7-resume-1', 2, '1問目のパッセージ本文。')
    const q2 = part7Question('p7-resume-2', 2, '2問目のパッセージ本文。')
    let snapshot = await startSession(db, {
      items: [
        { questionId: q1.id, mode: 'solo' },
        { questionId: q2.id, mode: 'solo' },
      ],
    })
    // 1問目は前回のセッションで解答済み（=item境界を進めた状態）を模擬する
    snapshot = await advanceSession(db, snapshot)
    useSessionStore.getState().begin(snapshot, [q1, q2], { L: 400, R: 400 })

    render(<ReadingScreen db={db} />)

    expect(screen.getByTestId('passage-text').textContent).toBe('2問目のパッセージ本文。')
    expect(screen.getByTestId('reading-question').textContent).toContain('設問1/2')
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: パッセージの途中（サブ設問単位）で中断すると、
  // 解答済みのサブ設問が再開後に再出題され、attempt・レート・タグ統計が重複すること
  it('パッセージ途中で中断しても解答済みサブ設問は再出題されない', async () => {
    const db = newDb()
    const q = part7Question('p7-resume-sub', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // 1回目: 3問中2問だけ解答して離脱する
    const first = render(<ReadingScreen db={db} />)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByText('a'))
      fireEvent.click(await screen.findByText('次へ'))
    }
    await waitFor(async () => expect(await db.attempts.count()).toBe(2))
    first.unmount()

    // 2回目: DBのスナップショットから復元して再開する（アプリ再起動の模擬）
    const resumed = await resumeSession(db)
    expect(resumed).not.toBeNull()
    expect(resumed!.answeredCount).toBe(0) // 親itemはまだ進んでいない
    expect(resumed!.attemptIds).toHaveLength(2) // リザルトの集計対象に入っている
    useSessionStore.getState().begin(resumed!, [q], { L: 400, R: 400 })

    render(<ReadingScreen db={db} />)

    // 未解答の3問目から始まり、進捗も解答済み分を織り込んでいる
    expect(screen.getByTestId('reading-question').textContent).toContain('設問3/3')
    expect(screen.getByLabelText('進捗 3/3')).toBeTruthy()

    // 残り1問を解答すると合計3件。再出題による重複が無い
    fireEvent.click(screen.getByText('a'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(3))
    const attempts = await db.attempts.toArray()
    expect(attempts.map((a) => a.questionId).sort()).toEqual([
      'p7-resume-sub-q0',
      'p7-resume-sub-q1',
      'p7-resume-sub-q2',
    ])
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: サブ設問のattemptがsnapshot.attemptIdsに入らず、
  // リザクトの全体集計（T-109。attemptIds基準）が「正解 0/0」になること
  it('サブ設問のattemptがスナップショットのattemptIdsに積まれる', async () => {
    const db = newDb()
    const q = part7Question('p7-tally', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    fireEvent.click(await screen.findByText('次へ'))
    fireEvent.click(screen.getByText('a'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(2))

    const attemptIds = useSessionStore.getState().snapshot?.attemptIds ?? []
    expect(attemptIds).toHaveLength(2)
    const rows = await db.attempts.bulkGet(attemptIds)
    expect(rows.every((r) => r !== undefined)).toBe(true)
  })
})

describe('ReadingScreen: 途中終了導線とペース表示（T-164。docs/27 のS-31・S-13）', () => {
  // 何を防ぐか: 全サブ設問を解き切るまでリザルトへ到達できず、抜ける手段が「中断」
  // （ホーム直行）だけだったこと。Part7の長文を全問解く覚悟がないと入れない状態だった
  it('未解答が残っている間だけ途中終了導線が出て、タップでリザルトへ遷移する', async () => {
    const db = newDb()
    const q = part7Question('p7-exit', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    // 解答前は解説ゾーンごと出ないので導線も出ない
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()

    // 1問目を解答すると、未解答が2問残っているので導線が出る
    fireEvent.click(screen.getByText('a'))
    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.getByText('ここで終了して結果を見る')).toBeTruthy()

    fireEvent.click(screen.getByText('ここで終了して結果を見る'))
    expect(useAppStore.getState().screen).toBe('result')
  })

  it('「ここで終了して結果を見る」をタップした時点でDB上のセッションを完了させる（T-196・Q-5）', async () => {
    // DrillScreenのhandleFinishEarlyと同じ理由（同ファイルのコメント参照）。
    // ResultScreenの「ホームへ」を待たず、この時点でDBのアクティブセッションを消す
    const db = newDb()
    const q = part7Question('p7-exit-complete', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    expect(await screen.findByText('次へ')).toBeTruthy()
    fireEvent.click(screen.getByText('ここで終了して結果を見る'))

    expect(useAppStore.getState().screen).toBe('result')
    await waitFor(async () => expect(await resumeSession(db)).toBeNull())
  })

  it('最終サブ設問を解答した後は途中終了導線を出さない（「次へ」がitemを進める）', async () => {
    const db = newDb()
    const q = part7Question('p7-exit-last', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    fireEvent.click(screen.getByText('a'))
    expect(await screen.findByText('次へ')).toBeTruthy()
    fireEvent.click(await screen.findByText('次へ'))

    // 2問目（最終）を解答すると全問解答済みになり、導線は消える
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy())
    fireEvent.click(screen.getByText('a'))
    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
  })

  // 何を防ぐか: 制限時間ではないのに「経過180秒」と出続けて心理的な圧だけが増えること。
  // **60秒の経過そのものは readingPaceLabel の単体テストで固定している**——画面テストで
  // 経過を作るには Date をフェイクにする必要があり、同一ファイル内の実データテストと
  // 干渉して不安定だった。ここでは「ラベル関数が配線されている」ことだけを見る
  it('ペース表示はreadingPaceLabelの結果を出す（初期は経過秒数つき）', async () => {
    const db = newDb()
    const q = part7Question('p7-pace', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByText(readingPaceLabel(0))).toBeTruthy()
    expect(screen.getByText(/目安1問\/分（経過\d+秒）/)).toBeTruthy()
  })

  // 何を防ぐか（T-198。docs/29 Q-7）: handleNextはstartedAtだけ更新してelapsedSecを
  // リセットしないため、一度60秒（PACE_GUIDE_SECONDS）を超えると以降の全設問で
  // 「1分超」表示に固着する（tick用effectがelapsedSec>=60で早期returnし自己回復しない）
  it('T-198: 設問切替時に経過秒がリセットされ、前設問の「1分超」表示を引き継がない', async () => {
    const db = newDb()
    const q = part7Question('p7-elapsed-reset', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // setInterval/clearInterval・Dateのみフェイク化する（RaidScreen.test.tsxと同じ理由で
    // setTimeout・Promiseは実時間のまま動かし、findBy*/waitForとのデッドロックを避ける）
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(<ReadingScreen db={db} />)

    // 1問目で目安の60秒を超えさせ、「1分超」表示に固着させる
    await vi.advanceTimersByTimeAsync(65_000)
    expect(screen.getByText(readingPaceLabel(60))).toBeTruthy()

    // 1問目を解答して「次へ」で2問目へ進む
    fireEvent.click(screen.getByText('a'))
    fireEvent.click(await screen.findByText('次へ'))

    // 2問目は経過秒0からのはず。前問の「1分超」を引き継いでいれば固着したままになる
    await waitFor(() =>
      expect(screen.getByTestId('reading-question').textContent).toContain('設問2/2'),
    )
    expect(screen.getByText(readingPaceLabel(0))).toBeTruthy()
    expect(screen.queryByText(readingPaceLabel(60))).toBeNull()
  })
})

describe('ReadingScreen: 中断の確認（T-162。docs/27 のS-7）', () => {
  // 何を防ぐか: 中断は画面最上部にあり、上端のスクロール・スワイプ時の誤タップで
  // セッションから抜けていた（進捗は保存されるが、読んでいた長文の文脈は失われる）
  it('「中断」は確認を経てホームへ戻る', async () => {
    const db = newDb()
    const q = part7Question('p7-abort', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    useAppStore.setState({ screen: 'reading' })

    fireEvent.click(screen.getByText('中断'))
    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()
    expect(useAppStore.getState().screen).toBe('reading')

    fireEvent.click(screen.getByText('読解を続ける'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(useAppStore.getState().screen).toBe('reading')

    fireEvent.click(screen.getByText('中断'))
    fireEvent.click(await screen.findByText('中断してホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })
})

describe('ReadingScreen: Part7複数文書のタブ切替（T-165。docs/27 のS-32）', () => {
  /** 複数文書のPart7（相互参照型）。従来は1通目しか読めず解答不能になりえた */
  function part7MultiQuestion(id: string): Question {
    return {
      ...part7Question(id, 2),
      passages: [
        { id: `${id}-p1`, kind: 'email', text: '1通目の本文です。請求書の件。' },
        { id: `${id}-p2`, kind: 'email', text: '2通目の本文です。返信の内容。' },
      ],
    }
  }

  it('文書が2件以上のときタブが出て、切替で本文が変わる', async () => {
    const db = newDb()
    const q = part7MultiQuestion('p7-multi')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    // 初期表示は1通目
    expect(screen.getByTestId('passage-text').textContent).toBe('1通目の本文です。請求書の件。')

    fireEvent.click(screen.getByRole('tab', { name: /文書2/ }))
    await waitFor(() =>
      expect(screen.getByTestId('passage-text').textContent).toBe('2通目の本文です。返信の内容。'),
    )

    // 1通目へ戻れる
    fireEvent.click(screen.getByRole('tab', { name: /文書1/ }))
    await waitFor(() =>
      expect(screen.getByTestId('passage-text').textContent).toBe('1通目の本文です。請求書の件。'),
    )
  })

  it('文書が1件のときはタブを出さない（単一文書の読解に無用な要素を増やさない）', async () => {
    const db = newDb()
    const q = part7Question('p7-single', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('タブを切り替えても解答は継続できる（設問は文書と独立）', async () => {
    const db = newDb()
    const q = part7MultiQuestion('p7-multi-answer')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    fireEvent.click(screen.getByRole('tab', { name: /文書2/ }))
    fireEvent.click(screen.getByText('a'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    // 2通目を表示したままでも解答が記録される
    expect(screen.getByTestId('passage-text').textContent).toBe('2通目の本文です。返信の内容。')
  })
})

describe('ReadingScreen: 読解タブのWAI-ARIA APG準拠（T-230。docs/29 Q-68）', () => {
  /** 複数文書のPart7（相互参照型）。従来は1通目しか読めず解答不能になりえた */
  function part7MultiQuestion(id: string): Question {
    return {
      ...part7Question(id, 2),
      passages: [
        { id: `${id}-p1`, kind: 'email', text: '1通目の本文です。請求書の件。' },
        { id: `${id}-p2`, kind: 'email', text: '2通目の本文です。返信の内容。' },
      ],
    }
  }

  // 何を防ぐか: aria-controls/tabpanelの紐づけが無いと、スクリーンリーダー利用者が
  // タブ切替でどのパネルが更新されたのか把握できない（APG Tabsパターン必須要件）
  it('各タブがaria-controlsで対応するtabpanelを参照し、tabpanelがaria-labelledbyで紐づく', async () => {
    const db = newDb()
    const q = part7MultiQuestion('p7-apg')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    const tab1 = screen.getByRole('tab', { name: /文書1/ })
    const tab2 = screen.getByRole('tab', { name: /文書2/ })
    const panel1 = screen.getByRole('tabpanel')

    // タブ1選択時: タブ1のaria-controlsが現在のtabpanelのidと一致し、
    // tabpanel側はタブ1のidをaria-labelledbyで指す
    const tab1ControlledId = tab1.getAttribute('aria-controls')
    expect(tab1ControlledId).toBeTruthy()
    expect(panel1.getAttribute('id')).toBe(tab1ControlledId)
    expect(panel1.getAttribute('aria-labelledby')).toBe(tab1.getAttribute('id'))

    // 各タブは自分自身の（他方とは異なる）tabpanelを指す
    const tab2ControlledId = tab2.getAttribute('aria-controls')
    expect(tab2ControlledId).toBeTruthy()
    expect(tab2ControlledId).not.toBe(tab1ControlledId)

    // タブ2に切り替えると、tabpanel側の紐づけもタブ2のものに変わる
    fireEvent.click(tab2)
    await waitFor(() => {
      const panel2 = screen.getByRole('tabpanel')
      expect(panel2.getAttribute('id')).toBe(tab2ControlledId)
      expect(panel2.getAttribute('aria-labelledby')).toBe(tab2.getAttribute('id'))
    })
  })

  // 何を防ぐか: roving tabindexが無いと、Tabキーで各タブに個別に止まってしまい
  // APGパターン（タブリストへは1回、以降は矢印キー）に反する
  it('選択中タブのみtabIndex=0で、他は-1になる（roving tabindex）', async () => {
    const db = newDb()
    const q = part7MultiQuestion('p7-roving')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    const tab1 = screen.getByRole('tab', { name: /文書1/ })
    const tab2 = screen.getByRole('tab', { name: /文書2/ })
    expect(tab1.getAttribute('tabindex')).toBe('0')
    expect(tab2.getAttribute('tabindex')).toBe('-1')

    fireEvent.click(tab2)
    await waitFor(() => expect(tab2.getAttribute('tabindex')).toBe('0'))
    expect(tab1.getAttribute('tabindex')).toBe('-1')
  })

  // 何を防ぐか: 矢印キーで移動できないと、APGのTabsパターンとして不完全になる
  // （Tab移動のみでは操作できるが規約違反。docs/30 T-230）
  it('矢印キー（→/←）でタブが移動し、選択と本文が切り替わる', async () => {
    const db = newDb()
    const q = part7MultiQuestion('p7-arrow')
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    const tab1 = screen.getByRole('tab', { name: /文書1/ })

    fireEvent.keyDown(tab1, { key: 'ArrowRight' })
    const tab2 = await screen.findByRole('tab', { name: /文書2/ })
    await waitFor(() => expect(tab2.getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByTestId('passage-text').textContent).toBe('2通目の本文です。返信の内容。')

    fireEvent.keyDown(tab2, { key: 'ArrowLeft' })
    await waitFor(() => expect(tab1.getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByTestId('passage-text').textContent).toBe('1通目の本文です。請求書の件。')
  })
})

describe('ReadingScreen: 進捗の上限と保存再試行の冪等性（レビュー指摘）', () => {
  // 何を防ぐか: 「解答済み+1」のままだと最終解答後に 6/5 と出る。バー幅はSessionProgress内で
  // 100%に丸められるが、表示文字とaria-valuenowは超過したままになる
  it('最終サブ設問を解答しても進捗が総数を超えない', async () => {
    const db = newDb()
    const q = part7Question('p7-progress', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    expect(screen.getByLabelText('進捗 1/3')).toBeTruthy()

    // 3問すべて解答する（最後の1問を解答した時点でも 3/3 を超えない）
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      expect(await screen.findByText('次へ')).toBeTruthy()
      if (i < 2) {
        fireEvent.click(await screen.findByText('次へ'))
        await waitFor(() => expect(screen.getByLabelText(`進捗 ${i + 2}/3`)).toBeTruthy())
      }
    }

    const bar = screen.getByRole('progressbar')
    expect(bar.getAttribute('aria-valuenow')).toBe('3')
    expect(bar.getAttribute('aria-label')).toBe('進捗 3/3')

    // 3件すべての記録完了を待ってから終わる。**待たないと後続テストを壊す**——
    // useSessionStore はモジュール単位の共有ストアなので、在職中のパイプラインが
    // 次のテストのセットアップ後に recordAnswer で上書きしてしまう
    await waitFor(async () => expect(await db.attempts.count()).toBe(3))
  })

  // 何を防ぐか: 保存の後段（レート・タグ統計等）が失敗した後に再試行すると、
  // パイプライン全体が再実行されて attempt が二重に記録されること（レビュー指摘のP1）。
  // 単一トランザクション化（ADR 0010）により、失敗時は何も書かれないので再試行が冪等になる
  it('後段の失敗後に再試行しても attempt は1件だけになる', async () => {
    const db = newDb()
    const q = part7Question('p7-retry', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // ratings への書き込みを1回だけ失敗させる（①attempt記録より後の段の失敗）
    const original = db.ratings.put.bind(db.ratings)
    let failed = false
    const spy = vi.spyOn(db.ratings, 'put').mockImplementation(((...args: unknown[]) => {
      if (!failed) {
        failed = true
        return Promise.reject(new Error('ratings書き込み失敗（模擬）'))
      }
      return original(...(args as Parameters<typeof original>))
    }) as typeof db.ratings.put)

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))

    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()
    // 正誤表示は保持され、attemptは書かれていない（ロールバック済み）
    expect(await db.attempts.count()).toBe(0)

    fireEvent.click(screen.getByText('保存を再試行する'))

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    // 二重記録しない
    expect(await db.attempts.count()).toBe(1)
    await waitFor(() =>
      expect(
        screen.queryByText('解答を保存できませんでした。空き容量を確認してください'),
      ).toBeNull(),
    )
    spy.mockRestore()
  })

  /** ratings への最初の1回だけ失敗させる（①attempt記録より後の段の失敗を作る） */
  function failRatingsOnce(db: BebRaidDatabase) {
    const original = db.ratings.put.bind(db.ratings)
    let failed = false
    return vi.spyOn(db.ratings, 'put').mockImplementation(((...args: unknown[]) => {
      if (!failed) {
        failed = true
        return Promise.reject(new Error('ratings書き込み失敗（模擬）'))
      }
      return original(...(args as Parameters<typeof original>))
    }) as typeof db.ratings.put)
  }

  // 何を防ぐか: 再試行ボタンの連打で attempt・レートが二重に書かれること（レビュー指摘のP1）。
  // 単一トランザクション化（ADR 0010）は「失敗した書き込みが部分的に残らない」ことしか
  // 保証しないので、成功する保存を2回走らせる操作は useRetrySave 側で弾く必要がある
  it('再試行ボタンを連打しても attempt は1件だけになる', async () => {
    const db = newDb()
    const q = part7Question('p7-retry-double', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const spy = failRatingsOnce(db)

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()

    // 2回のクリックを**同じ act 内で**発火させる。fireEvent を2回呼ぶとその間に
    // 再レンダーが挟まり disabled が効いてしまうため、それでは同期ガード（busyRef）を
    // 通らない。実機の連打は再レンダーを待たないので、この形で再現する
    const retryButton = screen.getByText('保存を再試行する')
    await act(async () => {
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      retryButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    // 1件目の再試行が完了した後も増えない（2件目が遅れて走らない）
    await waitFor(() =>
      expect(
        screen.queryByText('解答を保存できませんでした。空き容量を確認してください'),
      ).toBeNull(),
    )
    expect(await db.attempts.count()).toBe(1)
    // レートも1回分しか進んでいない（attemptだけでなくレート更新の二重実行も防ぐ）
    expect((await db.ratings.get('R'))?.answerCount).toBe(1)
    spy.mockRestore()
  })

  // 何を防ぐか: 再試行時に回答時間を再計算すること（レビュー指摘のP2）。
  // エラーバナーを見てから押すまでの時間がそのまま responseMs に乗ると、
  // 速答判定（isGuess）まで巻き込んで壊れる
  it('再試行しても回答時間は初回選択時の値を使う', async () => {
    const db = newDb()
    const q = part7Question('p7-retry-elapsed', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const spy = failRatingsOnce(db)

    // フェイクタイマーではなく Date.now だけをずらす（タイマーを止めると同一ファイルの
    // 他テストのwaitForが進まなくなるため。前進のみなのでDexie側への影響はない）
    const realNow = Date.now.bind(Date)
    let offsetMs = 0
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offsetMs)
    try {
      render(<ReadingScreen db={db} />)
      fireEvent.click(screen.getByText('a'))
      expect(
        await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
      ).toBeTruthy()

      // エラー表示のまま10分放置してから再試行する
      offsetMs = 600_000
      fireEvent.click(screen.getByText('保存を再試行する'))
      await waitFor(async () => expect(await db.attempts.count()).toBe(1))

      const attempts = await db.attempts.toArray()
      expect(attempts[0]?.responseMs).toBeLessThan(60_000)
    } finally {
      nowSpy.mockRestore()
      spy.mockRestore()
    }
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: 最終サブ設問の保存が終わる前に「次へ」を押して、
  // attempt未保存のまま advanceSession → リザルトへ進めること
  it('保存が完了するまで「次へ」を出さない', async () => {
    const db = newDb()
    const q = part7Question('p7-saving', 1)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // 待ちはトランザクションの**開始前**に入れる（Dexieのトランザクション内で非Dexieの
    // promiseをawaitすると、そのトランザクションが先にコミットされる＝ADR 0010の制約）
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

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))

    // 正誤表示は出ているが、進行導線はまだ出さない
    await waitFor(() => expect(screen.getByText('正解')).toBeTruthy())
    expect(screen.queryByText('次へ')).toBeNull()

    txSpy.mockRestore()
    release!()
    expect(await screen.findByText('次へ')).toBeTruthy()
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
  })

  // 何を防ぐか（レビュー指摘、2026-08-03）: 保存失敗のまま「次へ」「ここで終了」で進めること
  it('保存失敗後は再試行するまで進行導線を出さない', async () => {
    const db = newDb()
    const q = part7Question('p7-blocked', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])
    const spy = failRatingsOnce(db)

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    expect(
      await screen.findByText('解答を保存できませんでした。空き容量を確認してください'),
    ).toBeTruthy()

    expect(screen.queryByText('次へ')).toBeNull()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()

    fireEvent.click(screen.getByText('保存を再試行する'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.getByText('ここで終了して結果を見る')).toBeTruthy()
    spy.mockRestore()
  })

  // 何を防ぐか: 終了判定に解答スロット数（total）を使うこと（レビュー指摘のP2）。
  // displayIndex は item 単位なので、サブ設問を持つセッションでは最終itemでも判定が
  // 成立せず、範囲外のindexへ進んだ次のレンダーのフォールバックに拾われていた。
  // 到達先は同じ（リザルト）だが、範囲外の状態を一度作るのに依存していた
  it('最終itemの全サブ設問を解答して「次へ」を押すとリザルトへ進む', async () => {
    const db = newDb()
    const q = part7Question('p7-finish', 3)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByText('a'))
      expect(await screen.findByText('次へ')).toBeTruthy()
      if (i < 2) fireEvent.click(await screen.findByText('次へ'))
    }
    await waitFor(async () => expect(await db.attempts.count()).toBe(3))

    fireEvent.click(await screen.findByText('次へ'))
    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
  })
})

// 誤タップの取り消し猶予（T-268。docs/29 Q-113・ADR 0009 2026-08-05 Amendment）。
// 何を防ぐか: 読解の選択肢だけが同じChoiceButtonを使いながら猶予の対象外になっていたこと
// （DrillScreen・VocabScreenには既にADR 0009の猶予が適用済み）。読解は各subQuestionを
// 独立採点するため、DrillScreenの解答経路と同型の猶予で足りる
describe('ReadingScreen: 誤タップの取り消し猶予（T-268。ADR 0009）', () => {
  /** 猶予をONにしたセッション（setupSessionが既定OFFにするため上書きする） */
  async function setupWithUndo(db: BebRaidDatabase, items: SessionItem[], questions: Question[]) {
    const snapshot = await setupSession(db, items, questions)
    await db.settings.put({ key: MISTAP_UNDO_ENABLED_KEY, value: true })
    return snapshot
  }

  it('猶予中は attempts を書かず、解説は出すが「次へ」「ここで終了」は出ない', async () => {
    const db = newDb()
    const q = part7Question('p7-undo-1', 2)
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))

    // 視覚フィードバックは即時（テンポを変えない）
    expect(await screen.findByText('取り消し')).toBeTruthy()
    expect(screen.getByText('正解')).toBeTruthy()
    // 猶予中は記録しない
    expect(await db.attempts.count()).toBe(0)
    // ADR 0009 T-160 Amendmentどおり解説は猶予中も即時に出す
    expect(screen.getByText(/設問0の解説/)).toBeTruthy()
    // 未確定のまま進める導線は出さない
    expect(screen.queryByText('次へ')).toBeNull()
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
  })

  it('猶予が過ぎると記録され、「次へ」が出て「取り消し」が消える', async () => {
    const db = newDb()
    const q = part7Question('p7-undo-2', 2)
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))

    expect(await screen.findByText('次へ')).toBeTruthy()
    expect(screen.queryByText('取り消し')).toBeNull()
  })

  it('取り消しで記録せず次の未解答サブ設問へ進む', async () => {
    const db = newDb()
    const q = part7Question('p7-undo-3', 3)
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    expect(screen.getByTestId('reading-question').textContent).toContain('設問1/3')

    fireEvent.click(screen.getByText('a'))
    fireEvent.click(await screen.findByText('取り消し'))

    // attemptは作らないが、設問1は消化して次の未解答（設問2）へ進む（同じ設問の
    // 再解答は許さない: 正解が既に見えているためisCorrectが偽陽性になる）
    await waitFor(() =>
      expect(screen.getByTestId('reading-question').textContent).toContain('設問2/3'),
    )
    expect(await db.attempts.count()).toBe(0)
  })

  it('最後の1問を取り消すと、記録せずitemを進めてリザルトへ遷移する', async () => {
    const db = newDb()
    const q = part7Question('p7-undo-last', 1)
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a'))
    fireEvent.click(await screen.findByText('取り消し'))

    // 他に未解答のサブ設問が残っていない（このitemで唯一の設問だった）ので、
    // 1問分を未記録のままitemを進める。これが最終itemでもあるためリザルトへ到達する
    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    expect(await db.attempts.count()).toBe(0)
    expect(useSessionStore.getState().snapshot?.attemptIds).toEqual([])
  })

  it('Part6: 別の空所が猶予中の間は、表示中の空所の選択肢が無効化される', async () => {
    const db = newDb()
    const q = part6Question('p6-undo-1')
    await setupWithUndo(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)
    fireEvent.click(screen.getByText('a')) // 空所1に解答（猶予中のまま確定を待たせる）
    expect(await screen.findByText('取り消し')).toBeTruthy()

    // 空所2へジャンプする（3.5節: 閲覧目的のジャンプは猶予中も許す）
    fireEvent.click(screen.getByTestId('passage-blank-2'))
    await waitFor(() =>
      expect(screen.getByTestId('reading-question').textContent).toContain('設問2/4'),
    )
    // 空所1の猶予が残っている間、空所2の選択肢は無効化される（同時に2件の保存が
    // 走る経路を作らないため。usePendingCommitは猶予中の再scheduleで前のpendingを
    // 即flushする＝T-194・Q-107）
    const choiceButton = screen.getByText('a').closest('button')
    expect(choiceButton?.disabled).toBe(true)

    // 空所1の猶予が明けると記録され、空所2は再び操作できるようになる
    await waitFor(async () => expect(await db.attempts.count()).toBe(1))
    await waitFor(() => expect(screen.getByText('a').closest('button')?.disabled).toBe(false))
  })
})

describe('ReadingScreen: 全item解答済みのsnapshotでの初回レンダー（T-320・K-53）', () => {
  // 何を防ぐか: snapshotはあるがitemが無い（=全item解答済み）状態でのfinishSession()
  // 呼び出しが、レンダー本体（return null直前）に書かれていた。通常は最終設問の
  // 「次へ」ボタン（イベントハンドラ）を経由するが、中断復帰などでsnapshot自体が
  // 「既に全問解答済み」のままReadingScreenが最初にレンダーされることもあり、その場合は
  // ボタンクリックを経由せずレンダー本体のガードが初回レンダーで直接実行される。
  // レンダー本体からnavigate/completeSessionを直接呼ぶのはReactのレンダー純粋性に反するため
  // useEffectへ移した（T-320）。この経路が退行してリザルトへ進まなくなることを防ぐ
  it('既に全問解答済みのsnapshotで初回レンダーされた場合もリザルトへ進み、セッションが完了する', async () => {
    const db = newDb()
    const q = part7Question('p7-320', 1)
    const items: SessionItem[] = [{ questionId: q.id, mode: 'solo' }]
    const snapshot = await startSession(db, { items })
    const answeredSnapshot = { ...snapshot, answeredCount: items.length }
    useSessionStore.getState().begin(answeredSnapshot, [q], { L: 400, R: 400 })

    render(<ReadingScreen db={db} />)

    await waitFor(() => expect(useAppStore.getState().screen).toBe('result'))
    const active = await db.settings.get(ACTIVE_SESSION_KEY)
    expect(active).toBeUndefined()
  })
})

describe('readingPaceLabel（T-164。docs/27 のS-13）', () => {
  // 何を防ぐか: 目安を超えても数値が増え続けること（制限時間ではないのに圧だけが増える）
  it('目安（60秒）未満は経過秒数を出し、以降は「1分超」に切り替える', () => {
    expect(readingPaceLabel(0)).toBe('目安1問/分（経過0秒）')
    expect(readingPaceLabel(59)).toBe('目安1問/分（経過59秒）')
    expect(readingPaceLabel(60)).toBe('目安1問/分（1分超）')
    expect(readingPaceLabel(180)).toBe('目安1問/分（1分超）')
  })
})
