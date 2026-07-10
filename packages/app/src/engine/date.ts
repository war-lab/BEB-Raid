// 暦日ヘルパー（端末ローカルタイムゾーン基準。db/schema.ts の時刻規約に従う）。
//
// SRSの間隔・ストリークは「暦日」単位の概念であり、epoch ms の単純加算
// （+24h×n）では深夜跨ぎで日付がずれる。ここで暦日演算に一本化する。

/** epoch ms → ローカル暦日 'YYYY-MM-DD' */
export function toDateString(epochMs: number): string {
  const d = new Date(epochMs)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 'YYYY-MM-DD' → その日のローカル0時の epoch ms */
export function parseDateString(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined || Number.isNaN(y + m + d)) {
    throw new Error(`暦日文字列が不正: ${date}`)
  }
  return new Date(y, m - 1, d).getTime()
}

/** その時刻を含むローカル日の0時（epoch ms） */
export function startOfLocalDay(epochMs: number): number {
  const d = new Date(epochMs)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * now から days 日後のローカル0時（epoch ms）。
 * Date の暦日演算を使うため DST 跨ぎでも暦日がずれない
 */
export function localMidnightAfterDays(epochMs: number, days: number): number {
  const d = new Date(epochMs)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/** 暦日どうしの差（b - a、日数）。同日=0、b が翌日=1 */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateString(b) - parseDateString(a)) / 86_400_000)
}
