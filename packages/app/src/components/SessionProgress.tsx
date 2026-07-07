// セッション進捗（docs/07 6節: 画面最上部の細バー2px＋「7/12」残数表示。ドット列は使わない）
interface Props {
  /** 現在の問題番号（1始まり） */
  current: number
  /** 総問題数 */
  total: number
}

export function SessionProgress({ current, total }: Props) {
  const ratio = total > 0 ? Math.min(current / total, 1) : 0
  return (
    <div
      className="session-progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label={`進捗 ${current}/${total}`}
    >
      <div className="session-progress__bar">
        <div className="session-progress__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="session-progress__count display-num">
        {current}/{total}
      </span>
    </div>
  )
}
