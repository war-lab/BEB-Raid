// ゴースト週の弱点マップ（V-15。正本: docs/25 4.6節、07の8節「ボス防御パターンとの対応をチップで併記」）。
// 表示するのはPart・タグ単位の集計のみで、questionIdは受け取らない（型の上でも
// GhostWeaknessMapEntry に questionId が無い＝プライバシー境界をデータ形で担保している。T-129の実装意図）。
// 情報伝達の設計:
// - 倍率は「数値（×2）＋語（弱点/堅い）＋チップの枠線（実線/破線）」で示し、色だけに頼らない（07の原則4）
// - 問数は横棒（同一マップ内の最大問数を基準にした相対長）と数値の併記。バーだけに頼らない
// - 煽らない: 弱点は攻略の手がかりであってボス役の失点の告発ではないため、--ng / --warn は使わない
//   （4.6節・02の5.3節。--ok と --ink-3 のみを使う）
// 現在の buildGhostWeaknessMap は倍率2.0（弱点）のみを返す（堅いは挑戦前に開示しない仕様）。
// 4.6節の図には ×0.5 の行があるため、堅いが渡された場合も破線チップで正しく描けるようにしてある。
import type { GhostWeaknessMapEntry } from '../engine/ghostWeaknessMap'
import { RaidEmptyNote } from './RaidEmptyNote'

interface Props {
  entries: readonly GhostWeaknessMapEntry[]
  /** 空状態のシルエットに使うボスのシード */
  sigilSeed?: string
}

export function GhostWeaknessMap({ entries, sigilSeed }: Props) {
  // 倍率の降順（弱点を先）→同倍率内は問数の降順。攻略の判断材料として読みやすい順にする（4.6節）
  const sorted = [...entries].sort(
    (a, b) => b.multiplier - a.multiplier || b.count - a.count || a.part - b.part,
  )
  const maxCount = sorted.reduce((max, e) => Math.max(max, e.count), 0)

  return (
    <section className="ghost-weakness" data-testid="ghost-weakness-map">
      <p className="ghost-weakness__eyebrow">Weak Points</p>
      <h2 className="ghost-weakness__heading">弱点</h2>
      <p className="ghost-weakness__note">このボスの防御パターン</p>
      {sorted.length === 0 ? (
        <RaidEmptyNote sigilSeed={sigilSeed} testId="ghost-weakness-map-empty">
          弱点の傾向はまだ表示できません。問題パックを取得すると、Part・タグごとの傾向がここに並びます
        </RaidEmptyNote>
      ) : (
        <ul className="ghost-weakness__list">
          {sorted.map((w) => {
            const isWeak = w.multiplier > 1
            const ratio = maxCount > 0 ? w.count / maxCount : 0
            return (
              <li
                key={`${w.part}:${w.tag}:${w.multiplier}`}
                className="ghost-weakness__row"
                data-strength={isWeak ? 'weak' : 'tough'}
              >
                <span className="ghost-weakness__chip">
                  <span className="display-num">×{w.multiplier}</span>
                  {isWeak ? '弱点' : '堅い'}
                </span>
                <span className="ghost-weakness__main">
                  <span className="ghost-weakness__head">
                    <span className="ghost-weakness__tag">
                      Part{w.part} {w.tag}
                    </span>
                    <span className="ghost-weakness__count display-num">{w.count}問</span>
                  </span>
                  {/* 問数バーは数値の補助表現なので装飾扱い（問数は上の行に必ず出る） */}
                  <span className="ghost-weakness__bar" aria-hidden="true">
                    <span
                      className="ghost-weakness__bar-fill"
                      style={{ width: `${ratio * 100}%` }}
                    />
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
