// S5レイド画面の貢献ダメージリスト（V-15。正本: docs/25 4.6節）。
// 4.6節「4.1の順位表と同じ構造を流用する」に従い、V-9の `StandingsList` と同じDOM構造・
// 同じCSS（`.standings*`）を使う。**コンポーネント自体を再利用しない理由**:
// StandingsList は得点の単位「点」をJSXに固定して持つため、ダメージ値に流用すると
// 「1,234点」という誤った表示になる。単位をpropsに出すには StandingsList の変更が必要で、
// V-9完成済み資産の変更はV-15の作業範囲外（docs/25 6.1節の並行開発ルール）。
// そのためCSSと構造だけを共有し、値の描画のみ本ファイルで持つ。
// 表示するのはハンディ換算ダメージのみで、正答率は出さない（07の7節S5・プライバシー境界）。
import type { RaidContribution } from '@beb-raid/shared-schema'
import { RaidEmptyNote } from './RaidEmptyNote'

interface Props {
  /** サーバーがダメージ降順で並べた貢献一覧（並び順の保証はraidBossDo側にある） */
  entries: readonly RaidContribution[]
  /** 自分の行の識別に使う表示名（プロフィールの表示名） */
  selfDisplayName?: string
  /** 空状態のシルエットに使うボスのシード */
  sigilSeed?: string
}

export function RaidContributionList({ entries, selfDisplayName, sigilSeed }: Props) {
  const topDamage = entries.reduce((max, e) => Math.max(max, e.damage), 0)
  // 表示名は重複しうる（同名の参加者）。一意に定まるときだけ自分の行を示す
  // （サーバーは表示名しか返さないため、重複時に正しい行を選べない=StandingsListと同じ判断）
  const selfMatches = selfDisplayName
    ? entries.flatMap((e, i) => (e.displayName === selfDisplayName ? [i] : []))
    : []
  const selfIndex = selfMatches.length === 1 ? selfMatches[0] : -1

  return (
    <section className="standings raid-contrib" data-testid="raid-contributions">
      <p className="standings__label">Contribution</p>
      {/* 日本語見出しは残す（英字ラベルだけにすると何の数値か読み取れない=V-14と同じ判断） */}
      <h2 className="raid-contrib__heading">貢献ダメージ</h2>
      {entries.length === 0 ? (
        <RaidEmptyNote sigilSeed={sigilSeed} testId="raid-contributions-empty">
          まだ誰も挑戦していません。最初の一撃を入れると、ここに名前が並びます
        </RaidEmptyNote>
      ) : (
        <ol className="standings__list" data-testid="raid-contributions-list">
          {entries.map((entry, index) => {
            const rank = index + 1
            const isSelf = index === selfIndex
            const ratio = topDamage > 0 ? Math.max(0, entry.damage) / topDamage : 0
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
                      {entry.damage.toLocaleString('ja-JP')}
                    </span>
                  </span>
                  {/* ダメージバーは数値の補助表現なので装飾扱い（数値は上の行に必ず出る） */}
                  <span className="standings__bar" aria-hidden="true">
                    <span className="standings__bar-fill" style={{ width: `${ratio * 100}%` }} />
                  </span>
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
