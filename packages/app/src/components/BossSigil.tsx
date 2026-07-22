// ボス紋章コンポーネント（V-4。docs/20_ビジュアル刷新計画.md 3.3節）。
// シード文字列（bossId等）から djb2 ハッシュで多角形の辺数(5〜8)・回転角・軌道環の数(1〜2)・
// 破線パターン・核の半径を決定的に導出する。同一シードは常に同一の見た目になる
// （週次ボスやダッシュボード空状態のシルエットで再現性が要る）。
// 色は --raid（紋章本体）＋--ev-blue（内側の軌道環）のCSS変数参照のみでテーマ追従させる
// （hex直書き禁止。tokens.cssの慣行）。
// aria-hidden="true" の純粋な装飾。アニメーションは付けない。
// 光暈（drop-shadow）はモックアップには存在するが、2節2.3(6)の「光暈は4箇所限定
// （金CTA・ボスHPバー・ダメージトースト・リザルト数字）」に紋章は含まれないため付与しない。
// 討伐済み表現（紋章の割れ）は本コンポーネントのスコープ外（S5演出強化時に別途追加）。

interface Props {
  /** 一意な文字列（例: ボスIDの `boss-2026-W29`）。同一シードは常に同一の紋章になる */
  seed: string
  /** SVGの一辺の長さ(px)。viewBoxは正方形 `0 0 size size` */
  size: number
}

/** djb2ハッシュ（xor版）。文字列→32bit符号なし整数への単純な決定的変換 */
function djb2(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

/** seedとsalt（属性名）を連結してハッシュ化し [0, mod) の整数を取り出す。
 * 属性ごとに異なるsaltを使うことで、辺数・回転角などが互いに独立して分布する */
function derive(seed: string, salt: string, mod: number): number {
  return djb2(`${seed}:${salt}`) % mod
}

/** 破線パターン候補（[線分, 空白]のpx値。72px基準でscale倍する） */
const DASH_PATTERNS: ReadonlyArray<readonly [number, number]> = [
  [3, 5],
  [4, 6],
  [2, 4],
  [5, 3],
  [6, 2],
]

/** 正N角形の頂点座標を返す（12時方向を起点に時計回り。モックアップのSVG座標系に合わせる） */
function polygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotationDeg: number,
): string {
  const points: string[] = []
  for (let i = 0; i < sides; i++) {
    const angle = (2 * Math.PI * i) / sides + (rotationDeg * Math.PI) / 180
    const x = cx + radius * Math.sin(angle)
    const y = cy - radius * Math.cos(angle)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return points.join(' ')
}

/** 内側の塗り多角形の縮尺（モックアップ実測値: 外側半径26に対し内側頂点半径16≈0.62） */
const INNER_POLYGON_SCALE = 0.62

export function BossSigil({ seed, size }: Props) {
  const scale = size / 72 // モックアップの72px基準に対する比率
  const cx = size / 2
  const cy = size / 2

  const sides = 5 + derive(seed, 'sides', 4) // 5〜8
  const rotation = derive(seed, 'rotation', 360) // 0〜359度
  const ringCount = 1 + derive(seed, 'rings', 2) // 1〜2
  const dash = DASH_PATTERNS[derive(seed, 'dash', DASH_PATTERNS.length)]!
  const dashArray = `${dash[0] * scale} ${dash[1] * scale}`
  const coreRadius = (4 + derive(seed, 'core', 5)) * scale // 4〜8(72px基準)

  const outerRadius = 26 * scale
  const innerPolygonRadius = outerRadius * INNER_POLYGON_SCALE
  const outerRingRadius = 33 * scale
  const innerRingRadius = 26 * scale

  return (
    <svg
      className="boss-sigil"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      {/* 軌道環1: 常に描画する破線円（--raid） */}
      <circle
        cx={cx}
        cy={cy}
        r={outerRingRadius}
        fill="none"
        stroke="var(--raid)"
        strokeWidth={1 * scale}
        opacity={0.5}
        strokeDasharray={dashArray}
      />
      {/* 軌道環2: ringCount===2のときのみ描画する実線円（--ev-blue） */}
      {ringCount === 2 && (
        <circle
          cx={cx}
          cy={cy}
          r={innerRingRadius}
          fill="none"
          stroke="var(--ev-blue)"
          strokeWidth={0.8 * scale}
          opacity={0.6}
        />
      )}
      {/* 外側多角形（辺数・回転角はシード依存） */}
      <polygon
        points={polygonPoints(cx, cy, outerRadius, sides, rotation)}
        fill="none"
        stroke="var(--raid)"
        strokeWidth={1.6 * scale}
      />
      {/* 内側の塗り多角形（同じ辺数・回転角の縮小版） */}
      <polygon
        points={polygonPoints(cx, cy, innerPolygonRadius, sides, rotation)}
        fill="var(--raid)"
        fillOpacity={0.12}
        stroke="var(--raid)"
        strokeWidth={1 * scale}
      />
      {/* 核（半径はシード依存）。中心の穴は地の色に抜く演出でモックアップに合わせる */}
      <circle cx={cx} cy={cy} r={coreRadius} fill="var(--raid)" />
      <circle cx={cx} cy={cy} r={coreRadius * 0.4} fill="var(--bg)" />
    </svg>
  )
}
