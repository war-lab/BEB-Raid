// PWAアイコン生成スクリプト（手動実行。生成物は public/icons/ にコミットする）
//   node scripts/generate-icons.mjs
// 仕様は docs/07 の 5.2: logo.png のエンブレムを夜紺 #0E1220 のタイルに載せる。
// マスカブル（Android）はセーフゾーン（中央 約80%径の円）内に収まるよう縮小率を下げる。
// 注意: 小サイズで潰れる場合の「BEB部のみ切り出し版」は要実機確認の後続課題（07の5.2）。

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const logoPath = join(here, '..', '..', '..', 'logo.png')
const outDir = join(here, '..', 'public', 'icons')

/** 夜紺タイル（--bg ダーク値。docs/07 3.1） */
const TILE = '#0E1220'

/**
 * タイルにロゴを合成して書き出す
 * @param {number} size 出力px
 * @param {number} logoRatio タイル幅に対するロゴ幅の比率
 * @param {string} filename 出力ファイル名
 */
async function renderIcon(size, logoRatio, filename) {
  const logo = await sharp(logoPath)
    .resize({ width: Math.round(size * logoRatio), fit: 'inside' })
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: TILE },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(join(outDir, filename))
  console.log(`生成: ${filename} (${size}px, logo ${Math.round(logoRatio * 100)}%)`)
}

await mkdir(outDir, { recursive: true })
await renderIcon(192, 0.82, 'icon-192.png')
await renderIcon(512, 0.82, 'icon-512.png')
// マスカブル: 端が円形等に切り抜かれるためロゴをセーフゾーン内（約60%）に収める
await renderIcon(512, 0.6, 'icon-maskable-512.png')
// iOS ホーム画面用（apple-touch-icon は透過不可のためタイル地で問題ない）
await renderIcon(180, 0.82, 'apple-touch-icon.png')
