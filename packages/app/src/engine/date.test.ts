// date.ts 専用テスト（T-191・Q-109）。暦日ヘルパーはSRS・ストリーク・ヒートマップ全ての
// 基盤だが専用テストが無かった（docs/29 11節）。月末・年末跨ぎ、DST跨ぎ（実TZに影響されず
// 検証するためprocess.env.TZを一時的に切り替える）、不正文字列の拒否を確認する。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  daysBetween,
  localMidnightAfterDays,
  parseDateString,
  startOfLocalDay,
  toDateString,
} from './date'

describe('toDateString / parseDateString: 往復変換', () => {
  it('epoch→暦日文字列→暦日0時のepochに戻る', () => {
    const epoch = new Date(2026, 6, 14, 15, 30).getTime()
    const dateStr = toDateString(epoch)
    expect(dateStr).toBe('2026-07-14')
    expect(parseDateString(dateStr)).toBe(new Date(2026, 6, 14).getTime())
  })

  it('月・日が1桁でも0埋めされる', () => {
    expect(toDateString(new Date(2026, 0, 5).getTime())).toBe('2026-01-05')
  })
})

// 何を防ぐか（T-312・K-45）: epochMsがNaN等の非有限値だと、new Date(NaN)は例外を投げず
// 「Invalid Date」を返し、getFullYear()等もNaNを返すため "NaN-NaN-NaN" という一見文字列に
// 見える壊れた値が学習日集計・ヒートマップ等の日付キーに紛れ込む。parseDateStringの
// 不正入力の扱い（即座に例外）と揃える
describe('toDateString: 非有限のepochMsは拒否される（T-312・K-45）', () => {
  it('NaNは例外を投げる（"NaN-NaN-NaN"を返さない）', () => {
    expect(() => toDateString(NaN)).toThrow(/非有限|toDateString/)
  })

  it('Infinity・-Infinityも例外を投げる', () => {
    expect(() => toDateString(Infinity)).toThrow()
    expect(() => toDateString(-Infinity)).toThrow()
  })
})

describe('parseDateString: 不正文字列の拒否（T-191・Q-109: 範囲外成分の検出）', () => {
  it('月が13（範囲外）なら例外', () => {
    expect(() => parseDateString('2026-13-45')).toThrow(/不正/)
  })

  it('月が0（範囲外）なら例外', () => {
    expect(() => parseDateString('2026-00-10')).toThrow(/不正/)
  })

  it('日が範囲外（2月30日、Dateの繰り上げ解釈を許さない）なら例外', () => {
    expect(() => parseDateString('2026-02-30')).toThrow(/不正/)
  })

  it('日が範囲外（4月31日、4月は30日まで）なら例外', () => {
    expect(() => parseDateString('2026-04-31')).toThrow(/不正/)
  })

  it('平年の2月29日は例外', () => {
    expect(() => parseDateString('2026-02-29')).toThrow(/不正/)
  })

  it('うるう年の2月29日は妥当', () => {
    expect(() => parseDateString('2028-02-29')).not.toThrow()
  })

  it('区切りが不足した文字列は例外', () => {
    expect(() => parseDateString('2026-07')).toThrow(/不正/)
  })

  it('数値でない成分を含む文字列は例外', () => {
    expect(() => parseDateString('2026-AB-01')).toThrow(/不正/)
  })

  it('空文字列は例外', () => {
    expect(() => parseDateString('')).toThrow(/不正/)
  })
})

describe('localMidnightAfterDays: 月末・年末をまたぐ暦日演算', () => {
  it('月末（1/31）の翌日は2/1になる', () => {
    const jan31 = new Date(2026, 0, 31).getTime()
    expect(toDateString(localMidnightAfterDays(jan31, 1))).toBe('2026-02-01')
  })

  it('年末（12/31）の翌日は翌年1/1になる', () => {
    const dec31 = new Date(2026, 11, 31).getTime()
    expect(toDateString(localMidnightAfterDays(dec31, 1))).toBe('2027-01-01')
  })

  it('うるう年の2/28の翌日は2/29になる', () => {
    const feb28 = new Date(2028, 1, 28).getTime()
    expect(toDateString(localMidnightAfterDays(feb28, 1))).toBe('2028-02-29')
  })

  it('平年の2/28の翌日は3/1になる（2/29は存在しない）', () => {
    const feb28 = new Date(2026, 1, 28).getTime()
    expect(toDateString(localMidnightAfterDays(feb28, 1))).toBe('2026-03-01')
  })
})

/**
 * テスト実行環境のTZを復元する（T-291・K-18）。`process.env.TZ = undefined` は
 * 環境変数への代入のため文字列 `"undefined"` に変換されてしまい、元がTZ未設定
 * （多くのCI環境の既定）だった場合に復元後もTZが不正な文字列のまま残ってしまう
 * （以降のテストがローカルタイムゾーン=Asia/Tokyoへ戻らずUTC相当で動く）。
 * 元が未設定だった場合は delete で復元する
 */
function restoreTz(original: string | undefined): void {
  if (original === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = original
  }
}

describe('restoreTz: TZ復元が文字列"undefined"を残さない（T-291・K-18）', () => {
  it('元がprocess.env.TZ未設定だった場合、復元後は本当に未設定になる', () => {
    const saved = process.env.TZ
    try {
      delete process.env.TZ // 元が未設定だった状況を模擬
      process.env.TZ = 'America/New_York'
      restoreTz(undefined)
      expect(process.env.TZ).toBeUndefined()
    } finally {
      restoreTz(saved)
    }
  })

  it('元がTZ設定済みだった場合、復元後はその値に戻る', () => {
    const saved = process.env.TZ
    try {
      process.env.TZ = 'Asia/Tokyo'
      const original = process.env.TZ
      process.env.TZ = 'America/New_York'
      restoreTz(original)
      expect(process.env.TZ).toBe('Asia/Tokyo')
    } finally {
      restoreTz(saved)
    }
  })
})

// DST跨ぎの検証: 実行環境（Asia/Tokyo）にはDSTが無いため、process.env.TZを一時的に
// DSTのある地域へ切り替えて確認する。「epoch + 24h*n」の単純加算だとDST境界で
// 時刻が0時からずれる（春の時計進めで1時間失われる/秋の時計戻しで1時間増える）ことの
// 回帰確認であり、localMidnightAfterDays が Date の setDate（暦日演算）を使うことで
// 影響を受けないことを検証する
describe('localMidnightAfterDays / daysBetween: DST跨ぎでも暦日がずれない', () => {
  const originalTz = process.env.TZ

  beforeAll(() => {
    // America/New_York の2026年DST: 開始3/8（春、2時→3時）、終了11/1（秋、2時→1時）
    process.env.TZ = 'America/New_York'
  })

  afterAll(() => {
    restoreTz(originalTz)
  })

  it('春の時計進め跨ぎ（3/7→3/9の2日後）でも0時のまま暦日がちょうど2日進む', () => {
    const mar7 = new Date(2026, 2, 7, 0, 0, 0, 0).getTime()
    const result = localMidnightAfterDays(mar7, 2)
    // 単純な+48h加算なら1時になってしまう（DSTで1時間短い日を挟むため）
    expect(new Date(result).getHours()).toBe(0)
    expect(toDateString(result)).toBe('2026-03-09')
  })

  it('秋の時計戻し跨ぎ（11/1→11/2の1日後）でも0時のまま暦日がちょうど1日進む', () => {
    const nov1 = new Date(2026, 10, 1, 0, 0, 0, 0).getTime()
    const result = localMidnightAfterDays(nov1, 1)
    // 単純な+24h加算なら23時になってしまう（DSTで1時間長い日を挟むため）
    expect(new Date(result).getHours()).toBe(0)
    expect(toDateString(result)).toBe('2026-11-02')
  })

  it('daysBetweenはDSTによる時刻のずれに関わらず暦日差のみを返す', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1)
  })
})

describe('startOfLocalDay', () => {
  it('同日内の任意時刻から0時のepochを求める', () => {
    const epoch = new Date(2026, 6, 14, 23, 59, 59).getTime()
    expect(startOfLocalDay(epoch)).toBe(new Date(2026, 6, 14, 0, 0, 0, 0).getTime())
  })
})

describe('daysBetween: 基本ケース', () => {
  it('同日は0', () => {
    expect(daysBetween('2026-07-14', '2026-07-14')).toBe(0)
  })

  it('翌日は1、前日は-1', () => {
    expect(daysBetween('2026-07-14', '2026-07-15')).toBe(1)
    expect(daysBetween('2026-07-14', '2026-07-13')).toBe(-1)
  })

  it('月をまたいでも正しい日数差になる', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
  })
})
