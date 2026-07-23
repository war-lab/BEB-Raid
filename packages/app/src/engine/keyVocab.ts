// key単語システム（T-11。正本: docs/03 3節、01のFR-4）。
//
// 「誤答 → key語彙をSRSへ → 同key単語の類題を優先出題 → 定着後に元問題を再出題」
// の自動循環。類題の優先出題（重み付け）と同一問題フォールバックの材料は
// このモジュールが提供し、実際のパック組み込みはクイックパック生成（T-13）が行う。

import type { Question } from '@beb-raid/shared-schema'

import type { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord } from '../db/schema'
import { addSrsCard } from './srs'

/** 誤答処理の結果 */
export interface WrongAnswerResult {
  /**
   * SRSに入った（または既に入っていた）誤答問題カード。
   * text_passage（読解）は null（本文まるごとの再出題はしないため。T-106・下記コメント参照）
   */
  questionCard: SrsCardRecord | null
  /** SRSに入った（または既に入っていた）key語彙カード */
  vocabCards: SrsCardRecord[]
}

/**
 * ドリル誤答時のフロー（03の3.2）:
 * - 誤答問題そのものを問題SRSカードへ（03の2節「対象は語彙カードと誤答問題の2種」）
 * - 問題の keyVocab を語彙SRSカードへ（発生元問題IDを記録し、定着後の再出題に使う）
 *
 * 時間切れ・当て勘の区別はここでは行わない（全誤答が復習デッキに落ちるのが
 * 02の1節の不変ルール。統計上の重み減は T-12 が担う）
 *
 * 読解（text_passage）の例外（T-106・ADR 0006 判断6・docs/18 3.4節）:
 * 「本文まるごとの再出題はしない」ため、上記フローの「誤答問題そのものをSRSへ」は
 * text_passage では行わない（questionCardはnull）。さらに、key語彙カードにも
 * sourceQuestionId を乗せない（undefinedのまま）。sourceQuestionIdは
 * srs.tsのreviewSrsCardが「語彙カード卒業時に発生元問題を再出題する」ために使う
 * フィールドであり、これを乗せると後で同じ本文（passage）がSRSキューに戻ってきてしまう。
 * 読解の再挑戦は「同一タグ・keyVocabの別パッセージ」（quickPack.tsのkeyVocabReview重み付け＝
 * similarOrFallback）に委ねる
 */
export async function processWrongAnswer(
  db: BebRaidDatabase,
  question: Question,
  now: number = Date.now(),
): Promise<WrongAnswerResult> {
  const isPassage = question.format === 'text_passage'
  return db.transaction('rw', db.srsCards, async () => {
    const questionCard = isPassage
      ? null
      : await addSrsCard(db, {
          refType: 'question',
          refId: question.id,
          now,
        })
    const vocabCards: SrsCardRecord[] = []
    for (const vocab of question.keyVocab) {
      vocabCards.push(
        await addSrsCard(db, {
          refType: 'vocab',
          refId: vocab.word,
          sourceQuestionId: isPassage ? undefined : question.id,
          now,
        }),
      )
    }
    return { questionCard, vocabCards }
  })
}

/**
 * 復習対象のkey単語（SRS進行中=未卒業の語彙カードの単語一覧）。
 * クイックパック生成が「同key単語を持つ類題の出題重みUP」の判定に使う
 */
export async function getActiveReviewWords(
  db: BebRaidDatabase,
): Promise<Map<string, SrsCardRecord>> {
  const cards = await db.srsCards.where('refType').equals('vocab').toArray()
  return new Map(cards.filter((c) => (c.graduatedAt ?? null) === null).map((c) => [c.refId, c]))
}

/**
 * key単語 word を含む類題（発生元問題を除く）。
 * 誤答問題の再出題は同一問題でなく類題を優先する（答えの丸暗記防止。03の3.2）
 */
export function findSimilarQuestions(
  questions: readonly Question[],
  word: string,
  excludeQuestionId: string | null,
): Question[] {
  return questions.filter(
    (q) => q.id !== excludeQuestionId && q.keyVocab.some((v) => v.word === word),
  )
}

/**
 * key単語の復習に使う問題を選ぶ材料: 類題があれば類題一覧、
 * 在庫ゼロの場合のみ同一問題（発生元）へのフォールバック
 */
export function similarOrFallback(
  questions: readonly Question[],
  word: string,
  sourceQuestionId: string | null,
): { candidates: Question[]; isSameQuestion: boolean } {
  const similar = findSimilarQuestions(questions, word, sourceQuestionId)
  if (similar.length > 0) return { candidates: similar, isSameQuestion: false }
  const source = questions.find((q) => q.id === sourceQuestionId)
  return { candidates: source ? [source] : [], isSameQuestion: true }
}
