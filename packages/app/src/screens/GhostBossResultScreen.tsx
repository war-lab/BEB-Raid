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
import { ConfirmDialog } from '../components/ConfirmDialog'
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
  const snapshot = useSessionStore((s) => s.snapshot)
  const reset = useSessionStore((s) => s.reset)
  const navigate = useAppStore((s) => s.navigate)

  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  // T-202（docs/29 Q-34・J-105）:「破棄する」は「送信する」の直下に隣接し、確認なしの
  // 1タップでこの記録（正誤一覧）が失われた。撤回導線と同様に確認を挟む
  const [discardConfirm, setDiscardConfirm] = useState(false)

  const wrongCount = results.filter((r) => !r.isCorrect).length

  async function finishAndGoHome() {
    // T-267（docs/29 Q-5・PR #137）: ゴースト役セッションもDrillScreen経由でリザルトへ
    // 遷移する時点で既にcompleteSessionが呼ばれている（DrillScreen側のfinishSession()を
    // 参照）。ここでの呼び出しは基本的に空振り（settings.deleteは冪等）だが、
    // ResultScreen.tsxと同じ理由で安全網として残す
    try {
      // T-193: sessionId照合のため、このセッションを完了する対象が無ければ呼ばない
      if (snapshot) await completeSession(db, snapshot.sessionId)
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
      status={
        <>
          <p>ボス役の記録</p>
          {/* T-202（Q-34）: 「送信する」の直下に隣接し、確認なしの1タップで記録が失われていた */}
          {discardConfirm && (
            <ConfirmDialog
              message="記録を破棄しますか？（送信していない正誤記録が失われます）"
              onDismiss={() => setDiscardConfirm(false)}
              actions={[
                {
                  label: '破棄する',
                  primary: true,
                  onSelect: () => {
                    setDiscardConfirm(false)
                    void finishAndGoHome()
                  },
                },
                { label: 'キャンセル', onSelect: () => setDiscardConfirm(false) },
              ]}
            />
          )}
        </>
      }
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
              onClick={() => setDiscardConfirm(true)}
              disabled={sending}
            >
              破棄する
            </button>
          </>
        )
      }
    >
      {sent ? (
        // 送信済みは--okのアイコン＋文で完結させる（docs/25 4.7節）
        <p className="ghost-preview-sent" data-testid="ghost-boss-sent">
          <span aria-hidden="true" className="ghost-preview-sent__icon" />
          <span>記録を送信しました。今週のゴーストレイドに反映されます</span>
        </p>
      ) : (
        <>
          <p>
            正解 {results.length - wrongCount} / {results.length}
          </p>
          {/* 同意判断の材料になる数値なので--warnの枠を持つ注意カードに収める（docs/25 4.7節）。
              文言は変えず、数値だけを拡大する */}
          <div className="ghost-preview-notice">
            <p className="ghost-preview-notice__line" data-testid="ghost-boss-weakness-count">
              弱点として公開される問題数:{' '}
              <span className="ghost-preview-notice__count">{wrongCount}</span>問
            </p>
          </div>
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
