// イベントバトルの順位表（V-9。正本: docs/25 4.1節）。
// S7参加者画面・S8ホスト画面の途中順位（standingsフェーズ）と最終リザルト（resultフェーズ）の
// 両方から使う共通コンポーネント。設計の要点:
// - 順位は数字バッジ（形）＋色の二重符号化。色だけで1〜3位を区別しない（07の原則4）
// - 得点バーは1位を基準にした相対長だが、得点の数値を必ず併記する（バーだけに頼らない）
// - ホスト画面とのサイズ差は親クラス（.battle-host）側で上書きし、本体は分岐を持たない
// - 最終リザルトの表彰要素（V-10）は children と renderRowAccessory から載せる（本体は持たない）
import type { ReactNode } from 'react'

export interface StandingsEntry {
  displayName: string
  totalPoints: number
}

interface Props {
  /** サーバーから受け取った順位順（得点降順）のエントリ全件 */
  entries: StandingsEntry[]
  /** 英字ラベル（`--ev-blue`）。最終リザルト側で差し替えられるようpropsにする */
  label?: string
  /**
   * 自分の行の識別に使う表示名。S7参加者画面でのみ渡す
   * （S8ホストは解答しないため自分の行が存在せず、省略する＝docs/25 4.1節）
   */
  selfDisplayName?: string
  /**
   * リストに描画する最初の順位（1始まり。既定1）。V-10の表彰台が上位3名を別要素で見せる場合に
   * 4を渡す。得点バーの基準は entries 全体の最高得点のままにするため、切り出しは表示側だけで行う
   */
  fromRank?: number
  /** ラベルとリストの間に表彰台・ベストグロース賞カードを差し込む拡張スロット（V-10） */
  children?: ReactNode
  /** 各行の末尾に受賞マーク等を差し込む拡張スロット（V-10） */
  renderRowAccessory?: (entry: StandingsEntry, rank: number) => ReactNode
  /** リスト要素の data-testid（既存テストのIDを維持するため呼び出し側が指定する） */
  listTestId?: string
}

export function StandingsList({
  entries,
  label = 'STANDINGS',
  selfDisplayName,
  fromRank = 1,
  children,
  renderRowAccessory,
  listTestId,
}: Props) {
  const topPoints = entries.reduce((max, e) => Math.max(max, e.totalPoints), 0)
  // 表示名は重複しうる（同名の参加者）。一意に定まるときだけ自分の行を示し、重複時は
  // 誤った行に「YOU」を付けないよう識別を落とす（サーバーは表示名しか返さないため区別できない）
  const selfMatches = selfDisplayName
    ? entries.flatMap((e, i) => (e.displayName === selfDisplayName ? [i] : []))
    : []
  const selfIndex = selfMatches.length === 1 ? selfMatches[0] : -1

  const startIndex = Math.max(0, fromRank - 1)
  const startRank = startIndex + 1

  return (
    <div className="standings">
      <p className="standings__label">{label}</p>
      {children}
      <ol className="standings__list" data-testid={listTestId} start={startRank}>
        {entries.slice(startIndex).map((entry, i) => {
          const index = startIndex + i
          const rank = startRank + i
          const isSelf = index === selfIndex
          const ratio = topPoints > 0 ? Math.max(0, entry.totalPoints) / topPoints : 0
          return (
            <li
              // 表示名は重複しうるためkeyには使わず、サーバー送出順のindexを使う
              key={index}
              className="standings__row"
              data-rank={rank <= 3 ? String(rank) : undefined}
              data-self={isSelf ? 'true' : undefined}
            >
              {/* バッジの数字は装飾ではなく順位そのものなので、読み上げには「N位」を別途渡す */}
              <span className="standings__badge display-num" aria-hidden="true">
                {rank}
              </span>
              <span className="visually-hidden">{rank}位</span>
              <span className="standings__main">
                <span className="standings__head">
                  <span className="standings__who">
                    <span className="standings__name">{entry.displayName}</span>
                    {isSelf && <span className="standings__you">YOU</span>}
                  </span>
                  <span className="standings__points display-num">
                    {entry.totalPoints.toLocaleString('ja-JP')}点
                  </span>
                </span>
                {/* 得点バーは数値の補助表現なので装飾扱い（数値は上の行に必ず出る） */}
                <span className="standings__bar" aria-hidden="true">
                  <span className="standings__bar-fill" style={{ width: `${ratio * 100}%` }} />
                </span>
                {renderRowAccessory?.(entry, rank)}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
