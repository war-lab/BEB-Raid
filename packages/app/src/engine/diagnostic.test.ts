// T-20 完了条件のテスト（engine層）:
// - 自己申告TOEICの有無で初期Rが変わる
// - 写像距離最小の未出題問題を選ぶ／出題済みのみが残る場合は出題済みを許容する
// - K=32相当のレート更新（正解でレートが上がる・誤答で下がる）
// - turnからのL/R交互配分
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'
import { DEFAULT_INITIAL_RATING, difficultyToRatingSpace } from './rating'
import {
  DIAGNOSTIC_ITEMS_PER_SECTION,
  DIAGNOSTIC_TOTAL_ITEMS,
  initialRatingFromToeic,
  sectionForTurn,
  selectNextQuestion,
  updateDiagnosticRating,
} from './diagnostic'

function q(id: string, difficulty: number): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty,
    tags: [],
    keyVocab: [],
    question: `q${id}`,
    choices: [
      { key: 'A', text: 'a' },
      { key: 'B', text: 'b' },
    ],
    answer: 'A',
    explanation: '',
    translation: '',
  }
}

describe('initialRatingFromToeic', () => {
  it('自己申告ありは TOEIC×1000/990 を返す', () => {
    expect(initialRatingFromToeic(650, DEFAULT_INITIAL_RATING)).toBeCloseTo((650 * 1000) / 990)
  })

  it('自己申告なし（null）はフォールバック値をそのまま返す', () => {
    expect(initialRatingFromToeic(null, DEFAULT_INITIAL_RATING)).toBe(DEFAULT_INITIAL_RATING)
  })
})

describe('selectNextQuestion', () => {
  const pool = [q('easy', 1), q('mid', 3), q('hard', 5)]

  it('現在レートに写像距離が最も近い未出題問題を選ぶ', () => {
    // d(mid)=150+170*3=660。R=650に最も近いのはmid
    const picked = selectNextQuestion(pool, new Set(), 650)
    expect(picked?.id).toBe('mid')
  })

  it('出題済みは除外される', () => {
    const picked = selectNextQuestion(pool, new Set(['mid']), 650)
    // 次点はhard（d=1000, dist=350）かeasy（d=320, dist=330）。easyの方が近い
    expect(picked?.id).toBe('easy')
  })

  it('全問出題済みの場合のみ出題済みを許容する（在庫切れの保険）', () => {
    const picked = selectNextQuestion(pool, new Set(['easy', 'mid', 'hard']), 650)
    expect(picked?.id).toBe('mid')
  })

  it('プールが空ならnull', () => {
    expect(selectNextQuestion([], new Set(), 400)).toBeNull()
  })
})

describe('updateDiagnosticRating', () => {
  it('正解するとレートが上がる', () => {
    const d = difficultyToRatingSpace(2)
    const after = updateDiagnosticRating(400, 2, true)
    expect(after).toBeGreaterThan(400)
    // d=490 に対しR=400は期待正答率<0.5のはずなので、上がり幅は K=32 の一部
    expect(after).toBeLessThan(400 + 32)
    void d
  })

  it('誤答するとレートが下がる', () => {
    const after = updateDiagnosticRating(400, 2, false)
    expect(after).toBeLessThan(400)
  })
})

describe('難易度追従', () => {
  it('正解が続くとレートが伸び、選ばれる問題の難易度が非減少で上がっていく', () => {
    const pool = [q('d1', 1), q('d2', 2), q('d3', 3), q('d4', 4), q('d5', 5)]
    let rating = DEFAULT_INITIAL_RATING
    const asked = new Set<string>()
    const picks: number[] = []
    for (let i = 0; i < 5; i++) {
      const picked = selectNextQuestion(pool, asked, rating)
      if (!picked) throw new Error('picked should not be null')
      picks.push(picked.difficulty)
      asked.add(picked.id)
      rating = updateDiagnosticRating(rating, picked.difficulty, true)
    }
    for (let i = 1; i < picks.length; i++) {
      expect(picks[i] as number).toBeGreaterThanOrEqual(picks[i - 1] as number)
    }
    expect(picks[picks.length - 1] as number).toBeGreaterThan(picks[0] as number)
  })
})

describe('sectionForTurn', () => {
  it('L15/R15の交互配分になる（turn 0,2,4,...=L / 1,3,5,...=R）', () => {
    const sections = Array.from({ length: DIAGNOSTIC_TOTAL_ITEMS }, (_, i) => sectionForTurn(i))
    const lCount = sections.filter((s) => s === 'L').length
    const rCount = sections.filter((s) => s === 'R').length
    expect(lCount).toBe(DIAGNOSTIC_ITEMS_PER_SECTION)
    expect(rCount).toBe(DIAGNOSTIC_ITEMS_PER_SECTION)
    expect(sections[0]).toBe('L')
    expect(sections[1]).toBe('R')
  })
})
