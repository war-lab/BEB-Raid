// フレーズ中の対象単語を強調表示する（金フレ型体験=docs/02 4節。フレーズと暗記対象の
// 単語のつながりが見えないと「なぜこの単語の意味なのか」が分からなくなるため、
// front（対象語）がphrase内のどこにあるかを視覚的に示す）。
// 対象語がphrase中に見つからない場合はプレーンテキストのまま返す（活用形の揺れ等で
// 完全一致しないケースは強調を諦めるだけで、表示自体は壊さない）。

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Props {
  phrase: string
  word: string
}

export function HighlightedPhrase({ phrase, word }: Props) {
  if (!word) return <>{phrase}</>
  const parts = phrase.split(new RegExp(`(${escapeRegExp(word)})`, 'i'))
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === word.toLowerCase() ? (
          <strong key={i} className="vocab-card__target">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
