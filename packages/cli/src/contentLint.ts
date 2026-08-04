// コンテンツ機械検証の拡張（T-80。正本: docs/15 5節T-80行、docs/14 3.7-2節）。
//
// T-63の validateExplanationQuality と同じ位置づけ（Question[] → 問題点メッセージの配列を
// 返す純関数。build.ts の buildPack から呼ぶ）だが、検出した問題は**このタスクでは
// 修正しない**（14の3.7-2・15のT-80指示: 一覧のまま記録し、修正はT-81以降の担当範囲）。
// そのため buildPack の戻り値では errors ではなく warnings として扱い、ビルドを失敗させない
// （既存コンテンツに5ルールの違反が現に存在する状態でビルドを止めると、T-81/T-82の
// 修正が終わるまでパック配布そのものが止まってしまうため）。

import type { Choice, Question } from '@beb-raid/shared-schema'

/**
 * 選択肢・script等からテキストを集める（null/undefinedは除外）。
 * text_passage（Part6/7）はトップレベルのquestion/choicesを持たず、代わりにpassages本文＋
 * subQuestionsのquestion/choicesを持つ（T-107。shared-schema validateKeyVocabの検査対象と
 * 同じ範囲に合わせないと②keyVocab出現チェックが全件誤検出になるため、ここで専用に集める）
 */
function collectTexts(q: Question): string[] {
  if (q.format === 'text_passage') {
    const passageTexts = (q.passages ?? []).map((p) => p.text)
    const subQuestionTexts = (q.subQuestions ?? []).flatMap((sq) => [
      sq.question,
      ...sq.choices.map((c) => c.text),
    ])
    return [...passageTexts, ...subQuestionTexts].filter(
      (s): s is string => typeof s === 'string' && s !== '',
    )
  }
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

/** 正答キー→0..3のインデックス変換に使うキー一覧 */
const ANSWER_KEYS = ['A', 'B', 'C', 'D'] as const

/** ⑥の対象format（subQuestionsで束ねられたセット形式）。T-237でaudio_setを追加 */
const CYCLE_SET_FORMATS = new Set<Question['format']>(['text_passage', 'audio_set'])

/**
 * ⑥text_passage/audio_set: セット内正答キー列の決定的循環検出（T-107クロスレビューMF-1の
 * 再発防止。T-237でaudio_set＝Part3/4にも対象を拡大。正本: docs/29 Q-79・docs/30 11節T-237）。
 * rotateTextPassageChoices/rotateSubQuestionChoicesの決定的ローテーション出力をそのまま
 * 配布物に載せると、セット内の正答キーが常に一定差分の循環（A→D→C→B等）になり並びから
 * 推測可能になる。対象セット（subQuestions2問以上のtext_passage/audio_set）が3セット以上あり、
 * かつ全セットの隣接する正答キー差分が同一値で揃っている場合のみ警告する（シャッフル済みデータが
 * 偶然この条件を満たす確率は (1/4)^(セット数-1) 以下で無視できるため誤検出はほぼ起きない）。
 * 解消手段はtext_passageが packages/cli/scripts/shuffle-text-passage-choices.mjs、
 * audio_setが packages/cli/scripts/shuffle-cyclic-choices.mjs（いずれもシード付き決定的シャッフル）。
 */
function checkAnswerKeyCycle(questions: readonly Question[], packId: string): string[] {
  const sets = questions.filter(
    (q) => CYCLE_SET_FORMATS.has(q.format) && (q.subQuestions?.length ?? 0) >= 2,
  )
  if (sets.length < 3) return []
  let sharedDelta: number | undefined
  for (const q of sets) {
    const indices = (q.subQuestions ?? []).map((sq) =>
      ANSWER_KEYS.indexOf(sq.answer as (typeof ANSWER_KEYS)[number]),
    )
    if (indices.some((i) => i < 0)) return []
    const delta = (indices[1]! - indices[0]! + 4) % 4
    for (let i = 1; i < indices.length - 1; i++) {
      if ((indices[i + 1]! - indices[i]! + 4) % 4 !== delta) return []
    }
    if (sharedDelta === undefined) {
      sharedDelta = delta
    } else if (sharedDelta !== delta) {
      return []
    }
  }
  const formats = [...new Set(sets.map((q) => q.format))].sort().join('/')
  return [
    `[警告] ${packId}: ${formats}全${sets.length}セットの正答キーがセット内で一定差分${sharedDelta}の決定的循環になっている（選択肢シャッフル漏れの可能性）`,
  ]
}

/**
 * ⑨text_blank/audio_qa: パック全体を1本の設問列とみなした正答キー列の決定的循環検出（T-237。
 * 正本: docs/29 Q-79・docs/30 11節T-237）。
 * ⑥はsubQuestionsで束ねられたセット単位（text_passage/audio_set）が対象だが、text_blank
 * （Part5）・audio_qa（Part2）はsubQuestionsを持たずパック内の各Questionがそのまま1設問なので、
 * パック全体を1セットとみなして同じロジックを適用する。rotatePart5Choices/rotatePart2Choices
 * のindex%N（N=選択肢数）による決定的ローテーションが原因で、パック内で選択肢数が揃っていると
 * 正答キー列が一定差分の循環になる（M1レビュー⑦の方式の副作用）。対象は8問以上
 * （誤検出確率は(1/選択肢数)^7以下で無視できる）。
 * audio_qa（Part2）は選択肢テキストが音声と対応しているため、選択肢の並び替えでは解消できない
 * （responsesTextDigestが変わり応答音声の再生成が必要になる。part2Responses.ts参照）。
 * 解消は packages/cli/scripts/shuffle-cyclic-choices.mjs（text_blankは選択肢シャッフル、
 * audio_qaは音声・選択肢を変えない出題順の並べ替え）で行う。
 */
function checkFlatAnswerKeyCycle(questions: readonly Question[], packId: string): string[] {
  const problems: string[] = []
  for (const format of ['text_blank', 'audio_qa'] as const) {
    const subset = questions.filter(
      (q): q is Question & { answer: string; choices: Choice[] } =>
        q.format === format && typeof q.answer === 'string' && Array.isArray(q.choices),
    )
    if (subset.length < 8) continue
    const choiceCount = subset[0]!.choices.length
    if (choiceCount < 2 || !subset.every((q) => q.choices.length === choiceCount)) continue
    const keys = ANSWER_KEYS.slice(0, choiceCount)
    const indices = subset.map((q) => keys.indexOf(q.answer as (typeof ANSWER_KEYS)[number]))
    if (indices.some((i) => i < 0)) continue
    const delta = (indices[1]! - indices[0]! + choiceCount) % choiceCount
    // delta=0（正答キーが常に同じ）は別種の問題（テストフィクスチャ等で偶発しやすい）で
    // rotatePart5Choices/rotatePart2Choicesが生む「一定の非ゼロ差分で回転する」循環とは
    // 性質が違うため対象外にする（誤検出防止）
    if (delta === 0) continue
    let cyclic = true
    for (let i = 1; i < indices.length - 1; i++) {
      if ((indices[i + 1]! - indices[i]! + choiceCount) % choiceCount !== delta) {
        cyclic = false
        break
      }
    }
    if (cyclic) {
      problems.push(
        `[警告] ${packId}: ${format}全${subset.length}問の正答キーが一定差分${delta}の決定的循環になっている（出題順から正答位置が予測できる可能性）`,
      )
    }
  }
  return problems
}

/**
 * ⑦audio_qa の音声のみモード対応状況（T-152。警告のみ）。
 * `audioMeta.responseOffsetsMs` が無い問題は音声のみモード（本試験形式。ADR 0008）で
 * 出題できない。部分移行の途中でもビルドは止めず、どれが未対応かをログで分かるようにする
 * （アプリ側はプール抽出時に除外し、混入しても問題単位で従来UIへ落ちる）
 */
function checkAudioOnlyReadiness(q: Question): string[] {
  if (q.format !== 'audio_qa') return []
  if (q.audioMeta?.responseOffsetsMs) return []
  return [`[警告] ${q.id}: 音声のみモード非対応（応答音声が未生成）`]
}

/**
 * ⑧解説内の選択肢記号→品詞ラベルの不一致検出（T-236。正本: docs/29 Q-77・docs/30 11節T-236）。
 * 正答ローテーション適用後に解説文の記号を更新し忘れた痕跡を検出する（pack-p5-s-001の
 * part5-notify・part5-clientで発見。docs/29の9節）。BARE_LETTER_EXPLANATION_RE
 * （build.ts。「Aが正解」のように記号のみの解説）とは異なり、「A原形」のように記号＋
 * 品詞ラベルが併記されている箇所を拾い、実際にその記号の選択肢テキストがラベルと
 * 矛盾していないかを軽量な語彙ヒューリスティックで検証する。
 * 対象ラベルは1語の表層形だけで判定できるものに限る（名詞・受動態・進行形・完了形・
 * 三人称単数等は文全体の構造に依存し1選択肢のテキストだけでは判定できないため、
 * 誤検出を避けて対象外にする）。
 */
const CHOICE_TAG_RE =
  /(?<![a-zA-Z])([A-D])(?![a-zA-Z])(?:[^\sA-D、。,.]{0,10})?(原形|現在分詞|過去分詞|関係代名詞|関係副詞|所有格|目的格|比較級|最上級|動名詞)/g

const RELATIVE_PRONOUNS = new Set(['who', 'whom', 'whose', 'which', 'that'])
const RELATIVE_ADVERBS = new Set(['where', 'when', 'why', 'how'])
const POSSESSIVE_PRONOUNS = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their', 'whose'])
const OBJECTIVE_PRONOUNS = new Set(['me', 'him', 'her', 'us', 'them', 'whom', 'it', 'you'])

/**
 * ラベル1件が選択肢テキストと整合するかを判定する。判定できないラベルは null（対象外）。
 * 原形は同一問題のkeyVocab（テスト対象語の原形）と一致するかで判定する
 */
function isChoiceTagConsistent(
  tag: string,
  choiceText: string,
  keyVocab: readonly { word: string }[],
): boolean | null {
  const lower = choiceText.trim().toLowerCase()
  switch (tag) {
    case '関係代名詞':
      return RELATIVE_PRONOUNS.has(lower)
    case '関係副詞':
      return RELATIVE_ADVERBS.has(lower)
    case '所有格':
      return POSSESSIVE_PRONOUNS.has(lower) || /'s$/.test(lower)
    case '目的格':
      return OBJECTIVE_PRONOUNS.has(lower)
    case '現在分詞':
    case '動名詞':
      return /ing$/.test(lower)
    case '過去分詞':
      return /ed$/.test(lower)
    case '比較級':
      return /er$/.test(lower) || /^more\s/.test(lower)
    case '最上級':
      return /est$/.test(lower) || /^(the\s+)?most\s/.test(lower)
    case '原形':
      if (keyVocab.length === 0) return null
      return keyVocab.some((kv) => kv.word.toLowerCase() === lower)
    default:
      return null
  }
}

function checkChoiceTagText(
  id: string,
  explanation: string | null | undefined,
  choices: readonly Choice[] | null | undefined,
  keyVocab: readonly { word: string }[],
): string[] {
  const problems: string[] = []
  if (!explanation || !choices) return problems
  let m: RegExpExecArray | null
  CHOICE_TAG_RE.lastIndex = 0
  while ((m = CHOICE_TAG_RE.exec(explanation))) {
    const letter = m[1]!
    const tag = m[2]!
    const choice = choices.find((c) => c.key === letter)
    if (!choice) continue
    if (isChoiceTagConsistent(tag, choice.text, keyVocab) === false) {
      problems.push(
        `${id}: 解説の「${letter}${tag}」が実際の選択肢${letter}「${choice.text}」と矛盾している（正答ローテーション後の記号更新漏れの疑い）`,
      )
    }
  }
  return problems
}

/** パック内の全問（audio_set・text_passageはsubQuestions単位）を検査する */
function checkChoiceTagConsistency(q: Question): string[] {
  if (q.format === 'text_passage' || q.format === 'audio_set') {
    return (q.subQuestions ?? []).flatMap((sq) =>
      checkChoiceTagText(`${q.id}/${sq.id}`, sq.explanation, sq.choices, q.keyVocab),
    )
  }
  return checkChoiceTagText(q.id, q.explanation, q.choices, q.keyVocab)
}

/**
 * パック1件分のルール検証。①②③⑧は個別問題ごと、④⑦は問題ごと（警告）、
 * ⑤⑥⑨はパック全体（警告）。戻り値は修正すべき問題点の一覧（このタスクでは記録のみ。
 * buildPack側ではwarningsとして扱いビルドを失敗させない）
 */
export function validateContentLint(questions: readonly Question[], packId: string): string[] {
  const problems: string[] = []
  for (const q of questions) {
    problems.push(...checkPart2ScriptChoiceMatch(q))
    problems.push(...checkKeyVocabAppearance(q))
    problems.push(...checkCasualContractions(q))
    problems.push(...checkTextBlankLength(q))
    problems.push(...checkAudioOnlyReadiness(q))
    problems.push(...checkChoiceTagConsistency(q))
  }
  problems.push(...checkOpeningPhraseDiversity(questions, packId))
  problems.push(...checkAnswerKeyCycle(questions, packId))
  problems.push(...checkFlatAnswerKeyCycle(questions, packId))
  return problems
}
