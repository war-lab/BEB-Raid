// 伸びグラフ（S6。docs/07 8節・03 5.5）。
// 折れ線1系列（金）＋終端値をディスプレイ数字で直付け。単系列のため凡例なし。
// 予測スコア帯・二軸は作らない（J-1はM1対象外）。データ2点未満は「まだデータが足りない」。
import { useState } from 'react'

export interface LineChartPoint {
  date: string
  value: number
}

interface Props {
  points: LineChartPoint[]
  /** アクセシビリティ用のタイトル（グラフの意味。単系列なので凡例の代わりに使う） */
  title: string
}

const VIEW_WIDTH = 300
const VIEW_HEIGHT = 120
const PADDING = 16

export function LineChart({ points, title }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (points.length < 2) {
    return (
      <div className="chart-empty">
        <p>{title}: まだデータが足りない</p>
      </div>
    )
  }

  const values = points.map((p) => p.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue || 1

  const xStep = (VIEW_WIDTH - PADDING * 2) / (points.length - 1)
  const toXY = (index: number, value: number): [number, number] => {
    const x = PADDING + index * xStep
    const y =
      VIEW_HEIGHT - PADDING - ((value - minValue) / valueRange) * (VIEW_HEIGHT - PADDING * 2)
    return [x, y]
  }

  const pathD = points
    .map((p, i) => toXY(i, p.value))
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`)
    .join(' ')
  const last = points[points.length - 1]!
  const [lastX, lastY] = toXY(points.length - 1, last.value)
  const active = activeIndex !== null ? points[activeIndex] : null

  return (
    <div className="chart-line">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={`${title}: ${points[0]!.date}から${last.date}まで、現在値${Math.round(last.value)}`}
      >
        {/* 軸（退行色。07 8節） */}
        <line
          x1={PADDING}
          y1={VIEW_HEIGHT - PADDING}
          x2={VIEW_WIDTH - PADDING}
          y2={VIEW_HEIGHT - PADDING}
          stroke="var(--ink-3)"
          strokeWidth={1}
        />
        <path d={pathD} fill="none" stroke="var(--chart-gold)" strokeWidth={2} />
        {points.map((p, i) => {
          const [x, y] = toXY(i, p.value)
          return (
            <circle
              key={p.date}
              cx={x}
              cy={y}
              r={i === points.length - 1 ? 4 : 3}
              fill="var(--chart-gold)"
              onClick={() => setActiveIndex(i)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
        {/* 終端値をディスプレイ数字で直付け（03の5.5・07の8節） */}
        <text
          x={lastX}
          y={Math.max(lastY - 8, 10)}
          textAnchor="end"
          className="chart-line__end-value display-num"
          fill="var(--chart-gold)"
        >
          {Math.round(last.value)}
        </text>
      </svg>
      {active && (
        <p className="chart-tooltip">
          {active.date}: {Math.round(active.value)}
        </p>
      )}
      <details className="chart-table">
        <summary>数表で見る</summary>
        <table>
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>日付</th>
              <th>値</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.date}>
                <td>{p.date}</td>
                <td>{Math.round(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
