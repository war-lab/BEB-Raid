import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from './relativeTime'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

describe('formatRelativeTime', () => {
  it('0分前を返す（0ms経過）', () => {
    expect(formatRelativeTime(0)).toBe('0分前')
  })

  it('59分は分単位のまま', () => {
    expect(formatRelativeTime(59 * MINUTE_MS)).toBe('59分前')
  })

  it('ちょうど60分（=60分超の境界）は時間単位に切り替わる', () => {
    expect(formatRelativeTime(HOUR_MS)).toBe('1時間前')
  })

  it('23時間59分は時間単位のまま', () => {
    expect(formatRelativeTime(23 * HOUR_MS + 59 * MINUTE_MS)).toBe('23時間前')
  })

  it('ちょうど24時間（=24時間超の境界）は日単位に切り替わる', () => {
    expect(formatRelativeTime(DAY_MS)).toBe('1日前')
  })

  it('3日経過なら3日前', () => {
    expect(formatRelativeTime(3 * DAY_MS + 12 * HOUR_MS)).toBe('3日前')
  })

  it('負値は0扱いにする（未来時刻の誤差を吸収）', () => {
    expect(formatRelativeTime(-500)).toBe('0分前')
  })
})
