// 環境ごとのバインディング欠落を検出する（レビュー2巡目 指摘1）。
//
// wrangler.toml 冒頭に注記があるとおり、名前付き環境（env.dev / env.production）は
// トップレベルの**バインディングを継承しない**。新しいDOやKVを足すときにトップレベルだけ
// 書いて本番を書き忘れると、その環境でだけ `env.X` が undefined になり、
// 対象エンドポイントが実行時に500へ落ちる。型検査もCIのテストも通ってしまう
// （実際に RegistryDo で env.production への追加を落とし、全登録が500になる状態を作った）。
//
// テキストとして wrangler.toml を読み、環境間でバインディング名の集合が一致することを見る。
// workerd上のテストではnode:fsのパス解決が使えないため、viteのraw importで文字列として読む
import wranglerToml from '../wrangler.toml?raw'
import { describe, expect, it } from 'vitest'

type Section = 'top' | 'dev' | 'production'

/** wrangler.toml から「どの環境にどのバインディング名があるか」を読み取る */
function bindingsByEnv(
  kind: 'durable_objects.bindings' | 'kv_namespaces',
): Record<Section, string[]> {
  const toml = wranglerToml as string
  const result: Record<Section, string[]> = { top: [], dev: [], production: [] }
  const header = new RegExp(`^\\[\\[(?:env\\.(\\w+)\\.)?${kind.replace('.', '\\.')}\\]\\]`)
  let current: Section | null = null
  for (const line of toml.split(/\r?\n/)) {
    const matched = header.exec(line)
    if (matched) {
      const env = matched[1]
      current = env === undefined ? 'top' : env === 'dev' || env === 'production' ? env : null
      continue
    }
    // 別のテーブルが始まったら収集を止める（binding以外のnameを拾わないため）
    if (line.startsWith('[')) {
      current = null
      continue
    }
    // DOは name=、KVは binding= でバインディング名を書く
    const name = /^(?:name|binding) = "([^"]+)"/.exec(line)
    if (name && current) result[current].push(name[1]!)
  }
  return result
}

describe('wrangler.toml のバインディング（レビュー2巡目 指摘1）', () => {
  it('Durable Objectのバインディングがトップレベル・dev・productionで一致する', () => {
    const found = bindingsByEnv('durable_objects.bindings')
    const sorted = (names: string[]) => [...names].sort()
    expect(sorted(found.top).length).toBeGreaterThan(0)
    // 継承されないので、どれか1つでも欠けるとその環境だけ実行時に落ちる
    expect(sorted(found.dev)).toEqual(sorted(found.top))
    expect(sorted(found.production)).toEqual(sorted(found.top))
  })

  it('KVのバインディングもトップレベル・dev・productionで一致する', () => {
    const found = bindingsByEnv('kv_namespaces')
    const sorted = (names: string[]) => [...names].sort()
    expect(sorted(found.top).length).toBeGreaterThan(0)
    expect(sorted(found.dev)).toEqual(sorted(found.top))
    expect(sorted(found.production)).toEqual(sorted(found.top))
  })

  it('REGISTRYが全環境に存在する（本番の /register が500になる事故の回帰テスト）', () => {
    const found = bindingsByEnv('durable_objects.bindings')
    for (const env of ['top', 'dev', 'production'] as const) {
      expect(found[env]).toContain('REGISTRY')
    }
  })
})
