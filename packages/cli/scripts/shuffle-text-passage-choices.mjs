// text_passageドラフトの選択肢順シャッフル（一回限りのデータ衛生スクリプト。2026-07-23）
//   node scripts/shuffle-text-passage-choices.mjs <対象ドラフト.jsonl> [<対象ドラフト.jsonl> ...]
// 背景（T-107クロスレビューMF-1）: rotateTextPassageChoicesの決定的ローテーション出力を
// そのままドラフトJSONLに載せると、セット内の正答キー列が一定差分の循環（Part6は
// A→D→C→B、Part7単一は降順循環）になり並びから推測可能になる。アプリは描画時に
// シャッフルする（ReadingScreen.tsx）ため学習体験上の実害はないが、review-ui・将来の
// エクスポート面への露出を防ぐデータ衛生として、ドラフト側の選択肢順を並べ替える。
// 乱数はsubQuestion idから導出する決定的シード（FNV-1a→mulberry32）を使い、選択肢は
// 辞書順に正規化してからシャッフルするため、何度実行しても（既にシャッフル済みの
// ファイルに再実行しても）同一結果に収束する（regen-curly-audio.mjsと同じ一回限り運用）。
// 再発防止の検出はcontentLint.tsのcheckAnswerKeyCycle（⑥）が担う。

import { readFile, writeFile } from 'node:fs/promises'

/** FNV-1a 32bitハッシュ（文字列→シード値） */
function fnv1a(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32（シード付き決定的乱数生成器） */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher-Yatesシャッフル（rngは[0,1)の乱数関数） */
function shuffled(items, rng) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * subQuestion 1件の選択肢テキスト順をidシードでシャッフルし、answerキーを追随させる。
 * 入力順に依存しないよう辞書順へ正規化してからシャッフルする（=冪等。再実行しても同一結果）
 */
function shuffleSubQuestion(sq) {
  const correct = sq.choices.find((c) => c.key === sq.answer)
  if (!correct) {
    throw new Error(`answerキー ${sq.answer} に対応する選択肢が見つからない: ${sq.id}`)
  }
  const rng = mulberry32(fnv1a(sq.id))
  const canonical = sq.choices.map((c) => c.text).sort()
  const texts = shuffled(canonical, rng)
  sq.choices = texts.map((text, i) => ({ key: 'ABCD'[i], text }))
  sq.answer = 'ABCD'[texts.indexOf(correct.text)]
}

/**
 * シャッフル後の検算: 全セットの正答キー列が同一差分の循環のままなら失敗させる
 * （contentLint.tsのcheckAnswerKeyCycleと同じ判定）
 */
function assertNotCyclic(payloads, filePath) {
  const sets = payloads.filter(
    (p) => p.format === 'text_passage' && (p.subQuestions?.length ?? 0) >= 2,
  )
  if (sets.length < 3) return
  let sharedDelta
  for (const q of sets) {
    const indices = q.subQuestions.map((sq) => 'ABCD'.indexOf(sq.answer))
    const delta = (indices[1] - indices[0] + 4) % 4
    for (let i = 1; i < indices.length - 1; i++) {
      if ((indices[i + 1] - indices[i] + 4) % 4 !== delta) return
    }
    if (sharedDelta === undefined) sharedDelta = delta
    else if (sharedDelta !== delta) return
  }
  throw new Error(`シャッフル後も正答キー列が決定的循環のまま: ${filePath}`)
}

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error(
    '使い方: node scripts/shuffle-text-passage-choices.mjs <対象ドラフト.jsonl> [...追加ファイル]',
  )
  process.exit(1)
}

for (const filePath of targets) {
  const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter((l) => l.trim() !== '')
  const drafts = lines.map((line) => JSON.parse(line))
  let shuffledCount = 0
  for (const draft of drafts) {
    const payload = draft.payload
    if (payload?.format !== 'text_passage' || !Array.isArray(payload.subQuestions)) continue
    for (const sq of payload.subQuestions) {
      shuffleSubQuestion(sq)
      shuffledCount += 1
    }
  }
  assertNotCyclic(
    drafts.map((d) => d.payload),
    filePath,
  )
  await writeFile(filePath, drafts.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8')
  console.log(`${filePath}: ${shuffledCount}設問の選択肢順をシャッフルした`)
}
