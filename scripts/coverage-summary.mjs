// カバレッジ実測値をMarkdownの表で出力する（T-286。正本: docs/32 3節J-126）。
//
// 閾値割れはvitestが落とすので、この出力はCIを止める役割を持たない。
// 「今どのくらい余裕があるか」を見えるようにするためのもので、
// GitHub ActionsではジョブサマリへリダイレクトしてPR画面から読めるようにする。
//
//   node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
//
// 対象は packages/*/coverage/coverage-summary.json（vitestのjson-summaryレポータ出力）。
// カバレッジを計測していないworkspaceはファイルが無いので黙って飛ばす。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGES_DIR = 'packages'
const METRICS = ['statements', 'branches', 'functions', 'lines']

const rows = []
for (const ws of readdirSync(PACKAGES_DIR).sort()) {
  const path = join(PACKAGES_DIR, ws, 'coverage', 'coverage-summary.json')
  if (!existsSync(path)) continue
  const total = JSON.parse(readFileSync(path, 'utf-8')).total
  rows.push(`| ${ws} | ${METRICS.map((m) => `${total[m].pct.toFixed(2)}%`).join(' | ')} |`)
}

const lines = ['## カバレッジ', '']
if (rows.length === 0) {
  lines.push('カバレッジレポートが見つからなかった（`npm run test:coverage` が実行されていない）。')
} else {
  lines.push(
    `| workspace | ${METRICS.join(' | ')} |`,
    `|---|${'---|'.repeat(METRICS.length)}`,
    ...rows,
  )
}
console.log(lines.join('\n'))
