// audio_set（Part3/4）・text_passage（Part6/7）共通: サブ設問のtagStats集計用に、
// subQuestion.id→（親のtags等を持つ疑似Question）を補った解決表を作る
// （SubQuestion型はkeyVocabを持たないため。docs/18 3.6節）。
// 元はDrillScreen.tsxに閉じていたが、ReadingScreenでも同じ組み立てが必要になったため
// 共有モジュールへ抽出した（T-104）
//
// タグの扱い（T-106・docs/18 3.4節）: SubQuestion.tags（設問単位の解法タグ。例:
// 相互参照・推論等をsubQuestion側にだけ付ける運用=T-103のコメント）は、親のtagsに対して
// 「上書き」ではなく「追加」する。読解の解法タグ（先読み/スキャン/パラフレーズ照合/
// 相互参照/推論/語彙推測）は設問ごとに異なりうる一方、親questionのtags（文法カテゴリ等）も
// 引き続き集計対象に残す必要があるため。sq.tagsが無い（audio_set等の既存content）場合は
// 従来どおり親のtagsのみになり、挙動は変わらない

import type { Question } from '@beb-raid/shared-schema'
import type { QuestionLookup } from './types'

export function withSubQuestionLookup(parent: Question, base: QuestionLookup): QuestionLookup {
  const map = new Map(base)
  for (const sq of parent.subQuestions ?? []) {
    const tags =
      sq.tags && sq.tags.length > 0
        ? Array.from(new Set([...parent.tags, ...sq.tags]))
        : parent.tags
    map.set(sq.id, { ...parent, id: sq.id, tags })
  }
  return map
}
