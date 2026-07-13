// レビュー往復フォーマット（T-30。正本: docs/04 5節、docs/10 T-30行）。
//
// 生成コマンド（T-26〜T-29）は「ドラフトJSONL」（1行1件のGeneratedItemDraft）を
// 出力する。review-export はそれをスプレッドシート貼り付け用TSVに変換し、
// 人手レビュー後の TSV（status列に採用/修正/破棄を書き込んだもの）を
// review-import が読み、採用・修正のみを反映したJSONLと、破棄理由付きの
// rejected.jsonl に振り分ける。

/** 生成コマンドが出力する1件分のドラフト（種別問わず共通の外枠） */
export interface GeneratedItemDraft {
  /** ドラフトの一意ID（採用後の Question.id 等とは独立でよい） */
  id: string
  /** 種別（Question.format 相当。'vocab_card' | 'audio_qa' | 'text_blank' 等） */
  kind: string
  /** レビューア向けの本文プレビュー（1行に収まる要約。生成コマンド側が組み立てる） */
  preview: string
  /** 実際の生成物（採用時にそのまま/修正パッチを当てて出力に含める） */
  payload: unknown
}

export type ReviewStatus = '採用' | '修正' | '破棄'

const TSV_HEADER = [
  'id',
  '種別',
  '本文プレビュー',
  'status(採用・修正・破棄)',
  '修正内容',
  '破棄理由',
]

/** TSVセルを壊すタブ・改行を空白に潰す（プレビューは1行要約である前提） */
function sanitizeCell(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

/** ドラフト一覧 → レビュー用TSV（スプレッドシート貼り付け用） */
export function buildReviewTsv(drafts: readonly GeneratedItemDraft[]): string {
  const lines = [TSV_HEADER.join('\t')]
  for (const draft of drafts) {
    lines.push([draft.id, draft.kind, sanitizeCell(draft.preview), '', '', ''].join('\t'))
  }
  return lines.join('\n') + '\n'
}

export interface RejectedItem {
  id: string
  kind: string
  reason: string
}

export interface ReviewImportResult {
  /** 採用・修正後の反映済みpayload一覧（そのままJSONL出力する） */
  accepted: unknown[]
  rejected: RejectedItem[]
  /** status が空・未知の値など、レビュー未完了として無視した行数 */
  skipped: number
}

/**
 * レビュー済みTSVを取り込む。
 * - 採用: ドラフトのpayloadをそのまま採用する
 * - 修正: 「修正内容」列をJSONとしてpayloadに浅くマージする（空文字はpayloadそのまま採用と同義）
 * - 破棄: 「破棄理由」列（空なら「(理由未記入)」）付きでrejectedへ
 * - それ以外（status未記入・ドラフトに対応するid無し）: レビュー未完了として無視（次回に持ち越し）
 */
export function parseReviewTsv(
  tsv: string,
  draftsById: ReadonlyMap<string, GeneratedItemDraft>,
): ReviewImportResult {
  const lines = tsv.split(/\r?\n/).filter((line) => line.length > 0)
  const rows = lines.slice(1) // 先頭はヘッダー行

  const accepted: unknown[] = []
  const rejected: RejectedItem[] = []
  let skipped = 0

  for (const row of rows) {
    const cells = row.split('\t')
    const id = cells[0] ?? ''
    const status = cells[3] ?? ''
    const edit = cells[4] ?? ''
    const reason = cells[5] ?? ''

    const draft = draftsById.get(id)
    if (!draft) {
      skipped += 1
      continue
    }

    if (status === '採用') {
      accepted.push(draft.payload)
    } else if (status === '修正') {
      if (edit.trim() === '') {
        accepted.push(draft.payload)
        continue
      }
      try {
        const patch = JSON.parse(edit) as Record<string, unknown>
        accepted.push({ ...(draft.payload as Record<string, unknown>), ...patch })
      } catch {
        rejected.push({
          id: draft.id,
          kind: draft.kind,
          reason: `修正内容のJSON解析に失敗（そのまま破棄扱い）: ${edit}`,
        })
      }
    } else if (status === '破棄') {
      rejected.push({ id: draft.id, kind: draft.kind, reason: reason.trim() || '(理由未記入)' })
    } else {
      skipped += 1
    }
  }

  return { accepted, rejected, skipped }
}

/** JSONL文字列 → パース済み配列（空行は無視） */
export function parseJsonl<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as T)
}

/** 配列 → JSONL文字列（1行1件。末尾改行あり。空配列は空文字列） */
export function toJsonl(items: readonly unknown[]): string {
  if (items.length === 0) return ''
  return items.map((item) => JSON.stringify(item)).join('\n') + '\n'
}
