// アプリ内ワードマーク（docs/20 3.2節・V-3）。
// 当初はテキスト表示だったが、発起人が用意した実ロゴ(logo.png・鋼＋電光青)をトップに置く
// 方針に変更（2026-07-23）。ホーム画面で唯一の見出しのため role="heading" aria-level=1 を保ち、
// accessible name は img の alt で与える（テストは heading の name /BEB RAID/ で参照）。
// 画像は表示用に縮小済み（600×407・透過PNG。元1254×850は logo.png=リポジトリルートが原本）。
export function Wordmark() {
  return (
    <div className="wordmark" role="heading" aria-level={1}>
      <img
        className="wordmark-logo"
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt="BEB RAID"
        width={600}
        height={407}
      />
    </div>
  )
}
