// S8ホスト画面（プロジェクター投影）の投影レイアウトと外周リング（V-11。正本: docs/25 4.3節）。
// 設計の要点:
// - ScreenLayout の縦3分割・操作ゾーン下45%を使わない。ホスト端末はPCで操作は進行ボタンのみ
//   （親指リーチが無関係）。docs/20 の「変えないもの」に対する例外で、適用外はS8ホスト画面の
//   PC表示のみ（JV-5・承認済み案A）
// - 進行ボタンは投影に映る必要がないため画面下端に小さく置く。ただしタップ目標48px
//   （docs/20 2.3節5）は維持する（CSS側 .battle-host-stage__foot で min-height を確保）
// - タイポは vw 基準（問題文5vw以上・選択肢4vw以上・順位の得点6vw以上）。スケールは
//   ホスト画面専用のCSSカスタムプロパティ（components.css の .battle-host スコープ）に持つ
// - 外周リング（残り時間）は SVG の stroke-dasharray。**常時アニメーションではなく1秒刻みの
//   離散更新**にする（07の9節の精神を投影画面にも適用し、GPU負荷とちらつきを避ける）。
//   remainingSec は整数秒しか受け取らず、CSS側にも transition を当てないため、
//   描画が変わるのは秒が変わった瞬間だけになる
// - reduced-motion時はリングを描かず、残秒数の数値表示のみに縮退する（数値は常に描くので
//   リングが消えても情報は欠落しない）
import type { ReactNode } from 'react'

/** 残り時間の警告に切り替える秒数。以下になったらリングと数値を --raid にする */
const RING_LOW_SEC = 5

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

interface Props {
  /** 左上の英字メタ表示（例 `Q3 / 12`）。投影で「今どこか」を示す */
  meta: string
  /** 残り秒数（整数）。出題中のみ渡す。省略時はリングも数値も出さない */
  remainingSec?: number
  /** この問の制限秒数（リングの満量）。remainingSec を渡すときは必ず渡す */
  totalSec?: number
  /** 投影本体（問題文・選択肢・順位表） */
  children: ReactNode
  /** 画面下端の進行ボタン・注記 */
  action: ReactNode
}

export function HostProjectionLayout({ meta, remainingSec, totalSec, children, action }: Props) {
  const hasTimer = typeof remainingSec === 'number'
  const isLow = hasTimer && remainingSec <= RING_LOW_SEC
  return (
    <div className="battle-host battle-host-stage">
      {hasTimer && <ProjectionRing remainingSec={remainingSec} totalSec={totalSec ?? 0} />}
      <header className="battle-host-stage__head">
        <p className="battle-host-stage__meta">{meta}</p>
        {hasTimer && (
          <p
            className="battle-host-stage__timer display-num"
            data-testid="battle-host-timer"
            data-low={isLow ? 'true' : undefined}
          >
            残り{remainingSec}秒
          </p>
        )}
      </header>
      <section className="battle-host-stage__body">{children}</section>
      <footer className="battle-host-stage__foot">{action}</footer>
    </div>
  )
}

/**
 * 画面外周の残り時間リング。`pathLength={100}` で周長を100に正規化し、
 * 残り割合をそのまま stroke-dasharray の実線長に使う（周長が減っていく表現）。
 * 線幅の外側半分は viewBox の外へ出て切り取られるため、CSS側で見た目の2倍の太さを指定する。
 */
function ProjectionRing({ remainingSec, totalSec }: { remainingSec: number; totalSec: number }) {
  // reduced-motion時は数値表示のみに縮退する（docs/25 4.3節・6.3節のV-11完了条件）
  if (prefersReducedMotion()) return null

  // 秒未満の端数は落とす。リングが1秒刻みでしか変化しないことをここで保証する
  const total = Math.max(1, Math.floor(totalSec))
  const remaining = Math.min(total, Math.max(0, Math.floor(remainingSec)))
  const dash = ((remaining / total) * 100).toFixed(2)
  return (
    <svg
      className="battle-host-ring"
      data-testid="battle-host-ring"
      data-remaining-sec={remaining}
      data-low={remaining <= RING_LOW_SEC ? 'true' : undefined}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="battle-host-ring__track" x="0" y="0" width="100" height="100" />
      <rect
        className="battle-host-ring__fill"
        x="0"
        y="0"
        width="100"
        height="100"
        pathLength={100}
        strokeDasharray={`${dash} 100`}
      />
    </svg>
  )
}
