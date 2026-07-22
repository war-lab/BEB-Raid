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
})
