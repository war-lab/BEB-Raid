import { readFileSync } from 'node:fs'
import { fileURLToPath, URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'

// components.css は静的アセットのためimportで内容を取得できない。
// CSSの文字列そのものをテキストとして検証する（実機のPlaywright確認は別途。共有ブラウザの
// 競合を避けるためこのタスクではPlaywrightを使わない方針とした）。
// jsdom環境ではグローバルURLの相対解決がdocument基準になるため node:url の URL を使う（T-233参照）
const cssPath = fileURLToPath(new NodeURL('./components.css', import.meta.url))
const css = readFileSync(cssPath, 'utf-8')

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 指定セレクタの宣言ブロック本文を取り出す。
 * selectorはこのファイル内で一意に定まる範囲まで（次の`{`の直前まで）の文字列として扱う。
 * カンマで複数セレクタをまとめている箇所は、区切り文字も含めてselectorに渡すことで対応する。
 * 同一セレクタ文字列が複数箇所にあればすべて返す。
 */
function ruleBodies(selector: string): string[] {
  const re = new RegExp(`${escapeRegex(selector)}\\s*\\{([^}]*)\\}`, 'g')
  const bodies: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    bodies.push(m[1] ?? '')
  }
  return bodies
}

/**
 * カンマ区切りの複数セレクタの宣言ブロックを取り出す。改行コード（LF/CRLF）の違いを
 * 気にしないよう、各セレクタ断片の間は「{まで到達しない任意の文字列」として繋ぐ。
 */
function groupRuleBodies(parts: string[]): string[] {
  const pattern = parts.map(escapeRegex).join('[^{]*')
  const re = new RegExp(`${pattern}\\s*\\{([^}]*)\\}`, 'g')
  const bodies: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    bodies.push(m[1] ?? '')
  }
  return bodies
}

describe('T-227(Q-65): overflow-wrap（長いURL・メールアドレスの折返し）', () => {
  it('.choice-button__label に overflow-wrap: anywhere がある', () => {
    const bodies = ruleBodies('.choice-button__label')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /overflow-wrap:\s*anywhere/.test(b))).toBe(true)
  })

  it('.passage-text に overflow-wrap: anywhere がある', () => {
    const bodies = ruleBodies('.passage-text')
    expect(bodies.length).toBeGreaterThan(0)
    expect(bodies.some((b) => /overflow-wrap:\s*anywhere/.test(b))).toBe(true)
  })
})

describe('T-226(Q-64): .result-phase-transitionの文字色はAA(4.5:1)確保用の--gold-deepを使う', () => {
  it('.result-phase-transition の文字色は --gold-deep を使う', () => {
    const bodies = ruleBodies('.result-phase-transition')
    expect(bodies.length).toBe(1)
    expect(bodies[0]).toMatch(/color:\s*var\(--gold-deep\)/)
  })
})

// T-226(Q-70): 入力欄はコントロール自体に文字を持たず、枠線が識別の唯一の手掛かりのため
// WCAG 1.4.11の対象と判断し採用（J-114）。テキストラベル・可視記号を持つ通常ボタン19箇所は
// 視覚設計の判断が保留中のコミットに属する（別ブロック。コミットメッセージ参照）。
describe('T-226(Q-70): 入力欄の枠は--lineでなく--ink-3を使う（コントロール自体に文字を持たないため1.4.11の対象）', () => {
  it('.explanation-card__ai input の枠に --ink-3 を使う', () => {
    const bodies = ruleBodies('.explanation-card__ai input')
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body).toMatch(/border(-\w+)?:[^;]*var\(--ink-3\)/)
      expect(body).not.toMatch(/border(-\w+)?:[^;]*var\(--line\)/)
    }
  })

  it('.settings-list input, select（テキスト入力欄）の枠に --ink-3 を使う', () => {
    const bodies = groupRuleBodies(['.settings-list input', '.settings-list select'])
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body).toMatch(/border(-\w+)?:[^;]*var\(--ink-3\)/)
      expect(body).not.toMatch(/border(-\w+)?:[^;]*var\(--line\)/)
    }
  })

  it('.settings-list のチェックボックス・ラジオの枠に --ink-3 を使う', () => {
    const bodies = groupRuleBodies([
      ".settings-list input[type='checkbox']",
      ".settings-list input[type='radio']",
    ])
    // 同一グループのルールが2箇所ある（表示用・外観用）。境界線を持つのは外観用のみ
    expect(bodies.length).toBe(2)
    const withBorder = bodies.filter((b) => /border(-\w+)?:/.test(b))
    expect(withBorder.length).toBe(1)
    expect(withBorder[0]).toMatch(/border(-\w+)?:[^;]*var\(--ink-3\)/)
    for (const body of bodies) {
      expect(body).not.toMatch(/border(-\w+)?:[^;]*var\(--line\)/)
    }
  })
})

// T-226(Q-70)のうち対話部品19箇所（テキストラベル・可視記号を持つ通常ボタン）の枠線変更
// （--line → --ink-3）は視覚設計の判断が保留中のコミットに属する（コミットメッセージ参照）。
// このdescribeブロックはそのコミットの変更を検証するテストで、当該コミットを落とす場合は
// このブロックも一緒に落とすこと。
describe('T-226(Q-70・保留): テキストラベルを持つ通常ボタンの枠（--line→--ink-3、視覚確認後に採用判断）', () => {
  // 単一セレクタで、かつ .foo__bar や .foo.is-active のような修飾版と混同しない
  // （\s*\{ は「セレクタの直後に空白のみを挟んで{」なので、__やドット修飾は別マッチになる）
  const singleSelectors = [
    '.choice-button',
    '.drill-replay',
    '.secondary-action',
    '.passage-blank',
    '.vocab-grade-button',
    '.drill-undo',
    '.vocab-dontknow-button',
    '.dictation-rate-chips button',
    '.dictation-word-bank button',
    '.dictation-reset',
    '.home-chip',
    '.home-part2-options button',
    '.home-mode-tile',
    '.home-grid button',
    '.shadowing-speed-chips button',
    '.shadowing-script-toggle button',
    '.install-hint button',
    '.settings-list button',
    '.reading-passage-tabs button',
  ]

  it.each(singleSelectors)('%s の枠に var(--line) を使っていない', (selector) => {
    const bodies = ruleBodies(selector)
    expect(bodies.length).toBeGreaterThan(0)
    for (const body of bodies) {
      expect(body).not.toMatch(/border(-\w+)?:[^;]*var\(--line\)/)
    }
  })
})

describe('T-232(Q-71): --fs-* スケール外の直書きフォントサイズが無い', () => {
  it('font-size に px の直書きが残っていない', () => {
    const matches = css.match(/font-size:\s*[0-9]/g)
    expect(matches).toBeNull()
  })
})
