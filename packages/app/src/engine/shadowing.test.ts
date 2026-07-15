// T-48 完了条件のテスト（正本: docs/13 3.5節）:
// - script を文境界で分割し、timingがあれば各文の開始msをtimingから導出する
// - timingが無ければ語数比の近似値に縮退する（文単位ハイライト）
// - 現在位置(ms)から現在の単語/文indexを判定できる
import { describe, expect, it } from 'vitest'

import { buildShadowingSentences, currentSentenceIndex, currentWordIndex } from './shadowing'

describe('buildShadowingSentences', () => {
  it('文境界（. ? !）でscriptを分割し、timingから各文の開始msとdurationMsを導出する', () => {
    // "Stop." "Go now." "Really?" の3文, 単語: Stop. Go now. Really?
    const timing = [0, 500, 900, 1600]
    const sentences = buildShadowingSentences('Stop. Go now. Really?', timing, 2000)
    expect(sentences).toEqual([
      { text: 'Stop.', startMs: 0, durationMs: 500 },
      { text: 'Go now.', startMs: 500, durationMs: 1100 },
      { text: 'Really?', startMs: 1600, durationMs: 400 },
    ])
  })

  it('末尾に文末句読点が無い最後の断片も1文として扱う', () => {
    const timing = [0, 400, 900]
    const sentences = buildShadowingSentences('Wait please', timing, 900)
    // "Wait" "please"（句読点なし）は1文として最後にまとまる
    expect(sentences).toEqual([{ text: 'Wait please', startMs: 0, durationMs: 900 }])
  })

  it('timingが無い場合は語数比でdurationMsを按分する（文単位ハイライトへの縮退）', () => {
    // 4語中、1文目2語・2文目2語 → 均等割で1文目0ms、2文目1000ms
    const sentences = buildShadowingSentences('Stop now. Go please.', null, 2000)
    expect(sentences).toEqual([
      { text: 'Stop now.', startMs: 0, durationMs: 1000 },
      { text: 'Go please.', startMs: 1000, durationMs: 1000 },
    ])
  })

  it('空文字列は空配列を返す', () => {
    expect(buildShadowingSentences('', null, 1000)).toEqual([])
  })
})

describe('currentWordIndex', () => {
  const timing = [0, 300, 700, 1100]

  it('現在位置以下で最大のtiming要素のindexを返す', () => {
    expect(currentWordIndex(timing, 0)).toBe(0)
    expect(currentWordIndex(timing, 299)).toBe(0)
    expect(currentWordIndex(timing, 300)).toBe(1)
    expect(currentWordIndex(timing, 1200)).toBe(3)
  })

  it('timingが無ければnullを返す', () => {
    expect(currentWordIndex(null, 500)).toBeNull()
  })
})

describe('currentSentenceIndex', () => {
  const sentences = [
    { text: 'a', startMs: 0, durationMs: 500 },
    { text: 'b', startMs: 500, durationMs: 500 },
    { text: 'c', startMs: 1000, durationMs: 500 },
  ]

  it('現在位置以下で最大のstartMsを持つ文のindexを返す', () => {
    expect(currentSentenceIndex(sentences, 0)).toBe(0)
    expect(currentSentenceIndex(sentences, 499)).toBe(0)
    expect(currentSentenceIndex(sentences, 500)).toBe(1)
    expect(currentSentenceIndex(sentences, 1500)).toBe(2)
  })

  it('文が無ければnullを返す', () => {
    expect(currentSentenceIndex([], 100)).toBeNull()
  })
})
