// タグ統計・弱点判定（T-12。正本: docs/03 7節・1.3節）。
//
// タグ別正答率を「直近100問の移動窓」で集計し、60%未満を弱点と判定する。
// - 当て勘フラグ付き誤答（応答<2秒）は重み 0.5 で集計（03の7.2: 重みを下げる）
// - 時間切れは「速度不足」の別カウントであり、知識不足の統計（この窓）に混ぜない
// - SRS復習（mode='srs'）は既知カードの反復のため集計対象外（レート除外と同じ理由）
//
// attempts はタグを持たないため、questionId→問題 の解決表（QuestionLookup）を
// 呼び出し側が渡す。更新は「対象タグの窓を attempts から計算し直す」方式で、
// 再構築（rebuildTagStats）と完全に同じ計算経路を通る（完了条件: 再構築可能）。

import type { BebRaidDatabase } from '../db/database'
import type { AttemptRecord, TagStatRecord } from '../db/schema'
import { GUESS_THRESHOLD_MS } from '../services/attempts'
import type { QuestionLookup, TagAccuracy } from './types'

/** 移動窓の大きさ（対象解答の件数） */
export const TAG_WINDOW_SIZE = 100
/**
 * T-189（Q-99）: recomputeTagStatsは解答パイプラインの単一トランザクション（ADR 0010）の
 * 内側で毎解答時に走るため、db.attempts.toArray()（全件読み）は1年運用相当のデータ量で
 * 数百ms級に劣化する。services/phase.ts がT-74で同じ問題をanswerdAt降順の打ち切り読みへ
 * 変えた方針にそのまま揃える。
 * タグ窓（TAG_WINDOW_SIZE=100）に対する安全係数2倍・下限500件は phase.ts の
 * ATTEMPTS_READ_LIMIT と同じヒューリスティックで、対象タグの解答が直近500件の外に
 * 偏って集中するような極端な出題パターンでは理論上不足しうるが、通常運用では
 * 十分な件数を見込む
 */
const TAG_ATTEMPTS_READ_SAFETY_FACTOR = 2
const TAG_ATTEMPTS_READ_MIN = 500
export const TAG_ATTEMPTS_READ_LIMIT = Math.max(
  TAG_ATTEMPTS_READ_MIN,
  TAG_WINDOW_SIZE * TAG_ATTEMPTS_READ_SAFETY_FACTOR,
)
/** 弱点判定の正答率しきい値（これ未満が弱点） */
export const WEAK_ACCURACY_THRESHOLD = 0.6
/**
 * 弱点判定に必要な最小標本数（重み付き出題数）。
 * 数問の誤答だけで全タグが弱点化して重み付けが無意味になるのを防ぐ
 */
export const WEAK_MIN_SAMPLE = 5
/** 当て勘（応答2秒未満）の重み。T-309（K-38）以降は正答・誤答の両方に対称に適用する */
export const GUESS_WEIGHT = 0.5

/** 1タグ分の移動窓を attempts から計算する純粋関数（新しい順に最大100件） */
export function computeTagWindow(
  attempts: readonly AttemptRecord[],
  tag: string,
  lookup: QuestionLookup,
): { windowCorrect: number; windowTotal: number } {
  const relevant = attempts
    .filter(
      (a) =>
        a.mode !== 'srs' && !a.isTimeout && (lookup.get(a.questionId)?.tags.includes(tag) ?? false),
    )
    .sort((a, b) => b.answeredAt - a.answeredAt)
    .slice(0, TAG_WINDOW_SIZE)

  // T-309（K-38）: attemptsのisGuessは定義上「誤答かつ応答2秒未満」のみで立つ
  // （services/attempts.ts）ため、正答側の「まぐれ当たり」（同じ2秒未満の速答で
  // 偶然正解した場合）は対象にならない。従来はisGuessをそのまま使っており、
  // 誤答の当て勘だけ重み0.5で分母を軽くする一方、正答の速答（同じ当て勘の裏側）は
  // 常に重み1で分子・分母に満額計上していた。当て勘の多いタグはまぐれ正解が
  // 満点計上される一方で当て勘の誤答は軽く数えられる非対称になり、正答率が実力より
  // 高く出て弱点タグが立たなくなっていた。isGuessに依存せず「応答2秒未満（時間切れを
  // 除く）」を正答・誤答の両方に同じ基準で適用し、対称に重み0.5を掛ける
  let windowCorrect = 0
  let windowTotal = 0
  for (const attempt of relevant) {
    const isFastAnswer = attempt.responseMs < GUESS_THRESHOLD_MS
    const weight = isFastAnswer ? GUESS_WEIGHT : 1
    windowTotal += weight
    if (attempt.isCorrect) windowCorrect += weight
  }
  return { windowCorrect, windowTotal }
}

/** TagStatRecord → 正答率と弱点判定 */
export function toTagAccuracy(record: TagStatRecord): TagAccuracy {
  const accuracy = record.windowTotal > 0 ? record.windowCorrect / record.windowTotal : 0
  return {
    tag: record.tag,
    accuracy,
    windowTotal: record.windowTotal,
    isWeak: record.windowTotal >= WEAK_MIN_SAMPLE && accuracy < WEAK_ACCURACY_THRESHOLD,
  }
}

/**
 * 指定タグ（省略時は解決表に現れる全タグ）の統計を attempts から計算し直して保存する。
 * 全タグ再構築（完了条件の再計算関数）と解答後の差分更新の両方がこの関数を通る
 */
export async function recomputeTagStats(
  db: BebRaidDatabase,
  lookup: QuestionLookup,
  tags?: readonly string[],
): Promise<TagStatRecord[]> {
  const targetTags = tags ?? Array.from(new Set(Array.from(lookup.values()).flatMap((q) => q.tags)))
  const attempts = await db.attempts
    .orderBy('answeredAt')
    .reverse()
    .limit(TAG_ATTEMPTS_READ_LIMIT)
    .toArray()
  const records = targetTags.map((tag) => ({ tag, ...computeTagWindow(attempts, tag, lookup) }))
  await db.tagStats.bulkPut(records)
  return records
}

/** 1解答の記録後に、その問題が持つタグの統計を更新する */
export async function updateTagStatsForAnswer(
  db: BebRaidDatabase,
  questionId: string,
  lookup: QuestionLookup,
): Promise<void> {
  const question = lookup.get(questionId)
  if (!question || question.tags.length === 0) return
  await recomputeTagStats(db, lookup, question.tags)
}

/** 全タグの正答率と弱点判定（正答率の低い順。ダッシュボードの弱点マップ入力） */
export async function getTagAccuracies(db: BebRaidDatabase): Promise<TagAccuracy[]> {
  const records = await db.tagStats.toArray()
  return records.map(toTagAccuracy).sort((a, b) => a.accuracy - b.accuracy)
}

/** 弱点タグ（正答率60%未満かつ最小標本数以上）の一覧 */
export async function getWeakTags(db: BebRaidDatabase): Promise<string[]> {
  return (await getTagAccuracies(db)).filter((t) => t.isWeak).map((t) => t.tag)
}
