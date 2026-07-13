// 解説カード（docs/07 7節S2: 正誤確定→解説カードが操作ゾーンからせり上がる。
// 問題文は見えたまま。事前生成解説＋和訳を表示する）
import type { Question } from '@beb-raid/shared-schema'

interface Props {
  question: Question
  isCorrect: boolean
}

export function ExplanationCard({ question, isCorrect }: Props) {
  return (
    <div className="explanation-card" data-correct={isCorrect}>
      <p className="explanation-card__verdict">{isCorrect ? '正解' : '不正解'}</p>
      {question.explanation && <p className="explanation-card__body">{question.explanation}</p>}
      {question.translation && (
        <p className="explanation-card__translation">{question.translation}</p>
      )}
    </div>
  )
}
