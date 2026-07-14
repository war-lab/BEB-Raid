// T-40 完了条件のテスト:
// - エクスポートJSON→週次集計（学習日数・セッション数近似・SRS消化率）
import { describe, expect, it } from 'vitest'
import {
  aggregateWeeklyKpi,
  countApproxSessions,
  isoWeekKey,
  parseKpiExport,
  renderWeeklyKpiTable,
  type KpiAttempt,
  type KpiSrsCard,
} from './kpi.js'

function attempt(questionId: string, answeredAt: number, isCorrect = true): KpiAttempt {
  return { questionId, isCorrect, answeredAt }
}

describe('parseKpiExport', () => {
  it('BackupFile形式からattempts/srsCardsを取り出す', () => {
    const data = {
      stores: {
        attempts: [{ questionId: 'q-1', isCorrect: true, answeredAt: 1000, extra: 'x' }],
        srsCards: [{ dueAt: 2000, introducedDate: '2026-07-01', extra: 'y' }],
      },
    }
    const result = parseKpiExport(data)
    expect(result.attempts).toEqual([{ questionId: 'q-1', isCorrect: true, answeredAt: 1000 }])
    expect(result.srsCards).toEqual([{ dueAt: 2000, introducedDate: '2026-07-01' }])
  })

  it('storesが無ければエラー', () => {
    expect(() => parseKpiExport({})).toThrow()
  })

  it('attemptsにanswered Atが無ければエラー', () => {
    expect(() =>
      parseKpiExport({
        stores: { attempts: [{ questionId: 'q-1', isCorrect: true }], srsCards: [] },
      }),
    ).toThrow()
  })

  it('srsCardsが配列でなければエラー', () => {
    expect(() => parseKpiExport({ stores: { attempts: [], srsCards: 'x' } })).toThrow()
  })

  it('introducedDateが無ければnullとして扱う', () => {
    const data = { stores: { attempts: [], srsCards: [{ dueAt: 1000 }] } }
    expect(parseKpiExport(data).srsCards).toEqual([{ dueAt: 1000, introducedDate: null }])
  })
})

describe('isoWeekKey', () => {
  it('同一週内の日付は同じ週キーになる', () => {
    // 2026-07-13(月)〜2026-07-19(日)は同一ISO週
    const monday = Date.UTC(2026, 6, 13)
    const sunday = Date.UTC(2026, 6, 19, 23, 59)
    expect(isoWeekKey(monday)).toBe(isoWeekKey(sunday))
  })

  it('週をまたぐと異なる週キーになる', () => {
    const sunday = Date.UTC(2026, 6, 19)
    const nextMonday = Date.UTC(2026, 6, 20)
    expect(isoWeekKey(sunday)).not.toBe(isoWeekKey(nextMonday))
  })
})

describe('countApproxSessions', () => {
  it('30分未満の間隔は同一セッションとして数える', () => {
    const base = Date.UTC(2026, 6, 13, 8, 0)
    const attempts = [
      attempt('q-1', base),
      attempt('q-2', base + 5 * 60_000),
      attempt('q-3', base + 10 * 60_000),
    ]
    expect(countApproxSessions(attempts)).toBe(1)
  })

  it('30分以上の間隔は別セッションとして数える', () => {
    const base = Date.UTC(2026, 6, 13, 8, 0)
    const attempts = [attempt('q-1', base), attempt('q-2', base + 31 * 60_000)]
    expect(countApproxSessions(attempts)).toBe(2)
  })

  it('0件は0を返す', () => {
    expect(countApproxSessions([])).toBe(0)
  })
})

describe('aggregateWeeklyKpi', () => {
  it('週ごとに学習日数を集計する', () => {
    const day1 = Date.UTC(2026, 6, 13, 8, 0)
    const day2 = Date.UTC(2026, 6, 14, 8, 0)
    const attempts = [attempt('q-1', day1), attempt('q-2', day2)]
    const rows = aggregateWeeklyKpi(attempts, [])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.studyDays).toBe(2)
  })

  it('srsCardsが空ならSRS消化率はnull', () => {
    const day1 = Date.UTC(2026, 6, 13, 8, 0)
    const rows = aggregateWeeklyKpi([attempt('q-1', day1)], [])
    expect(rows[0]!.srsCompletionRate).toBeNull()
  })

  it('導入済みsrsCardsがあれば消化率を算出する', () => {
    const weekStart = Date.UTC(2026, 6, 13, 8, 0)
    const attempts = [attempt('q-1', weekStart)]
    const srsCards: KpiSrsCard[] = [
      { dueAt: weekStart + 86_400_000, introducedDate: '2026-07-01' },
      { dueAt: weekStart - 30 * 86_400_000, introducedDate: '2026-06-01' },
    ]
    const rows = aggregateWeeklyKpi(attempts, srsCards)
    expect(rows[0]!.srsCompletionRate).not.toBeNull()
  })

  it('attemptsが無い週は出力に含まれない', () => {
    expect(aggregateWeeklyKpi([], [])).toEqual([])
  })
})

describe('renderWeeklyKpiTable', () => {
  it('タブ区切りの表形式を出力する', () => {
    const output = renderWeeklyKpiTable([
      { week: '2026-W29', studyDays: 3, approxSessions: 4, srsCompletionRate: 0.5 },
    ])
    expect(output).toContain('2026-W29')
    expect(output).toContain('50%')
    expect(output).toContain('近似')
  })

  it('SRS消化率がnullならN/Aと表示する', () => {
    const output = renderWeeklyKpiTable([
      { week: '2026-W29', studyDays: 1, approxSessions: 1, srsCompletionRate: null },
    ])
    expect(output).toContain('N/A')
  })
})
