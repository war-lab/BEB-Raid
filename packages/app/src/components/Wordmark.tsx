// アプリ内ワードマーク（docs/20 3.2節・V-3）。
// 画像(logo.png)ではなくテキストで表示する: --wordmark-gradの鋼グラデ文字＋
// ダークのみ電光青の淡い光暈（drop-shadow。ライトはfilter無しでノイズを増やさない）。
// 「BEB RAID」表記＋小さく「ビーブレイド」を併記する。
// ホーム画面ではこれが唯一の見出しとなるため role="heading" aria-level=1 を持つ。
export function Wordmark() {
  return (
    <div className="wordmark" role="heading" aria-level={1}>
      <span className="wordmark-mark">BEB RAID</span>
      <span className="wordmark-sub">ビーブレイド</span>
    </div>
  )
}
