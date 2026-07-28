// S5レイド画面の空状態（V-15。正本: docs/25 4.6節）。
// 「見出しだけが浮く」状態を防ぐための共通の枠で、貢献ダメージ0人・弱点マップ0件・
// バッジ0件の3箇所から使う。設計の要点:
// - 文は「次に何をすればここが埋まるか」が分かる形にする（4.6節）
// - 煽らない・責めないトーンを保ち、--warn / --ng は使わない（4.6節・02の5.3節）
// - 装飾はBossSigilの低透明度シルエットのみ（ダッシュボード空状態=.chart-empty-sigil の流用）。
//   紋章に光暈は付けない（docs/20 3.1節の光暈4箇所限定）
import type { ReactNode } from 'react'
import { BossSigil } from './BossSigil'

interface Props {
  /** シルエットに使うボスのシード。シードが取れない文脈（バッジ一覧）では省略する */
  sigilSeed?: string
  children: ReactNode
  /** テストから空状態を特定するためのID（呼び出し側が指定する） */
  testId?: string
}

export function RaidEmptyNote({ sigilSeed, children, testId }: Props) {
  return (
    <div className="raid-empty" data-testid={testId}>
      {sigilSeed !== undefined && (
        <div className="chart-empty-sigil">
          <BossSigil seed={sigilSeed} size={48} />
        </div>
      )}
      <p className="raid-empty__text">{children}</p>
    </div>
  )
}
