// text_blank・audio_set・audio_qaドラフトの決定的正答循環解消（一回限りのデータ衛生スクリプト。
// T-237。正本: docs/29 Q-79・docs/30 11節T-237）。
//   node scripts/shuffle-cyclic-choices.mjs choices <対象ドラフト.jsonl> [...]
//   node scripts/shuffle-cyclic-choices.mjs order <対象ドラフト.jsonl> [...]
//
// 背景: rotatePart5Choices（part5Question.ts）・rotateSubQuestionChoices（part34Question.ts）・
// rotatePart2Choices（part2Question.ts）はいずれもindex%N（N=選択肢数）の決定的ローテーションで
// 正答キーを分散させる方式（M1レビュー⑦）だが、この方式は「パック内で一定差分の循環」という
// 別の予測可能パターンを生む副作用がある（text_passageで先に判明したMF-1と同型の問題。
// shuffle-text-passage-choices.mjsの対処と同じ考え方をtext_blank・audio_set・audio_qaにも
// 適用する。再発防止の検出はcontentLint.tsのcheckAnswerKeyCycle（⑥）・
// checkFlatAnswerKeyCycle（⑨）が担う）。
//
// 【choicesモード】text_blank（Part5。トップレベルchoices）・audio_set（Part3/4。
// subQuestions配列）が対象。どちらも選択肢テキストと音声（生成されていれば）に対応関係が
// 無い（Part3/4の音声は会話・トークそのものであり選択肢を読み上げない）ため、選択肢の
// 並び替え＝キー割り当ての変更をしても安全。
//
// 【orderモード】audio_qa（Part2）専用。Part2は「設問＋応答A＋応答B＋応答C」を1音声ファイルに
// 連結し、responseOffsetsMsが choices の key昇順＝音声の読み上げ順に対応する
// （part2Responses.ts参照）。選択肢テキストを編集・並び替えるとresponsesTextDigestが変わり
// 音声の再生成が必要になるため、choicesモードと同じ手段は使えない。代わりに、各設問の
// 選択肢・答え・音声は一切変更せず、ドラフト内の「設問の並び順」だけをシャッフルする。
// パック内での出題順に依存する決定的循環（Q-79の核心）はこれで解消できる。
//
// 乱数はid（またはファイルパス）から導出する決定的シード（FNV-1a→mulberry32）を使い、
// 選択肢は辞書順に正規化してからシャッフルする（shuffle-text-passage-choices.mjsと同方式。
// 何度実行しても収束する冪等な変換）。

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
 * 選択肢配列1件（text_blankのpayload本体、またはaudio_setのsubQuestion）の並びをidシードで
 * シャッフルし、answerキーを追随させる。辞書順に正規化してからシャッフルするため冪等
 */
function shuffleChoiceArray(target, seedKey) {
  const correct = target.choices.find((c) => c.key === target.answer)
  if (!correct) {
    throw new Error(`answerキー ${target.answer} に対応する選択肢が見つからない: ${seedKey}`)
  }
  const rng = mulberry32(fnv1a(seedKey))
  const canonical = target.choices.map((c) => c.text).sort()
  const texts = shuffled(canonical, rng)
  target.choices = texts.map((text, i) => ({ key: 'ABCD'[i], text }))
  target.answer = 'ABCD'[texts.indexOf(correct.text)]
}

/** フラット列（text_blank/audio_qa）が一定差分の決定的循環かどうか（contentLint.tsの⑨と同じ判定） */
function isCyclicFlatSequence(answers, choiceCount) {
  if (answers.length < 2 || choiceCount < 2) return false
  const keys = 'ABCD'.slice(0, choiceCount)
  const indices = answers.map((a) => keys.indexOf(a))
  if (indices.some((i) => i < 0)) return false
  const delta = (indices[1] - indices[0] + choiceCount) % choiceCount
  if (delta === 0) return false
  for (let i = 1; i < indices.length - 1; i++) {
    if ((indices[i + 1] - indices[i] + choiceCount) % choiceCount !== delta) return false
  }
  return true
}

/** セット列（audio_set/text_passageのsubQuestions）が一定差分の決定的循環かどうか（⑥と同じ判定） */
function isCyclicSubQuestionSets(sets) {
  if (sets.length < 3) return false
  let sharedDelta
  for (const indices of sets) {
    if (indices.some((i) => i < 0)) return false
    const delta = (indices[1] - indices[0] + 4) % 4
    for (let i = 1; i < indices.length - 1; i++) {
      if ((indices[i + 1] - indices[i] + 4) % 4 !== delta) return false
    }
    if (sharedDelta === undefined) sharedDelta = delta
    else if (sharedDelta !== delta) return false
  }
  return true
}

async function runChoicesMode(filePath) {
  const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter((l) => l.trim() !== '')
  const drafts = lines.map((line) => JSON.parse(line))
  let shuffledCount = 0
  for (const draft of drafts) {
    const payload = draft.payload
    if (payload?.format === 'text_blank' && Array.isArray(payload.choices)) {
      shuffleChoiceArray(payload, payload.id)
      shuffledCount += 1
    } else if (payload?.format === 'audio_set' && Array.isArray(payload.subQuestions)) {
      for (const sq of payload.subQuestions) {
        shuffleChoiceArray(sq, sq.id)
        shuffledCount += 1
      }
    }
  }

  const flatAnswers = drafts
    .map((d) => d.payload)
    .filter((p) => p?.format === 'text_blank')
    .map((p) => p.answer)
  if (isCyclicFlatSequence(flatAnswers, 4)) {
    throw new Error(`シャッフル後もtext_blankの正答キー列が決定的循環のまま: ${filePath}`)
  }
  const subSets = drafts
    .map((d) => d.payload)
    .filter((p) => p?.format === 'audio_set' && (p.subQuestions?.length ?? 0) >= 2)
    .map((p) => p.subQuestions.map((sq) => 'ABCD'.indexOf(sq.answer)))
  if (isCyclicSubQuestionSets(subSets)) {
    throw new Error(`シャッフル後もaudio_setの正答キー列が決定的循環のまま: ${filePath}`)
  }

  await writeFile(filePath, drafts.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8')
  console.log(`${filePath}: ${shuffledCount}設問の選択肢順をシャッフルした`)
}

async function runOrderMode(filePath) {
  const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/).filter((l) => l.trim() !== '')
  const drafts = lines.map((line) => JSON.parse(line))
  // 現在の並びに依存しないよう、まずid辞書順へ正規化してからシャッフルする（冪等）
  const canonical = [...drafts].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const rng = mulberry32(fnv1a(filePath))
  const reordered = shuffled(canonical, rng)

  const answers = reordered.map((d) => d.payload.answer)
  const choiceCount = reordered[0]?.payload.choices?.length ?? 0
  if (isCyclicFlatSequence(answers, choiceCount)) {
    throw new Error(`並べ替え後も正答キー列が決定的循環のまま: ${filePath}`)
  }

  await writeFile(filePath, reordered.map((d) => JSON.stringify(d)).join('\n') + '\n', 'utf8')
  console.log(
    `${filePath}: ${reordered.length}問の出題順を並べ替えた（選択肢・answer・音声は無変更）`,
  )
}

const [mode, ...targets] = process.argv.slice(2)
if ((mode !== 'choices' && mode !== 'order') || targets.length === 0) {
  console.error(
    '使い方: node scripts/shuffle-cyclic-choices.mjs <choices|order> <対象ドラフト.jsonl> [...追加ファイル]',
  )
  process.exit(1)
}

for (const filePath of targets) {
  if (mode === 'choices') {
    await runChoicesMode(filePath)
  } else {
    await runOrderMode(filePath)
  }
}
