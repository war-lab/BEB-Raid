import { beforeEach, describe, expect, it } from 'vitest'
import { getFontSizeScale, setFontSizeScale } from './fontSize'

describe('文字サイズ切替（data-font-size 属性）', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.fontSize
  })

  it('未設定時はM扱い', () => {
    expect(getFontSizeScale()).toBe('M')
  })

  it('setFontSizeScaleでdata-font-sizeが切り替わる', () => {
    setFontSizeScale('S')
    expect(document.documentElement.dataset.fontSize).toBe('S')
    expect(getFontSizeScale()).toBe('S')

    setFontSizeScale('L')
    expect(document.documentElement.dataset.fontSize).toBe('L')
    expect(getFontSizeScale()).toBe('L')
  })

  it('Mに戻すとdata-font-size属性自体が外れる', () => {
    setFontSizeScale('S')
    setFontSizeScale('M')
    expect(document.documentElement.dataset.fontSize).toBeUndefined()
    expect(getFontSizeScale()).toBe('M')
  })
})
