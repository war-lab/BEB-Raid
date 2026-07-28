// イベントバトル最終リザルトの表彰（V-10。正本: docs/25 4.2節・JV-4）。
// StandingsList（V-9）の children スロットに差し込んで使い、順位表そのものは持たない。
// 設計の要点:
// - 表彰台は上位3名のみ。順位＝数字＋台の高さ＋色の三重符号化（グレースケールでも
//   数字と高さで判別できる）。4位以下は StandingsList 側の fromRank={4} が描く
// - ベストグロース賞は表彰台とは別枠の独立カード。順位表に埋めない（順位と別の軸で
//   表彰することで「最下位でもスポットライトが当たる」が成立する＝docs/02 6.2節）
// - JV-4（承認済み・案B）: 3位→2位→1位→ベストグロース賞の順に段階開示し、1位の得点に
//   `--glow-gold` を当てる（光暈の適用箇所の拡張。docs/20 3.1節・docs/07 3.1節に追記済み）
// - 段階開示は setTimeout 駆動のため、base.css のCSSアニメーション全停止では止まらない。
//   `matchMedia('(prefers-reduced-motion: reduce)')` を自前で見て静止表示へ縮退する
//   （ResultScreen.tsx の既存パターンを踏襲）
// - 開示待ちへの配慮（docs/25 4.2節の指摘）: 4位以下の全順位は開示に関係なく最初から
//   見えており、加えて「すべて表示」で開示を打ち切れる。開示完了後は全要素が残る
import { useEffect, useState } from 'react'
import type { StandingsEntry } from './StandingsList'

/** 1段ぶんの開示間隔。3位=0ms → 2位=250ms → 1位=500ms → ベストグロース=750ms */
const AWARD_REVEAL_STEP_MS = 250
/** 表彰台の得点カウントアップ時間（ResultScreen の POINTS_COUNTUP_MS と同じ実装パターン） */
const AWARD_COUNTUP_MS = 300
/** 開示の段数（3位・2位・1位・ベストグロース賞） */
const AWARD_STEP_COUNT = 4
/**
 * 演出の総時間。最後に終わるのは1位のカウントアップ（開示500ms＋カウントアップ300ms＝800ms。
 * ベストグロース賞の開示750msより後）。07の9節「報酬演出600〜900ms」の範囲に収める
 */
export const AWARD_TOTAL_MS = AWARD_REVEAL_STEP_MS * 2 + AWARD_COUNTUP_MS

/** 表彰台に載せる順位数（上位3名。docs/25 4.2節） */
const PODIUM_SIZE = 3

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** 得点のrAFカウントアップ。active になった時点から始め、instant の間は最終値をそのまま返す */
function useCountUp(target: number, active: boolean, instant: boolean): number {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (instant || !active) return
    let raf = 0
    const start = Date.now()
    function tick() {
      const progress = Math.min(1, (Date.now() - start) / AWARD_COUNTUP_MS)
      setAnimated(Math.round(target * progress))
      if (progress < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, active, instant])

  return instant ? target : animated
}

interface Props {
  /** サーバーから受け取った順位順（得点降順）のエントリ全件。上位3名だけを表彰台に載せる */
  entries: StandingsEntry[]
  /** ベストグロース賞の受賞者名（サーバーの result メッセージの bestGrowth） */
  bestGrowthName: string | null
  /** 自分の行の識別に使う表示名。S7参加者画面でのみ渡す（S8ホストは解答しない） */
  selfDisplayName?: string
  /** ベストグロース賞カードの data-testid（既存テストのIDを維持するため呼び出し側が指定する） */
  bestGrowthTestId: string
}

export function BattleAward({ entries, bestGrowthName, selfDisplayName, bestGrowthTestId }: Props) {
  // reduced-motion はマウント時に1回だけ見る（開示中に設定が変わる想定はしない）
  const [instant, setInstant] = useState(prefersReducedMotion)
  // 開示済みの段数。instant のときは最初から全段開示（＝静止表示）
  const [step, setStep] = useState(() => (prefersReducedMotion() ? AWARD_STEP_COUNT : 1))

  useEffect(() => {
    if (instant || step >= AWARD_STEP_COUNT) return
    const id = window.setTimeout(() => setStep((s) => s + 1), AWARD_REVEAL_STEP_MS)
    return () => window.clearTimeout(id)
  }, [instant, step])

  const podium = entries.slice(0, PODIUM_SIZE)
  // 表示名は重複しうる（同名の参加者）。一意に定まるときだけ「YOU」を付ける
  // （StandingsList と同じ判定。サーバーは表示名しか返さないため区別できない）
  const selfMatches = selfDisplayName
    ? entries.flatMap((e, i) => (e.displayName === selfDisplayName ? [i] : []))
    : []
  const selfIndex = selfMatches.length === 1 ? selfMatches[0] : -1

  const growthRevealed = step >= AWARD_STEP_COUNT

  return (
    <div className="battle-award" data-testid="battle-award">
      <ol className="battle-award__podium">
        {podium.map((entry, i) => (
          <PodiumPlace
            key={i}
            entry={entry}
            rank={i + 1}
            isSelf={i === selfIndex}
            // 3位から開示するので、開示段数は下位の順位ほど小さい
            revealed={step >= AWARD_STEP_COUNT - (i + 1)}
            instant={instant}
          />
        ))}
      </ol>
      {bestGrowthName && (
        <div
          className="battle-award__growth"
          data-testid={bestGrowthTestId}
          data-revealed={growthRevealed ? 'true' : 'false'}
          aria-hidden={growthRevealed ? undefined : 'true'}
        >
          <p className="battle-award__growth-label">★ Best Growth</p>
          <p className="battle-award__growth-name">ベストグロース賞: {bestGrowthName}</p>
          <p className="battle-award__growth-note">自己平均を最も上回りました</p>
        </div>
      )}
      {/* 段階開示を待たずに全体を見る手段（docs/25 4.2節）。開示中だけ出すが、
          消えたときに下の順位表がずれないよう枠の高さは常に確保する */}
      {!instant && (
        <div className="battle-award__skip-slot">
          {!growthRevealed && (
            <button
              type="button"
              className="secondary-action"
              data-testid="battle-award-skip"
              onClick={() => {
                setInstant(true)
                setStep(AWARD_STEP_COUNT)
              }}
            >
              すべて表示
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PodiumPlace({
  entry,
  rank,
  isSelf,
  revealed,
  instant,
}: {
  entry: StandingsEntry
  rank: number
  isSelf: boolean
  revealed: boolean
  instant: boolean
}) {
  const points = useCountUp(entry.totalPoints, revealed, instant)
  return (
    <li
      className="battle-award__place"
      data-rank={String(rank)}
      data-revealed={revealed ? 'true' : 'false'}
      aria-hidden={revealed ? undefined : 'true'}
    >
      <p className="battle-award__points display-num">{points.toLocaleString('ja-JP')}点</p>
      <p className="battle-award__name">
        {entry.displayName}
        {isSelf && <span className="battle-award__you"> YOU</span>}
      </p>
      {/* 台の高さが順位そのものなので、数字は装飾ではなく読み上げ用の「N位」を別に置く */}
      <div className="battle-award__pedestal">
        <span className="battle-award__rank-num display-num" aria-hidden="true">
          {rank}
        </span>
        <span className="visually-hidden">{rank}位</span>
      </div>
    </li>
  )
}
