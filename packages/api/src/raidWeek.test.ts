import { describe, expect, it } from 'vitest'

import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'

describe('isoWeekInfo', () => {
  it('2024-01-01（月曜）は2024年第1週で、weekStartAtは自分自身の0時になる', () => {
    const epochMs = Date.UTC(2024, 0, 1, 12, 0, 0)
    const info = isoWeekInfo(epochMs)
    expect(info.isoYear).toBe(2024)
    expect(info.isoWeek).toBe(1)
    expect(info.weekStartAt).toBe(Date.UTC(2024, 0, 1))
  })

  it('2019-12-30（月曜）は2020年第1週になる（木曜=2020-01-02が2020年のため）', () => {
    const epochMs = Date.UTC(2019, 11, 30)
    const info = isoWeekInfo(epochMs)
    expect(info.isoYear).toBe(2020)
    expect(info.isoWeek).toBe(1)
  })

  it('2020-12-31（木曜）は2020年第53週になる', () => {
    const epochMs = Date.UTC(2020, 11, 31)
    const info = isoWeekInfo(epochMs)
    expect(info.isoYear).toBe(2020)
    expect(info.isoWeek).toBe(53)
  })

  it('2021-01-01（金曜）は2020年第53週に属する（木曜=2020-12-31が2020年のため）', () => {
    const epochMs = Date.UTC(2021, 0, 1)
    const info = isoWeekInfo(epochMs)
    expect(info.isoYear).toBe(2020)
    expect(info.isoWeek).toBe(53)
  })

  it('週の途中（水曜）の入力でもweekStartAtは同じ週の月曜0時になる', () => {
    const monday = Date.UTC(2026, 6, 13) // 2026-07-13は月曜
    const wednesday = monday + 2 * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000
    const info = isoWeekInfo(wednesday)
    expect(info.weekStartAt).toBe(monday)
  })
})

describe('bossIdFor', () => {
  it('週番号を2桁ゼロパディングしてboss-<年>-W<週>形式にする', () => {
    expect(bossIdFor({ isoYear: 2026, isoWeek: 3 })).toBe('boss-2026-W03')
    expect(bossIdFor({ isoYear: 2026, isoWeek: 30 })).toBe('boss-2026-W30')
  })
})

describe('weekEndAt', () => {
  it('月曜0時UTCから4日+15時間後（=金曜15:00 UTC）になる', () => {
    const monday = Date.UTC(2026, 6, 13)
    const endAt = weekEndAt(monday)
    expect(new Date(endAt).toISOString()).toBe('2026-07-17T15:00:00.000Z')
  })
})

describe('previousWeekInfo', () => {
  it('通常週は週番号が1つ前になる', () => {
    const current = isoWeekInfo(Date.UTC(2026, 6, 13)) // 2026-W29
    const previous = previousWeekInfo(current)
    expect(previous.isoYear).toBe(current.isoYear)
    expect(previous.isoWeek).toBe(current.isoWeek - 1)
  })

  it('年またぎ（2024年第1週の前週）は2023年第52週になる', () => {
    const current = isoWeekInfo(Date.UTC(2024, 0, 1))
    const previous = previousWeekInfo(current)
    expect(previous.isoYear).toBe(2023)
    expect(previous.isoWeek).toBe(52)
  })
})
