// 既存Part2音声への questionEndMs 埋め戻し（一回限りの移行スクリプト。2026-07-22）
//   node scripts/backfill-question-end.mjs
// 背景: 既存のPart2（audio_qa）150問は「質問＋400ms無音＋応答(=正答)」を1本のmp3に
// 連結済みで、再生成すると音声が全量変わる（Piper voiceリビジョン非決定性。STATUS.mdの
// T-84既知事項）。そのため再生成せず、ffmpegのsilencedetectで連結時の無音ギャップを
// 実測し、質問部終端（questionEndMs）をパックJSONへ埋め戻す。
// manifest.jsonのhash/sizeBytesはbuild.tsと同じロジック（dist経由）で再計算する。
// 前提: ffmpegがPATHにあること。`npm run build -w @beb-raid/cli` 済みであること。

import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const contentRoot = join(here, '..', '..', '..', 'content')

// build.tsのハッシュ・sizeBytes計算・検証を再利用する（重複実装しない）
const { buildPack, scanAudioFiles } = await import('../dist/build.js')
const audioFiles = await scanAudioFiles(contentRoot)

/** ffmpeg silencedetect: 0.3秒以上・-35dB以下の無音区間 [startMs, endMs][] を返す */
async function detectSilences(mp3Path) {
  const { stderr } = await execFileAsync('ffmpeg', [
    '-i',
    mp3Path,
    '-af',
    'silencedetect=noise=-35dB:d=0.3',
    '-f',
    'null',
    '-',
  ])
  const silences = []
  let start = null
  for (const line of stderr.split('\n')) {
    const s = /silence_start: ([\d.]+)/.exec(line)
    const e = /silence_end: ([\d.]+)/.exec(line)
    if (s) start = parseFloat(s[1]) * 1000
    if (e && start !== null) {
      silences.push([start, parseFloat(e[1]) * 1000])
      start = null
    }
  }
  return silences
}

const anomalies = []
for (const packName of ['pack-p2-s-001', 'pack-p2-s-002']) {
  const packPath = join(contentRoot, 'packs', `${packName}.json`)
  const pack = JSON.parse(await readFile(packPath, 'utf8'))

  for (const q of pack.questions) {
    if (q.format !== 'audio_qa' || !q.audio || !q.audioMeta) continue
    const silences = await detectSilences(join(contentRoot, q.audio))
    // 連結ギャップ候補: 350ms以上の無音のうち最長のもの（質問文内の息継ぎは350msに届かない想定）。
    // ファイル末尾の残響無音（part2-outsourceで実測）はQ/Aギャップではないため除外する
    const gaps = silences.filter(([s, e]) => e - s >= 350 && e < q.audioMeta.durationMs - 150)
    if (gaps.length === 0) {
      anomalies.push(`${q.id}: ギャップ無音が検出できない（silences=${JSON.stringify(silences)}）`)
      continue
    }
    const gap = gaps.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))
    const mid = Math.round((gap[0] + gap[1]) / 2)
    // 妥当性: 質問部は全長の15%〜90%の範囲に収まるはず
    if (mid < q.audioMeta.durationMs * 0.15 || mid > q.audioMeta.durationMs * 0.9) {
      anomalies.push(`${q.id}: 検出位置が範囲外 mid=${mid} duration=${q.audioMeta.durationMs}`)
      continue
    }
    q.audioMeta.questionEndMs = mid
  }

  // build.tsと同一ロジックで検証・sizeBytes/hash確定し、パックとmanifestを整合させる
  const { built, errors } = buildPack(
    {
      id: pack.pack.id,
      title: pack.pack.title,
      license: pack.pack.license,
      origin: pack.pack.origin,
      targetLevel: pack.pack.targetLevel,
      questions: pack.questions,
    },
    audioFiles,
  )
  if (!built) {
    console.error(`${packName}: buildPack検証エラー`, errors)
    process.exit(1)
  }
  await writeFile(packPath, JSON.stringify(built.pack, null, 2) + '\n')

  const manifestPath = join(contentRoot, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const entry = manifest.packs.find((p) => p.id === pack.pack.id)
  entry.sizeBytes = built.pack.pack.sizeBytes
  entry.hash = built.hash
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`${packName}: 更新完了 sizeBytes=${built.pack.pack.sizeBytes} hash=${built.hash}`)
}

if (anomalies.length) {
  console.error(`\n⚠️ 手動確認が必要な問題 ${anomalies.length}件:`)
  for (const a of anomalies) console.error(' -', a)
  process.exit(1)
}
console.log('全件正常')
