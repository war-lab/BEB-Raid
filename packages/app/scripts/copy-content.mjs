// ビルド後、content/（パックJSON・音声mp3・manifest.json。T-32/T-33のビルド成果物）を
// dist/ へコピーする（T-37）。
//
// 当初は vite.config.ts のプラグインの closeBundle フックで行っていたが、
// vite-plugin-pwa 等が内部的に行う別ビルドパス（プレースホルダの outDir で走る）でも
// closeBundle が発火し、意図しない場所に content/ 一式がコピーされる事象が起きたため、
// 「npm run build の一部として1回だけ確実に実行される後段スクリプト」に切り出した。
import { existsSync, readdirSync, statSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const contentRoot = join(here, '..', '..', '..', 'content')
const distDir = join(here, '..', 'dist')

async function copyDir(src, dest) {
  if (!existsSync(src)) return
  await mkdir(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

if (!existsSync(distDir) || !statSync(distDir).isDirectory()) {
  console.error(`dist/ が見つからない（先に vite build を実行すること）: ${distDir}`)
  process.exit(1)
}

await copyDir(join(contentRoot, 'packs'), join(distDir, 'packs'))
await copyDir(join(contentRoot, 'audio'), join(distDir, 'audio'))
const manifestSrc = join(contentRoot, 'manifest.json')
if (existsSync(manifestSrc)) {
  await copyFile(manifestSrc, join(distDir, 'manifest.json'))
}

console.log(`content/ を ${distDir} へコピーしました`)
