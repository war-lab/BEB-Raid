// audio_set（Part3/4）・text_passage（Part6/7）共通: サブ設問のtagStats集計用に、
// subQuestion.id→（親のtags等を持つ疑似Question）を補った解決表を作る
// （SubQuestion型はtags/keyVocabを持たないため。docs/18 3.6節）。
// 元はDrillScreen.tsxに閉じていたが、ReadingScreenでも同じ組み立てが必要になったため
// 共有モジュールへ抽出した（T-104）

import type { Question } from '@beb-raid/shared-schema'
import type { QuestionLookup } from './types'

export function withSubQuestionLookup(parent: Question, base: QuestionLookup): QuestionLookup {
  const map = new Map(base)
  for (const sq of parent.subQuestions ?? []) {
    map.set(sq.id, { ...parent, id: sq.id })
  }
  return map
}
