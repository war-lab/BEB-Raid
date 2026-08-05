// T-22 完了条件のテスト:
// - 3チャートが fake-indexeddb の実データから描画される（SVG要素の存在・値の反映）
// - 系列色が --chart-* トークンのみ（hex直書きなし）
// - データ0件・1件でも壊れない
// - 数表ビューが3チャート全てにある
import 'fake-indexeddb/auto'
import type { Question } from '@beb-raid/shared-schema'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import { toDateString } from '../engine/date'
import { buildHeatmapCells } from '../engine/heatmapCells'
import { useAppStore } from '../store/appStore'
import { DashboardScreen } from './DashboardScreen'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`dashboard-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

const DAY_MS = 86_400_000

describe('DashboardScreen: データ0件・1件でも壊れない', () => {
  it('全ストア空でも描画でき、データ不足の案内が出る', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)

    expect(await screen.findByText(/まだデータが足りない/)).toBeTruthy()
    expect(await screen.findByText(/対象タグがまだない/)).toBeTruthy()
    // docs/26 A-7: 全日0のときは枠だけの空マスを並べず、次の行動が分かる空状態にする
    // （以前は「15週分の空グリッドを描画する」ことを固定していた）
    expect(document.querySelector('.chart-heatmap svg')).toBeNull()
    expect(await screen.findByText(/まだ記録がありません/)).toBeTruthy()
  })

  it('T-75: 「ホームへ」ボタンでホーム画面へ戻れる', async () => {
    const db = newDb()
    useAppStore.setState({ screen: 'dashboard' })
    render(<DashboardScreen db={db} questionPool={[]} />)

    fireEvent.click(await screen.findByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('伸びグラフのデータが1件だけでも壊れない（2点未満は案内表示）', async () => {
    const db = newDb()
    await db.ratingHistory.put({ date: '2026-07-01', section: 'total', rating: 420 })
    render(<DashboardScreen db={db} questionPool={[]} />)

    expect(await screen.findByText(/まだデータが足りない/)).toBeTruthy()
  })
})

describe('DashboardScreen: 実データからの描画', () => {
  it('伸びグラフが折れ線として描画され、終端値が表示される', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([
      { date: '2026-07-01', section: 'total', rating: 400 },
      { date: '2026-07-05', section: 'total', rating: 430 },
      { date: '2026-07-09', section: 'total', rating: 450 },
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)
    await screen.findByRole('img', { name: /総合レート/ })

    expect(document.querySelector('.chart-line path')).not.toBeNull()
    expect(document.querySelectorAll('.chart-line circle').length).toBe(3)
    // 終端値の直付け表示（数表にも同じ値が出るためSVG内のテキストを直接見る）
    expect(document.querySelector('.chart-line__end-value')?.textContent).toBe('450')
  })

  it('弱点マップが弱い順の横棒として描画され、isWeakタグが強調色になる', async () => {
    const db = newDb()
    await db.tagStats.bulkPut([
      { tag: '品詞', windowCorrect: 2, windowTotal: 10 }, // 20% → 弱点
      { tag: '動詞の形', windowCorrect: 9, windowTotal: 10 }, // 90% → 弱点でない
      { tag: '標本不足', windowCorrect: 0, windowTotal: 2 }, // 最小標本未満 → 非表示
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)

    const rects = await screen.findAllByRole('img', { name: /弱点マップ/ })
    expect(rects.length).toBe(1)
    // 標本不足のタグは表示されない
    expect(screen.queryByText('標本不足')).toBeNull()
    // ラベルはSVGと数表の両方に出るため、SVG側だけを直接見る
    const svgLabels = Array.from(document.querySelectorAll('.chart-bars svg text')).map(
      (t) => t.textContent,
    )
    expect(svgLabels).toContain('品詞')
    expect(svgLabels).toContain('動詞の形')

    const bars = document.querySelectorAll('.chart-bars rect')
    expect(bars.length).toBe(2)
    const fills = Array.from(bars).map((r) => r.getAttribute('fill'))
    expect(fills).toContain('var(--chart-crimson)') // 弱点タグ
    expect(fills).toContain('var(--chart-teal)') // 非弱点タグ
    // hex直書きがないこと
    expect(fills.every((f) => !f || !/^#/.test(f))).toBe(true)
  })

  it('学習ヒートマップが日別解答数から描画される', async () => {
    const db = newDb()
    const now = Date.now()
    await db.attempts.bulkAdd([
      {
        id: 'a1',
        questionId: 'q-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now,
      },
      {
        id: 'a2',
        questionId: 'q-2',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now - DAY_MS,
      },
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)

    const svg = await screen.findByRole('img', { name: /学習ヒートマップ/ })
    expect(svg).toBeTruthy()
    const filledCells = Array.from(document.querySelectorAll('.chart-heatmap rect')).filter(
      (r) => r.getAttribute('fill') !== 'none',
    )
    expect(filledCells.length).toBeGreaterThan(0)
  })

  it('T-74: 表示窓（15週）より古いattemptsは読み込まれず描画にも影響しない', async () => {
    const db = newDb()
    const now = Date.now()
    const WEEK_MS = 7 * DAY_MS
    await db.attempts.bulkAdd([
      {
        id: 'recent',
        questionId: 'q-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now,
      },
      {
        // 表示窓（15週）より古い解答。where('answeredAt').aboveOrEqual(...)で
        // そもそもDBから読まれなくなるはずで、クラッシュせず描画にも影響しない
        id: 'too-old',
        questionId: 'q-2',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now - 16 * WEEK_MS,
      },
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)

    await screen.findByRole('img', { name: /学習ヒートマップ/ })
    const filledCells = Array.from(document.querySelectorAll('.chart-heatmap rect')).filter(
      (r) => r.getAttribute('fill') !== 'none',
    )
    // 「recent」1件分のみが反映される（too-oldはDBクエリの時点で除外される）
    expect(filledCells.length).toBe(1)
  })

  it('3チャート全てに数表ビュー（詳細開閉）がある', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([
      { date: '2026-07-01', section: 'total', rating: 400 },
      { date: '2026-07-02', section: 'total', rating: 410 },
    ])
    await db.tagStats.put({ tag: '品詞', windowCorrect: 1, windowTotal: 10 })
    // docs/26 A-7: ヒートマップは解答が1件も無いと空状態になり数表を持たない。本テストの
    // 意図は「データがある3チャートすべてに数表がある」ことなので、解答を1件与える
    await db.attempts.bulkPut([
      {
        id: 'recent',
        questionId: 'q-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: Date.now(),
      },
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)

    const summaries = await screen.findAllByText('数表で見る')
    expect(summaries.length).toBe(3)
  })
})

describe('DashboardScreen: 成長ランク（M4・T-130）', () => {
  it('ratingHistory不在（新規ユーザー）でもブロンズ0ptが表示される', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)

    const rankSection = await screen.findByTestId('growth-rank')
    expect(rankSection.textContent).toContain('ブロンズ')
    expect(rankSection.textContent).toContain('0pt')
    expect((await screen.findByTestId('growth-rank-next')).textContent).toBe(
      '次のランク（シルバー）まで残り 40pt',
    )
  })

  it('レート上昇分＋学習日数からランクが導出され表示される', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([
      { date: '2026-07-01', section: 'total', rating: 400 },
      { date: '2026-07-05', section: 'total', rating: 445 },
    ])
    await db.ratings.put({ section: 'total', rating: 445, updatedAt: Date.now() })
    await db.attempts.bulkAdd([
      {
        id: 'ga-1',
        questionId: 'q-1',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: new Date(2026, 6, 1, 12).getTime(),
      },
      {
        id: 'ga-2',
        questionId: 'q-2',
        mode: 'solo',
        isCorrect: true,
        responseMs: 1000,
        isTimeout: false,
        isGuess: false,
        answeredAt: new Date(2026, 6, 5, 12).getTime(),
      },
    ])
    render(<DashboardScreen db={db} questionPool={[]} />)

    // (445-400) + 学習日数2 = 47 → シルバー（40以上90未満）
    const rankSection = await screen.findByTestId('growth-rank')
    expect(rankSection.textContent).toContain('シルバー')
    expect(rankSection.textContent).toContain('47pt')
    expect((await screen.findByTestId('growth-rank-next')).textContent).toBe(
      '次のランク（ゴールド）まで残り 43pt',
    )
  })

  // 何を防ぐか: rankPointsはレート差分（小数を持ちうる）＋学習日数の合算なので丸めずに
  // 表示すると「現在 6.450246125604053pt」のような小数が出る（実機所見、docs/29 Q-6）
  it('T-197: rankPointsが小数でも丸めた整数で表示される', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([{ date: '2026-07-01', section: 'total', rating: 400 }])
    await db.ratings.put({
      section: 'total',
      rating: 406.450246125604053,
      updatedAt: Date.now(),
    })
    render(<DashboardScreen db={db} questionPool={[]} />)

    const rankSection = await screen.findByTestId('growth-rank')
    expect(rankSection.textContent).toContain('現在 6pt')
    expect(rankSection.textContent).not.toMatch(/\d+\.\d+pt/)
    expect((await screen.findByTestId('growth-rank-next')).textContent).toBe(
      '次のランク（シルバー）まで残り 34pt',
    )
  })

  // docs/25 V-14: 色＋台座段数の二重符号化。色を落としても段数でランクが判別できること
  it('ランクIDが data-rank に載り、台座の線の本数が段数（ブロンズ=1）になる', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)

    const rankSection = await screen.findByTestId('growth-rank')
    expect(rankSection.getAttribute('data-rank')).toBe('bronze')
    expect(rankSection.querySelectorAll('.dashboard-growth-rank__tier-bar').length).toBe(1)
  })

  it('シルバーでは台座が2本になり、次ランクまでの進捗バーが表示される', async () => {
    const db = newDb()
    await db.ratingHistory.bulkPut([
      { date: '2026-07-01', section: 'total', rating: 400 },
      { date: '2026-07-05', section: 'total', rating: 445 },
    ])
    await db.ratings.put({ section: 'total', rating: 445, updatedAt: Date.now() })
    render(<DashboardScreen db={db} questionPool={[]} />)

    const rankSection = await screen.findByTestId('growth-rank')
    expect(rankSection.getAttribute('data-rank')).toBe('silver')
    expect(rankSection.querySelectorAll('.dashboard-growth-rank__tier-bar').length).toBe(2)
    // rankPoints=45・シルバー(40)→ゴールド(90)なので 5/50 = 10%
    const fill = rankSection.querySelector<HTMLElement>('.dashboard-growth-rank__progress-fill')
    expect(fill?.style.width).toBe('10%')
  })
})

describe('DashboardScreen: 予測スコア・到達予測（M2・T-53）', () => {
  it('ratings不在でも「計測中」表示は壊れず出る', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())
    expect(screen.getByTestId('forecast-message').textContent).toContain('計測中')
  })

  // 何を防ぐか: measuring（データ14日未満）でも予測スコア帯の数値（display-num）を
  // 同時に出すと「604–704」と「計測中」が矛盾して見える（実機所見、docs/29 Q-9）。
  // 排他にする＝measuringの間は数値を一切出さない
  it('T-199: measuringでは予測スコア帯の数値を出さず「計測中」のみになる', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    expect(screen.getByTestId('forecast-message').textContent).toContain('計測中')
    expect(document.querySelector('.dashboard-forecast-hero .display-num')).toBeNull()
    expect(screen.queryByText('予測スコア帯（参考値。社内問題での推定）')).toBeNull()
  })

  it('14日以上の履歴があると断定しない到達予測が表示される（onTrack）', async () => {
    const db = newDb()
    // 回帰窓（直近28日）に収まるよう、実行時刻基準で過去19日分を仕込む
    const base = Date.now() - 19 * 86_400_000
    await db.ratingHistory.bulkPut(
      Array.from({ length: 20 }, (_, i) => ({
        date: toDateString(base + i * 86_400_000),
        section: 'total' as const,
        rating: 400 + i * 4,
      })),
    )
    await db.ratings.put({ section: 'total', rating: 476, updatedAt: Date.now() })
    render(<DashboardScreen db={db} questionPool={[]} />)

    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())
    const message = screen.getByTestId('forecast-message').textContent!
    expect(message).toContain('参考値')
    expect(message).not.toMatch(/します|なります|保証/) // 断定表現を含まない
    // T-199: measuringでないときは排他の反対側（数値が出る）も壊れていないことを確認する
    expect(document.querySelector('.dashboard-forecast-hero .display-num')).not.toBeNull()
  })

  it('実試験スコアを登録すると一覧に表示され、予測帯との差が併記される', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-14' } })
    fireEvent.change(screen.getByLabelText('L'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '410' } })
    fireEvent.click(screen.getByText('登録'))

    const list = await screen.findByTestId('exam-score-list')
    expect(list.textContent).toContain('2026-07-14')
    expect(list.textContent).toContain('合計810')
    expect(await db.examScores.count()).toBe(1)
  })
})

// 何を防ぐか（T-205。docs/29 Q-53）: L/Rは本来各5〜495点なのに範囲検証が無く、
// 桁誤り（例: 650を6500と入力）がそのまま登録され、修正・削除手段も無いため
// 「予測帯との差」表示に誤登録が残り続けていた
describe('DashboardScreen: 実試験スコアの範囲検証・修正・削除（T-205）', () => {
  it('L/Rが範囲外（5〜495の外）だと登録ボタンが無効になり、理由が表示される', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-14' } })
    fireEvent.change(screen.getByLabelText('L'), { target: { value: '6500' } }) // 桁誤り
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '410' } })

    expect(screen.getByText(/Lは5〜495の範囲で入力してください/)).toBeTruthy()
    expect((screen.getByText('登録') as HTMLButtonElement).disabled).toBe(true)

    // 直接handleRegisterExamScoreを叩かれても（disabledを迂回する経路があっても）多層防御で拒否される
    fireEvent.submit(screen.getByText('登録').closest('form')!)
    expect(await db.examScores.count()).toBe(0)
  })

  it('範囲の境界値（5・495）は登録でき、範囲外（4・496）は拒否される', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-14' } })
    fireEvent.change(screen.getByLabelText('L'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '496' } })
    expect((screen.getByText('登録') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('L'), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '495' } })
    expect((screen.getByText('登録') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByText('登録'))

    await waitFor(async () => expect(await db.examScores.count()).toBe(1))
  })

  it('登録済みスコアを編集できる（同じidのまま値だけ更新される）', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-14' } })
    fireEvent.change(screen.getByLabelText('L'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '410' } })
    fireEvent.click(screen.getByText('登録'))
    await screen.findByTestId('exam-score-list')
    const originalId = (await db.examScores.toArray())[0]!.id

    fireEvent.click(screen.getByText('編集'))
    // フォームに既存値が流し込まれる
    expect((screen.getByLabelText('L') as HTMLInputElement).value).toBe('400')
    expect(screen.getByText('更新')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('L'), { target: { value: '450' } })
    fireEvent.click(screen.getByText('更新'))

    await waitFor(() =>
      expect(screen.getByTestId('exam-score-list').textContent).toContain('合計860'),
    )
    // 新規行が増えたのではなく、同じidの内容が更新されている
    expect(await db.examScores.count()).toBe(1)
    expect((await db.examScores.toArray())[0]!.id).toBe(originalId)
    expect((await db.examScores.toArray())[0]!.listening).toBe(450)
  })

  it('削除は確認を経てから実行され、キャンセルでは消えない', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} questionPool={[]} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('日付'), { target: { value: '2026-07-14' } })
    fireEvent.change(screen.getByLabelText('L'), { target: { value: '400' } })
    fireEvent.change(screen.getByLabelText('R'), { target: { value: '410' } })
    fireEvent.click(screen.getByText('登録'))
    await screen.findByTestId('exam-score-list')

    fireEvent.click(screen.getByText('削除'))
    expect(await screen.findByTestId('confirm-overlay')).toBeTruthy()

    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByTestId('confirm-overlay')).toBeNull()
    expect(await db.examScores.count()).toBe(1)

    fireEvent.click(screen.getByText('削除'))
    fireEvent.click(await screen.findByText('削除する'))

    await waitFor(async () => expect(await db.examScores.count()).toBe(0))
    expect(screen.queryByTestId('exam-score-list')).toBeNull()
  })
})

describe('buildHeatmapCells: 曜日整列（GitHub草式グリッド）', () => {
  it('先頭セルの曜日が日曜（getDay()===0）になるよう余白セルを詰める', () => {
    const now = new Date(2026, 6, 10).getTime() // 2026-07-10（金曜）
    const cells = buildHeatmapCells(new Map(), now, 2)
    // 実データ開始（count>=0）の直前までが余白（count:-1）
    const firstRealIndex = cells.findIndex((c) => c.count >= 0)
    expect(firstRealIndex).toBeGreaterThanOrEqual(0)
    // 余白セル数 = 実データ先頭日の曜日番号と一致する
    const firstRealDate = new Date(cells[firstRealIndex]!.date)
    expect(firstRealIndex).toBe(firstRealDate.getDay())
  })

  it('countsByDate の値が対応する日付のセルに反映される', () => {
    const now = new Date(2026, 6, 10).getTime()
    const dateKey = toDateString(now)
    const counts = new Map([[dateKey, 7]])
    const cells = buildHeatmapCells(counts, now, 2)
    const todayCell = cells.find((c) => c.date === dateKey)
    expect(todayCell?.count).toBe(7)
  })
})

describe('DashboardScreen: 読解のペース指標（T-145。docs/24 3.5節）', () => {
  const readingQuestion: Question = {
    id: 'p7-dash',
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    passages: [{ id: 'p7-dash-p1', kind: 'email', text: '本文' }],
    subQuestions: Array.from({ length: 3 }, (_, i) => ({
      id: `p7-dash-q${i}`,
      question: `設問${i}`,
      choices: [
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
      answer: 'A',
      explanation: '',
      translation: '',
    })),
  }

  async function seedReadingAttempts(db: BebRaidDatabase, responseMs: number, count: number) {
    const now = Date.now()
    await db.attempts.bulkAdd(
      Array.from({ length: count }, (_, i) => ({
        id: `rp-${i}`,
        questionId: `p7-dash-q${i % 3}`,
        mode: 'solo' as const,
        isCorrect: true,
        responseMs,
        isTimeout: false,
        isGuess: false,
        answeredAt: now - i * 1000,
      })),
    )
  }

  it('読解の平均解答時間と目標ペースとの差を表示する', async () => {
    const db = newDb()
    await seedReadingAttempts(db, 80_000, 6)

    render(<DashboardScreen db={db} questionPool={[readingQuestion]} />)

    const metric = await screen.findByTestId('reading-pace')
    expect(metric.textContent).toContain('1問あたり1分20秒')
    expect(metric.textContent).toContain('6問')
    // 目標60秒より20秒遅い
    expect(screen.getByText(/より20秒遅いペースです/)).toBeTruthy()
  })

  it('目標より速い場合は「速いペース」と表示する', async () => {
    const db = newDb()
    await seedReadingAttempts(db, 45_000, 6)

    render(<DashboardScreen db={db} questionPool={[readingQuestion]} />)

    await screen.findByTestId('reading-pace')
    expect(screen.getByText(/より15秒速いペースです/)).toBeTruthy()
  })

  // 何を防ぐか: 1問の当たり外れで揺れる平均を見せて判断を誤らせること
  it('サンプルが足りなければ節ごと表示しない', async () => {
    const db = newDb()
    await seedReadingAttempts(db, 80_000, 3)

    render(<DashboardScreen db={db} questionPool={[readingQuestion]} />)

    // 他の節（弱点マップ）が描画されるまで待ってから、ペース節が無いことを確認する
    await screen.findByText('弱点マップ')
    expect(screen.queryByTestId('reading-pace')).toBeNull()
    expect(screen.queryByText('読解のペース')).toBeNull()
  })

  it('読解の解答が無ければ表示しない（他パートの解答では出さない）', async () => {
    const db = newDb()
    const now = Date.now()
    await db.attempts.bulkAdd(
      Array.from({ length: 10 }, (_, i) => ({
        id: `p5-${i}`,
        questionId: 'p5-dash',
        mode: 'solo' as const,
        isCorrect: true,
        responseMs: 20_000,
        isTimeout: false,
        isGuess: false,
        answeredAt: now - i * 1000,
      })),
    )

    render(<DashboardScreen db={db} questionPool={[readingQuestion]} />)

    await screen.findByText('弱点マップ')
    expect(screen.queryByTestId('reading-pace')).toBeNull()
  })
})
