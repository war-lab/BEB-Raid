// ボス紋章コンポーネント（V-4。docs/20_ビジュアル刷新計画.md 3.3節）。
// シード文字列（bossId等）から djb2 ハッシュで多角形の辺数(5〜8)・回転角・軌道環の数(1〜2)・
// 破線パターン・核の半径を決定的に導出する。同一シードは常に同一の見た目になる
// （週次ボスやダッシュボード空状態のシルエットで再現性が要る）。
// 色は --raid（紋章本体）＋--ev-blue（内側の軌道環）のCSS変数参照のみでテーマ追従させる
// （hex直書き禁止。tokens.cssの慣行）。
// aria-hidden="true" の純粋な装飾。既定ではアニメーションを付けない。
// 光暈（drop-shadow）はモックアップには存在するが、2節2.3(6)の「光暈は4箇所限定
// （金CTA・ボスHPバー・ダメージトースト・リザルト数字）」に紋章は含まれないため付与しない。
//
// 討伐済み表現（紋章の割れ＋金の粒子。V-21。JV-9=案Aで承認。正本: docs/07 7節S5・docs/25 4.6節）:
// `defeated` を渡したときだけ、紋章を破断線で2片に割って左右へ離し、金の粒子を散らす。
// - **既定（defeated 省略／false）のDOMは1要素も変えていない。** 週次ボス・ダッシュボードの
//   シルエットは討伐演出のコストを一切負わない
// - 破断線の角度はシード依存（同一ボスは常に同じ割れ方になる。紋章本体と同じ決定性の要件）
// - 割れは**同じ幾何を2枚のクリップで切り出して逆方向へずらす**方式にした。多角形を実際に
//   分割して座標を作り直すと辺数がシードから導出した値と合わなくなり、決定性のテストが
//   見ているのと別の図形になる。クリップなら幾何はそのまま残る
// - 粒子は**固定6個のSVG円**で、CSSの transform とopacityだけで動かす。多重 box-shadow と
//   大量DOMはどちらも docs/20 2.3節6（低端末のGPU負荷）に触れるため使わない
// - 演出の総時間は800ms（07の9節の報酬演出600〜900msの範囲内）
// - reduced-motion時はアニメーションを行わず、**割れた状態を静止で見せる**（粒子は出さない）。
//   討伐の事実は割れた紋章と「討伐成功！」の文が担うので情報は欠落しない
import { type CSSProperties, useId } from 'react'

/** 金の粒子の数。固定。増やすとDOMとGPU負荷が増えるだけで表現は良くならない */
const SPARK_COUNT = 6

interface Props {
  /** 一意な文字列（例: ボスIDの `boss-2026-W29`）。同一シードは常に同一の紋章になる */
  seed: string
  /** SVGの一辺の長さ(px)。viewBoxは正方形 `0 0 size size` */
  size: number
  /** 討伐済み（紋章の割れ＋金の粒子）。省略時は従来どおりの静止した紋章 */
  defeated?: boolean
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

export function BossSigil({ seed, size, defeated = false }: Props) {
  // clipPathのid衝突を避ける。RaidScreenは同一ページに紋章を2つ描き、シードが同値になりうる
  const uid = useId().replace(/:/g, '')
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

  // 破断線の角度（0〜179度）と、片ごとのずらし量。シード依存で同一ボスは常に同じ割れ方になる
  const fractureDeg = derive(seed, 'fracture', 180)
  const fractureRad = (fractureDeg * Math.PI) / 180
  const shardShift = 3.2 * scale // 72px基準で3.2px。破断線に直交する向きへ離す
  const shardDx = -Math.sin(fractureRad) * shardShift
  const shardDy = Math.cos(fractureRad) * shardShift

  const geometry = (
    <>
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
    </>
  )

  return (
    <svg
      className="boss-sigil"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      data-defeated={defeated ? 'true' : undefined}
    >
      {defeated ? (
        <>
          {/* 破断線で分けた2つの半平面。クリップ用は rect にする（polygon にすると
              紋章本体の多角形と同じセレクタで拾われ、決定性テストの読み取り先が変わる） */}
          <defs>
            <clipPath id={`${uid}-shard-a`}>
              <rect
                x={cx - size * 2}
                y={cy - size * 2}
                width={size * 4}
                height={size * 2}
                transform={`rotate(${fractureDeg} ${cx} ${cy})`}
              />
            </clipPath>
            <clipPath id={`${uid}-shard-b`}>
              <rect
                x={cx - size * 2}
                y={cy}
                width={size * 4}
                height={size * 2}
                transform={`rotate(${fractureDeg} ${cx} ${cy})`}
              />
            </clipPath>
          </defs>
          <g
            className="boss-sigil__shard"
            data-shard="a"
            clipPath={`url(#${uid}-shard-a)`}
            style={
              {
                '--shard-dx': `${shardDx.toFixed(2)}px`,
                '--shard-dy': `${shardDy.toFixed(2)}px`,
              } as CSSProperties
            }
          >
            {geometry}
          </g>
          <g
            className="boss-sigil__shard"
            data-shard="b"
            clipPath={`url(#${uid}-shard-b)`}
            style={
              {
                '--shard-dx': `${(-shardDx).toFixed(2)}px`,
                '--shard-dy': `${(-shardDy).toFixed(2)}px`,
              } as CSSProperties
            }
          >
            {geometry}
          </g>
          {/* 金の粒子。固定6個。角度はシード依存で散らす */}
          <g className="boss-sigil__sparks" data-testid="boss-sigil-sparks">
            {Array.from({ length: SPARK_COUNT }, (_, i) => {
              const angle = ((360 / SPARK_COUNT) * i + derive(seed, 'spark', 60)) * (Math.PI / 180)
              const distance = (22 + derive(seed, `spark${i}`, 12)) * scale
              return (
                <circle
                  key={i}
                  className="boss-sigil__spark"
                  cx={cx}
                  cy={cy}
                  r={2.2 * scale}
                  fill="var(--gold)"
                  style={
                    {
                      '--spark-dx': `${(Math.cos(angle) * distance).toFixed(2)}px`,
                      '--spark-dy': `${(Math.sin(angle) * distance).toFixed(2)}px`,
                      '--spark-delay': `${i * 25}ms`,
                    } as CSSProperties
                  }
                />
              )
            })}
          </g>
        </>
      ) : (
        geometry
      )}
    </svg>
  )
}
