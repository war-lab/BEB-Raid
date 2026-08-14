// T-225（Q-63・Q-72）: 文字サイズ設定（S/M/L）はdocumentElementのdata-font-size属性で
// --fs-questionだけを上書きする（fontSize.ts）。語彙フレーズ（.vocab-card__phrase）と
// シャドーイング本文（.karaoke-script）は--fs-heading／--fs-uiに固定されていたため、
// 設定を変えても文字サイズが変わらなかった。CSS変数の参照先はjsdomの算出スタイルでは
// 検証できない（テスト環境にスタイルシートを読み込まないため）ので、components.cssの
// テキストを直接読み、対象セレクタの宣言ブロックがvar(--fs-question)を参照していることを
// 確認する回帰テストとする。
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const componentsCssPath = join(__dirname, 'components.css')
const componentsCss = readFileSync(componentsCssPath, 'utf-8')

/** selectorの宣言ブロック（selector { ... } の中身）を1つ取り出す。無ければnull */
function ruleBodyOf(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`)
  return re.exec(css)?.[1] ?? null
}

describe('文字サイズ設定（--fs-question）が英文表示全般に効く（T-225）', () => {
  it('.vocab-card__phrase（語彙フレーズ）がvar(--fs-question)を参照する', () => {
    const body = ruleBodyOf(componentsCss, '.vocab-card__phrase')
    expect(body).not.toBeNull()
    expect(body).toContain('var(--fs-question)')
  })

  it('.karaoke-script（シャドーイング本文）がvar(--fs-question)を参照する', () => {
    const body = ruleBodyOf(componentsCss, '.karaoke-script')
    expect(body).not.toBeNull()
    expect(body).toContain('var(--fs-question)')
  })

  it('.karaoke-sentence にキーボード操作時のフォーカスリング（:focus-visible）が定義されている（T-223）', () => {
    expect(componentsCss).toMatch(/\.karaoke-sentence:focus-visible\s*\{/)
  })
})
