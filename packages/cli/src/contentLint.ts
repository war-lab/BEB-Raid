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
/**
 * 隣接差分の最頻値がこの比率以上を占めるパックを統計的な循環とみなす（T-339・K-75）。
 * pack-p5-s-001の実測（1次マルコフ的中率83.7%）を検出でき、既存の「シャッフル済み」
 * フィクスチャ（最頻差分は5割程度）を誤検出しない値として0.7を採る
 */
const CYCLE_RATIO_THRESHOLD = 0.7

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
    const deltas = indices.slice(1).map((idx, i) => (idx - indices[i]! + choiceCount) % choiceCount)
    // delta=0（正答キーが常に同じ）は別種の問題（テストフィクスチャ等で偶発しやすい）で
    // rotatePart5Choices/rotatePart2Choicesが生む「一定の非ゼロ差分で回転する」循環とは
    // 性質が違うため統計判定の母数から除外する（誤検出防止）
    const nonZeroDeltas = deltas.filter((d) => d !== 0)
    if (nonZeroDeltas.length === 0) continue
    const counts = new Map<number, number>()
    for (const d of nonZeroDeltas) counts.set(d, (counts.get(d) ?? 0) + 1)
    const [dominantDelta, dominantCount] = [...counts.entries()].reduce((max, entry) =>
      entry[1] > max[1] ? entry : max,
    )
    const ratio = dominantCount / nonZeroDeltas.length
    if (ratio >= CYCLE_RATIO_THRESHOLD) {
      const pct = Math.round(ratio * 100)
      problems.push(
        ratio === 1
          ? `[警告] ${packId}: ${format}全${subset.length}問の正答キーが一定差分${dominantDelta}の決定的循環になっている（出題順から正答位置が予測できる可能性）`
          : `[警告] ${packId}: ${format}全${subset.length}問の正答キーが差分${dominantDelta}の統計的循環になっている（隣接差分の${pct}%が同一。出題順から正答位置が高確率で予測できる）`,
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

/**
 * Part3話者ラベルと性別指示の整合検出（⑩。T-338・K-73）。
 * TTS音声は script の "A:" を女声、"B:" を男声に固定して合成する（ttsBatch.ts/tts.ts）。
 * 解説が「男性は"（引用）"と述べている」「女性の"（引用）"という提案」のように scriptの発言を
 * 引用しつつ性別ラベルを付ける形式を取っているため、引用文が実際にscript上のどちらの話者の
 * 発言かをA:/B:の出現位置から逆引きし、解説側のラベルと食い違っていないかを検査する。
 * Part4は単一話者のモノローグでA/B表記自体が無いため対象外
 */
function checkPart34SpeakerGenderConsistency(q: Question): string[] {
  if (q.format !== 'audio_set' || q.part !== 3 || !q.script) return []
  const problems: string[] = []
  const labelPattern = /(男性|女性)(?:は|の)"([^"]{6,})"/g
  for (const sq of q.subQuestions ?? []) {
    const text = sq.explanation ?? ''
    let m: RegExpExecArray | null
    labelPattern.lastIndex = 0
    while ((m = labelPattern.exec(text))) {
      const claimedLabel = m[1]!
      const quote = m[2]!
      const claimedSpeaker = claimedLabel === '男性' ? 'B' : 'A'
      const quoteIndex = q.script.indexOf(quote)
      if (quoteIndex === -1) continue
      const upToQuote = q.script.slice(0, quoteIndex)
      const lastA = upToQuote.lastIndexOf('A:')
      const lastB = upToQuote.lastIndexOf('B:')
      if (lastA === -1 && lastB === -1) continue
      const actualSpeaker = lastA > lastB ? 'A' : 'B'
      if (actualSpeaker !== claimedSpeaker) {
        const actualLabel = actualSpeaker === 'A' ? '女性' : '男性'
        problems.push(
          `[警告] ${q.id}/${sq.id}: 解説の引用"${quote}"を${claimedLabel}に誤帰属している（script上は${actualLabel}=話者${actualSpeaker}の発言）`,
        )
      }
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
 * ブロッキング昇格ルール（⑥⑧⑨。正本: docs/29 Q-77・Q-79・docs/30 11節T-236・T-237の
 * 追加修正）。T-236/T-237で実コンテンツの違反件数が0になったルールに限り、buildPackの
 * errors（ビルド失敗）として扱う。
 *
 * T-80がcontentLint全体をwarnings（非ブロッキング）にした理由は「既存コンテンツに
 * 現存する違反をビルド失敗に変えると配布が止まる」ことだった（build.ts参照）。この理由は
 * 違反が0件のルールには当てはまらない。むしろwarningsのまま据え置くと、既存の109件の
 * warningsに埋もれて再発（生成関数の副作用や解説記号の再ずれ）に気づけない
 * （T-234のbeb verify-contentがCI/デプロイの必須ステップになったことで、ここをerrorsに
 * すればCIが実効的に再発を検知するようになる）。
 * ①②③④⑤⑦は既存違反が現に残っている（docs/STATUS.md参照）ため、このタスクの範囲では
 * 引き続き警告のみとする。安易に昇格すると配布が止まる
 */
/**
 * ⑪解説が誤答に言及しているか（T-343の完了条件そのものを測る検査）。
 *
 * K-83は「誤答に一切触れない解説」を問題にし、T-343の完了条件は「全解説が誤答への言及を
 * 含むこと」だが、これを測る検査が無かったため、追記が済んでいるかを機械で確かめられず、
 * 未達のまま完了扱いにできてしまっていた。
 *
 * 「言及」は次のいずれかで満たすものとする。
 *   (a) 誤答選択肢の本文が解説に現れる（1語の選択肢は語形変化に耐えるよう先頭5文字の語幹で照合）
 *   (b) 「他の選択肢」「他の2つ」「いずれも」等、他の選択肢を明示的に指す語句を含む
 * (b)を認めるのは、Part3/4・読解では選択肢が文単位で長く、全文引用が常に読みやすいとは
 * 限らないためである。
 */
const DISTRACTOR_REFERENCE_RE =
  /(他の(選択肢|2つ|二つ|3つ|三つ|候補|理由)|残りの(選択肢|2つ|3つ)|いずれも|それ以外の選択肢)/

/** 照合用の正規化（英数字と空白だけ残す） */
function normalizeForMention(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function mentionsDistractor(choices: readonly Choice[], answer: string, explanation: string) {
  if (DISTRACTOR_REFERENCE_RE.test(explanation)) return true
  const haystack = normalizeForMention(explanation)
  return choices.some((c) => {
    if (c.key === answer) return false
    const needle = normalizeForMention(c.text)
    if (needle.length < 2) return false
    if (haystack.includes(needle)) return true
    // 1語の選択肢は活用形で書かれることがあるため語幹5文字で照合する
    return !needle.includes(' ') && needle.length >= 6 && haystack.includes(needle.slice(0, 5))
  })
}

function checkExplanationMentionsDistractor(q: Question): string[] {
  const problems: string[] = []
  const units: {
    id: string
    choices?: Choice[] | null
    answer?: string | null
    explanation?: string | null
  }[] = [{ id: q.id, choices: q.choices, answer: q.answer, explanation: q.explanation }]
  for (const sq of q.subQuestions ?? []) {
    units.push({
      id: sq.id ?? q.id,
      choices: sq.choices,
      answer: sq.answer,
      explanation: sq.explanation,
    })
  }
  for (const u of units) {
    if (!Array.isArray(u.choices) || u.choices.length < 2 || typeof u.answer !== 'string') continue
    if (!u.explanation) {
      problems.push(`[警告] ${u.id}: 解説が無い`)
      continue
    }
    if (!mentionsDistractor(u.choices, u.answer, u.explanation)) {
      problems.push(`[警告] ${u.id}: 解説が誤答選択肢に言及していない`)
    }
  }
  return problems
}

/**
 * ⑩正答位置の予測可能性（T-339の完了条件そのものを測る検査）。
 *
 * T-339の完了条件は「1次マルコフ的中率がランダム+15pt以内」だが、⑨
 * （checkFlatAnswerKeyCycle）が測っているのは隣接差分の最頻値比率で、別の統計量である。
 * 完了条件に書かれた指標が機械検査に載っていなかったため、条件を満たさないまま完了扱いに
 * できてしまっていた。本検査で条件そのものを測る。
 *
 * 【基準線の取り方】「ランダム=100/選択肢数」との比較は使わない。1次マルコフ的中率は
 * 同じ列で遷移表を学習して同じ列を当てにいく in-sample の統計量で、**完全にランダムな列でも
 * 上振れする**（20000回のモンテカルロで、n=50・4択なら中央値が40.8%＝ランダム+15.8pt、
 * n=60・4択なら39.0%＝+14.0pt）。標本が小さいほど上振れが大きく、n=50・4択では
 * 「ランダム+15pt以内」という条件は理想的にシャッフルしても満たせない。
 * そこで、同じ (問題数, 選択肢数) のランダム列を固定シードで生成した帰無分布の95%点を
 * 基準線に採る。これなら「偏りが偶然では説明できないほど大きい」ときだけ検出できる。
 *
 * ⑨は残す。⑨が捉える「一定差分の決定的循環」は生成器の構造欠陥を直接指す鋭い信号で、
 * 本検査の統計判定より早く原因に到達できるため、目的が違う。
 */
const NULL_TRIALS = 2000
const NULL_PERCENTILE = 0.95

/** 決定的PRNG（mulberry32。shuffle-cyclic-choices.mjsと同方式。実行ごとに結果を変えない） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 正答位置列に対する1次マルコフ的中率（%）。直前の位置ごとの最頻の次位置を当てにいく */
export function firstOrderMarkovAccuracy(indices: readonly number[]): number {
  if (indices.length < 2) return 0
  const table = new Map<number, Map<number, number>>()
  for (let i = 1; i < indices.length; i++) {
    const from = indices[i - 1]!
    const row = table.get(from) ?? new Map<number, number>()
    row.set(indices[i]!, (row.get(indices[i]!) ?? 0) + 1)
    table.set(from, row)
  }
  let hit = 0
  for (let i = 1; i < indices.length; i++) {
    const row = table.get(indices[i - 1]!)!
    let best = -1
    let bestCount = -1
    for (const [to, count] of row) {
      if (count > bestCount) {
        best = to
        bestCount = count
      }
    }
    if (best === indices[i]!) hit++
  }
  return (hit / (indices.length - 1)) * 100
}

/** 同じ (n, 選択肢数) のランダム列における1次マルコフ的中率の95%点（帰無分布の上限） */
export function markovNullThreshold(n: number, choiceCount: number): number {
  const rng = mulberry32(0x5eed ^ (n * 131) ^ (choiceCount * 7919))
  const values: number[] = []
  for (let t = 0; t < NULL_TRIALS; t++) {
    const seq: number[] = []
    for (let i = 0; i < n; i++) seq.push(Math.floor(rng() * choiceCount))
    values.push(firstOrderMarkovAccuracy(seq))
  }
  values.sort((a, b) => a - b)
  return values[Math.min(values.length - 1, Math.floor(NULL_PERCENTILE * values.length))]!
}

function checkAnswerPositionPredictability(
  questions: readonly Question[],
  packId: string,
): string[] {
  const indices: number[] = []
  let choiceCount = 0
  for (const q of questions) {
    const units: { choices?: Choice[] | null; answer?: string | null }[] = [
      q,
      ...(q.subQuestions ?? []),
    ]
    for (const u of units) {
      if (!Array.isArray(u.choices) || typeof u.answer !== 'string') continue
      const i = u.choices.findIndex((c) => c.key === u.answer)
      if (i < 0) continue
      indices.push(i)
      choiceCount = Math.max(choiceCount, u.choices.length)
    }
  }
  // 標本が小さいと帰無分布が広がりすぎて検出力が無いため、20問未満は対象外にする
  if (indices.length < 20 || choiceCount < 2) return []
  const accuracy = firstOrderMarkovAccuracy(indices)
  const threshold = markovNullThreshold(indices.length, choiceCount)
  if (accuracy <= threshold) return []
  return [
    `[警告] ${packId}: 正答位置の1次マルコフ的中率が${accuracy.toFixed(1)}%で、同条件のランダム列の95%点${threshold.toFixed(1)}%（${indices.length}問・${choiceCount}択）を超えている（出題順から正答位置が予測できる）`,
  ]
}

export function validateContentLintBlocking(
  questions: readonly Question[],
  packId: string,
): string[] {
  const problems: string[] = []
  for (const q of questions) {
    problems.push(...checkChoiceTagConsistency(q))
    problems.push(...checkPart34SpeakerGenderConsistency(q))
  }
  problems.push(...checkAnswerKeyCycle(questions, packId))
  problems.push(...checkFlatAnswerKeyCycle(questions, packId))
  return problems
}

/** 従来どおり警告のみのルール（①②③④⑤⑦）。既存コンテンツに現存する違反があるため据え置く */
export function validateContentLintWarnings(
  questions: readonly Question[],
  packId: string,
): string[] {
  const problems: string[] = []
  for (const q of questions) {
    problems.push(...checkPart2ScriptChoiceMatch(q))
    problems.push(...checkKeyVocabAppearance(q))
    problems.push(...checkCasualContractions(q))
    problems.push(...checkTextBlankLength(q))
    problems.push(...checkAudioOnlyReadiness(q))
    problems.push(...checkExplanationMentionsDistractor(q))
  }
  problems.push(...checkOpeningPhraseDiversity(questions, packId))
  problems.push(...checkAnswerPositionPredictability(questions, packId))
  return problems
}

/**
 * パック1件分の全ルール検証（ブロッキング⑥⑧⑨＋警告①②③④⑤⑦の合算）。
 * 個別のブロッキング可否を問わない一括検査・テスト用。buildPack側は
 * validateContentLintBlocking/validateContentLintWarningsを個別に呼び分ける
 */
export function validateContentLint(questions: readonly Question[], packId: string): string[] {
  return [
    ...validateContentLintBlocking(questions, packId),
    ...validateContentLintWarnings(questions, packId),
  ]
}
