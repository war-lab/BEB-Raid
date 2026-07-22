// キービジュアルの最適化・組込用画像生成スクリプト（手動実行。生成物はコミットする）
//   node scripts/generate-keyvisual.mjs
// 正本: docs/20 4節（V-8）。元画像は docs/design/keyvisual/*-original.png（発起人が生成AIで作成）。
// 出力:
//   public/og-image.jpg   — OGP用 1200x630。JPEGにするのは docs/20 4節の「WebP」想定からの
//                           意図的な変更（LINE等のOGPクローラーにWebP非対応が残るため。互換優先）
//   public/splash.webp    — 起動スプラッシュ背景（index.html #boot-splash）。オフライン起動でも
//                           表示するためSWのprecache対象に含める（vite.config.tsのglobPatterns）。
//                           precache容量を守るため100KB以下を必須とする
//   docs/design/keyvisual/key-visual.webp — README掲載用（GitHub上で表示。precache対象外）

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stat } from 'node:fs/promises'
import sharp from 'sharp'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..', '..', '..', 'docs', 'design', 'keyvisual')
const publicDir = join(here, '..', 'public')

/** 生成してサイズ上限を検査する（超過したら非0終了=CIや手動実行で気づける） */
async function emit(pipeline, outPath, maxBytes) {
  await pipeline.toFile(outPath)
  const { size } = await stat(outPath)
  const label = `${outPath} (${(size / 1024).toFixed(1)}KB / 上限${(maxBytes / 1024).toFixed(0)}KB)`
  if (size > maxBytes) {
    console.error(`サイズ超過: ${label}。品質値を下げて再生成すること`)
    process.exit(1)
  }
  console.log(`生成: ${label}`)
}

// OGP: 1200x630 中央クロップ。元画像 1672x941 (約16:9) → cover で切り出す
await emit(
  sharp(join(srcDir, 'main-original.png'))
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, mozjpeg: true }),
  join(publicDir, 'og-image.jpg'),
  300 * 1024,
)

// 起動スプラッシュ背景: 縦長のまま幅720に縮小（表示はCSSのcover。100KB以下必須=precache対象）
await emit(
  sharp(join(srcDir, 'splash-original.png')).resize({ width: 720 }).webp({ quality: 68 }),
  join(publicDir, 'splash.webp'),
  100 * 1024,
)

// README用: 幅1400のWebP（precache対象外なので上限は緩め）
await emit(
  sharp(join(srcDir, 'main-original.png')).resize({ width: 1400 }).webp({ quality: 80 }),
  join(srcDir, 'key-visual.webp'),
  250 * 1024,
)
