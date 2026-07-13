// 文字サイズ3段階切替（docs/07 4節、T-23の設定画面から使う）。
// theme.ts と同じ仕組み: documentElement の data 属性でCSS変数（--fs-question）を上書きする。
// 対象は「英文問題文」のみ（07 3節: --fs-question。UI全体の文字は変えない）。

export type FontSizeScale = 'S' | 'M' | 'L'

export function getFontSizeScale(): FontSizeScale {
  const value = document.documentElement.dataset.fontSize
  return value === 'S' || value === 'L' ? value : 'M'
}

export function setFontSizeScale(scale: FontSizeScale): void {
  if (scale === 'M') {
    delete document.documentElement.dataset.fontSize
  } else {
    document.documentElement.dataset.fontSize = scale
  }
}
