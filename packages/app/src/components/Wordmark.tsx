// アプリ内ワードマーク（docs/20 3.2節・V-3）。
// 当初はテキスト表示だったが、発起人が用意した実ロゴ(logo.png・鋼＋電光青)をトップに置く
// 方針に変更（2026-07-23）。ホーム画面で唯一の見出しのため role="heading" aria-level=1 を保ち、
// accessible name は img の alt で与える（テストは heading の name /BEB RAID/ で参照）。
// 画像は表示用に縮小済み（600×407・透過PNG。元1254×850は logo.png=リポジトリルートが原本）。
// docs/26 A-4: 初回起動（診断ウェルカム）だけが鋼グラデのテキストワードマークで、ホーム以降は
// このロゴ画像だった。1画面目と2画面目でブランドマークが変わるため、診断側も本コンポーネントへ
// 統一した。診断画面には別途 h1（「ようこそ」等）があるので、見出しにしない 'plain' を持たせて
// aria-level=1 の重複を避ける。
interface Props {
  /** 'heading'（既定）= role="heading" aria-level=1。'plain' = 意味を持たない装飾配置 */
  as?: 'heading' | 'plain'
  /** ロゴ下に置く読み仮名（診断ウェルカムのみ使用） */
  sub?: string
}

export function Wordmark({ as = 'heading', sub }: Props) {
  const headingProps = as === 'heading' ? ({ role: 'heading', 'aria-level': 1 } as const) : {}
  return (
    <div className="wordmark" {...headingProps}>
      <img
        className="wordmark-logo"
        src={`${import.meta.env.BASE_URL}logo.png`}
        alt="BEB RAID"
        width={600}
        height={407}
      />
      {sub && <span className="wordmark-sub">{sub}</span>}
    </div>
  )
}
