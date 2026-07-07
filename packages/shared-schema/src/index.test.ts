import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, type PackMeta } from './index.js'

describe('shared-schema 配線確認', () => {
  it('schemaVersion は 2（docs/04 準拠）', () => {
    expect(SCHEMA_VERSION).toBe(2)
  })

  it('PackMeta 型に license / origin が必須で存在する', () => {
    // license / origin を欠くとコンパイルエラーになること自体が確認事項
    const meta: PackMeta = {
      id: 'sample-pack',
      title: 'サンプル',
      license: 'internal-original',
      origin: 'llm-generated',
      targetLevel: [300, 500],
    }
    expect(meta.license).toBeTruthy()
    expect(meta.origin).toBeTruthy()
  })
})
