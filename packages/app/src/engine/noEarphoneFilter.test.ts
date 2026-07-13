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
