// S9 間違えた問題一覧（発起人の要望、2026-08-03。docs/02 2.5節）。
//
// リザルトの誤答一覧はそのセッション分だけで、過去の誤答をあとから見返す経路が無かった。
// attempts（追記のみ・分析の基盤）から誤答を問題単位に畳んで並べ、そのまま復習セッションを
// 開始できるようにする。
//
// **自分が選んだ選択肢は出さない**（出せない）。attempts は選択キーを保存していないため、
// 表示できるのは正解・解説・誤答回数・最終誤答日・時間切れ/当て勘の区別である。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptRecord } from '../db/schema'
import {
  collectWrongAnswers,
  formatWrongAnswerDate,
  wrongAnswerCorrectText,
  wrongAnswerPrompt,
  wrongAnswerReviewIds,
  WRONG_ANSWER_REVIEW_LIMIT,
  type WrongAnswerEntry,
} from '../engine/wrongAnswers'
import type { AiClient, RaidApi } from '../platform'
import { useReviewSession } from '../hooks/useReviewSession'
import { useAppStore } from '../store/appStore'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ExplanationCard } from '../components/ExplanationCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  /** 誤答のquestionIdから問題を引くためのプール（サブ設問は親から解決する） */
  questionPool: Question[]
  aiClient?: AiClient
  raidApi?: RaidApi
}

/**
 * 走査する解答ログの上限（新しい順）。
 * 全件走査は端末の履歴が伸びるほど重くなる一方、間違えた問題の振り返りは新しい方から
 * 見るものなので上限を置く。到達した場合は画面に明示する（黙って切らない）
 */
export const WRONG_ANSWER_SCAN_LIMIT = 3000

/**
 * 一覧の1ページあたりの表示件数（T-215・Q-49）。
 * 走査上限3000から畳んだ全誤答を一括レンダーすると、数百件規模でPartフィルタ切替のたびに
 * 全再レンダーが重くなる。仮想化ライブラリを新規導入するほどの規模ではないため、
 * ページング（「もっと見る」で追加表示）で初期レンダー件数を絞る
 */
export const WRONG_ANSWER_PAGE_SIZE = 20

export function WrongAnswersScreen({ db, questionPool, aiClient, raidApi }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const review = useReviewSession(db, questionPool)

  const [entries, setEntries] = useState<WrongAnswerEntry[] | null>(null)
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [scanTruncated, setScanTruncated] = useState(false)
  /** 絞り込み中のPart（null=全部） */
  const [partFilter, setPartFilter] = useState<number | null>(null)
  /** 解説を開いている行（attempts上のID）。1件ずつ開く（全部展開すると一覧の見通しが死ぬ） */
  const [expanded, setExpanded] = useState<string | null>(null)
  /** ページングの表示件数（T-215・Q-49）。Partフィルタを切り替えたら1ページ目に戻す */
  const [visibleCount, setVisibleCount] = useState(WRONG_ANSWER_PAGE_SIZE)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const rows: AttemptRecord[] = await db.attempts
        .orderBy('answeredAt')
        .reverse()
        .limit(WRONG_ANSWER_SCAN_LIMIT)
        .toArray()
      if (cancelled) return
      const lookup = new Map(questionPool.map((q) => [q.id, q]))
      const summary = collectWrongAnswers(rows, lookup)
      setEntries(summary.entries)
      setUnresolvedCount(summary.unresolvedCount)
      setScanTruncated(rows.length >= WRONG_ANSWER_SCAN_LIMIT)
    }
    void load().catch((e) => {
      console.error('[WrongAnswersScreen] 誤答一覧の読み込みに失敗', e)
      if (!cancelled) setEntries([])
    })
    return () => {
      cancelled = true
    }
  }, [db, questionPool])

  const parts = [...new Set((entries ?? []).map((e) => e.question.part))].sort((a, b) => a - b)
  const filtered = (entries ?? []).filter(
    (e) => partFilter === null || e.question.part === partFilter,
  )
  // T-215（Q-49）: Partフィルタを切り替えたら1ページ目に戻す（絞り込み後の件数に対して
  // 「もっと見る」を再度押す必要がないようにする）
  useEffect(() => {
    setVisibleCount(WRONG_ANSWER_PAGE_SIZE)
  }, [partFilter])
  const visibleEntries = filtered.slice(0, visibleCount)
  const reviewIds = wrongAnswerReviewIds(filtered, WRONG_ANSWER_REVIEW_LIMIT)

  return (
    <ScreenLayout
      status={
        <>
          {review.conflict && (
            <ConfirmDialog
              message="進行中のセッションを破棄して復習を始めますか？"
              onDismiss={review.cancel}
              actions={[
                {
                  label: '続きから再開する',
                  primary: true,
                  onSelect: () => void review.resume(),
                },
                { label: '破棄して復習を始める', onSelect: () => void review.discardAndStart() },
                { label: 'やめる', onSelect: review.cancel },
              ]}
            />
          )}
          <p>間違えた問題</p>
          {entries !== null && <span className="home-due-badge">{entries.length}件</span>}
        </>
      }
      action={
        <>
          {reviewIds.length > 0 && (
            <PrimaryButton onClick={() => void review.start(reviewIds)}>
              この一覧で復習する（{reviewIds.length}問）
            </PrimaryButton>
          )}
          <button type="button" className="secondary-action" onClick={() => navigate('home')}>
            ホームへ
          </button>
        </>
      }
    >
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>間違えた問題</h1>

      {entries === null && <p>読み込み中…</p>}

      {entries !== null && entries.length === 0 && (
        <p>まだ誤答の記録がありません。クエストや単独モードを解くとここに並びます。</p>
      )}

      {parts.length > 1 && (
        <div className="dictation-rate-chips" role="group" aria-label="Partで絞り込む">
          <button
            type="button"
            className={partFilter === null ? 'is-selected' : ''}
            onClick={() => setPartFilter(null)}
          >
            すべて
          </button>
          {parts.map((part) => (
            <button
              key={part}
              type="button"
              className={partFilter === part ? 'is-selected' : ''}
              onClick={() => setPartFilter(part)}
            >
              Part{part}
            </button>
          ))}
        </div>
      )}

      {/* 一覧はリザルトの誤答ふりかえりリストと同じ器（.result-list）を使う。
          間違えた記録なので data-correct は常に false（✕の二重符号化）。
          T-215（Q-49）: 全件を一括レンダーせず、visibleEntries（ページング）のみを描く */}
      <ul className="result-list" data-testid="wrong-answer-list">
        {visibleEntries.map((entry) => (
          <li
            key={entry.attemptQuestionId}
            className="result-list__item"
            data-correct="false"
            data-testid="wrong-answer-item"
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <p className="result-list__question" style={{ whiteSpace: 'normal' }}>
              <span className="result-list__icon" aria-hidden="true" /> Part{entry.question.part}{' '}
              {wrongAnswerPrompt(entry)}
            </p>
            <p className="result-list__note" style={{ marginLeft: 0 }}>
              {formatWrongAnswerDate(entry.lastWrongAt)}
              {entry.wrongCount > 1 && ` ・ ${entry.wrongCount}回`}
              {/* 時間切れ・当て勘は知識不足と別物なので区別して出す（03の7.2節・T-163と同じ扱い） */}
              {entry.lastWrongTimeout && ' ・ 時間切れ'}
              {entry.lastWrongGuess && ' ・ 当て勘'}
              {entry.recovered && ' ・ その後正解'}
            </p>
            <button
              type="button"
              className="secondary-action"
              aria-expanded={expanded === entry.attemptQuestionId}
              onClick={() =>
                setExpanded((prev) =>
                  prev === entry.attemptQuestionId ? null : entry.attemptQuestionId,
                )
              }
            >
              {expanded === entry.attemptQuestionId ? '解説を閉じる' : '解説'}
            </button>
            {expanded === entry.attemptQuestionId && (
              <>
                {/* T-215（Q-54）: 復習開始前に正解が見えるとネタバレになり再テスト価値が下がる。
                    「解説」を開いたときだけ出す（即時表示しない） */}
                <p className="result-list__note" style={{ marginLeft: 0, whiteSpace: 'normal' }}>
                  正解: {wrongAnswerCorrectText(entry)}
                </p>
                {/* サブ設問の誤答は設問文・選択肢・正解・解説をサブ設問のものへ差し替えて渡す
                    （親を渡すとパッセージ全体の解説になってしまう。ReadingScreenと同じ組み立て） */}
                <ExplanationCard
                  question={
                    entry.subQuestion
                      ? {
                          ...entry.question,
                          question: entry.subQuestion.question,
                          choices: entry.subQuestion.choices,
                          answer: entry.subQuestion.answer,
                          explanation: entry.subQuestion.explanation,
                          translation: entry.subQuestion.translation,
                        }
                      : entry.question
                  }
                  isCorrect={false}
                  aiClient={aiClient}
                  raidApi={raidApi}
                  db={db}
                />
              </>
            )}
          </li>
        ))}
      </ul>

      {/* T-215（Q-49）: ページング。残りがある間だけ「もっと見る」を出す */}
      {filtered.length > visibleEntries.length && (
        <button
          type="button"
          className="secondary-action"
          onClick={() => setVisibleCount((c) => c + WRONG_ANSWER_PAGE_SIZE)}
        >
          もっと見る（残り{filtered.length - visibleEntries.length}件）
        </button>
      )}

      {entries !== null && filtered.length === 0 && entries.length > 0 && (
        <p>このPartの誤答はありません。</p>
      )}

      {/* 件数が合わない理由を必ず出す（黙って捨てると記録が消えたように見える） */}
      {unresolvedCount > 0 && (
        <p className="result-list__note" style={{ marginLeft: 0, whiteSpace: 'normal' }}>
          問題データを引けない誤答が{unresolvedCount}件あります（語彙カード・配信から外れた問題）。
        </p>
      )}
      {scanTruncated && (
        <p className="result-list__note" style={{ marginLeft: 0, whiteSpace: 'normal' }}>
          直近{WRONG_ANSWER_SCAN_LIMIT}件の解答から集計しています。
        </p>
      )}
    </ScreenLayout>
  )
}
