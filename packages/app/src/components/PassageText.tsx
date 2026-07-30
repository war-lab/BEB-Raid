// 読解（Part6/7）の本文表示（docs/24 3.5節）。
// Part6は本文中に空所マーカー [[1]]…[[4]] を埋め込む（passage.text）。
// 未解答の空所は `___(n)___` として表示し、タップで該当設問へジャンプできる。
// 解答済みの空所は選択結果（選んだ選択肢の文言＋正誤）に置き換えて本文へ反映する。
// Part7単一はマーカーを持たないため、本文をそのまま表示する。
import type { ReactNode } from 'react'
import type { SubQuestion } from '@beb-raid/shared-schema'

/** 本文中の空所マーカー [[n]] を検出する（validate.ts の PASSAGE_MARKER_RE と同じ規約） */
const MARKER_RE = /\[\[(\d+)\]\]/g

export interface PassageAnswer {
  selectedKey: string
  isCorrect: boolean
}

interface Props {
  text: string
  subQuestions: readonly SubQuestion[]
  /** サブ設問インデックス（0始まり）→ 解答済みの結果 */
  answers: ReadonlyMap<number, PassageAnswer>
  /** 現在アクティブなサブ設問インデックス（該当空所を強調表示する） */
  activeIndex: number
  /** 空所タップ時に呼ばれる（該当設問へジャンプ。3.5節） */
  onSelectBlank: (index: number) => void
}

export function PassageText({ text, subQuestions, answers, activeIndex, onSelectBlank }: Props) {
  const matches = [...text.matchAll(MARKER_RE)]

  // マーカーが無い本文（Part7単一）はそのまま表示する
  if (matches.length === 0) {
    return (
      <p className="passage-text" data-testid="passage-text">
        {text}
      </p>
    )
  }

  const nodes: ReactNode[] = []
  let cursor = 0
  matches.forEach((m, i) => {
    const markerNumber = Number(m[1])
    const subIndex = markerNumber - 1
    const start = m.index ?? 0
    if (start > cursor) nodes.push(text.slice(cursor, start))
    const answer = answers.get(subIndex)
    const sub = subQuestions[subIndex]
    const choiceText = answer
      ? (sub?.choices.find((c) => c.key === answer.selectedKey)?.text ?? answer.selectedKey)
      : null
    nodes.push(
      <button
        key={`blank-${markerNumber}-${i}`}
        type="button"
        className={
          'passage-blank' +
          (answer ? (answer.isCorrect ? ' is-correct' : ' is-wrong') : ' is-unanswered') +
          (subIndex === activeIndex ? ' is-active' : '')
        }
        data-testid={`passage-blank-${markerNumber}`}
        onClick={() => onSelectBlank(subIndex)}
      >
        {answer ? `(${markerNumber}) ${choiceText}` : `___(${markerNumber})___`}
      </button>,
    )
    cursor = start + m[0].length
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))

  return (
    <p className="passage-text" data-testid="passage-text">
      {nodes}
    </p>
  )
}
