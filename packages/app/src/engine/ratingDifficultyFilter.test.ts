// ②-a（ドッグフィードバック 2026-07-22）: レート連動の難易度調整。
// 過度に難しいドリル問題が実力相応へ差し替わること、SRS/対象外は不変であることを担保する。
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'
import {
  applyRatingDifficultyFilter,
  HARD_MIX_RATIO,
  orderByRating,
  type SectionRatings,
} from './ratingDifficultyFilter'
import type { QuickPack, QuickPackItem } from './types'

function textQuestion(id: string, difficulty: number): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty,
    tags: [],
    keyVocab: [],
    question: 'dummy',
    choices: [{ key: 'A', text: 'a' }],
    answer: 'A',
  }
}

function drillItem(questionId: string): QuickPackItem {
  return {
    kind: 'drill',
    mode: 'solo',
    questionId,
    srsCardId: null,
    reason: { type: 'allocation' },
  }
}

function srsItem(
  questionId: string,
  kind: 'srsQuestion' | 'srsVocab' = 'srsQuestion',
): QuickPackItem {
  return {
    kind,
    mode: 'srs',
    questionId,
    srsCardId: kind === 'srsVocab' ? `vocab:${questionId}` : `question:${questionId}`,
    reason: { type: 'srsDue' },
  }
}

/** L区間（part 1-4）の問題。難易度連動がL/R別に効くことの確認用 */
function audioQuestion(id: string, difficulty: number): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty,
    tags: [],
    keyVocab: [],
    audio: '/dummy.mp3',
    choices: [{ key: 'A', text: 'a' }],
    answer: 'A',
  }
}

/** 語彙カード（part 0=レート対象外）。sectionForPartがnullで差し替え対象外になることの確認用 */
function vocabQuestion(id: string): Question {
  return {
    id,
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: id,
    phrase: `use ${id} here`,
    phraseAudio: `audio/vocab/${id}.mp3`,
    back: 'いみ',
    freqRank: 'S',
    levelBand: 600,
  }
}

const LOW: SectionRatings = { L: 400, R: 400 }

describe('applyRatingDifficultyFilter', () => {
  it('実力より過度に難しいドリル問題を、同型・未使用・元より易しくレートに最も近い問題へ差し替える', () => {
    // R=400。D5(d=1000)は 1000-400=600>170 で過度に難しい。候補はD1(d=320,|−80|)とD2(d=490,|+90|)で
    // D1が最もレートに近い
    const pack: QuickPack = { duration: 7, items: [drillItem('hard')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['hard', textQuestion('hard', 5)],
      ['easy1', textQuestion('easy1', 1)],
      ['easy2', textQuestion('easy2', 2)],
    ])

    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items).toHaveLength(1)
    expect(filtered.items[0]!.questionId).toBe('easy1')
    // 元itemの属性（kind/mode/reason）は保持し、questionIdだけ差し替える
    expect(filtered.items[0]!.kind).toBe('drill')
  })

  it('SRS由来item（復習の同一性が本質）は難易度が高くても差し替えない', () => {
    const pack: QuickPack = { duration: 7, items: [srsItem('hard')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['hard', textQuestion('hard', 5)],
      ['easy1', textQuestion('easy1', 1)],
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items).toEqual(pack.items)
  })

  it('元より易しい同型の代替が無ければ元の難問をそのまま残す（取り除かない）', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('hard')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['hard', textQuestion('hard', 5)],
      ['alsohard', textQuestion('alsohard', 5)], // 元と同難易度=易しくないので候補外
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items).toHaveLength(1)
    expect(filtered.items[0]!.questionId).toBe('hard')
  })

  it('SRS由来item（srsVocab）も難易度が高くても差し替えない', () => {
    const pack: QuickPack = { duration: 7, items: [srsItem('hard', 'srsVocab')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['hard', textQuestion('hard', 5)],
      ['easy1', textQuestion('easy1', 1)],
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items).toEqual(pack.items)
  })

  it('語彙カード（part 0=レート対象外）はドリルでも差し替えない', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('voc')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['voc', vocabQuestion('voc')],
      ['easy1', textQuestion('easy1', 1)],
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items[0]!.questionId).toBe('voc')
  })

  it('L区間（Part2）の過度に難しい問題はLレート基準で同区間の易しい問題へ差し替える', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('l-hard')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['l-hard', audioQuestion('l-hard', 5)],
      ['l-easy', audioQuestion('l-easy', 1)],
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, { L: 400, R: 900 })
    expect(filtered.items[0]!.questionId).toBe('l-easy')
  })

  it('難問が複数あっても、同じ易しい問題を2件が奪い合わない（usedIdsで重複防止）', () => {
    const pack: QuickPack = {
      duration: 7,
      items: [drillItem('hard1'), drillItem('hard2')],
      srsOverflow: 0,
    }
    const questions = new Map<string, Question>([
      ['hard1', textQuestion('hard1', 5)],
      ['hard2', textQuestion('hard2', 5)],
      ['easy1', textQuestion('easy1', 1)], // 易しい候補は1件のみ
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    const ids = filtered.items.map((i) => i.questionId)
    // 1件だけが easy1 へ差し替わり、もう1件は代替枯渇で元のまま。easy1の重複はない
    expect(ids).toContain('easy1')
    expect(new Set(ids).size).toBe(2)
    expect(ids.filter((id) => id === 'easy1')).toHaveLength(1)
  })

  it('questionIdがマップに無いdrill itemはそのまま通す（落とさない）', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('ghost')], srsOverflow: 0 }
    const questions = new Map<string, Question>([['easy1', textQuestion('easy1', 1)]])
    const filtered = applyRatingDifficultyFilter(pack, questions, LOW)
    expect(filtered.items[0]!.questionId).toBe('ghost')
  })

  it('レートが十分高ければ難易度が高くても差し替えない（実力相応の範囲）', () => {
    // R=900。D3(d=660)は 660-900<0 で過度ではない → 易しい候補があっても差し替えない
    const pack: QuickPack = { duration: 7, items: [drillItem('mid')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['mid', textQuestion('mid', 3)],
      ['easy1', textQuestion('easy1', 1)],
    ])
    const filtered = applyRatingDifficultyFilter(pack, questions, { L: 900, R: 900 })
    expect(filtered.items[0]!.questionId).toBe('mid')
  })
})

describe('orderByRating（単独モードの並べ替え）', () => {
  it('実力相応/以下の問題を先に、過度に難しい問題を後ろに置く', () => {
    const pool = [textQuestion('d1', 1), textQuestion('d2', 2), textQuestion('d5', 5)]
    const ordered = orderByRating(pool, LOW, () => 0) // rng固定で決定的に
    // D5だけが過度に難しい（後ろ）。D1/D2は前方
    expect(ordered[ordered.length - 1]!.id).toBe('d5')
    expect(ordered.slice(0, 2).map((q) => q.id)).toEqual(expect.arrayContaining(['d1', 'd2']))
  })

  // 何を防ぐか（T-170・docs/27 のS-20）: 過度に難しい層を丸ごと末尾へ回すと、プールが
  // 選択問数を超えるユーザーはレートが上がるまでその層に一生出会わない（50問選んでも
  // 同じ易しい層を周回する）
  it('プールが大きいときは高難度を先頭側に少数混ぜる（末尾に固定しない）', () => {
    const easy = Array.from({ length: 20 }, (_, i) => textQuestion(`easy-${i}`, 1))
    const hard = Array.from({ length: 10 }, (_, i) => textQuestion(`hard-${i}`, 5))
    const ordered = orderByRating([...easy, ...hard], LOW, () => 0)

    // 件数と重複なしは保つ（並べ替えなので取りこぼさない）
    expect(ordered).toHaveLength(30)
    expect(new Set(ordered.map((q) => q.id)).size).toBe(30)

    // 混率2割（易しい20問 → 高難度4問）が先頭側に入る
    const mixCount = Math.round(easy.length * HARD_MIX_RATIO)
    expect(mixCount).toBe(4)
    const headHardCount = ordered
      .slice(0, easy.length + mixCount)
      .filter((q) => q.id.startsWith('hard-')).length
    expect(headHardCount).toBe(mixCount)

    // 1問目は高難度にしない（開始直後の離脱に直結するため）
    expect(ordered[0]!.id.startsWith('hard-')).toBe(false)

    // 20問だけ選抜しても高難度に到達できる（S-20の本題）
    expect(ordered.slice(0, 20).some((q) => q.id.startsWith('hard-'))).toBe(true)
  })

  it('高難度が無い、または混率で0件になる小さいプールでは従来どおり（回帰）', () => {
    // shuffle が入るので順序は問わない（取りこぼさないことを見る）
    const onlyEasy = [textQuestion('e1', 1), textQuestion('e2', 1)]
    expect(
      orderByRating(onlyEasy, LOW, () => 0)
        .map((q) => q.id)
        .sort(),
    ).toEqual(['e1', 'e2'])

    // 易しい2問なら mixCount=round(0.4)=0 なので高難度は末尾のまま
    const small = [textQuestion('e1', 1), textQuestion('e2', 1), textQuestion('h1', 5)]
    expect(orderByRating(small, LOW, () => 0).at(-1)!.id).toBe('h1')
  })
})
