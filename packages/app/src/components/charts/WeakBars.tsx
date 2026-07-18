// 弱点マップ（S5/S6。docs/07 8節: レーダー禁止。弱い順にソートした横棒）。
// isWeak のタグは --chart-crimson で強調、それ以外は --chart-teal。
// 最小標本未満のタグは表示しない（呼び出し側で渡す配列は事前に絞り込み済みの前提）。
import { useState } from 'react'
import type { TagAccuracy } from '../../engine/types'

interface Props {
  bars: TagAccuracy[]
}

const VIEW_WIDTH = 300
const ROW_HEIGHT = 24
const LABEL_WIDTH = 90
const BAR_MAX_WIDTH = VIEW_WIDTH - LABEL_WIDTH - 40

export function WeakBars({ bars }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (bars.length === 0) {
    return (
      <div className="chart-empty">
        <p>弱点マップ: 対象タグがまだない</p>
      </div>
    )
  }

  const height = bars.length * ROW_HEIGHT
  const active = activeIndex !== null ? bars[activeIndex] : null

  return (
    <div className="chart-bars">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        role="img"
        aria-label="弱点マップ: タグ別正答率（弱い順）"
      >
        {bars.map((bar, i) => {
          const y = i * ROW_HEIGHT
          const barWidth = Math.max(bar.accuracy * BAR_MAX_WIDTH, 1)
          const color = bar.isWeak ? 'var(--chart-crimson)' : 'var(--chart-teal)'
          return (
            <g key={bar.tag} onClick={() => setActiveIndex(i)} style={{ cursor: 'pointer' }}>
              {/* T-116(4): SVGは描画幅次第で縮小されうるため、実効12px以上を確保できる値にする */}
              <text x={0} y={y + ROW_HEIGHT / 2 + 4} fontSize={13} fill="var(--ink-2)">
                {bar.tag}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y + 4}
                width={barWidth}
                height={ROW_HEIGHT - 10}
                fill={color}
                rx={2}
              />
              <text
                x={LABEL_WIDTH + barWidth + 4}
                y={y + ROW_HEIGHT / 2 + 4}
                fontSize={13}
                fill="var(--ink-2)"
              >
                {Math.round(bar.accuracy * 100)}%
              </text>
            </g>
          )
        })}
        {/* グリッド軸線（退行色） */}
        <line
          x1={LABEL_WIDTH}
          y1={0}
          x2={LABEL_WIDTH}
          y2={height}
          stroke="var(--ink-3)"
          strokeWidth={1}
        />
      </svg>
      {active && (
        <p className="chart-tooltip">
          {active.tag}: 正答率{Math.round(active.accuracy * 100)}%（標本
          {Math.round(active.windowTotal)}）{active.isWeak ? ' ・弱点' : ''}
        </p>
      )}
      <details className="chart-table">
        <summary>数表で見る</summary>
        <table>
          <caption>弱点マップ</caption>
          <thead>
            <tr>
              <th>タグ</th>
              <th>正答率</th>
              <th>標本数</th>
              <th>弱点</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.tag}>
                <td>{bar.tag}</td>
                <td>{Math.round(bar.accuracy * 100)}%</td>
                <td>{Math.round(bar.windowTotal)}</td>
                <td>{bar.isWeak ? '弱点' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
