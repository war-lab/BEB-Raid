// レビューUI用のVite devサーバーミドルウェア（M2・T-57。正本: docs/13 3.9節）。
// File System Access APIは使わず（ブラウザ互換を追わない方針）、Node側で完結する
// 素朴なローカルAPIをdevサーバーに生やす（packages/appのcontentAssetsPluginと同型）。
//
// エンドポイント:
//   GET  /api/drafts             → content/drafts/ 直下の *.jsonl ファイル名一覧
//   GET  /api/drafts/:filename   → 指定ファイルをパースしたGeneratedItemDraft[]
//   POST /api/review             → { filename, accepted, rejected } を受け取り
//                                    content/drafts/reviewed/ に書き出す
//   GET  /content-assets/audio/* → TTS済み音声のプレビュー再生用（payload.audio等の実体）

import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, posix } from 'node:path'
import type { Plugin } from 'vite'
import { listDraftFiles, loadDraftFile, writeReviewResult } from './draftsApi.js'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * content/audio/ 配下のみを許可（正規化して../で外に出るパスは弾く）。
 *
 * T-238（Q-78）: URLパスは常にスラッシュ区切りだが、素の `node:path`（`normalize`/`join`）は
 * Windows上ではバックスラッシュ区切りで正規化結果を返す。そのため
 * `normalized.startsWith('audio/')` がWindowsでは常にfalseになり、音声プレビューが
 * 全件404になっていた。判定用の正規化には `posix.normalize` を使い、常にスラッシュ区切りの
 * 結果で `audio/` プレフィックスと `..` 混入を検査する（実ファイルへのアクセスは
 * プラットフォーム標準の `join` のままでよい。Windowsの `join` はスラッシュ・
 * バックスラッシュ双方を区切りとして扱うため実ファイルパスの組み立ては壊れない）。
 */
export function resolveAudioAsset(contentRoot: string, urlPath: string): string | null {
  const relative = decodeURIComponent(urlPath.slice('/content-assets/'.length))
  const normalized = posix.normalize(relative)
  if (!normalized.startsWith('audio/') || normalized.includes('..')) return null
  const filePath = join(contentRoot, normalized)
  return existsSync(filePath) && statSync(filePath).isFile() ? filePath : null
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf-8')
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function draftsServerPlugin(contentRoot: string): Plugin {
  return {
    name: 'beb-review-drafts-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlPath = req.url?.split('?')[0] ?? ''
        try {
          if (req.method === 'GET' && urlPath.startsWith('/content-assets/')) {
            const filePath = resolveAudioAsset(contentRoot, urlPath)
            if (!filePath) {
              res.statusCode = 404
              res.end()
              return
            }
            res.setHeader('Content-Type', 'audio/mpeg')
            createReadStream(filePath).pipe(res)
            return
          }
          if (req.method === 'GET' && urlPath === '/api/drafts') {
            sendJson(res, 200, await listDraftFiles(contentRoot))
            return
          }
          if (req.method === 'GET' && urlPath.startsWith('/api/drafts/')) {
            const filename = decodeURIComponent(urlPath.slice('/api/drafts/'.length))
            sendJson(res, 200, await loadDraftFile(contentRoot, filename))
            return
          }
          if (req.method === 'POST' && urlPath === '/api/review') {
            const body = JSON.parse(await readRequestBody(req)) as {
              filename: string
              accepted: unknown[]
              rejected: { id: string; kind: string; reason: string }[]
            }
            const result = await writeReviewResult(contentRoot, body)
            sendJson(res, 200, result)
            return
          }
        } catch (e) {
          sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
          return
        }
        next()
      })
    },
  }
}
