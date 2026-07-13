// content/（パックJSON・音声mp3・manifest.json。T-32/T-33のビルド成果物）を
// ローカル開発サーバー（npm run dev）からもアプリと同じ場所で見られるようにするための
// devサーバー専用ミドルウェア。
//
// ビルド成果物（npm run build）への合流は scripts/copy-content.mjs が行う
// （このプラグインのcloseBundleフックで行っていた時期があったが、vite-plugin-pwaが
// 内部的に走らせる別ビルドパス（プレースホルダのoutDirを使う）でもcloseBundleが発火し、
// 意図しない場所にcontent/一式がコピーされる事象が起きたため、Viteのビルドフックには
// 依存せず、package.jsonのbuildスクリプトで明示的に1回だけ実行する形に切り出した）。

import { createReadStream, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

const CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
}

function resolveContentFile(contentRoot: string, urlPath: string): string | null {
  if (
    urlPath !== '/manifest.json' &&
    !urlPath.startsWith('/packs/') &&
    !urlPath.startsWith('/audio/')
  ) {
    return null
  }
  const filePath = join(contentRoot, urlPath)
  return existsSync(filePath) && statSync(filePath).isFile() ? filePath : null
}

export function contentAssetsPlugin(contentRoot: string): Plugin {
  return {
    name: 'beb-content-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const urlPath = req.url?.split('?')[0]
        const filePath = urlPath ? resolveContentFile(contentRoot, urlPath) : null
        if (!filePath) {
          next()
          return
        }
        const ext = filePath.slice(filePath.lastIndexOf('.'))
        res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}
