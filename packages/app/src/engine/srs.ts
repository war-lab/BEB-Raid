// SRSエンジン（T-09。正本: docs/03 2節）。
//
// SM-2 簡略版。間隔テーブル 1→3→7→14→30→60日、自己評価3段階
// （もう一回=リセット / OK=次段階 / 余裕=1段階スキップ）、60日突破で卒業。
// 「純粋関数（applyGrade）＋DBアクセスの薄い層」の構成。
//
// 日付境界の扱い: dueAt は「復習した日のローカル0時 + 間隔日数」= 期限日の0時。
// 23:59 に復習しても 00:01 に復習しても同じ「翌日」に期限が来る（暦日基準）。

import type { BebRaidDatabase } from '../db/database'
import type { SrsCardRecord, SrsRefType } from '../db/schema'
import { localMidnightAfterDays, toDateString } from './date'
import type { AddSrsCardInput, ReviewSrsCardResult, SrsGrade, SrsQueue } from './types'

/** 間隔テーブル（日）。stage がこの配列のインデックス。末尾（60日）を突破すると卒業 */
export const SRS_INTERVAL_DAYS = [1, 3, 7, 14, 30, 60] as const

/** SRS運用パラメータ（03の2節「変更可」に対応） */
export interface SrsOptions {
  /** 1日の新規カード上限 */
  newCardsPerDay: number
  /**
   * 復習滞留とみなす期限超過枚数（これ以上溜まった日は新規を自動停止）。
   * 既定16 = クイックパックのSRS上限15枚（03の1.3）を超えて溢れる状態
   */
  newStopBacklog: number
}

export const DEFAULT_SRS_OPTIONS: SrsOptions = {
  newCardsPerDay: 20,
  newStopBacklog: 16,
}

/** SRSカードの主キー（`${refType}:${refId}` 合成キー） */
export function srsCardId(refType: SrsRefType, refId: string): string {
  return `${refType}:${refId}`
}

/**
 * 自己評価をカードへ適用した結果を返す純粋関数。
 * - 未導入カード（introducedDate なし）は仮想段階 -1 からの遷移:
 *   OK→stage0（1日）/ 余裕→stage1（3日）。導入日を記録する
 * - もう一回: stage0 へリセット（導入済みなら lapses+1）
 * - 遷移先が間隔テーブルを超えたら卒業（graduatedAt を記録。dueAt は据え置き）
 */
export function applyGrade(card: SrsCardRecord, grade: SrsGrade, now: number): ReviewSrsCardResult {
  const introduced = card.introducedDate ?? null
  let nextStage: number
  let lapses = card.lapses
  if (grade === 'again') {
    nextStage = 0
    if (introduced !== null) lapses += 1
  } else {
    const current = introduced === null ? -1 : card.stage
    nextStage = current + (grade === 'good' ? 1 : 2)
  }

  const graduated = nextStage >= SRS_INTERVAL_DAYS.length
  const rawDueAt = localMidnightAfterDays(now, SRS_INTERVAL_DAYS[Math.max(nextStage, 0)] ?? 1)
  // T-303（K-31）: 値の破損防止のクランプ（時刻そのものの正当性検証はしない=J-124）。
  // nowが何らかの理由（呼び出し元の計算ミス・端末時計のずれ等）で実際の現在時刻から
  // 大きく離れた未来値だと、dueAtも同様に未来へ飛び、正しい時刻に戻っても長期間
  // （実測1521日）キューに現れなくなる。実際の現在時刻（Date.now()）を基準に、
  // 間隔テーブルの最大値を超えて先には進めない
  const maxDueAt = localMidnightAfterDays(
    Date.now(),
    SRS_INTERVAL_DAYS[SRS_INTERVAL_DAYS.length - 1]!,
  )
  const next: SrsCardRecord = {
    ...card,
    stage: graduated ? SRS_INTERVAL_DAYS.length - 1 : nextStage,
    dueAt: graduated ? card.dueAt : Math.min(rawDueAt, maxDueAt),
    lapses,
    introducedDate: introduced ?? toDateString(now),
    graduatedAt: graduated ? now : null,
  }
  return { card: next, graduated }
}

/**
 * SRSカードを追加する。
 * - 既存の未卒業カードがあれば何もしない（sourceQuestionId のみ補完）
 * - 卒業済みカードに再追加が来た場合（=定着したはずの語で再誤答）は
 *   新規カードとして学習し直す（stage0・未導入へリセット）
 */
export async function addSrsCard(
  db: BebRaidDatabase,
  input: AddSrsCardInput,
): Promise<SrsCardRecord> {
  const now = input.now ?? Date.now()
  const id = srsCardId(input.refType, input.refId)
  return db.transaction('rw', db.srsCards, async () => {
    const existing = await db.srsCards.get(id)
    if (existing && (existing.graduatedAt ?? null) === null) {
      if ((existing.sourceQuestionId ?? null) === null && input.sourceQuestionId) {
        const updated = { ...existing, sourceQuestionId: input.sourceQuestionId }
        await db.srsCards.put(updated)
        return updated
      }
      return existing
    }
    const card: SrsCardRecord = {
      id,
      refType: input.refType,
      refId: input.refId,
      stage: 0,
      // 新規カードの dueAt は追加時刻（新規プールの並び順に使う。導入までは復習期限を持たない）
      dueAt: now,
      lapses: existing?.lapses ?? 0,
      introducedDate: null,
      graduatedAt: null,
      sourceQuestionId: input.sourceQuestionId ?? existing?.sourceQuestionId ?? null,
    }
    await db.srsCards.put(card)
    return card
  })
}

/**
 * 語彙仕分けの「知ってる」を永続化する（T-119・docs/19 3.2節=J-58）。
 * 卒業済みSRSカード（graduatedAt=now）を作成し、次回入店時にまた仕分けキューへ
 * 出てしまう問題（従来は仕分けインデックスを進めるだけで何も記録しなかった）に対処する。
 * 卒業済みカード方式にする理由:
 * - getSrsQueueのactiveフィルタ（graduatedAt!==nullを除外）により復習キューへ出ない
 * - 仕分け候補フィルタ（srsCards登録済みを除外）により再出題されない
 * - 既知語が後の学習で誤答された場合、addSrsCardの既存仕様（卒業済みカードへの
 *   再追加=stage0から学習し直す）により、自動的にSRS学習へ編入される（意図した相互作用）
 * 既存の未卒業（active）カードがある語には何もしない（多層防御。通常は仕分け候補フィルタで
 * 除外済みのため到達しない）
 */
export async function markVocabKnown(
  db: BebRaidDatabase,
  word: string,
  now: number = Date.now(),
): Promise<void> {
  const id = srsCardId('vocab', word)
  return db.transaction('rw', db.srsCards, async () => {
    const existing = await db.srsCards.get(id)
    if (existing && (existing.graduatedAt ?? null) === null) return
    const card: SrsCardRecord = {
      id,
      refType: 'vocab',
      refId: word,
      stage: 0,
      dueAt: now,
      lapses: 0,
      introducedDate: toDateString(now),
      graduatedAt: now,
      sourceQuestionId: null,
    }
    await db.srsCards.put(card)
  })
}

/**
 * カードに自己評価を反映して保存する。
 * key語彙カードが卒業した場合、発生元の問題を問題SRSカードとして再投入する
 * （03の3.2「定着後、元問題タイプを再出題して定着確認」= T-11）
 */
export async function reviewSrsCard(
  db: BebRaidDatabase,
  cardId: string,
  grade: SrsGrade,
  now: number = Date.now(),
): Promise<ReviewSrsCardResult> {
  return db.transaction('rw', db.srsCards, async () => {
    const card = await db.srsCards.get(cardId)
    if (!card) throw new Error(`SRSカードが存在しない: ${cardId}`)
    if ((card.graduatedAt ?? null) !== null) {
      throw new Error(`卒業済みカードは復習対象外: ${cardId}`)
    }
    const result = applyGrade(card, grade, now)
    await db.srsCards.put(result.card)

    const sourceQuestionId = result.card.sourceQuestionId ?? null
    if (result.graduated && result.card.refType === 'vocab' && sourceQuestionId !== null) {
      await addSrsCard(db, { refType: 'question', refId: sourceQuestionId, now })
    }
    return result
  })
}

/**
 * 出題対象のSRSキューを返す。
 * - dueReviews: 導入済み・未卒業・期限到来（dueAt <= now）。dueAt 昇順
 * - newCards: 未導入カードを追加順に、残り新規枠（上限 − 今日導入済み数）まで。
 *   期限超過が newStopBacklog 以上溜まっている日は新規を自動停止（03の2節）
 *
 * @param isServable T-188（Q-98）: 新規停止判定（滞留カウント）に使う実出題可否判定。
 *   配信から外れたパックの問題カード等は `srsCards` に削除経路が無く、期限超過のまま
 *   復習キューへ残り続ける。全件を数える判定だとこれが積み上がり、出題可能なカードが
 *   0枚でも新規カード導入が恒久停止しうる。呼び出し元（quickPack.ts の isServable 等）が
 *   実際の出題候補プールに対する可否を渡せるようにし、滞留判定をそちらへ寄せる。
 *   未指定時は全件を servable 扱いし、既存呼び出し元（HomeScreenの件数表示など）の
 *   挙動を変えない。`dueReviews`・`newCards` 自体はこれまでどおり全件を返す（呼び出し側の
 *   既存の後段フィルタ処理を壊さないため）
 */
export async function getSrsQueue(
  db: BebRaidDatabase,
  now: number = Date.now(),
  options: SrsOptions = DEFAULT_SRS_OPTIONS,
  isServable: (card: SrsCardRecord) => boolean = () => true,
): Promise<SrsQueue> {
  const all = await db.srsCards.toArray()
  const active = all.filter((c) => (c.graduatedAt ?? null) === null)

  const dueReviews = active
    .filter((c) => (c.introducedDate ?? null) !== null && c.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)

  const today = toDateString(now)
  const introducedToday = active.filter((c) => c.introducedDate === today).length
  const servableDueCount = dueReviews.filter(isServable).length
  const newStopped = servableDueCount >= options.newStopBacklog
  const allowance = newStopped ? 0 : Math.max(0, options.newCardsPerDay - introducedToday)
  const newCards = active
    .filter((c) => (c.introducedDate ?? null) === null)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, allowance)

  return { dueReviews, newCards, newStopped }
}
