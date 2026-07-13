// 実測補正の暫定運用ライン（T-34。正本: docs/04 5節、docs/03 4節・5.2節、docs/10 T-34行）。
//
// 共有API（M3）導入前は「発起人端末のエクスポートを手動投入」で questionStats を代替する
// （04の5節の規約）。このファイルは、端末からエクスポートしたJSON（services/backup.tsの
// BackupFile形式）を入力に、①問題別正答率から難易度Dの補正値、②key単語が誤答に絡んだ回数
// から頻出度ランクの補正値、を算出する純粋関数群を提供する。実ファイルI/OはCLIコマンド層
// （commands.ts）が担当し、ここでは行わない。
//
// packages/app の型（AttemptRecord等）には依存しない（cliパッケージはappに依存しない構成の
// ため）。エクスポートJSONのうち使うフィールドだけを最小限の型で受ける

import type { FreqRank, Question } from '@beb-raid/shared-schema'

/** エクスポートJSON（BackupFile）のうち calibrate が使う最小限のフィールド */
export interface ExportedAttempt {
  questionId: string
  isCorrect: boolean
}

/**
 * エクスポートJSON（services/backup.tsのBackupFile形式）から attempts 配列を取り出す。
 * 形式が不正なら例外を投げる（他コマンド同様、部分読み込みはしない）
 */
export function parseExportedAttempts(data: unknown): ExportedAttempt[] {
  if (typeof data !== 'object' || data === null) {
    throw new Error('エクスポートJSONがオブジェクトではない')
  }
  const stores = (data as Record<string, unknown>).stores
  if (typeof stores !== 'object' || stores === null) {
    throw new Error('エクスポートJSONに stores が無い')
  }
  const attempts = (stores as Record<string, unknown>).attempts
  if (!Array.isArray(attempts)) {
    throw new Error('エクスポートJSONに stores.attempts が無い（配列ではない）')
  }
  return attempts.map((a, i) => {
    if (typeof a !== 'object' || a === null) {
      throw new Error(`stores.attempts[${i}] がオブジェクトではない`)
    }
    const r = a as Record<string, unknown>
    if (typeof r.questionId !== 'string' || typeof r.isCorrect !== 'boolean') {
      throw new Error(`stores.attempts[${i}] に questionId(string)/isCorrect(boolean) が無い`)
    }
    return { questionId: r.questionId, isCorrect: r.isCorrect }
  })
}

export interface QuestionStats {
  attempts: number
  correct: number
}

/**
 * 問題ID別に正答率を集計する。`vocab:` プレフィックスのattempts（語彙SRS復習。
 * docs/10 3.7節の規約）は問題別統計の対象外として除外する
 */
export function aggregateQuestionStats(
  attempts: readonly ExportedAttempt[],
): Map<string, QuestionStats> {
  const stats = new Map<string, QuestionStats>()
  for (const a of attempts) {
    if (a.questionId.startsWith('vocab:')) continue
    const current = stats.get(a.questionId) ?? { attempts: 0, correct: 0 }
    current.attempts += 1
    if (a.isCorrect) current.correct += 1
    stats.set(a.questionId, current)
  }
  return stats
}

/**
 * 難易度D補正の最低サンプル数（docs未記載の設計判断）。M1はドッグフード開始時点で
 * 実質1ユーザーのため、数件の解答だけで難易度を動かすとノイズで暴れる。5件未満は補正しない
 */
export const MIN_SAMPLE_SIZE = 5

/**
 * 難易度D（1–5）ごとの期待正答率レンジ（IRT 1PLの簡略運用。docs未記載の設計判断。
 * 03の5.2節が定めるのは「実測正答率で補正する」という方針のみで、具体的な数値は
 * 運用調整前提としてここで定義する）。観測正答率がレンジの外なら1段階だけ動かす
 * （極端な補正を避け、間違ったサンプルで暴走しないよう保守的にする）
 */
const DIFFICULTY_ACCURACY_BANDS: ReadonlyMap<number, { min: number; max: number }> = new Map([
  [1, { min: 0.8, max: 1.01 }],
  [2, { min: 0.65, max: 0.85 }],
  [3, { min: 0.5, max: 0.7 }],
  [4, { min: 0.35, max: 0.55 }],
  [5, { min: 0.0, max: 0.4 }],
])

/**
 * 観測正答率から難易度Dを1段階だけ補正する。サンプル不足なら現状維持。
 * 正答率が高すぎれば易化（D-1）、低すぎれば難化（D+1）、範囲内なら維持。1–5にクランプ
 */
export function correctDifficulty(current: number, stats: QuestionStats): number {
  if (stats.attempts < MIN_SAMPLE_SIZE) return current
  const band = DIFFICULTY_ACCURACY_BANDS.get(current)
  if (!band) return current
  const accuracy = stats.correct / stats.attempts
  if (accuracy > band.max) return Math.max(1, current - 1)
  if (accuracy < band.min) return Math.min(5, current + 1)
  return current
}

/**
 * key単語が誤答に絡んだ回数の昇格しきい値（docs未記載の設計判断）。頻出度ランクは
 * S/A/B/Cの4段階しかなく、根拠の薄い降格は「本当は頻出なのに見かけ上のデータ不足で
 * 埋もれる」リスクの方が大きいため、昇格のみ行い降格はしない（保守的な運用）
 */
export const MIN_MISS_FOR_PROMOTION = 10

const RANK_ORDER: readonly FreqRank[] = ['C', 'B', 'A', 'S']

function promoteFreqRank(rank: FreqRank): FreqRank {
  const index = RANK_ORDER.indexOf(rank)
  return RANK_ORDER[Math.min(index + 1, RANK_ORDER.length - 1)]!
}

/** 誤答絡み回数からfreqRankを補正する（しきい値以上なら1段階昇格、それ以外は現状維持） */
export function correctFreqRank(current: FreqRank, missCount: number): FreqRank {
  if (missCount >= MIN_MISS_FOR_PROMOTION) return promoteFreqRank(current)
  return current
}

/**
 * 問題一覧から、key単語ごとの「誤答に絡んだ回数」を集計する。
 * その単語をkeyVocabに持つ問題が誤答された回数の合計（複数問題に同じ単語が
 * 出現する場合は合算する＝その単語が実際に間違えられやすいことの根拠が強まる）
 */
export function aggregateWordMissCounts(
  questions: readonly Question[],
  questionStats: ReadonlyMap<string, QuestionStats>,
): Map<string, number> {
  const misses = new Map<string, number>()
  for (const q of questions) {
    const stats = questionStats.get(q.id)
    if (!stats) continue
    const incorrect = stats.attempts - stats.correct
    if (incorrect <= 0) continue
    for (const kv of q.keyVocab) {
      misses.set(kv.word, (misses.get(kv.word) ?? 0) + incorrect)
    }
    // vocab_card自体もその単語の出現とみなす（keyVocabを持たないため front を使う）
    if (q.format === 'vocab_card' && q.front) {
      misses.set(q.front, (misses.get(q.front) ?? 0) + incorrect)
    }
  }
  return misses
}

/** 補正値ファイル（build コマンドの入力フォーマット。実際に値が変わった項目のみ含む） */
export interface CorrectionsFile {
  schemaVersion: 1
  generatedAt: number
  /** questionId → 補正後のdifficulty（変化した問題のみ） */
  questionDifficulty: Record<string, number>
  /** key単語 → 補正後のfreqRank（変化した単語のみ） */
  wordFreqRank: Record<string, FreqRank>
}

/**
 * エクスポートJSON由来のattemptsと、ビルド対象の全問題からCorrectionsFileを組み立てる。
 * 現在値と補正後の値が同じ項目は出力に含めない（差分だけを持つ最小限のファイルにする）
 */
export function buildCorrections(
  questions: readonly Question[],
  attempts: readonly ExportedAttempt[],
  now: number,
): CorrectionsFile {
  const questionStats = aggregateQuestionStats(attempts)

  const questionDifficulty: Record<string, number> = {}
  for (const q of questions) {
    const stats = questionStats.get(q.id)
    if (!stats) continue
    const corrected = correctDifficulty(q.difficulty, stats)
    if (corrected !== q.difficulty) questionDifficulty[q.id] = corrected
  }

  const wordMissCounts = aggregateWordMissCounts(questions, questionStats)
  const currentRankByWord = new Map<string, FreqRank>()
  for (const q of questions) {
    for (const kv of q.keyVocab) {
      if (!currentRankByWord.has(kv.word)) currentRankByWord.set(kv.word, kv.freqRank)
    }
    if (q.format === 'vocab_card' && q.front && q.freqRank) {
      if (!currentRankByWord.has(q.front)) currentRankByWord.set(q.front, q.freqRank)
    }
  }
  const wordFreqRank: Record<string, FreqRank> = {}
  for (const [word, currentRank] of currentRankByWord) {
    const missCount = wordMissCounts.get(word) ?? 0
    const corrected = correctFreqRank(currentRank, missCount)
    if (corrected !== currentRank) wordFreqRank[word] = corrected
  }

  return { schemaVersion: 1, generatedAt: now, questionDifficulty, wordFreqRank }
}
