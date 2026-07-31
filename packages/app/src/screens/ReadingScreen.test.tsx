// T-104（改番後はT-139）完了条件のテスト（正本: docs/24 3.5節・4節T-139）:
// - Part6（4空所）が表示され、空所をタップして該当設問へジャンプできる
// - 空所を解答すると本文の該当箇所に選択結果が反映される
// - Part7単一（マーカーなし）を順に解答するとattemptsにサブ設問IDで記録され、
//   2/3ルールを使わずRセクションのレートが更新される
// - 中断復帰: 完了済みの1問目（パッセージ）をスキップして2問目から表示される
// - ペース表示（15秒タイマーではない柔らかい目安）が出る
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { applyRatingUpdate } from '../engine/rating'
import { advanceSession, startSession, type SessionItem } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ReadingScreen } from './ReadingScreen'

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
      fireEvent.click(screen.getByText('次へ'))
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
      fireEvent.click(screen.getByText('次へ'))
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
      fireEvent.click(screen.getByText('次へ'))
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
    await waitFor(() => expect(screen.getByText('次へ')).toBeTruthy())
    expect(screen.getByText('ここで終了して結果を見る')).toBeTruthy()

    fireEvent.click(screen.getByText('ここで終了して結果を見る'))
    expect(useAppStore.getState().screen).toBe('result')
  })

  it('最終サブ設問を解答した後は途中終了導線を出さない（「次へ」がitemを進める）', async () => {
    const db = newDb()
    const q = part7Question('p7-exit-last', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    render(<ReadingScreen db={db} />)

    fireEvent.click(screen.getByText('a'))
    await waitFor(() => expect(screen.getByText('次へ')).toBeTruthy())
    fireEvent.click(screen.getByText('次へ'))

    // 2問目（最終）を解答すると全問解答済みになり、導線は消える
    await waitFor(() => expect(screen.getByText('a')).toBeTruthy())
    fireEvent.click(screen.getByText('a'))
    await waitFor(() => expect(screen.getByText('次へ')).toBeTruthy())
    expect(screen.queryByText('ここで終了して結果を見る')).toBeNull()
  })

  // 何を防ぐか: 制限時間ではないのに「経過180秒」と出続けて心理的な圧だけが増えること
  it('目安の1分を超えると経過秒数の表示が「1分超」に切り替わる', async () => {
    const db = newDb()
    const q = part7Question('p7-pace', 2)
    await setupSession(db, [{ questionId: q.id, mode: 'solo' }], [q])

    // Date も含めてフェイクにする（elapsedSec は now() - startedAt で計算するため、
    // setInterval だけ進めても経過時間が変わらない）。setTimeout・Promise は
    // Dexie/fake-indexeddb のデッドロックを避けるためリアルタイムのまま残す
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    render(<ReadingScreen db={db} />)

    // 初期表示は経過秒数つき
    expect(screen.getByText(/目安1問\/分（経過\d+秒）/)).toBeTruthy()

    await vi.advanceTimersByTimeAsync(61_000)

    await vi.waitFor(() => expect(screen.getByText('目安1問/分（1分超）')).toBeTruthy())
    // 数値のカウントアップは止まる（「経過61秒」等は出さない）
    expect(screen.queryByText(/経過\d+秒/)).toBeNull()
  })
})
