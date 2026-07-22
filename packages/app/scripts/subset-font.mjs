// ディスプレイ用フォントのサブセット化スクリプト（手動実行。生成物はコミットする）
//   node scripts/subset-font.mjs <ChakraPetch-Bold.ttf のパス>
// docs/07 4.1・docs/20 V-2: Chakra Petch Bold を英数字＋記号（ASCII可視文字＋×）に絞り
// WOFF2 で自前ホストする。当初は数字のみ（ChakraPetchBold-digits.woff2）だったが、
// ビジュアル刷新（docs/20）でワードマーク・英字ラベル・ボス名にも使うため英字へ拡張した。
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

// ASCII可視文字（0x20-0x7E）＋タイプスケール表記の×。
// ボス名（例: Nocturne Courier）に小文字を使うため大文字だけには絞らない
const ascii = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
const CHARS = ascii + '×'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'src', 'assets', 'fonts')
await mkdir(outDir, { recursive: true })

const ttf = await readFile(srcPath)
const woff2 = await subsetFont(ttf, CHARS, { targetFormat: 'woff2' })
const outPath = join(outDir, 'ChakraPetchBold-latin.woff2')
await writeFile(outPath, woff2)
console.log(`生成: ${outPath} (${woff2.length} bytes, 収録: ASCII可視文字+×)`)
