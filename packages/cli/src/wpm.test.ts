// T-81完了条件のテスト: wpm計測（J-37の150〜170wpmレンジ判定）
import { describe, expect, it } from 'vitest'
import { computeWpm, countWords, isWithinWpmRange } from './wpm.js'

describe('countWords', () => {
  it('空白区切りで語数を数える', () => {
    expect(countWords('Please submit the report by Friday.')).toBe(6)
  })

  it('前後の空白・連続空白を無視する', () => {
    expect(countWords('  Hello   world  ')).toBe(2)
  })
})

describe('computeWpm', () => {
  it('ギャップ無しなら単純に語数/分で算出する', () => {
    // 10語を4秒（=1/15分）で読めば150wpm
    expect(computeWpm(10, 4000)).toBeCloseTo(150, 5)
  })

  it('ギャップ（無音）分をdurationMsから差し引いてから算出する', () => {
    // 全体4.4秒のうち400ms×1が無音なら、発話は4秒。10語/4秒=150wpm
    expect(computeWpm(10, 4400, 1)).toBeCloseTo(150, 5)
  })

  it('発話時間が0以下ならwpmは0（異常値を返さない）', () => {
    expect(computeWpm(10, 300, 1)).toBe(0)
  })
})

describe('isWithinWpmRange', () => {
  it('既定レンジ150〜170に収まっていればtrue', () => {
    expect(isWithinWpmRange(160)).toBe(true)
    expect(isWithinWpmRange(149)).toBe(false)
    expect(isWithinWpmRange(171)).toBe(false)
  })

  it('レンジを引数で指定できる', () => {
    expect(isWithinWpmRange(120, 100, 130)).toBe(true)
  })
})
