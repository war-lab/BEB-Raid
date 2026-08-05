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

/**
 * 'YYYY-MM-DD' → その日のローカル0時の epoch ms。
 * 月・日の範囲外成分（例: '2026-13-45'）は Date コンストラクタが繰り上げ解釈して
 * 別の暦日になってしまうため、構築後の年月日が入力と一致するかで検出する（T-191・Q-109）
 */
export function parseDateString(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    throw new Error(`暦日文字列が不正: ${date}`)
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12) {
    throw new Error(`暦日文字列が不正: ${date}`)
  }
  const parsed = new Date(y, m - 1, d)
  if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
    throw new Error(`暦日文字列が不正: ${date}`)
  }
  return parsed.getTime()
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
