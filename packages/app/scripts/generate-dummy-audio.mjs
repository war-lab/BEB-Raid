// 開発用ダミー音声生成スクリプト（手動実行。生成物はコミットする）
//   node scripts/generate-dummy-audio.mjs
// docs/10 3.7節: TTS前の開発用ダミーパックは数百msの無音/トーンmp3をスクリプト生成して置く。
// ffmpeg（外部コマンド。npm依存は増やさない）で Part2瞬発（audio_qa）用の短いトーンmp3を
// public/packs/dev/audio/ に生成する。本番コンテンツ差し替え（T-37）でこのディレクトリごと削除する。

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'packs', 'dev', 'audio')
mkdirSync(outDir, { recursive: true })

/** @type {Array<{ file: string, frequencyHz: number, durationSec: number }>} */
const CLIPS = [
  { file: 'p2-001.mp3', frequencyHz: 440, durationSec: 3 },
  { file: 'p2-002.mp3', frequencyHz: 660, durationSec: 3 },
]

for (const { file, frequencyHz, durationSec } of CLIPS) {
  const outPath = join(outDir, file)
  execFileSync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${frequencyHz}:duration=${durationSec}`,
    '-ar',
    '44100',
    '-ac',
    '1',
    '-b:a',
    '64k',
    outPath,
  ])
  console.log(`生成: ${outPath}`)
}
