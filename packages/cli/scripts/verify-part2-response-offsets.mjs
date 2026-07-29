// Part2の responseOffsetsMs を実mp3の無音ギャップと照合する検証スクリプト（T-152/T-153）
//   node scripts/verify-part2-response-offsets.mjs
//
// 目的: responseOffsetsMs は連結前の各WAVの実測長を積算して求めるため、mp3の
// encoder padding ぶんの誤差が乗りうる（数十ms級）。実ファイルの無音位置と突き合わせて
// ずれが許容範囲内かを全件確認する。T-153（音声再生成）の受け入れ条件。
//
// 検証内容:
//   ①「設問＋応答A＋応答B＋応答C」なら応答の数だけギャップ（各400ms）が検出できる
//   ② 各 responseOffsetsMs が対応するギャップの終端付近（±TOLERANCE_MS）にある
//   ③ accent と voice が期待値（引数で渡した比較用パック）から変わっていない
//
// 前提: ffmpeg が PATH にあること。
// 使い方:
//   node scripts/verify-part2-response-offsets.mjs                 … ①②のみ
//   node scripts/verify-part2-response-offsets.mjs <baselineDir>   … ③も（再生成前のpacksを置いたディレクトリ）

import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const here = dirname(fileURLToPath(import.meta.url))
const contentRoot = join(here, '..', '..', '..', 'content')
const baselineDir = process.argv[2] ?? null

/** オフセットの許容誤差。mp3のencoder padding由来のずれを吸収する */
const TOLERANCE_MS = 150
/** 連結ギャップとみなす最小の無音長（TURN_GAP_SECONDS=0.4sに対し余裕を持たせる） */
const MIN_GAP_MS = 300

const PACK_NAMES = ['pack-p2-s-001', 'pack-p2-s-002']

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

const problems = []
let checked = 0
let unsupported = 0

for (const packName of PACK_NAMES) {
  const pack = JSON.parse(await readFile(join(contentRoot, 'packs', `${packName}.json`), 'utf8'))
  const baseline = baselineDir
    ? JSON.parse(await readFile(join(baselineDir, `${packName}.json`), 'utf8'))
    : null

  for (const q of pack.questions) {
    if (q.format !== 'audio_qa' || !q.audio || !q.audioMeta) continue

    // ③ accent / voice の不変チェック（並び崩れのシグナル）
    if (baseline) {
      const before = baseline.questions.find((b) => b.id === q.id)
      if (!before) {
        problems.push(`${q.id}: 再生成前のパックに存在しない（並びが崩れている可能性）`)
      } else {
        if (before.audioMeta?.accent !== q.audioMeta.accent) {
          problems.push(
            `${q.id}: accentが変化（${before.audioMeta?.accent} → ${q.audioMeta.accent}）`,
          )
        }
        if (before.audioMeta?.voice !== q.audioMeta.voice) {
          problems.push(`${q.id}: voiceが変化（${before.audioMeta?.voice} → ${q.audioMeta.voice}）`)
        }
      }
    }

    const offsets = q.audioMeta.responseOffsetsMs
    if (!offsets) {
      unsupported++
      continue
    }
    checked++

    const silences = await detectSilences(join(contentRoot, q.audio))
    // 末尾の残響無音はギャップではないため除外する（backfill-question-end.mjs と同じ判定）
    const gaps = silences.filter(
      ([s, e]) => e - s >= MIN_GAP_MS && e < q.audioMeta.durationMs - 150,
    )
    if (gaps.length < offsets.length) {
      problems.push(
        `${q.id}: ギャップ検出数(${gaps.length})が応答数(${offsets.length})に足りない（silences=${JSON.stringify(silences.map(([s, e]) => [Math.round(s), Math.round(e)]))}）`,
      )
      continue
    }
    // 応答nの開始 ≒ n番目のギャップの終端
    for (let i = 0; i < offsets.length; i++) {
      const gapEnd = gaps[i][1]
      const diff = Math.abs(offsets[i] - gapEnd)
      if (diff > TOLERANCE_MS) {
        problems.push(
          `${q.id}: 応答${i}のオフセット${offsets[i]}msが実測ギャップ終端${Math.round(gapEnd)}msから${Math.round(diff)}msずれている（許容${TOLERANCE_MS}ms）`,
        )
      }
    }
    // バリデータと同じ不変条件も念のため実ファイル基準で確認する
    if (offsets.at(-1) >= q.audioMeta.durationMs) {
      problems.push(`${q.id}: 末尾オフセット${offsets.at(-1)}が全長${q.audioMeta.durationMs}以上`)
    }
  }
}

console.log(`照合済み: ${checked}問 / 音声のみモード非対応（オフセット無し）: ${unsupported}問`)
if (baselineDir === null) {
  console.log('※ accent/voice の不変チェックは baselineDir 未指定のためスキップした')
}

if (problems.length) {
  console.error(`\n照合NG ${problems.length}件:`)
  for (const p of problems) console.error(' -', p)
  process.exit(1)
}
console.log('全件一致')
