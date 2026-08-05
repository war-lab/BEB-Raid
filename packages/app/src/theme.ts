// テーマ切替（docs/07 2節 原則5: ダーク既定・ライト対応、data-theme 属性で切替）。
// OS追従＋手動切替の設定UIは T-23。ここでは切替の仕組みだけを提供する。

export type Theme = 'dark' | 'light'

/** テーマ設定は「OS追従」を含む3値（実際に適用されるのはTheme=dark/light） */
export type ThemePreference = 'system' | Theme

/**
 * 設定値（system/dark/light）から実際に適用するThemeを決定する。
 * T-69: SettingsScreen専用だったものを起動時適用（App.tsx）と共有するためここへ移した
 */
export function resolveTheme(pref: ThemePreference): Theme {
  if (pref === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return pref
}

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  // ステータスバー色（theme-color meta）もテーマに追従させる（07の5.2）。
  // T-233(Q-73): 値をここで手動複製せず、tokens.cssの--bgを実行時に読み取って導出する
  // （data-theme切替後に読むため、算出されるのは切替後の値）。--bgが未定義の場合
  // （tokens.cssが未読込のテスト環境等）はmetaを変更せず既定値のまま残す
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (meta) {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    if (bg) meta.content = bg
  }
}
