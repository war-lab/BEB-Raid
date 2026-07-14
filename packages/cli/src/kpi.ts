// ドッグフード計測支援（T-40。正本: docs/13 3.11節、docs/06 4節、docs/08 T-36〜T-38行）。
//
// 発起人端末のエクスポートJSON（services/backup.tsのBackupFile形式）から、
// 週あたり学習日数・電車セッション数/週・SRS消化率を算出する純粋関数群。
// calibrate.ts と同じ方針で app パッケージの型には依存しない

import type { ExportedAttempt } from './calibrate.js'

/** エクスポートJSONのうち kpi が使う最小限のフィールド（calibrate.tsのExportedAttemptに日時を追加） */
export interface KpiAttempt extends ExportedAttempt {
  answeredAt: number
}

/** srsCards のうち kpi が使う最小限のフィールド */
export interface KpiSrsCard {
  dueAt: number
  introducedDate: string | null
}

/**
 * エクスポートJSON（BackupFile形式）から kpi が使う attempts/srsCards を取り出す。
 * calibrate.ts の parseExportedAttempts と同じ厳格さ（形式不正なら例外）
 */
export function parseKpiExport(data: unknown): { attempts: KpiAttempt[]; srsCards: KpiSrsCard[] } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('エクスポートJSONがオブジェクトではない')
  }
  const stores = (data as Record<string, unknown>).stores
  if (typeof stores !== 'object' || stores === null) {
    throw new Error('エクスポートJSONに stores が無い')
  }
  const s = stores as Record<string, unknown>

  const rawAttempts = s.attempts
  if (!Array.isArray(rawAttempts)) {
    throw new Error('エクスポートJSONに stores.attempts が無い（配列ではない）')
  }
  const attempts = rawAttempts.map((a, i) => {
    if (typeof a !== 'object' || a === null) {
      throw new Error(`stores.attempts[${i}] がオブジェクトではない`)
    }
    const r = a as Record<string, unknown>
    if (
      typeof r.questionId !== 'string' ||
      typeof r.isCorrect !== 'boolean' ||
      typeof r.answeredAt !== 'number'
    ) {
      throw new Error(
        `stores.attempts[${i}] に questionId(string)/isCorrect(boolean)/answeredAt(number) が無い`,
      )
    }
    return { questionId: r.questionId, isCorrect: r.isCorrect, answeredAt: r.answeredAt }
  })

  const rawSrsCards = s.srsCards
  if (!Array.isArray(rawSrsCards)) {
    throw new Error('エクスポートJSONに stores.srsCards が無い（配列ではない）')
  }
  const srsCards = rawSrsCards.map((c, i) => {
    if (typeof c !== 'object' || c === null) {
      throw new Error(`stores.srsCards[${i}] がオブジェクトではない`)
    }
    const r = c as Record<string, unknown>
    if (typeof r.dueAt !== 'number') {
      throw new Error(`stores.srsCards[${i}] に dueAt(number) が無い`)
    }
    const introducedDate = typeof r.introducedDate === 'string' ? r.introducedDate : null
    return { dueAt: r.dueAt, introducedDate }
  })

  return { attempts, srsCards }
}

/** ISO週番号（YYYY-Www形式）を epoch ms から算出する（月曜始まり） */
export function isoWeekKey(epochMs: number): string {
  const d = new Date(epochMs)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // 木曜日基準のISO週番号アルゴリズム
  const dayNum = (utc.getUTCDay() + 6) % 7
  utc.setUTCDate(utc.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((utc.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/**
 * attempts を30分間隔でクラスタリングし「セッション」とみなす近似（正本: 13の3.11節）。
 * activeSession の完了記録は取れないため、時系列でソートしギャップ30分以上を境界とする
 */
const SESSION_GAP_MS = 30 * 60_000

export function countApproxSessions(attempts: readonly KpiAttempt[]): number {
  if (attempts.length === 0) return 0
  const sorted = [...attempts].sort((a, b) => a.answeredAt - b.answeredAt)
  let sessions = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.answeredAt - sorted[i - 1]!.answeredAt >= SESSION_GAP_MS) sessions++
  }
  return sessions
}

export interface WeeklyKpi {
  week: string
  studyDays: number
  approxSessions: number
  srsCompletionRate: number | null
}

/**
 * ISO週ごとに 学習日数（attemptsのある日数）・セッション数近似・SRS消化率を集計する。
 * SRS消化率 = その週にdueだったカードのうち、その週内に復習された（dueAtがその週より後に
 * 更新された）割合。近似計算であり、複数回復習されたカードの中間状態は捕捉できない
 */
export function aggregateWeeklyKpi(
  attempts: readonly KpiAttempt[],
  srsCards: readonly KpiSrsCard[],
): WeeklyKpi[] {
  const dayByWeek = new Map<string, Set<string>>()
  const attemptsByWeek = new Map<string, KpiAttempt[]>()
  for (const a of attempts) {
    const week = isoWeekKey(a.answeredAt)
    const day = new Date(a.answeredAt).toISOString().slice(0, 10)
    if (!dayByWeek.has(week)) dayByWeek.set(week, new Set())
    dayByWeek.get(week)!.add(day)
    if (!attemptsByWeek.has(week)) attemptsByWeek.set(week, [])
    attemptsByWeek.get(week)!.push(a)
  }

  const weeks = [...dayByWeek.keys()].sort()
  return weeks.map((week) => {
    const studyDays = dayByWeek.get(week)!.size
    const approxSessions = countApproxSessions(attemptsByWeek.get(week) ?? [])
    const srsCompletionRate = estimateSrsCompletionRate(srsCards, week)
    return { week, studyDays, approxSessions, srsCompletionRate }
  })
}

/**
 * SRS消化率の近似。「導入済みカードのうち、当該週の時点で次回期限が未来に進んでいる」割合を
 * 現在のsrsCardsスナップショットから推定する（週次の履歴を持たないための簡易近似。
 * 精度より運用開始のしやすさを優先=13の3.11節の位置づけ）
 */
function estimateSrsCompletionRate(srsCards: readonly KpiSrsCard[], week: string): number | null {
  const introduced = srsCards.filter((c) => c.introducedDate !== null)
  if (introduced.length === 0) return null
  const weekStartMs = isoWeekStartMs(week)
  const weekEndMs = weekStartMs + 7 * 86_400_000
  const dueInWeek = introduced.filter((c) => c.dueAt < weekEndMs)
  if (dueInWeek.length === 0) return null
  const reviewed = dueInWeek.filter((c) => c.dueAt >= weekStartMs)
  return reviewed.length / dueInWeek.length
}

function isoWeekStartMs(weekKey: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey)
  if (!match) throw new Error(`不正なISO週キー: ${weekKey}`)
  const year = Number(match[1])
  const week = Number(match[2])
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7
  const week1Monday = jan4.getTime() - jan4DayNum * 86_400_000
  return week1Monday + (week - 1) * 7 * 86_400_000
}

/** stdout向けの表形式レンダリング */
export function renderWeeklyKpiTable(rows: readonly WeeklyKpi[]): string {
  const header = ['週', '学習日数', 'セッション数(近似)', 'SRS消化率']
  const lines = [
    header.join('\t'),
    ...rows.map((r) =>
      [
        r.week,
        String(r.studyDays),
        String(r.approxSessions),
        r.srsCompletionRate === null ? 'N/A' : `${Math.round(r.srsCompletionRate * 100)}%`,
      ].join('\t'),
    ),
    '',
    '※ セッション数は attempts を30分間隔でクラスタリングした近似値（activeSessionの完了記録からの厳密集計ではない）',
    '※ SRS消化率は当該週時点のsrsCardsスナップショットからの近似値（週次履歴を保持しないための簡易推定）',
  ]
  return lines.join('\n')
}
