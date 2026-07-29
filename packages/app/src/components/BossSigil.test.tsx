// V-4完了条件のテスト（20の3.3節・5節）:
// - 同一シードは常に同一の紋章属性になる（決定的導出。スナップショットでなく属性値で確認）
// - 異なるシード5個で辺数・軌道環の数が分布する
// - 装飾要素として aria-hidden="true" になっている
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BossSigil } from './BossSigil'

/** 描画結果から辺数・軌道環の数・核半径・多角形頂点を読み取る（属性値ベースの比較用） */
function readSigilAttributes(seed: string) {
  const { container } = render(<BossSigil seed={seed} size={72} />)
  const svg = container.querySelector('svg.boss-sigil')!
  const outerPolygon = svg.querySelectorAll('polygon')[0]!
  const points = outerPolygon.getAttribute('points')!
  const sides = points.trim().split(/\s+/).length
  const hasSecondRing = svg.querySelector('circle[stroke="var(--ev-blue)"]') !== null
  const ringCount = hasSecondRing ? 2 : 1
  const coreRadius = svg.querySelectorAll('circle[fill="var(--raid)"]')[0]!.getAttribute('r')
  return { points, sides, ringCount, coreRadius }
}

describe('BossSigil', () => {
  it('同一シードは常に同一の紋章属性になる', () => {
    const a = readSigilAttributes('boss-2026-W29')
    const b = readSigilAttributes('boss-2026-W29')
    expect(a).toEqual(b)
  })

  it('装飾要素として aria-hidden="true" になっている（キーボード・スクリーンリーダー操作は不変）', () => {
    const { container } = render(<BossSigil seed="boss-2026-W29" size={72} />)
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('辺数は常に5〜8の範囲に収まる', () => {
    const seeds = [
      'boss-2026-W29',
      'boss-2026-W30',
      'boss-2026-W31',
      'boss-2026-W32',
      'boss-2026-W33',
    ]
    for (const seed of seeds) {
      const { sides } = readSigilAttributes(seed)
      expect(sides).toBeGreaterThanOrEqual(5)
      expect(sides).toBeLessThanOrEqual(8)
    }
  })

  it('異なるシード5個で辺数・軌道環の数が分布する（全て同一にならない）', () => {
    const seeds = [
      'boss-2026-W29',
      'boss-2026-W30',
      'boss-2026-W31',
      'boss-2026-W32',
      'boss-2026-W33',
    ]
    const results = seeds.map(readSigilAttributes)

    const sidesSet = new Set(results.map((r) => r.sides))
    const ringSet = new Set(results.map((r) => r.ringCount))

    expect(sidesSet.size).toBeGreaterThan(1)
    expect(ringSet.size).toBeGreaterThan(1)
  })

  // V-21（討伐演出。JV-9=案A）。docs/25 4.6節・6.3節
  describe('討伐演出（defeated）', () => {
    it('既定（defeatedを渡さない）のDOMは討伐演出を一切含まない', () => {
      const { container } = render(<BossSigil seed="boss-2026-W29" size={56} />)
      expect(container.querySelector('.boss-sigil__shard')).toBeNull()
      expect(container.querySelector('.boss-sigil__spark')).toBeNull()
      expect(container.querySelector('clipPath')).toBeNull()
      expect(container.querySelector('svg')?.getAttribute('data-defeated')).toBeNull()
    })

    it('defeated=false は defeated 省略時と同一のDOMになる（週次ボスの見た目を変えない）', () => {
      const plain = render(<BossSigil seed="boss-2026-W29" size={56} />).container.innerHTML
      const explicit = render(<BossSigil seed="boss-2026-W29" size={56} defeated={false} />)
        .container.innerHTML
      expect(explicit).toBe(plain)
    })

    it('defeated=true で紋章が2片に割れ、金の粒子が固定6個出る', () => {
      const { container } = render(<BossSigil seed="boss-2026-W29" size={56} defeated />)
      const shards = container.querySelectorAll('.boss-sigil__shard')
      expect(shards).toHaveLength(2)
      // 2片は逆向きにずれる（左右対称に開く）
      const dxA = (shards[0] as HTMLElement).style.getPropertyValue('--shard-dx')
      const dxB = (shards[1] as HTMLElement).style.getPropertyValue('--shard-dx')
      expect(parseFloat(dxA)).toBeCloseTo(-parseFloat(dxB), 5)
      expect(container.querySelectorAll('.boss-sigil__spark')).toHaveLength(6)
    })

    it('討伐演出でも幾何は変わらない（同一シードの多角形頂点が既定と一致する）', () => {
      const plain = render(<BossSigil seed="boss-2026-W30" size={56} />)
      const defeated = render(<BossSigil seed="boss-2026-W30" size={56} defeated />)
      const plainPoints = plain.container.querySelector('polygon')!.getAttribute('points')
      // 討伐時は片ごとに同じ幾何を描くので、最初の polygon が外側多角形になる
      const shard = defeated.container.querySelector('.boss-sigil__shard')!
      expect(shard.querySelector('polygon')!.getAttribute('points')).toBe(plainPoints)
    })

    it('clipPathのidはインスタンスごとに異なる（同一シードを2つ描いてもクリップが混ざらない）', () => {
      const { container } = render(
        <>
          <BossSigil seed="same-seed" size={56} defeated />
          <BossSigil seed="same-seed" size={56} defeated />
        </>,
      )
      const ids = [...container.querySelectorAll('clipPath')].map((n) => n.id)
      expect(ids).toHaveLength(4)
      expect(new Set(ids).size).toBe(4)
    })

    it('討伐演出も aria-hidden の装飾のままで、支援技術に新しい情報を出さない', () => {
      const { container } = render(<BossSigil seed="boss-2026-W29" size={56} defeated />)
      expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    })
  })
})
