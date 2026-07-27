// T-106: withSubQuestionLookup のタグ合成テスト（docs/24 3.4節）。
// 何を防ぐか: SubQuestion.tags（設問単位の解法タグ。読解の先読み/スキャン/パラフレーズ照合/
// 相互参照/推論/語彙推測等）が親questionのtagsで上書き・無視され、tagStats集計（弱点判定）に
// 一切乗らなくなる回帰
import type { Question } from '@beb-raid/shared-schema'
import { describe, expect, it } from 'vitest'
import { withSubQuestionLookup } from './subQuestionLookup'
import type { QuestionLookup } from './types'

function passageQuestion(): Question {
  return {
    id: 'p7-1',
    part: 7,
    format: 'text_passage',
    difficulty: 3,
    tags: ['パラフレーズ照合'],
    keyVocab: [],
    passages: [{ id: 'p7-1-p1', kind: 'email', text: 'dummy' }],
    subQuestions: [
      { id: 'p7-1-q0', question: 'q0', choices: [], answer: 'A', tags: ['相互参照'] },
      { id: 'p7-1-q1', question: 'q1', choices: [], answer: 'A' }, // tags無し（従来content互換）
      {
        id: 'p7-1-q2',
        question: 'q2',
        choices: [],
        answer: 'A',
        tags: ['パラフレーズ照合', '推論'], // 親と重複するタグを含む
      },
    ],
  }
}

describe('withSubQuestionLookup: SubQuestion.tagsの合成（T-106）', () => {
  const base: QuestionLookup = new Map()
  const lookup = withSubQuestionLookup(passageQuestion(), base)

  it('sq.tagsがあれば親のtagsに追加される（上書きではなく合成）', () => {
    expect(lookup.get('p7-1-q0')?.tags.sort()).toEqual(['パラフレーズ照合', '相互参照'].sort())
  })

  it('sq.tagsが無い設問は従来どおり親のtagsのみになる（audio_set等の既存contentと互換）', () => {
    expect(lookup.get('p7-1-q1')?.tags).toEqual(['パラフレーズ照合'])
  })

  it('親と重複するタグは重複除去される', () => {
    expect(lookup.get('p7-1-q2')?.tags.sort()).toEqual(['パラフレーズ照合', '推論'].sort())
  })

  it('idはsubQuestionのidに差し替わり、tags以外の親フィールドはそのまま', () => {
    const q0 = lookup.get('p7-1-q0')
    expect(q0?.id).toBe('p7-1-q0')
    expect(q0?.part).toBe(7)
    expect(q0?.format).toBe('text_passage')
  })
})
