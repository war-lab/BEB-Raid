// platform境界のESLintルールが「迂回した書き方」も検出することの検証（T-263・docs/29 のESLint境界）。
//
// 背景: 従来の設定は `no-restricted-globals`（ベア識別子）と
// `no-restricted-syntax`（NewExpression の callee 名）だけで境界を守っていたため、
// `window.caches` のようなメンバー式・`new window.Audio()`・`webkitAudioContext` が素通りしていた。
// 現時点で違反箇所は0件なので、実コードを見るだけでは「塞げているか」を確認できない。
// そこで意図的に違反するコードをESLintへ渡し、実際にエラーになることをここで確かめる。
//
// 実コードのlintは `npm run lint` が担う。本テストは設定の穴を回帰的に見張る目的に限る。
import { resolve } from 'node:path'

import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/** リポジトリルート（このファイルは packages/app/src 配下） */
const REPO_ROOT = resolve(__dirname, '../../..')

/**
 * ESLintインスタンスは1つを共有する。フラット設定とtypescript-eslintの読み込みが重く
 * （初回数十秒）、テストごとに生成するとフルスイートの並列実行時に既定タイムアウトを
 * 超えてフレークになる。設定の解決はlintText時のfilePathごとに行われるため共有できる
 */
let shared: ESLint | null = null
function eslintInstance(): ESLint {
  shared ??= new ESLint({ cwd: REPO_ROOT })
  return shared
}

/**
 * platform境界の対象となるパス（`packages/app/src/**` かつ platform 配下でない）として
 * コードをlintし、報告されたruleIdの集合を返す。
 */
async function lintAsAppSource(code: string): Promise<Set<string>> {
  const filePath = resolve(REPO_ROOT, 'packages/app/src/__boundary_probe__.ts')
  const results = await eslintInstance().lintText(code, { filePath })
  const ruleIds = new Set<string>()
  for (const result of results) {
    for (const message of result.messages) {
      if (message.ruleId !== null) ruleIds.add(message.ruleId)
    }
  }
  return ruleIds
}

// ESLintの初期化と実行はvitestの既定タイムアウト（5秒）に収まらないことがあるため広げる
describe('platform境界のESLintルール（T-263）', { timeout: 120_000 }, () => {
  it('ベア識別子の caches は従来どおり検出される', async () => {
    const ruleIds = await lintAsAppSource('export const c = caches\n')
    expect(ruleIds.has('no-restricted-globals')).toBe(true)
  })

  it('window.caches / globalThis.caches を検出する（従来はメンバー式のため素通りしていた）', async () => {
    const viaWindow = await lintAsAppSource('export const c = window.caches\n')
    expect(viaWindow.has('no-restricted-properties')).toBe(true)

    const viaGlobalThis = await lintAsAppSource('export const c = globalThis.caches\n')
    expect(viaGlobalThis.has('no-restricted-properties')).toBe(true)
  })

  it('new window.Audio() を検出する（従来は callee 名が Audio でないため素通りしていた）', async () => {
    const ruleIds = await lintAsAppSource('export const a = new window.Audio()\n')
    expect(ruleIds.has('no-restricted-properties')).toBe(true)
  })

  it('webkitAudioContext をキャスト経由で参照しても検出する', async () => {
    // 非標準APIのため実コードではキャストを介して参照される。キャストを挟むと
    // no-restricted-properties の object 名一致から外れるため、プロパティ名で検出している
    const ruleIds = await lintAsAppSource(
      'export const Ctx = (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext\n',
    )
    expect(ruleIds.has('no-restricted-syntax')).toBe(true)
  })

  it('Notification を検出する（Notifier抽象があるのに従来は制限対象外だった）', async () => {
    const bare = await lintAsAppSource('export const n = Notification\n')
    expect(bare.has('no-restricted-globals')).toBe(true)

    const viaWindow = await lintAsAppSource('export const n = window.Notification\n')
    expect(viaWindow.has('no-restricted-properties')).toBe(true)
  })

  it('platform配下は境界ルールの対象外である（抽象化レイヤ自身はWeb APIを直接使う）', async () => {
    const filePath = resolve(REPO_ROOT, 'packages/app/src/platform/__boundary_probe__.ts')
    const results = await eslintInstance().lintText('export const c = window.caches\n', {
      filePath,
    })
    const ruleIds = results.flatMap((r) => r.messages.map((m) => m.ruleId))
    expect(ruleIds).not.toContain('no-restricted-properties')
  })
})
