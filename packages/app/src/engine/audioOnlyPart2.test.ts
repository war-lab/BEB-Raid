// T-154 完了条件のテスト（音声のみモードの判定と区間計算）:
// - responseOffsetsMs が choices と対応し範囲内なら対応、壊れたデータは非対応に落とす
// - 応答区間は key 昇順の位置で引き、最後の応答の終端は全長
import { describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import { audioOnlyChoiceOrder, responseSegment, supportsAudioOnlyPart2 } from './audioOnlyPart2'

function audioQa(overrides: Partial<Question> = {}): Question {
  return {
    id: 'p2-1',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: [],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: 'audio/part2/submit.mp3',
    audioMeta: {
      accent: 'US',
      tts: true,
      voice: 'piper:a+piper:b',
      durationMs: 12000,
      questionEndMs: 2700,
      responseOffsetsMs: [2900, 5300, 7900],
    },
    script: 'When should I submit? — By Friday.',
    choices: [
      { key: 'A', text: 'By Friday.' },
      { key: 'B', text: 'To the accounting office.' },
      { key: 'C', text: 'Yes, I already did.' },
    ],
    answer: 'A',
    ...overrides,
  }
}

describe('supportsAudioOnlyPart2', () => {
  it('3応答のオフセットが揃っていれば対応', () => {
    expect(supportsAudioOnlyPart2(audioQa())).toBe(true)
  })

  it('responseOffsetsMs が無い従来形式は非対応', () => {
    const q = audioQa()
    delete q.audioMeta!.responseOffsetsMs
    expect(supportsAudioOnlyPart2(q)).toBe(false)
  })

  it('audio_qa 以外は非対応', () => {
    expect(supportsAudioOnlyPart2(audioQa({ format: 'text_blank' }))).toBe(false)
  })

  it('件数が choices と一致しなければ非対応', () => {
    const q = audioQa()
    q.audioMeta!.responseOffsetsMs = [2900, 5300]
    expect(supportsAudioOnlyPart2(q)).toBe(false)
  })

  it('非単調・非整数・0以下は非対応（壊れたデータで進行不能にしない）', () => {
    for (const offsets of [
      [2900, 5300, 5300],
      [2900, 7900, 5300],
      [0, 5300, 7900],
      [2900, 5300.5, 7900],
    ]) {
      const q = audioQa()
      q.audioMeta!.responseOffsetsMs = offsets
      expect(supportsAudioOnlyPart2(q)).toBe(false)
    }
  })

  it('末尾が durationMs 以上なら非対応', () => {
    const q = audioQa()
    q.audioMeta!.responseOffsetsMs = [2900, 5300, 12000]
    expect(supportsAudioOnlyPart2(q)).toBe(false)
  })

  it('audio が無ければ非対応', () => {
    expect(supportsAudioOnlyPart2(audioQa({ audio: null }))).toBe(false)
  })
})

describe('responseSegment', () => {
  it('key 昇順の位置で区間を引く', () => {
    expect(responseSegment(audioQa(), 'A')).toEqual({ startMs: 2900, durationMs: 2400 })
    expect(responseSegment(audioQa(), 'B')).toEqual({ startMs: 5300, durationMs: 2600 })
  })

  it('最後の応答の終端は音声の全長', () => {
    expect(responseSegment(audioQa(), 'C')).toEqual({ startMs: 7900, durationMs: 4100 })
  })

  it('choices の配列順に依存しない（key で引く）', () => {
    const q = audioQa({
      choices: [
        { key: 'C', text: 'c' },
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
    })
    expect(responseSegment(q, 'A')).toEqual({ startMs: 2900, durationMs: 2400 })
  })

  it('非対応の問題・未知のキーは null', () => {
    const unsupported = audioQa()
    delete unsupported.audioMeta!.responseOffsetsMs
    expect(responseSegment(unsupported, 'A')).toBeNull()
    expect(responseSegment(audioQa(), 'D')).toBeNull()
  })
})

describe('audioOnlyChoiceOrder', () => {
  it('key 昇順に並べる（読み上げ順が音声に焼き込まれているためシャッフルしない）', () => {
    const q = audioQa({
      choices: [
        { key: 'C', text: 'c' },
        { key: 'A', text: 'a' },
        { key: 'B', text: 'b' },
      ],
    })
    expect(audioOnlyChoiceOrder(q)?.map((c) => c.key)).toEqual(['A', 'B', 'C'])
  })
})
