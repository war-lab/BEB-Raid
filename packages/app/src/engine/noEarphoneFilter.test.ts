// T-23 完了条件のテスト: イヤホンなしONでクイックパックにリスニング問題が含まれない
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'
import { applyNoEarphoneFilter } from './noEarphoneFilter'
import type { QuickPack, QuickPackItem } from './types'

function audioQuestion(id: string): Question {
  return {
    id,
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    audio: '/dummy.mp3',
    choices: [{ key: 'A', text: 'a' }],
    answer: 'A',
  }
}

function textQuestion(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    question: 'dummy',
    choices: [{ key: 'A', text: 'a' }],
    answer: 'A',
  }
}

/** Part7単一（passages 1件）: 通常パックへの差し替え候補になる（T-105・T-106） */
function singlePassageQuestion(id: string): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    passages: [{ id: `${id}-p1`, kind: 'email', text: 'dummy' }],
    subQuestions: [{ id: `${id}-q0`, question: 'q', choices: [], answer: 'A' }],
  }
}

/** Part7複数パッセージ（passages 2件以上）: 「じっくり読解」専用。通常パックの差し替え候補にしない */
function multiPassageQuestion(id: string): Question {
  return {
    id,
    part: 7,
    format: 'text_passage',
    difficulty: 2,
    tags: [],
    keyVocab: [],
    passages: [
      { id: `${id}-p1`, kind: 'email', text: 'dummy1' },
      { id: `${id}-p2`, kind: 'chat', text: 'dummy2' },
    ],
    subQuestions: [{ id: `${id}-q0`, question: 'q', choices: [], answer: 'A' }],
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

function srsItem(questionId: string): QuickPackItem {
  return {
    kind: 'srsQuestion',
    mode: 'srs',
    questionId,
    srsCardId: `question:${questionId}`,
    reason: { type: 'srsDue' },
  }
}

describe('applyNoEarphoneFilter', () => {
  it('ドリル由来のリスニング問題を未使用のリーディング問題に差し替える', () => {
    const pack: QuickPack = {
      duration: 7,
      items: [drillItem('p2-1'), drillItem('p5-1')],
      srsOverflow: 0,
    }
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p5-1', textQuestion('p5-1')],
      ['p5-2', textQuestion('p5-2')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)

    expect(filtered.items).toHaveLength(2)
    const resultQuestions = filtered.items.map((i) => questions.get(i.questionId!)!)
    expect(resultQuestions.every((q) => q.format !== 'audio_qa')).toBe(true)
    // 既に使用中のp5-1と重複せず、p5-2が採用される
    expect(filtered.items.map((i) => i.questionId)).toEqual(
      expect.arrayContaining(['p5-1', 'p5-2']),
    )
  })

  it('SRS由来item（復習の同一性が本質）は差し替えない', () => {
    const pack: QuickPack = {
      duration: 7,
      items: [srsItem('p2-1')],
      srsOverflow: 0,
    }
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p5-1', textQuestion('p5-1')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)
    expect(filtered.items).toEqual(pack.items)
  })

  it('代替候補が尽きた場合はitemを取り除く', () => {
    const pack: QuickPack = {
      duration: 7,
      items: [drillItem('p2-1'), drillItem('p2-2')],
      srsOverflow: 0,
    }
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p2-2', audioQuestion('p2-2')],
      ['p5-1', textQuestion('p5-1')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)
    expect(filtered.items).toHaveLength(1)
    expect(questions.get(filtered.items[0]!.questionId!)!.format).toBe('text_blank')
  })
})

describe('applyNoEarphoneFilter: M2新規リスニングformat（T-52）', () => {
  function dictationQuestion(id: string): Question {
    return { id, part: 2, format: 'dictation', difficulty: 2, tags: [], keyVocab: [] }
  }
  function shadowingQuestion(id: string): Question {
    return { id, part: 3, format: 'shadowing', difficulty: 2, tags: [], keyVocab: [] }
  }

  it('dictation問題も差し替え対象になる', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('dict-1')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['dict-1', dictationQuestion('dict-1')],
      ['p5-1', textQuestion('p5-1')],
    ])
    const filtered = applyNoEarphoneFilter(pack, questions)
    expect(questions.get(filtered.items[0]!.questionId!)!.format).toBe('text_blank')
  })

  it('shadowing問題も差し替え対象になる', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('shadow-1')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['shadow-1', shadowingQuestion('shadow-1')],
      ['p5-1', textQuestion('p5-1')],
    ])
    const filtered = applyNoEarphoneFilter(pack, questions)
    expect(questions.get(filtered.items[0]!.questionId!)!.format).toBe('text_blank')
  })
})

describe('applyNoEarphoneFilter: text_passage（読解）への差し替え（T-106・docs/18 3.4節）', () => {
  it('リーディング候補がtext_passage（Part7単一）しか無くても実際に差し替わる（従来はtext_blankにしか差し替わらなかった疑いの解消）', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('p2-1')], srsOverflow: 0 }
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p7-1', singlePassageQuestion('p7-1')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)

    expect(filtered.items).toHaveLength(1)
    expect(filtered.items[0]!.questionId).toBe('p7-1')
    expect(questions.get(filtered.items[0]!.questionId!)!.format).toBe('text_passage')
  })

  it('Part7複数パッセージは差し替え候補にしない（「じっくり読解」専用。T-105の不変条件を継承）', () => {
    const pack: QuickPack = { duration: 7, items: [drillItem('p2-1')], srsOverflow: 0 }
    // リーディング候補が複数パッセージのみ（単一パッセージ・text_blankとも無し）の状況
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p7-multi', multiPassageQuestion('p7-multi')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)

    // 代替候補が（除外により）実質ゼロのため、itemは取り除かれる（差し替えられない）
    expect(filtered.items).toHaveLength(0)
  })

  it('単一パッセージとtext_blankが両方候補にある場合も、複数パッセージだけは選ばれない', () => {
    const pack: QuickPack = {
      duration: 7,
      items: [drillItem('p2-1'), drillItem('p2-2')],
      srsOverflow: 0,
    }
    const questions = new Map<string, Question>([
      ['p2-1', audioQuestion('p2-1')],
      ['p2-2', audioQuestion('p2-2')],
      ['p7-multi', multiPassageQuestion('p7-multi')],
      ['p5-1', textQuestion('p5-1')],
    ])

    const filtered = applyNoEarphoneFilter(pack, questions)

    const resultIds = filtered.items.map((i) => i.questionId)
    expect(resultIds).not.toContain('p7-multi')
    expect(resultIds).toEqual(['p5-1'])
  })
})
