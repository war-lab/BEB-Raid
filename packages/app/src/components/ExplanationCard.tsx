// 解説カード（docs/07 7節S2: 正誤確定→解説カードが操作ゾーンからせり上がる。
// 問題文は見えたまま。事前生成解説＋和訳を表示する）。
// 「AIに聞く」（M2・T-56。正本: docs/13 3.7節、docs/02 8節、docs/05 5節）:
// BYOK設定済み（AiClient.isConfigured()）のときのみボタンを表示し、未設定なら出さない。
// オフライン時はボタンを表示したまま disabled＋理由を出す。対話履歴はこのコンポーネントの
// state のみに持ち、画面遷移（アンマウント）で自然に破棄する（J-14: 永続化しない）。
// 「問題がおかしい」報告（M3・T-101。正本: docs/17 3.8節）:
// raidApi.isConfigured() かつ登録済み（settings raidRegisteredAt）のときのみボタンを表示。
// オフラインはdisabled。キューイングせず直接fetch送信し、成功後は同一問題への再報告を
// メモリ内フラグで無効化する（永続化しない。画面遷移で自然にリセットされる）
import { useEffect, useState } from 'react'
import type { Question, QuestionReportReason } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { AiClientError, type AiChatTurn, type AiClient, type RaidApi } from '../platform'
import { RAID_REGISTERED_AT_KEY } from '../services/settingsKeys'

interface Props {
  question: Question
  isCorrect: boolean
  /** BYOK AIクライアント（未注入なら「AIに聞く」自体を出さない） */
  aiClient?: AiClient
  /** 共有API（レイド）クライアント（未注入なら「問題がおかしい」自体を出さない） */
  raidApi?: RaidApi
  /** raidRegisteredAt照会用（未注入ならraidApiがあっても報告ボタンは出さない） */
  db?: BebRaidDatabase
}

// 理由ラベルは「何を報告するのか」が一目で分かる文にする（レビューF4(b)）
const REPORT_REASONS: { value: QuestionReportReason; label: string }[] = [
  { value: 'wrong_answer', label: '正解が間違っている' },
  { value: 'unnatural', label: '英文が不自然' },
  { value: 'bad_explanation', label: '解説が間違っている' },
]

/** questionからAIへの問い合わせコンテキストを組み立てる（audio_qa/dictation/shadowing等は.question空のため.scriptにフォールバック） */
function toAskContext(question: Question) {
  return {
    question: question.question ?? question.script ?? '',
    choices: (question.choices ?? []).map((c) => c.text),
    answer: question.answer ?? '',
    explanation: question.explanation ?? '',
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof AiClientError) return error.message
  return 'エラーが発生しました。再試行してください'
}

export function ExplanationCard({ question, isCorrect, aiClient, raidApi, db }: Props) {
  const [configured, setConfigured] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<AiChatTurn[]>([])
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [registered, setRegistered] = useState(false)
  const [reportExpanded, setReportExpanded] = useState(false)
  const [reportSending, setReportSending] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!aiClient) return
    void aiClient.isConfigured().then((value) => {
      if (!cancelled) setConfigured(value)
    })
    return () => {
      cancelled = true
    }
  }, [aiClient])

  useEffect(() => {
    let cancelled = false
    if (!db) return
    void db.settings.get(RAID_REGISTERED_AT_KEY).then((setting) => {
      if (!cancelled) setRegistered(setting?.value != null)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  useEffect(() => {
    function handleOnline() {
      setOnline(true)
    }
    function handleOffline() {
      setOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function handleAsk() {
    const userQuestion = pendingQuestion.trim()
    if (!userQuestion || !aiClient) return
    setLoading(true)
    setError(null)
    try {
      const answer = await aiClient.ask(toAskContext(question), userQuestion, history)
      setHistory((h) => [
        ...h,
        { role: 'user', text: userQuestion },
        { role: 'assistant', text: answer },
      ])
      setPendingQuestion('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleReport(reason: QuestionReportReason) {
    if (!raidApi) return
    setReportSending(true)
    setReportError(null)
    try {
      await raidApi.sendReport({ questionId: question.id, reason })
      setReportSent(true)
    } catch {
      setReportError('送信できませんでした。通信環境を確認して再度お試しください')
    } finally {
      setReportSending(false)
    }
  }

  return (
    <div className="explanation-card" data-correct={isCorrect}>
      <p className="explanation-card__verdict">{isCorrect ? '正解' : '不正解'}</p>
      {question.explanation && <p className="explanation-card__body">{question.explanation}</p>}
      {question.translation && (
        <p className="explanation-card__translation">{question.translation}</p>
      )}

      {aiClient && configured && (
        <div className="explanation-card__ai">
          {!expanded ? (
            <button
              type="button"
              className="secondary-action"
              disabled={!online}
              onClick={() => setExpanded(true)}
            >
              AIに聞く
            </button>
          ) : (
            <>
              {!online && (
                <p className="explanation-card__ai-note">オフラインのため利用できません</p>
              )}
              {history.map((turn, i) => (
                <p
                  key={i}
                  className={
                    turn.role === 'user'
                      ? 'explanation-card__ai-question'
                      : 'explanation-card__ai-answer'
                  }
                >
                  {turn.text}
                </p>
              ))}
              {history.length > 0 && (
                <p className="explanation-card__ai-note">
                  AI回答は未レビュー。矛盾に気づいたら「問題がおかしい」から報告してください
                </p>
              )}
              <label>
                質問
                <input
                  value={pendingQuestion}
                  disabled={!online || loading}
                  onChange={(e) => setPendingQuestion(e.target.value)}
                />
              </label>
              {error && <p className="explanation-card__ai-error">{error}</p>}
              <button
                type="button"
                className="secondary-action"
                disabled={!online || loading || pendingQuestion.trim() === ''}
                onClick={() => void handleAsk()}
              >
                {loading ? '送信中…' : error ? '再試行' : '送信'}
              </button>
            </>
          )}
        </div>
      )}

      {raidApi && raidApi.isConfigured() && registered && (
        <div className="explanation-card__report">
          {reportSent ? (
            <p className="explanation-card__report-note">報告しました</p>
          ) : !reportExpanded ? (
            <button
              type="button"
              className="secondary-action"
              disabled={!online}
              onClick={() => setReportExpanded(true)}
            >
              問題がおかしい
            </button>
          ) : (
            <>
              <p className="explanation-card__report-note">どこがおかしいですか？</p>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className="secondary-action"
                  disabled={!online || reportSending}
                  onClick={() => void handleReport(r.value)}
                >
                  {r.label}
                </button>
              ))}
              {reportError && <p className="explanation-card__report-error">{reportError}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
