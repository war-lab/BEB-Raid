// T-46 完了条件のテスト（timing推定アライメント。正本: docs/13 3.5節）:
// - 検証条件（単調増加・先頭0付近・末尾≦duration）を満たす
// - 単語数1・長文・句読点連続の境界を扱える
// - 実mp3（既存のPart2音声）1件のscript/durationMsで生成できる
import { describe, expect, it } from 'vitest'

import { estimateWordTimings } from './timing.js'

describe('estimateWordTimings', () => {
  it('先頭は0、以降は単調増加、末尾はduration以下になる', () => {
    const timings = estimateWordTimings('Where should I submit the expense report?', 4000)
    expect(timings[0]).toBe(0)
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i]).toBeGreaterThanOrEqual(timings[i - 1]!)
    }
    expect(timings.at(-1)!).toBeLessThanOrEqual(4000)
  })

  it('要素数はscriptの語数（空白区切り）と一致する', () => {
    const script = 'Where should I submit the expense report?'
    const timings = estimateWordTimings(script, 4000)
    expect(timings.length).toBe(script.split(/\s+/).length)
  })

  it('単語数1でも先頭0・末尾がdurationMs以下になる', () => {
    const timings = estimateWordTimings('Hello', 500)
    expect(timings).toEqual([0])
  })

  it('長文でも単調増加・末尾がduration以下を保つ', () => {
    const script =
      'I have been working on this project for three months, and I still need more time ' +
      'to finish the report before the deadline next Friday afternoon.'
    const timings = estimateWordTimings(script, 12000)
    expect(timings.length).toBe(script.split(/\s+/).length)
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i]).toBeGreaterThanOrEqual(timings[i - 1]!)
    }
    expect(timings.at(-1)!).toBeLessThanOrEqual(12000)
  })

  it('句読点が連続する単語（"Wait..."やダッシュ単独トークン）でも壊れない', () => {
    const script = 'Wait... — really?! Yes, absolutely!!'
    const timings = estimateWordTimings(script, 3000)
    expect(timings.length).toBe(script.split(/\s+/).length)
    expect(timings[0]).toBe(0)
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i]).toBeGreaterThanOrEqual(timings[i - 1]!)
    }
    expect(timings.at(-1)!).toBeLessThanOrEqual(3000)
  })

  it('文末句読点（.?!）の単語には一時停止分の重みが加わり、後続単語の開始が後ろ倒しになる', () => {
    // 文末記号ありの場合と無しの場合で、直後の単語の開始msを比較する
    const withPeriod = estimateWordTimings('Stop. Go', 1000)
    const withoutPeriod = estimateWordTimings('Stop Go', 1000)
    expect(withPeriod[1]!).toBeGreaterThan(withoutPeriod[1]!)
  })

  it('実際のPart2音声のscript/durationMsで生成しても検証条件を満たす（既存content/packs/pack-p2-s-001.json question[0]より）', () => {
    const script = 'When should I submit the expense report? — By the end of this week.'
    const durationMs = 3500
    const timings = estimateWordTimings(script, durationMs)
    expect(timings.length).toBe(script.split(/\s+/).length)
    expect(timings[0]).toBe(0)
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i]).toBeGreaterThanOrEqual(timings[i - 1]!)
    }
    expect(timings.at(-1)!).toBeLessThanOrEqual(durationMs)
  })

  it('空文字列は空配列を返す', () => {
    expect(estimateWordTimings('', 1000)).toEqual([])
  })
})
