// 数字ディスプレイ用フォントのサブセット化スクリプト（手動実行。生成物はコミットする）
//   node scripts/subset-font.mjs <ChakraPetch-Bold.ttf のパス>
// docs/07 4.1: Chakra Petch Bold を数字＋記号（0-9 +-×%.:/）のみに絞り WOFF2 で自前ホストする。
// ライセンスは SIL OFL 1.1（src/assets/fonts/OFL.txt に原文を同梱すること）。

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import subsetFont from 'subset-font'

const srcPath = process.argv[2]
if (!srcPath) {
  console.error('使い方: node scripts/subset-font.mjs <ChakraPetch-Bold.ttf のパス>')
  process.exit(1)
}

// 07の4.2のタイプスケール表記も含め、数字表示に必要な文字だけを残す
const CHARS = '0123456789+-×%.:/ '

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'assets', 'fonts')
await mkdir(outDir, { recursive: true })

const ttf = await readFile(srcPath)
const woff2 = await subsetFont(ttf, CHARS, { targetFormat: 'woff2' })
const outPath = join(outDir, 'ChakraPetchBold-digits.woff2')
await writeFile(outPath, woff2)
console.log(`生成: ${outPath} (${woff2.length} bytes, 収録: "${CHARS}")`)
