// ISO週番号・週境界の算出（正本: docs/17_M3実装計画.md 3.4節）。
// bossId = `boss-<ISO年>-W<ISO週番号2桁>`。週の境界は月曜0:00 UTC〜金曜15:00 UTC
// （=JST月曜9:00生成〜金曜24:00締切）

const DAY_MS = 24 * 60 * 60 * 1000

export interface IsoWeekInfo {
  isoYear: number
  isoWeek: number
  /** そのISO週の月曜0:00 UTC（epoch ms） */
  weekStartAt: number
}

/** ISO 8601週番号（月曜始まり・その週の木曜が属する年を週の年とする） */
export function isoWeekInfo(epochMs: number): IsoWeekInfo {
  const date = new Date(epochMs)
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const dayNr = (new Date(utcMidnight).getUTCDay() + 6) % 7 // 月=0 ... 日=6
  const thursday = utcMidnight - dayNr * DAY_MS + 3 * DAY_MS
  const isoYear = new Date(thursday).getUTCFullYear()

  const jan4 = Date.UTC(isoYear, 0, 4)
  const jan4DayNr = (new Date(jan4).getUTCDay() + 6) % 7
  const week1Monday = jan4 - jan4DayNr * DAY_MS

  const isoWeek = Math.round((thursday - week1Monday) / (7 * DAY_MS)) + 1
  const weekStartAt = utcMidnight - dayNr * DAY_MS

  return { isoYear, isoWeek, weekStartAt }
}

export function bossIdFor(info: Pick<IsoWeekInfo, 'isoYear' | 'isoWeek'>): string {
  return `boss-${info.isoYear}-W${String(info.isoWeek).padStart(2, '0')}`
}

/** 週の終了時刻（金曜15:00 UTC = 月曜0:00 UTC + 4日 + 15時間） */
export function weekEndAt(weekStartAt: number): number {
  return weekStartAt + 4 * DAY_MS + 15 * 60 * 60 * 1000
}

/** 直前のISO週の情報（EMA更新で前週ボスを参照するために使う） */
export function previousWeekInfo(current: IsoWeekInfo): IsoWeekInfo {
  return isoWeekInfo(current.weekStartAt - DAY_MS)
}
