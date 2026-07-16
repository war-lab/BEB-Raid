// 完了カード（T-78。14の2.3節: 完了画面の達成感を可視化する共通部品）。
// 語彙SRS終了・診断完了・シャドーイング完了の3箇所で使う（軽いスケールイン。J-42と同じCSS制約）
interface Props {
  /** 今日の実施数の見出し文（例: "今日は12問こなしました"） */
  countLabel: string
  streakDays: number
  message: string
}

export function CompletionCard({ countLabel, streakDays, message }: Props) {
  return (
    <div className="completion-card" data-testid="completion-card">
      <p className="completion-card__count">{countLabel}</p>
      {streakDays > 0 && <p className="completion-card__streak display-num">🔥{streakDays}</p>}
      <p className="completion-card__message">{message}</p>
    </div>
  )
}
