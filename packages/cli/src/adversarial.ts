// AIクロスレビュー＋敵対的検証の記録フォーマット（T-355。正本: docs/32 8節）。
//
// review.ts（review-export/review-import）は「採用/修正/破棄」を判定してビルド入力を
// 振り分ける工程だが、こちらは既にビルド済み・配信済みのパックも含めて「6観点の敵対的検証を
// 通したか」を記録するための工程で、ビルド入力の振り分けは行わない（8.3節: verdictが
// revise/rejectになった問題は該当タスクで直接修正する）。
//
// 観点は8.1節の6つ（二重正答・不当な易しさ・話者と設問の整合・題材の適格性・実在情報の混入・
// 統計的偏り）を明示するが、TSV自体は観点ごとの列を持たない（観点別の判定はレビュー実施者が
// observation列に自由記述する）。

export type AdversarialVerdict = 'accept' | 'revise' | 'reject'

export interface AdversarialRecord {
  id: string
  verdict: AdversarialVerdict
  observation: string
  reviewer: string
  reviewedAt: string
}

const TSV_HEADER = ['id', 'verdict', 'observation', 'reviewer', 'reviewedAt']

/** TSVセルを壊すタブ・改行を空白に潰す */
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

/** id一覧 → 敵対的検証記録用TSVの雛形（verdict等は空欄で、レビュー実施者が埋める） */
export function buildAdversarialTsvTemplate(ids: readonly string[]): string {
  const lines = [TSV_HEADER.join('\t')]
  for (const id of ids) {
    lines.push([id, '', '', '', ''].join('\t'))
  }
  return lines.join('\n') + '\n'
}

const VERDICTS: readonly AdversarialVerdict[] = ['accept', 'revise', 'reject']

/**
 * 記入済みTSVを解析する。verdict未記入行はスキップし、不正なverdict値はエラーとして返す
 * （review.tsのparseReviewTsvと同じ「未完了はスキップ、壊れた値はエラー」の方針）
 */
export function parseAdversarialTsv(tsv: string): {
  records: AdversarialRecord[]
  skipped: number
  errors: string[]
} {
  const lines = tsv.split(/\r?\n/).filter((line) => line.length > 0)
  const records: AdversarialRecord[] = []
  const errors: string[] = []
  let skipped = 0
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split('\t')
    const [id, verdict, observation, reviewer, reviewedAt] = cols
    if (!id) continue
    if (!verdict) {
      skipped++
      continue
    }
    if (!VERDICTS.includes(verdict as AdversarialVerdict)) {
      errors.push(
        `行${i + 1}（id=${id}）: verdict は ${VERDICTS.join('|')} のいずれか（実際: ${verdict}）`,
      )
      continue
    }
    records.push({
      id,
      verdict: verdict as AdversarialVerdict,
      observation: sanitizeCell(observation ?? ''),
      reviewer: sanitizeCell(reviewer ?? ''),
      reviewedAt: sanitizeCell(reviewedAt ?? ''),
    })
  }
  return { records, skipped, errors }
}

/** pack.origin へ追記する工程名（8.2節の書式: 「AIクロスレビュー（<モデル名>）＋敵対的検証（<観点数>観点・<日付>）」） */
export function reviewMethodLabel(
  reviewerModel: string,
  dimensionCount: number,
  date: string,
): string {
  return `AIクロスレビュー（${reviewerModel}）＋敵対的検証（${dimensionCount}観点・${date}）`
}
