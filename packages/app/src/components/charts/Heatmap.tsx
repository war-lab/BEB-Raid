// 学習ヒートマップ（S6。docs/07 8節: 金の単色シーケンシャル5段・GitHub草式。0日はセル枠のみ）。
// 色は --surface-2 → --chart-gold の間を color-mix() で機械的に補間する（hex直書き禁止）。
import { useState } from 'react'
import { BossSigil } from '../BossSigil'

export interface HeatmapCell {
  date: string
  /** 曜日グリッド整列のための余白セルは count: -1（描画・数表とも対象外） */
  count: number
}

interface Props {
  /** 週開始日（日曜）で揃え、7の倍数長で渡す（列=週、行=曜日のGitHub草式配置） */
  cells: HeatmapCell[]
}

const CELL_SIZE = 12
const CELL_GAP = 3
const ROWS = 7

/** count を 0–4 の5段階に変換する（最大値に対する相対比） */
function heatLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0 || maxCount <= 0) return 0
  const ratio = count / maxCount
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function levelFill(level: 0 | 1 | 2 | 3 | 4): string {
  if (level === 0) return 'none'
  const pct = level * 25 // 1→25%, 2→50%, 3→75%, 4→100%
  return `color-mix(in srgb, var(--surface-2), var(--chart-gold) ${pct}%)`
}

export function Heatmap({ cells }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (cells.length === 0) {
    return (
      <div className="chart-empty">
        <div className="chart-empty-sigil">
          <BossSigil seed="dashboard-empty-heatmap" size={64} />
        </div>
        <p>学習ヒートマップ: まだデータが足りない</p>
      </div>
    )
  }

  const realCells = cells.filter((c) => c.count >= 0)
  const maxCount = Math.max(...realCells.map((c) => c.count))

  // docs/26 A-7: セルはあるが全日0のとき（＝初回起動直後の全員が通る状態）、枠だけの
  // 空マスが28個並び、凡例「薄い=少、濃い=多」も数表も意味を成していなかった。
  // docs/25 4.6節の空状態の方針（見出しだけ浮かせず次の行動が分かる文にする・煽らない）に
  // 揃え、cells.length===0 と同じ扱いへ寄せる
  if (maxCount <= 0) {
    return (
      <div className="chart-empty">
        <div className="chart-empty-sigil">
          <BossSigil seed="dashboard-empty-heatmap" size={64} />
        </div>
        <p>まだ記録がありません。1回解くと、この場所に日ごとの学習量が積み上がります。</p>
      </div>
    )
  }
  const columns = Math.ceil(cells.length / ROWS)
  const width = columns * (CELL_SIZE + CELL_GAP)
  const height = ROWS * (CELL_SIZE + CELL_GAP)
  const active = activeIndex !== null ? cells[activeIndex] : null

  return (
    <div className="chart-heatmap">
      {/* T-116(3): 濃淡が何を表すか不明という指摘への対処。常時1行で凡例を出す */}
      <p className="chart-heatmap-legend">薄い=少、濃い=多</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="学習ヒートマップ: 日別解答数">
        {cells.map((cell, i) => {
          if (cell.count < 0) return null // 曜日整列用の余白セルは描画しない
          const col = Math.floor(i / ROWS)
          const row = i % ROWS
          const level = heatLevel(cell.count, maxCount)
          return (
            <rect
              key={cell.date}
              x={col * (CELL_SIZE + CELL_GAP)}
              y={row * (CELL_SIZE + CELL_GAP)}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={levelFill(level)}
              stroke={level === 0 ? 'var(--line)' : undefined}
              strokeWidth={level === 0 ? 1 : 0}
              onClick={() => setActiveIndex(i)}
              style={{ cursor: 'pointer' }}
            />
          )
        })}
      </svg>
      {active && (
        <p className="chart-tooltip">
          {active.date}: {active.count}問
        </p>
      )}
      <details className="chart-table">
        <summary>数表で見る</summary>
        <table>
          <caption>学習ヒートマップ</caption>
          <thead>
            <tr>
              <th>日付</th>
              <th>解答数</th>
            </tr>
          </thead>
          <tbody>
            {realCells.map((cell) => (
              <tr key={cell.date}>
                <td>{cell.date}</td>
                <td>{cell.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
