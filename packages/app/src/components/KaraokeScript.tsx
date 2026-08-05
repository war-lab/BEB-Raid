// カラオケハイライト（シャドーイング用。T-48。正本: docs/13 3.5節、docs/07 6節131行）。
// 発話中の語を --gold の下線＋明るい文字色、読了語は --ink、未読語は --ink-2 で表す
// （背景塗りは車内でちらつくため使わない）。timing が無い素材は文単位ハイライトに
// 縮退し、「ハイライトは目安」の注記を出す。タップ単位は常に文（区間リピート=3.5節）。
import { useMemo } from 'react'
import {
  buildShadowingSentences,
  currentSentenceIndex,
  currentWordIndex,
  type ShadowingSentence,
} from '../engine/shadowing'

interface Props {
  script: string
  timing: number[] | null
  positionMs: number
  durationMs: number
  onSentenceTap?: (sentence: ShadowingSentence, index: number) => void
}

function wordClass(index: number, current: number | null): string {
  if (current === null) return 'karaoke-unread'
  if (index < current) return 'karaoke-read'
  if (index === current) return 'karaoke-current'
  return 'karaoke-unread'
}

export function KaraokeScript({ script, timing, positionMs, durationMs, onSentenceTap }: Props) {
  const sentences = useMemo(
    () => buildShadowingSentences(script, timing, durationMs),
    [script, timing, durationMs],
  )
  const wordIdx = timing ? currentWordIndex(timing, positionMs) : null
  const sentenceIdx = timing ? null : currentSentenceIndex(sentences, positionMs)

  // 各文の先頭単語インデックス（全文通しての単語番号）を文単位ハイライトと同時に
  // 求める。map内でのカウンタ変数の再代入はreact-hooks/immutabilityに引っかかるため、
  // reduceのアキュムレータで純粋に計算する
  const sentenceWords = useMemo(
    () =>
      sentences.reduce<{ startWordIdx: number; words: string[] }[]>((acc, sentence) => {
        const prev = acc.at(-1)
        const startWordIdx = prev ? prev.startWordIdx + prev.words.length : 0
        const words = sentence.text.split(/\s+/).filter((w) => w.length > 0)
        acc.push({ startWordIdx, words })
        return acc
      }, []),
    [sentences],
  )

  return (
    <div className="karaoke-script">
      {sentences.map((sentence, sIdx) => {
        const { startWordIdx, words } = sentenceWords[sIdx]!

        return (
          <span
            key={sIdx}
            role="button"
            tabIndex={0}
            className="karaoke-sentence"
            onClick={() => onSentenceTap?.(sentence, sIdx)}
            // Q-61: role="button"のspanはネイティブbuttonと違いEnter/Spaceでは
            // onClickが発火しない。区間リピートをキーボードのみで操作できるよう
            // 明示的に発火させる（Spaceのページスクロールは抑止する）
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              e.preventDefault()
              onSentenceTap?.(sentence, sIdx)
            }}
          >
            {timing ? (
              words.map((word, wi) => (
                <span key={wi} className={wordClass(startWordIdx + wi, wordIdx)}>
                  {word}{' '}
                </span>
              ))
            ) : (
              <span className={wordClass(sIdx, sentenceIdx)}>{sentence.text} </span>
            )}
          </span>
        )
      })}
      {!timing && <p className="karaoke-note">ハイライトは目安です</p>}
    </div>
  )
}
