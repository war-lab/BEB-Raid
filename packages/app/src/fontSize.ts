// 文字サイズ3段階切替（docs/07 4.2節、T-23の設定画面から使う）。
// theme.ts と同じ仕組み: documentElement の data 属性でCSS変数（--fs-question）を上書きする。
// 対象は「英文の学習本文」（07 4.2節: --fs-question）。出題文だけでなく、語彙フレーズ・
// シャドーイングスクリプトなど英文問題文に準じる英文表示は同じ変数で揃える（T-225。
// 07 4.2節参照）。和文UI・ディスプレイ数字など英文問題文以外の文字は変えない。

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
