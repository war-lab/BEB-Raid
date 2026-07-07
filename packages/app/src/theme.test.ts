import { beforeEach, describe, expect, it } from 'vitest'
import { getTheme, setTheme } from './theme'

describe('テーマ切替（data-theme 属性・J-8: ダーク既定）', () => {
  beforeEach(() => {
    document.head.innerHTML = '<meta name="theme-color" content="#0E1220" />'
    delete document.documentElement.dataset.theme
  })

  it('data-theme 未設定時はダーク扱い', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme で data-theme と theme-color meta が連動して切り替わる', () => {
    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      '#F6F5F1',
    )

    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      '#0E1220',
    )
  })
})
