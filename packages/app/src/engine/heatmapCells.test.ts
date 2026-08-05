// heatmapCells.ts 専用テスト（T-264。29の11節「テスト空白地帯」）。
// 何を防ぐか: 週境界（GitHub草式のグリッド整列に使う日曜始まり計算）と
// 曜日パディング（count:-1の余白セル）の崩れ。ズレるとDashboardScreen・HomeScreenの
// ヒートマップの列がずれ、日付と実際の学習日が食い違って表示される。

import { describe, expect, it } from 'vitest'
import { buildHeatmapCells } from './heatmapCells'

describe('buildHeatmapCells', () => {
  it('日曜始まりでないと先頭に曜日分のパディング（count:-1）が入る（2026-08-05は水曜）', () => {
    const now = new Date(2026, 7, 5).getTime() // 2026-08-05 水曜（getDay()===3）
    const cells = buildHeatmapCells(new Map(), now, 2)

    // weeks*7=14日分の実データセルの前に、直近の日曜まで遡るための4セル（木〜土の並びの前）
    // が余白として入る。実データの先頭日（2026-07-23、木曜）のgetDay()===4がパディング数と一致する
    const padding = cells.filter((c) => c.count === -1)
    expect(padding).toHaveLength(4)
    expect(padding.every((c) => c.date.startsWith('pad-'))).toBe(true)
    expect(cells.length).toBe(4 + 14)

    const realCells = cells.filter((c) => c.count !== -1)
    expect(realCells[0]!.date).toBe('2026-07-23')
    expect(realCells.at(-1)!.date).toBe('2026-08-05')
  })

  it('表示開始日がちょうど日曜ならパディングが入らない（2026-08-01は土曜）', () => {
    const now = new Date(2026, 7, 1).getTime() // 2026-08-01 土曜（getDay()===6）
    const cells = buildHeatmapCells(new Map(), now, 2)

    // 直近14日の先頭（2026-07-19）が日曜のケース
    const padding = cells.filter((c) => c.count === -1)
    expect(padding).toHaveLength(0)
    expect(cells).toHaveLength(14)
    expect(cells[0]!.date).toBe('2026-07-19')
    expect(new Date(2026, 6, 19).getDay()).toBe(0)
  })

  it('実データセルは日付の昇順で今日で終わり、月境界を跨いでも欠落・重複しない', () => {
    const now = new Date(2026, 7, 5).getTime() // 2026-08-05
    const cells = buildHeatmapCells(new Map(), now, 2)
    const realDates = cells.filter((c) => c.count !== -1).map((c) => c.date)

    expect(realDates).toHaveLength(14)
    expect(new Set(realDates).size).toBe(14) // 重複なし
    // 昇順で連続している（前日+1日=当日）ことを日付文字列の並びで確認
    const sorted = [...realDates].sort()
    expect(realDates).toEqual(sorted)
    expect(realDates).toContain('2026-07-31')
    expect(realDates).toContain('2026-08-01')
    expect(realDates[realDates.length - 1]).toBe('2026-08-05')
  })

  it('countsByDateにある日付はその件数を反映し、無い日は0になる', () => {
    const now = new Date(2026, 7, 5).getTime()
    const counts = new Map([
      ['2026-08-05', 3],
      ['2026-08-01', 7],
    ])
    const cells = buildHeatmapCells(counts, now, 1)

    const byDate = new Map(cells.map((c) => [c.date, c.count]))
    expect(byDate.get('2026-08-05')).toBe(3)
    expect(byDate.get('2026-08-01')).toBe(7)
    expect(byDate.get('2026-08-02')).toBe(0) // 記録の無い日は0
  })

  it('weeksを増やすと表示開始日はより過去になるが、パディング数は変わらない（今日の曜日にのみ依存）', () => {
    const now = new Date(2026, 7, 5).getTime() // 水曜
    const oneWeek = buildHeatmapCells(new Map(), now, 1)
    const fourWeeks = buildHeatmapCells(new Map(), now, 4)

    const paddingOf = (cells: ReturnType<typeof buildHeatmapCells>) =>
      cells.filter((c) => c.count === -1).length
    expect(paddingOf(oneWeek)).toBe(4)
    expect(paddingOf(fourWeeks)).toBe(4)
    expect(oneWeek.filter((c) => c.count !== -1)).toHaveLength(7)
    expect(fourWeeks.filter((c) => c.count !== -1)).toHaveLength(28)
  })
})
