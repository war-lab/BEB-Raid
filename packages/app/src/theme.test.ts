import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { getTheme, setTheme } from './theme'

// T-233(Q-73): theme-color metaは--bgトークンから導出するため、実際のtokens.cssを
// jsdom上に読み込んで--bgを解決させる（期待値を本ファイル側に手で複製しない）。
// jsdom環境ではグローバルURLの相対解決がdocument基準になりimport.meta.urlを無視するため、
// node:url の URL を明示的に使う
const tokensCssPath = fileURLToPath(new NodeURL('./styles/tokens.css', import.meta.url))
const tokensCss = readFileSync(tokensCssPath, 'utf-8')

describe('テーマ切替（data-theme 属性・J-8: ダーク既定）', () => {
  beforeEach(() => {
    document.head.innerHTML = `<style>${tokensCss}</style><meta name="theme-color" content="#0E1220" />`
    delete document.documentElement.dataset.theme
  })

  it('data-theme 未設定時はダーク扱い', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme で data-theme と theme-color meta が--bgトークンに追従して切り替わる', () => {
    const bg = (theme: 'dark' | 'light') => {
      document.documentElement.dataset.theme = theme
      return getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    }
    const lightBg = bg('light')
    const darkBg = bg('dark')

    setTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      lightBg,
    )

    setTheme('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(
      darkBg,
    )
  })

  it('meta[name="theme-color"]が存在しなくても例外にならない', () => {
    document.head.innerHTML = `<style>${tokensCss}</style>`
    expect(() => setTheme('light')).not.toThrow()
  })
})
