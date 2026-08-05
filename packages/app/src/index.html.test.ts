import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// index.html は静的アセットのためimportで内容を取得できない。HTML/CSSテキストを直接検証する
// （実機のPlaywright確認は別途。共有ブラウザの競合を避けるためこのタスクではPlaywrightを
// 使わない方針とした）。jsdom環境ではグローバルURLの相対解決がdocument基準になるため
// node:url の URL を使う（theme.test.tsと同じ理由）
const htmlPath = fileURLToPath(new NodeURL('../index.html', import.meta.url))
const html = readFileSync(htmlPath, 'utf-8')

describe('T-229(Q-67): ブートスピナーのreduced-motionガード', () => {
  it('#boot-spinner に boot-spin の無限回転アニメーションが定義されている（前提条件の確認）', () => {
    // アニメーション自体はdiv#boot-spinnerのinline styleで指定されている
    const divMatch = html.match(/id="boot-spinner"[\s\S]*?style="([^"]*)"/)
    expect(divMatch).not.toBeNull()
    expect(divMatch?.[1]).toMatch(/animation:\s*boot-spin[^;]*infinite/)
  })

  it('prefers-reduced-motion: reduce で #boot-spinner のアニメーションを止めるルールがある', () => {
    const match = html.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\}\s*<\/style>/,
    )
    expect(match).not.toBeNull()
    const body = match?.[1] ?? ''
    expect(body).toMatch(/#boot-spinner\s*\{[^}]*animation:\s*none[^}]*\}/)
  })

  it('このreduced-motionガードは<style>内（バンドルCSS読込前）に存在する', () => {
    // base.cssの全停止則（*,*::before,*::after）はバンドル読込後にしか効かないため、
    // index.html自身にも同じガードが必要（T-229の前提）
    const styleBlockMatch = html.match(/<style>([\s\S]*?)<\/style>/)
    expect(styleBlockMatch).not.toBeNull()
    expect(styleBlockMatch?.[1]).toMatch(/prefers-reduced-motion:\s*reduce/)
  })
})
