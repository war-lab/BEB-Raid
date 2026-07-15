// ディクテーションの採点・ワードバンク生成（M2・T-47。正本: docs/03 8節、docs/13 3.4節）。
//
// ワードバンク方式のみ（タイピング入力はM2では見送り=J-12）。全穴一致で正解、
// 部分点なし。大文字小文字は無視する。レート更新の対象外（J-29。得点式=03の5.3は
// 選択式前提のため）。tagStatsには反映する（弱形タグがL1卒業判定の入力になる）

import type { DictationBlank, Question } from '@beb-raid/shared-schema'
import { DICTATION_DISTRACTOR_POOL } from './dictationDistractors'
import type { DictationAnswer, DictationJudgement, DictationWordBank } from './types'

const WORD_BANK_SIZE = 6

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

/**
 * ワードバンクを組み立てる（13の3.4節: 正解語N＋ダミー(6−N)語）。
 * ダミーは同一パック内の他dictation問題のblanks正解語を優先し、不足分は
 * DICTATION_DISTRACTOR_POOL（固定の弱形・混同語プール）から補う。重複は除く
 */
export function buildWordBank(
  target: Question,
  pool: readonly Question[],
  rng: () => number = Math.random,
): DictationWordBank {
  const correctWords = (target.blanks ?? []).map((b) => b.answer)
  const seen = new Set(correctWords.map((w) => w.toLowerCase()))
  const distractorCount = Math.max(WORD_BANK_SIZE - correctWords.length, 0)

  const distractors: string[] = []
  const otherAnswers = pool
    .filter((q) => q.format === 'dictation' && q.id !== target.id)
    .flatMap((q) => (q.blanks ?? []).map((b) => b.answer))
  for (const word of shuffle(otherAnswers, rng)) {
    if (distractors.length >= distractorCount) break
    const key = word.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    distractors.push(word)
  }
  if (distractors.length < distractorCount) {
    for (const word of shuffle(DICTATION_DISTRACTOR_POOL, rng)) {
      if (distractors.length >= distractorCount) break
      const key = word.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      distractors.push(word)
    }
  }

  return { words: shuffle([...correctWords, ...distractors], rng) }
}

/** 大文字小文字を無視して比較する（03の8節・13の3.4節） */
function normalize(word: string): string {
  return word.toLowerCase()
}

/**
 * 解答（穴ごとに選んだ語）を採点する。全穴一致で正解、1つでも不一致なら不正解
 * （部分点なし）。解答が欠落している穴は不一致として扱う
 */
export function judgeDictation(
  blanks: readonly DictationBlank[],
  answers: readonly DictationAnswer[],
): DictationJudgement {
  const answerByIndex = new Map(answers.map((a) => [a.blankIndex, a.word]))
  const blankResults = blanks.map((b) => {
    const answered = answerByIndex.get(b.index)
    return {
      blankIndex: b.index,
      isCorrect: answered !== undefined && normalize(answered) === normalize(b.answer),
    }
  })
  return {
    isCorrect: blankResults.length > 0 && blankResults.every((r) => r.isCorrect),
    blankResults,
  }
}
