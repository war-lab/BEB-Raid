// T-238（Q-78）完了条件のテスト:
// - Windows上でも音声プレビューのパス解決が404にならない（normalizeのOS依存が原因だった）
// - path traversal（../）は引き続き弾く
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveAudioAsset } from './draftsServerPlugin.js'

let contentRoot: string

beforeEach(async () => {
  contentRoot = await mkdtemp(join(tmpdir(), 'beb-review-ui-audio-'))
})

afterEach(async () => {
  await rm(contentRoot, { recursive: true, force: true })
})

describe('resolveAudioAsset', () => {
  it('content/audio/配下の実ファイルを解決する（OSのパス区切りに依存しない）', async () => {
    const audioDir = join(contentRoot, 'audio', 'vocab')
    await mkdir(audioDir, { recursive: true })
    await writeFile(join(audioDir, 'submit.mp3'), 'dummy', 'utf-8')

    const resolved = resolveAudioAsset(contentRoot, '/content-assets/audio/vocab/submit.mp3')
    expect(resolved).toBe(join(contentRoot, 'audio', 'vocab', 'submit.mp3'))
  })

  it('存在しないファイルはnull', () => {
    expect(resolveAudioAsset(contentRoot, '/content-assets/audio/vocab/missing.mp3')).toBeNull()
  })

  it('audio/以外のプレフィックスはnull', async () => {
    const dir = join(contentRoot, 'secret')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'x.mp3'), 'dummy', 'utf-8')

    expect(resolveAudioAsset(contentRoot, '/content-assets/secret/x.mp3')).toBeNull()
  })

  it('..による親ディレクトリ脱出はnull', () => {
    expect(resolveAudioAsset(contentRoot, '/content-assets/audio/../../etc/passwd')).toBeNull()
  })
})
