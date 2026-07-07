// テーマ切替（docs/07 2節 原則5: ダーク既定・ライト対応、data-theme 属性で切替）。
// OS追従＋手動切替の設定UIは T-23。ここでは切替の仕組みだけを提供する。

export type Theme = 'dark' | 'light'

/** manifest の theme_color と揃えるステータスバー色（07の5.2） */
const THEME_COLOR: Record<Theme, string> = {
  dark: '#0E1220',
  light: '#F6F5F1',
}

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  // ステータスバー色（theme-color meta）もテーマに追従させる
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) meta.content = THEME_COLOR[theme]
}
