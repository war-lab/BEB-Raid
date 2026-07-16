// コンテンツ機械検証の拡張（T-80。正本: docs/15 5節T-80行、docs/14 3.7-2節）。
//
// T-63の validateExplanationQuality と同じ位置づけ（Question[] → 問題点メッセージの配列を
// 返す純関数。build.ts の buildPack から呼ぶ）だが、検出した問題は**このタスクでは
// 修正しない**（14の3.7-2・15のT-80指示: 一覧のまま記録し、修正はT-81以降の担当範囲）。
// そのため buildPack の戻り値では errors ではなく warnings として扱い、ビルドを失敗させない
// （既存コンテンツに5ルールの違反が現に存在する状態でビルドを止めると、T-81/T-82の
// 修正が終わるまでパック配布そのものが止まってしまうため）。

import type { Choice, Question } from '@beb-raid/shared-schema'

/** 選択肢・script等からテキストを集める（null/undefinedは除外） */
function collectTexts(q: Question): string[] {
  return [q.question, q.script, ...(q.choices ?? []).map((c) => c.text)].filter(
    (s): s is string => typeof s === 'string' && s !== '',
  )
}

/** 比較用正規化: 前後空白除去・小文字化・末尾句読点除去 */
function normalizeForCompare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/, '')
    .trim()
}

/** script中の「設問 — 応答」区切り（emダッシュ/enダッシュ） */
const SCRIPT_RESPONSE_SPLIT_RE = /\s+[—–]\s+/

/**
 * ①Part2: script応答部と正解選択肢テキストの正規化完全一致（14の3.7-2）。
 * script側の音声は再生成しない前提のため、選択肢テキストの書き換えで揃える運用（J-43＝T-81担当）
 */
function checkPart2ScriptChoiceMatch(q: Question): string[] {
  if (q.format !== 'audio_qa' || !q.script || !q.choices || !q.answer) return []
  const parts = q.script.split(SCRIPT_RESPONSE_SPLIT_RE)
  if (parts.length < 2) return []
  const responseText = parts.slice(1).join(' — ').trim()
  const correctChoice: Choice | undefined = q.choices.find((c) => c.key === q.answer)
  if (!correctChoice) return []
  if (normalizeForCompare(responseText) !== normalizeForCompare(correctChoice.text)) {
    return [
      `${q.id}: script応答部「${responseText}」と正解選択肢「${correctChoice.text}」が一致しない`,
    ]
  }
  return []
}

/**
 * ②keyVocab出現チェック（簡易版。14の3.7-2）。
 * sense（意味）と品詞の照合は機械判定が困難なため将来課題とし、本ルールは
 * 「keyVocab.wordがquestion/script/choicesのいずれにも出現しない」検出に留める
 */
function checkKeyVocabAppearance(q: Question): string[] {
  const problems: string[] = []
  const haystack = collectTexts(q).join(' ').toLowerCase()
  for (const kv of q.keyVocab) {
    if (!haystack.includes(kv.word.toLowerCase())) {
      problems.push(
        `${q.id}: keyVocab「${kv.word}」がquestion/script/choicesのいずれにも出現しない`,
      )
    }
  }
  return problems
}

/**
 * ③カジュアル縮約禁止リスト（14の3.5・3.7-2）。大文字小文字無視・単語境界一致。
 * アポストロフィは直書き（'）とタイポグラフィ引用符（'）の両方が本文に混在するため、
 * 文字クラスでどちらにもマッチさせる
 */
const CASUAL_CONTRACTIONS = ['Wanna', 'Gonna', 'Didja', "D'you", 'Gotta', 'Lemme'] as const
const CASUAL_CONTRACTION_RE = new RegExp(
  `\\b(${CASUAL_CONTRACTIONS.map((w) => w.replace("'", "['’]")).join('|')})\\b`,
  'i',
)

function checkCasualContractions(q: Question): string[] {
  const problems: string[] = []
  for (const text of collectTexts(q)) {
    const match = CASUAL_CONTRACTION_RE.exec(text)
    if (match) {
      problems.push(
        `${q.id}: カジュアル縮約「${match[0]}」を含む（禁止リスト。標準表記へ差し替え）`,
      )
    }
  }
  return problems
}

/** 本文の語数（空白区切りの簡易カウント） */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * ④text_blankの本文長（警告のみ。既存資産を壊さないためエラーにしない）。
 * difficulty≥3は公式試験並みの文長（12語以上）を目安にする
 */
function checkTextBlankLength(q: Question): string[] {
  if (q.format !== 'text_blank' || q.difficulty < 3 || !q.question) return []
  const words = countWords(q.question)
  if (words < 12) {
    return [`[警告] ${q.id}: difficulty${q.difficulty}のtext_blankが本文${words}語（目安12語未満）`]
  }
  return []
}

/** 文頭3語（小文字化して比較） */
function openingTrigram(text: string): string {
  return text.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase()
}

/**
 * ⑤文頭3語バイグラムの同一開始が同一パック内5%超で警告（14の3.6・3.7-2）。
 * 出題パターンの単調さ（"Please ___ the..."等の使い回し）を検出する
 */
function checkOpeningPhraseDiversity(questions: readonly Question[], packId: string): string[] {
  const withQuestionText = questions.filter(
    (q) => typeof q.question === 'string' && q.question.trim() !== '',
  )
  if (withQuestionText.length === 0) return []

  const counts = new Map<string, number>()
  for (const q of withQuestionText) {
    const prefix = openingTrigram(q.question!)
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }

  const threshold = withQuestionText.length * 0.05
  const problems: string[] = []
  for (const [prefix, count] of counts) {
    if (count > 1 && count > threshold) {
      const pct = Math.round((count / withQuestionText.length) * 100)
      problems.push(
        `[警告] ${packId}: 文頭「${prefix}」で始まる問題が${count}/${withQuestionText.length}件（${pct}%。5%超）`,
      )
    }
  }
  return problems
}

/**
 * パック1件分の5ルール検証。①②③は個別問題ごと、④は問題ごと（警告）、
 * ⑤はパック全体（警告）。戻り値は修正すべき問題点の一覧（このタスクでは記録のみ。
 * buildPack側ではwarningsとして扱いビルドを失敗させない）
 */
export function validateContentLint(questions: readonly Question[], packId: string): string[] {
  const problems: string[] = []
  for (const q of questions) {
    problems.push(...checkPart2ScriptChoiceMatch(q))
    problems.push(...checkKeyVocabAppearance(q))
    problems.push(...checkCasualContractions(q))
    problems.push(...checkTextBlankLength(q))
  }
  problems.push(...checkOpeningPhraseDiversity(questions, packId))
  return problems
}
