import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// base.css は静的アセットのためimportで内容を取得できない。CSSテキストを直接検証する
// jsdom環境ではグローバルURLの相対解決がdocument基準になるため node:url の URL を使う（T-233参照）
const cssPath = fileURLToPath(new NodeURL('./base.css', import.meta.url))
const css = readFileSync(cssPath, 'utf-8')

describe('T-227(Q-65): .question-text の overflow-wrap', () => {
  it('.question-text に overflow-wrap: anywhere がある', () => {
    const match = css.match(/\.question-text\s*\{([^}]*)\}/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(/overflow-wrap:\s*anywhere/)
  })
})
