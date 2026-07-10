// S2 ドリル実行画面（共通。docs/07 7節S2・02の2.2・03の3.2）。
// T-16 では text_blank 等の共通フロー（音声なし）を実装する。
// audio_qa 固有のタイマー・音声再生（unlock/playSequence）は T-17 が追加する。
import { useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { processWrongAnswer } from '../engine/keyVocab'
import { formatQuickPackReason } from '../engine/reason'
import { applyRatingUpdate } from '../engine/rating'
import { reviewSrsCard } from '../engine/srs'
import { updateTagStatsForAnswer } from '../engine/tagStats'
import type { QuestionLookup } from '../engine/types'
import { answerCurrentQuestion } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { ExplanationCard } from '../components/ExplanationCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'

interface Props {
  db: BebRaidDatabase
}

interface AnswerResult {
  selectedKey: string
  isCorrect: boolean
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
// （イベントハンドラ内の呼び出しも静的解析では判別されない）、別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function DrillScreen({ db }: Props) {
  const snapshot = useSessionStore((s) => s.snapshot)
  const questions = useSessionStore((s) => s.questions)
  const recordAnswer = useSessionStore((s) => s.recordAnswer)
  const navigate = useAppStore((s) => s.navigate)

  // 表示中の item インデックス（snapshot.answeredCount とは独立に持つ:
  // 解答直後は snapshot が既に次へ進んでいても、解説カードは「次へ」タップまで
  // 現在の問題を表示し続ける必要があるため=07 7節S2）
  const [displayIndex, setDisplayIndex] = useState(() => snapshot?.answeredCount ?? 0)
  const [result, setResult] = useState<AnswerResult | null>(null)
  const [startedAt, setStartedAt] = useState(() => now())

  if (!snapshot) return null

  const item = snapshot.items[displayIndex]
  if (!item) {
    navigate('result')
    return null
  }
  const question = questions.get(item.questionId)
  if (!question) return null

  const total = snapshot.items.length
  const current = displayIndex + 1

  async function handleSelect(choiceKey: string) {
    if (result || !question) return
    const responseMs = now() - startedAt
    const isCorrect = choiceKey === question.answer
    setResult({ selectedKey: choiceKey, isCorrect })

    const nextSnapshot = await answerCurrentQuestion(db, snapshot!, { isCorrect, responseMs })

    if (!isCorrect) {
      await processWrongAnswer(db, question)
    }
    const lookup: QuestionLookup = questions
    await updateTagStatsForAnswer(db, question.id, lookup)
    const ratingUpdate = await applyRatingUpdate(db, {
      part: question.part,
      difficulty: question.difficulty,
      isCorrect,
      mode: item!.mode,
    })
    if (item!.srsCardId) {
      // S2は客観正誤のみのUIのため、自己評価3段階への写像は正解→good/誤答→again に固定する
      await reviewSrsCard(db, item!.srsCardId, isCorrect ? 'good' : 'again')
    }

    recordAnswer(nextSnapshot, {
      questionId: question.id,
      isCorrect,
      basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
    })
  }

  function handleNext() {
    if (displayIndex + 1 >= total) {
      navigate('result')
      return
    }
    setDisplayIndex((i) => i + 1)
    setResult(null)
    setStartedAt(now())
  }

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={current} total={total} />
          {item.reason && <p className="drill-reason">{formatQuickPackReason(item.reason)}</p>}
        </>
      }
      action={
        <>
          {(question.choices ?? []).map((choice) => {
            let state: ChoiceState = 'idle'
            if (result) {
              if (choice.key === question.answer) state = 'correct'
              else if (choice.key === result.selectedKey) state = 'wrong'
              else state = 'dimmed'
            }
            return (
              <ChoiceButton
                key={choice.key}
                marker={choice.key}
                state={state}
                disabled={result !== null}
                onClick={() => handleSelect(choice.key)}
              >
                {choice.text}
              </ChoiceButton>
            )
          })}
          {result && (
            <>
              <ExplanationCard question={question} isCorrect={result.isCorrect} />
              <PrimaryButton onClick={handleNext}>次へ</PrimaryButton>
            </>
          )}
        </>
      }
    >
      <p className="question-text">{question.question}</p>
    </ScreenLayout>
  )
}
