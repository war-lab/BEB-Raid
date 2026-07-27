// ボス役セッションの記録プレビュー画面（M4・T-128。正本: docs/22 3.5節）。
// App.tsxが 'result' 画面をこちらへ振り分けるのは useSessionStore().isGhostBossSession が
// true のときのみ（RaidScreenの同意画面確定後にしかこのフラグは立たない＝
// 同意なしにこの画面自体へ到達しない。同意の構造的強制の一部）。
//
// 完走後に正誤一覧・「弱点として公開される問題数」（誤答数）を表示し、
// 送信ボタンで POST /ghosts、送信前ならいつでも破棄できる（3.5節）
import { useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import type { RaidApi } from '../platform'
import { sendGhostBossRecord } from '../services/ghostBoss'
import { completeSession } from '../services/session'
import { GHOST_BOSS_SUBMITTED_AT_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { resultQuestionLabel } from './ResultScreen'

interface Props {
  db: BebRaidDatabase
  raidApi: RaidApi
}

export function GhostBossResultScreen({ db, raidApi }: Props) {
  const results = useSessionStore((s) => s.results)
  const questions = useSessionStore((s) => s.questions)
  const reset = useSessionStore((s) => s.reset)
  const navigate = useAppStore((s) => s.navigate)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const wrongCount = results.filter((r) => !r.isCorrect).length

  async function finishAndGoHome() {
    try {
      await completeSession(db)
    } catch (e) {
      console.warn('[GhostBossResultScreen] セッション完了処理に失敗', e)
    }
    reset()
    navigate('home')
  }

  async function handleSend() {
    setSendError(null)
    setSending(true)
    try {
      const profile = await db.profile.get(PROFILE_ID)
      const displayName = profile?.displayName ?? ''
      // このsendGhostBossRecord呼び出しがconsented=trueで呼べるのは、
      // この画面自体が同意画面確定後にしか表示されないため（isGhostBossSessionの説明を参照）
      await sendGhostBossRecord(raidApi, true, {
        displayName,
        records: results.map((r) => ({ questionId: r.questionId, correct: r.isCorrect })),
      })
      await db.settings.put({ key: GHOST_BOSS_SUBMITTED_AT_KEY, value: Date.now() })
      setSent(true)
    } catch (e) {
      console.warn('[GhostBossResultScreen] 記録の送信に失敗', e)
      setSendError('送信に失敗しました。通信を確認してもう一度お試しください')
    } finally {
      setSending(false)
    }
  }

  function questionLabel(questionId: string): string {
    return resultQuestionLabel(questionId, questions.get(questionId) as Question | undefined)
  }

  return (
    <ScreenLayout
      status={<p>ボス役の記録</p>}
      action={
        sent ? (
          <PrimaryButton onClick={() => void finishAndGoHome()}>ホームへ</PrimaryButton>
        ) : (
          <>
            <PrimaryButton onClick={() => void handleSend()} disabled={sending}>
              送信する
            </PrimaryButton>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void finishAndGoHome()}
              disabled={sending}
            >
              破棄する
            </button>
          </>
        )
      }
    >
      {sent ? (
        <p data-testid="ghost-boss-sent">記録を送信しました。今週のゴーストレイドに反映されます</p>
      ) : (
        <>
          <p>
            正解 {results.length - wrongCount} / {results.length}
          </p>
          <p data-testid="ghost-boss-weakness-count">弱点として公開される問題数: {wrongCount}問</p>
          {sendError && <p className="drill-error">{sendError}</p>}
          <ul className="result-list">
            {results.map((r, i) => (
              <li key={i} className="result-list__item" data-correct={r.isCorrect}>
                <span aria-hidden="true" className="result-list__icon" />
                <span className="result-list__question">{questionLabel(r.questionId)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </ScreenLayout>
  )
}
