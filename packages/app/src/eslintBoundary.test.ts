// platform境界のESLintルールが「迂回した書き方」も検出することの検証（T-263・docs/29 のESLint境界）。
//
// 背景: 従来の設定は `no-restricted-globals`（ベア識別子）と
// `no-restricted-syntax`（NewExpression の callee 名）だけで境界を守っていたため、
// `window.caches` のようなメンバー式・`new window.Audio()`・`webkitAudioContext` が素通りしていた。
// 現時点で違反箇所は0件なので、実コードを見るだけでは「塞げているか」を確認できない。
// そこで意図的に違反するコードをESLintへ渡し、実際にエラーになることをここで確かめる。
//
// 実コードのlintは `npm run lint` が担う。本テストは設定の穴を回帰的に見張る目的に限る。
import { unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ESLint } from 'eslint'
import { afterEach, describe, expect, it } from 'vitest'

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

  // T-295（K-58）: 実ESLintに違反コードを投入して確認したところ、以下4件が
  // 素通りしていた（このテストファイル自身が「遮断される側だけ」を検証しており、
  // 抜け穴自体は対象外になっていたため実態より被覆範囲を広く見せていた）
  it('document.createElement("audio")（Audio識別子を経由しない生成）を検出する', async () => {
    const ruleIds = await lintAsAppSource('export const a = document.createElement("audio")\n')
    expect(ruleIds.has('no-restricted-syntax')).toBe(true)
  })

  it('self.caches（windowとglobalThisのみ列挙していたため素通り）を検出する', async () => {
    const ruleIds = await lintAsAppSource('export const c = self.caches\n')
    expect(ruleIds.has('no-restricted-properties')).toBe(true)
  })

  it('speechSynthesis（AudioPlayerの外の音声出力経路）を検出する', async () => {
    const bare = await lintAsAppSource('export const s = speechSynthesis\n')
    expect(bare.has('no-restricted-globals')).toBe(true)

    const viaWindow = await lintAsAppSource('export const s = window.speechSynthesis\n')
    expect(viaWindow.has('no-restricted-properties')).toBe(true)
  })

  it('showNotification（Notifier抽象の迂回路。iOS PWAで通知を出す唯一のWeb手段）を検出する', async () => {
    // ServiceWorkerRegistration.showNotificationは`navigator.serviceWorker.getRegistration()`
    // 等で得たオブジェクト経由で呼ばれ、オブジェクト名が固定されないためプロパティ名一致で検出する
    // （webkitAudioContextと同じ理由）
    const ruleIds = await lintAsAppSource(
      'declare const registration: ServiceWorkerRegistration\nregistration.showNotification("x")\n',
    )
    expect(ruleIds.has('no-restricted-syntax')).toBe(true)
  })
})

// T-289（K-16）: 型情報つきESLintを使っておらず、未awaitのPromiseを検出できていなかった
// （no-floating-promises・no-misused-promises）。型検査つきルールはprojectServiceが
// 実ファイルをtsconfigのプログラムに含める必要があり、上のlintText（存在しない仮想パス）では
// 「project serviceに見つからない」エラーになるため、実ファイルを一時的に書いて検証する
describe('packages/app/src/**の未awaitPromise検出（T-289・K-16）', { timeout: 120_000 }, () => {
  const probePath = resolve(REPO_ROOT, 'packages/app/src/__eslint_promise_probe__.ts')

  afterEach(() => {
    try {
      unlinkSync(probePath)
    } catch {
      // 既に無ければ無視
    }
  })

  async function lintRealFile(code: string): Promise<Set<string>> {
    // 共有ESLintインスタンス（eslintInstance()）はprojectServiceのファイル一覧を
    // 初回利用時にキャッシュするため、後から書いたこのプローブファイルを認識しない
    // ことがある。この検証専用に毎回新しいインスタンスを使う
    writeFileSync(probePath, code)
    const results = await new ESLint({ cwd: REPO_ROOT }).lintFiles([probePath])
    const ruleIds = new Set<string>()
    for (const result of results) {
      for (const message of result.messages) {
        if (message.ruleId !== null) ruleIds.add(message.ruleId)
      }
    }
    return ruleIds
  }

  it('未awaitのPromiseを検出する', async () => {
    const ruleIds = await lintRealFile(
      'async function f(): Promise<void> {}\nexport function g() { f() }\n',
    )
    expect(ruleIds.has('@typescript-eslint/no-floating-promises')).toBe(true)
  })

  it('voidで明示的に無視した場合は検出しない', async () => {
    const ruleIds = await lintRealFile(
      'async function f(): Promise<void> {}\nexport function g() { void f() }\n',
    )
    expect(ruleIds.has('@typescript-eslint/no-floating-promises')).toBe(false)
  })

  it('Promiseを返す関数をvoid期待の場所（onClick相当）へ渡すと検出する', async () => {
    const ruleIds = await lintRealFile(
      [
        'async function f(): Promise<void> {}',
        'export function g(handler: () => void) {',
        '  handler()',
        '}',
        'g(f)',
        '',
      ].join('\n'),
    )
    expect(ruleIds.has('@typescript-eslint/no-misused-promises')).toBe(true)
  })
})
