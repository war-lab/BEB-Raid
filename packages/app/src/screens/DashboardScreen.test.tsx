// T-22 完了条件のテスト:
// - 3チャートが fake-indexeddb の実データから描画される（SVG要素の存在・値の反映）
// - 系列色が --chart-* トークンのみ（hex直書きなし）
// - データ0件・1件でも壊れない
// - 数表ビューが3チャート全てにある
import 'fake-indexeddb/auto'
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
    render(<DashboardScreen db={db} />)

    expect(await screen.findByText(/まだデータが足りない/)).toBeTruthy()
    expect(await screen.findByText(/対象タグがまだない/)).toBeTruthy()
    // ヒートマップは0件でも15週分の空グリッドとして描画される（クラッシュしない）
    expect(document.querySelector('.chart-heatmap svg')).not.toBeNull()
  })

  it('T-75: 「ホームへ」ボタンでホーム画面へ戻れる', async () => {
    const db = newDb()
    useAppStore.setState({ screen: 'dashboard' })
    render(<DashboardScreen db={db} />)

    fireEvent.click(await screen.findByText('ホームへ'))
    expect(useAppStore.getState().screen).toBe('home')
  })

  it('伸びグラフのデータが1件だけでも壊れない（2点未満は案内表示）', async () => {
    const db = newDb()
    await db.ratingHistory.put({ date: '2026-07-01', section: 'total', rating: 420 })
    render(<DashboardScreen db={db} />)

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
    render(<DashboardScreen db={db} />)
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
    render(<DashboardScreen db={db} />)

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
    render(<DashboardScreen db={db} />)

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
    render(<DashboardScreen db={db} />)

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
    render(<DashboardScreen db={db} />)

    const summaries = await screen.findAllByText('数表で見る')
    expect(summaries.length).toBe(3)
  })
})

describe('DashboardScreen: 予測スコア・到達予測（M2・T-53）', () => {
  it('ratings不在でもヒーロー数値と「計測中」表示が壊れず出る', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} />)
    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())
    expect(screen.getByTestId('forecast-message').textContent).toContain('計測中')
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
    render(<DashboardScreen db={db} />)

    await waitFor(() => expect(screen.getByTestId('forecast-message')).toBeTruthy())
    const message = screen.getByTestId('forecast-message').textContent!
    expect(message).toContain('参考値')
    expect(message).not.toMatch(/します|なります|保証/) // 断定表現を含まない
  })

  it('実試験スコアを登録すると一覧に表示され、予測帯との差が併記される', async () => {
    const db = newDb()
    render(<DashboardScreen db={db} />)
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
