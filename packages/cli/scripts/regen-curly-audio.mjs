// カーリークォート起因のゴミ読み上げ音声の再生成（一回限りの移行スクリプト。2026-07-22）
//   node scripts/regen-curly-audio.mjs <対象IDのJSONファイル>
//   （対象ID = whisper転写検品でゴミ読み上げを確認した question id の配列）
// 背景: U+2019等を含むscriptをpiperへ渡すとエンコーディング不整合でCJK文字に化け、
// espeak-ngが「Chinese letter …」と読み上げていた（発起人FB起点。sanitizeForTtsで恒久修正済み）。
// 本スクリプトは汚染ファイルのみを修正後のパイプラインで再生成し、churnを最小化する
// （T-84の「変更6本のみ再生成」と同じ方針。voiceリビジョン差は該当ファイルのみに限定される）。
// 前提: piper/ffmpeg/ffprobeがPATH、PIPER_VOICES_DIR設定（無ければ ../../.piper-voices）、
//       `npm run build -w @beb-raid/cli` 済み。
// 実行後: p2パックはdurationMs/questionEndMsが実測値で更新されるため、
//         pack JSON・manifestのhash/sizeBytesも本スクリプトが再計算する。

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..', '..')
const contentRoot = join(repoRoot, 'content')

const { PiperTtsProvider } = await import('../dist/tts.js')
const { splitDialogueScript } = await import('../dist/ttsBatch.js')
const { buildPack, scanAudioFiles } = await import('../dist/build.js')

const idsPath = process.argv[2]
if (!idsPath) {
  console.error('使い方: node scripts/regen-curly-audio.mjs <対象IDのJSON配列ファイル>')
  process.exit(1)
}
const targetIds = new Set(JSON.parse(await readFile(idsPath, 'utf8')))

const provider = new PiperTtsProvider({
  voicesDir: process.env.PIPER_VOICES_DIR ?? join(repoRoot, '.piper-voices'),
})

/** audioMeta.voice（'piper:en_GB-...'）からアクセントを判定する */
function accentFromVoice(voice) {
  return voice.includes('en_GB') ? 'UK' : 'US'
}

const packNames = ['pack-p2-s-001', 'pack-p2-s-002', 'pack-vocab-a-001', 'pack-vocab-b-001']
const regenerated = []
for (const packName of packNames) {
  const packPath = join(contentRoot, 'packs', `${packName}.json`)
  const pack = JSON.parse(await readFile(packPath, 'utf8'))
  let packChanged = false

  for (const q of pack.questions) {
    if (!targetIds.has(q.id)) continue

    if (q.format === 'audio_qa') {
      const [questionText, answerText] = splitDialogueScript(q.script)
      const result = await provider.synthesizeDialogue({
        questionText,
        answerText,
        accent: accentFromVoice(q.audioMeta.voice),
        outputPath: join(contentRoot, q.audio),
      })
      q.audioMeta = {
        ...q.audioMeta,
        voice: result.voice,
        durationMs: result.durationMs,
        questionEndMs: result.questionEndMs,
      }
      packChanged = true
      regenerated.push(`${q.id} (audio_qa ${q.audio})`)
    } else if (q.format === 'vocab_card' && q.phraseAudio) {
      // vocab_cardはaudioMetaを持たないため音声ファイルの差し替えのみ。
      // 元のvoice/accentは記録されていないため、US primary（en_US-lessac）で統一する
      await provider.synthesize({
        text: q.phrase,
        accent: 'US',
        role: 'primary',
        outputPath: join(contentRoot, q.phraseAudio),
      })
      regenerated.push(`${q.id} (vocab ${q.phraseAudio})`)
    }
  }

  if (packChanged) {
    const audioFiles = await scanAudioFiles(contentRoot)
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
    console.log(`${packName}: pack/manifest更新`)
  }
}
console.log(`再生成 ${regenerated.length}件:`)
for (const r of regenerated) console.log(' -', r)
