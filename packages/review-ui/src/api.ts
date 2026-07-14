// レビューUIのdevサーバーAPI呼び出し（クライアント側。draftsServerPlugin.tsのエンドポイントと対）。
import type { GeneratedItemDraft, RejectedItem } from '@beb-raid/cli/review'

export async function fetchDraftFiles(): Promise<string[]> {
  const res = await fetch('/api/drafts')
  if (!res.ok) throw new Error(`ドラフト一覧の取得に失敗しました（${res.status}）`)
  return (await res.json()) as string[]
}

export async function fetchDrafts(filename: string): Promise<GeneratedItemDraft[]> {
  const res = await fetch(`/api/drafts/${encodeURIComponent(filename)}`)
  if (!res.ok) throw new Error(`ドラフトの読込に失敗しました（${res.status}）`)
  return (await res.json()) as GeneratedItemDraft[]
}

export interface SubmitReviewResult {
  acceptedPath: string
  rejectedPath: string
}

export async function submitReview(
  filename: string,
  accepted: unknown[],
  rejected: RejectedItem[],
): Promise<SubmitReviewResult> {
  const res = await fetch('/api/review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, accepted, rejected }),
  })
  if (!res.ok) throw new Error(`書出に失敗しました（${res.status}）`)
  return (await res.json()) as SubmitReviewResult
}
