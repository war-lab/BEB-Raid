// M4・T-129: 弱点マップの集計テスト（正本: docs/22 3.4節）。
// 挑戦前に見せてよいのはPart・タグ単位の集計のみで、questionIdを露出しないことを検証する
import type { GhostDefenseEntry, Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'

import { buildFullQuestionLookup, buildGhostWeaknessMap } from './ghostWeaknessMap'

function question(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 3,
    tags: ['前置詞コロケーション'],
    keyVocab: [],
    ...overrides,
  }
}

describe('buildGhostWeaknessMap', () => {
  it('弱点（multiplier>1）のみをPart・タグ単位で集計する（堅いは事前に見せない=3.4節）', () => {
    const pool = [
      question('q-1', { part: 5, tags: ['前置詞コロケーション'] }),
      question('q-2', { part: 5, tags: ['前置詞コロケーション'] }),
      question('q-3', { part: 5, tags: ['前置詞コロケーション'] }),
      question('q-4', { part: 2, tags: ['疑問詞聞き取り'] }),
    ]
    const lookup = buildFullQuestionLookup(pool)
    const defense: GhostDefenseEntry[] = [
      { questionId: 'q-1', multiplier: 2.0 },
      { questionId: 'q-2', multiplier: 2.0 },
      { questionId: 'q-3', multiplier: 0.5 }, // 堅い。集計対象外
      { questionId: 'q-4', multiplier: 2.0 },
    ]

    const map = buildGhostWeaknessMap(defense, lookup)

    expect(map).toEqual([
      { part: 5, tag: '前置詞コロケーション', multiplier: 2.0, count: 2 },
      { part: 2, tag: '疑問詞聞き取り', multiplier: 2.0, count: 1 },
    ])
  })

  it('questionIdを結果へ含めない（正答の狙い撃ち防止=3.4節）', () => {
    const pool = [question('q-1', { part: 5, tags: ['品詞'] })]
    const lookup = buildFullQuestionLookup(pool)
    const defense: GhostDefenseEntry[] = [{ questionId: 'q-1', multiplier: 2.0 }]

    const map = buildGhostWeaknessMap(defense, lookup)

    for (const entry of map) {
      expect(Object.keys(entry).sort()).toEqual(['count', 'multiplier', 'part', 'tag'])
    }
  })

  it('1問が複数タグを持つ場合はタグごとに独立してカウントする', () => {
    const pool = [question('q-1', { part: 6, tags: ['動詞の形', '接続詞vs前置詞'] })]
    const lookup = buildFullQuestionLookup(pool)
    const defense: GhostDefenseEntry[] = [{ questionId: 'q-1', multiplier: 2.0 }]

    const map = buildGhostWeaknessMap(defense, lookup)

    expect(map).toHaveLength(2)
    expect(map.map((e) => e.tag).sort()).toEqual(['動詞の形', '接続詞vs前置詞'].sort())
  })

  it('lookupに解決できないquestionId（パック未取得）は黙ってスキップする', () => {
    const lookup = buildFullQuestionLookup([])
    const defense: GhostDefenseEntry[] = [{ questionId: 'unknown-question', multiplier: 2.0 }]

    expect(buildGhostWeaknessMap(defense, lookup)).toEqual([])
  })

  it('defenseがnull/undefinedなら空配列を返す', () => {
    const lookup = buildFullQuestionLookup([])
    expect(buildGhostWeaknessMap(null, lookup)).toEqual([])
    expect(buildGhostWeaknessMap(undefined, lookup)).toEqual([])
  })
})

describe('buildFullQuestionLookup', () => {
  it('audio_set/text_passageのサブ設問idも解決できる（ボス役が解いた設問単位のquestionId対応）', () => {
    const parent = question('set-1', {
      part: 3,
      format: 'audio_set',
      tags: ['意図推定'],
      subQuestions: [
        {
          id: 'set-1-q0',
          question: 'Q1',
          choices: [{ key: 'A', text: 'a' }],
          answer: 'A',
        },
      ],
    })
    const lookup = buildFullQuestionLookup([parent])

    const resolved = lookup.get('set-1-q0')
    expect(resolved).toBeTruthy()
    expect(resolved?.part).toBe(3)
    expect(resolved?.tags).toContain('意図推定')
  })
})
