// レビューUI本体（M2・T-57。正本: docs/13 3.9節、04の5節、11節）。
// ドラフト一覧→1件ずつフィールド編集フォーム→採用/破棄（破棄は理由必須）→
// shared-schema検証のインライン表示→音声プレビュー→accepted/rejected.jsonl書出。
// cliのreview.tsの意味論（採用/修正/破棄）をそのまま流用し、出力は既存の
// review-import運用と互換にする（修正は「編集済みpayloadのまま採用」で表現する。
// TSV列と違いフィールド単位で直接編集できるため、別ボタンの「修正」は設けない）。
import { useEffect, useState } from 'react'
import { SCHEMA_VERSION, validatePack, type ValidationError } from '@beb-raid/shared-schema'
import type { GeneratedItemDraft, RejectedItem } from '@beb-raid/cli/review'
import { fetchDraftFiles, fetchDrafts, submitReview } from './api'
import { DraftForm } from './components/DraftForm'

type DraftStatus = 'pending' | 'accepted' | 'rejected'

interface ReviewItem {
  draft: GeneratedItemDraft
  payload: Record<string, unknown>
  status: DraftStatus
  reason: string
}

function validateDraftPayload(payload: unknown): ValidationError[] {
  const pseudoPack = {
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: 'review-ui-preview',
      title: 'preview',
      license: 'internal-original',
      origin: 'review-ui',
      targetLevel: [600, 990],
    },
    questions: [payload],
  }
  const result = validatePack(pseudoPack)
  return result.errors.map((e) => ({ ...e, path: e.path.replace(/^questions\[0\]\.?/, '') }))
}

export function App() {
  const [files, setFiles] = useState<string[] | null>(null)
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [submitResult, setSubmitResult] = useState<{
    acceptedPath: string
    rejectedPath: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchDraftFiles()
      .then((f) => {
        if (!cancelled) setFiles(f)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSelectFile(filename: string) {
    setError(null)
    setSubmitResult(null)
    setSelectedFile(filename)
    setCurrentIndex(0)
    try {
      const drafts = await fetchDrafts(filename)
      setItems(
        drafts.map((draft) => ({
          draft,
          payload: { ...(draft.payload as Record<string, unknown>) },
          status: 'pending',
          reason: '',
        })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setItems(null)
    }
  }

  function updateCurrent(patch: Partial<ReviewItem>) {
    setItems((prev) =>
      prev ? prev.map((it, i) => (i === currentIndex ? { ...it, ...patch } : it)) : prev,
    )
  }

  function goToNextPending(fromIndex: number, updated: ReviewItem[]) {
    const next = updated.findIndex((it, i) => i > fromIndex && it.status === 'pending')
    if (next !== -1) {
      setCurrentIndex(next)
      return
    }
    const anyPending = updated.findIndex((it) => it.status === 'pending')
    setCurrentIndex(anyPending !== -1 ? anyPending : fromIndex)
  }

  function handleAccept() {
    if (!items) return
    const updated = items.map((it, i) =>
      i === currentIndex ? { ...it, status: 'accepted' as const } : it,
    )
    setItems(updated)
    goToNextPending(currentIndex, updated)
  }

  function handleReject() {
    if (!items) return
    const current = items[currentIndex]
    if (!current || current.reason.trim() === '') return
    const updated = items.map((it, i) =>
      i === currentIndex ? { ...it, status: 'rejected' as const } : it,
    )
    setItems(updated)
    goToNextPending(currentIndex, updated)
  }

  async function handleSubmit() {
    if (!items || !selectedFile) return
    const accepted = items.filter((it) => it.status === 'accepted').map((it) => it.payload)
    const rejected: RejectedItem[] = items
      .filter((it) => it.status === 'rejected')
      .map((it) => ({ id: it.draft.id, kind: it.draft.kind, reason: it.reason.trim() }))
    try {
      const result = await submitReview(selectedFile, accepted, rejected)
      setSubmitResult(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const current = items?.[currentIndex]
  const pendingCount = items?.filter((it) => it.status === 'pending').length ?? 0
  const validationErrors = current ? validateDraftPayload(current.payload) : []

  return (
    <main className="review-app">
      <h1>BEB Raid レビューUI（ローカル専用）</h1>
      {error && <p className="review-app__error">{error}</p>}

      <section>
        <label>
          ドラフトファイル
          <select
            value={selectedFile ?? ''}
            onChange={(e) => void handleSelectFile(e.target.value)}
          >
            <option value="" disabled>
              選択してください
            </option>
            {files?.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </section>

      {items && (
        <section>
          <p>
            {items.length}件中 未レビュー{pendingCount}件（現在 {currentIndex + 1}件目）
          </p>

          {current ? (
            <div className="review-card">
              <p className="review-card__meta">
                id: {current.draft.id} / kind: {current.draft.kind} / status: {current.status}
              </p>
              <p className="review-card__preview">{current.draft.preview}</p>

              <DraftForm
                kind={current.draft.kind}
                payload={current.payload}
                onChange={(next) => updateCurrent({ payload: next })}
              />

              {validationErrors.length > 0 && (
                <div className="review-validation">
                  <p>検証エラー（{validationErrors.length}件）</p>
                  <ul>
                    {validationErrors.map((e, i) => (
                      <li key={i}>
                        [{e.code}] {e.path || '(全体)'}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="review-card__actions">
                <button
                  type="button"
                  disabled={current.status !== 'pending'}
                  onClick={handleAccept}
                >
                  採用
                </button>
                <label>
                  破棄理由
                  <input
                    value={current.reason}
                    onChange={(e) => updateCurrent({ reason: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  disabled={current.status !== 'pending' || current.reason.trim() === ''}
                  onClick={handleReject}
                >
                  破棄
                </button>
              </div>
            </div>
          ) : (
            <p>ドラフトが0件です</p>
          )}

          <button type="button" disabled={pendingCount > 0} onClick={() => void handleSubmit()}>
            書き出す
          </button>
          {submitResult && (
            <p className="review-app__result">
              書き出しました: {submitResult.acceptedPath} / {submitResult.rejectedPath}
            </p>
          )}
        </section>
      )}
    </main>
  )
}
