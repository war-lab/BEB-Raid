// 問題パックのバリデータ（T-05。正本: docs/04_データ設計.md 2節）。
//
// 検査内容: スキーマ検証 / license・origin 必須 / answer整合 / keyVocab存在チェック
// （検査対象フィールドは format 毎に定義: audio系=script、text_blank=question＋choices、
// text_passage=passages本文＋subQuestions、vocab_card=phrase）/ 音声存在チェック
// （audioFiles オプション指定時のみ）。text_passage（Part6/7）は audio_set と同じ
// 「1刺激＋subQuestions」構造で、刺激は音声でなく passages（本文）になる（ADR 0006・docs/24 3.1節）。
//
// エラーはパック単位で全件レポートし、部分取込はしない（1件でもエラーがあれば ok=false）。
// ファイルシステムには触れない設計: 実ファイルの列挙はビルド側（T-32）が行い、
// audioFiles として渡す。app（ブラウザ）からも同じバリデータを使えるようにするため。

import { part2ResponsesDigest } from './part2Responses.js'
import type { Choice, FreqRank, PackLicense, QuestionFormat } from './types.js'

export type ValidationErrorCode =
  | 'invalid_structure' // JSONの構造自体が不正（型違い・必須オブジェクト欠落）
  | 'missing_field' // format 上必須のフィールドが欠落
  | 'invalid_value' // 値が許容範囲外（enum外・範囲外・重複ID等）
  | 'missing_license' // license 欠落・不正（取込拒否の主対象）
  | 'missing_origin' // origin 欠落
  | 'answer_mismatch' // answer が choices のいずれの key とも一致しない
  | 'missing_key_vocab' // keyVocab が欠落（空含む）
  | 'key_vocab_not_found' // keyVocab の word が検査対象フィールドに存在しない
  | 'missing_audio_file' // 参照する音声ファイルが実在しない（audioFiles 指定時のみ）

export interface ValidationError {
  /** エラー位置（例: `questions[2].answer`） */
  path: string
  code: ValidationErrorCode
  message: string
}

export interface ValidationResult {
  ok: boolean
  errors: ValidationError[]
}

export interface ValidatePackOptions {
  /**
   * パック内の音声参照パス（audio / phraseAudio）の実在チェックに使うファイル一覧。
   * 未指定の場合このチェックはスキップする（ビルド時=T-32 に実ファイル一覧を渡す）。
   */
  audioFiles?: ReadonlySet<string>
}

const LICENSES: readonly PackLicense[] = ['internal-original', 'cc-by', 'public-domain']
const FREQ_RANKS: readonly FreqRank[] = ['S', 'A', 'B', 'C']
/** vocab_card の levelBand（目標スコア帯）の許容値（03の4節・T-41=C-1改訂） */
const LEVEL_BANDS: readonly number[] = [600, 730, 860, 990]
/** dictation/shadowing の script/timing/blanks 整合チェックで使う句読点（前後除去対象） */
const PUNCTUATION_RE = /^[.,?!;:'"]+|[.,?!;:'"]+$/g
const FORMATS: readonly QuestionFormat[] = [
  'audio_qa',
  'audio_photo',
  'audio_set',
  'text_blank',
  'text_passage',
  'vocab_card',
  'dictation',
  'shadowing',
]
const AUDIO_FORMATS: readonly QuestionFormat[] = [
  'audio_qa',
  'audio_photo',
  'audio_set',
  'dictation',
  'shadowing',
]
/** トップレベルに question を持つ text 系 format（text_passage は passages+subQuestions 側で持つ） */
const TEXT_FORMATS: readonly QuestionFormat[] = ['text_blank']
/** 単独の choices + answer を持つ format（audio_set / text_passage は subQuestions 側で持つ） */
const CHOICE_FORMATS: readonly QuestionFormat[] = ['audio_qa', 'audio_photo', 'text_blank']
/** text_passage の subQuestions 件数上限（Part7複数パッセージ=5問。docs/24 3.1節） */
const MAX_SUB_QUESTIONS = 5
/** Part6 の空所マーカー（本文中の [[1]]…[[4]]）。数字を1グループで捕捉する */
const PASSAGE_MARKER_RE = /\[\[(\d+)\]\]/g

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== ''
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

/**
 * 問題パックJSONを検証する。エラーは全件列挙で返し、部分取込はしない。
 */
export function validatePack(data: unknown, options: ValidatePackOptions = {}): ValidationResult {
  const errors: ValidationError[] = []
  const err = (path: string, code: ValidationErrorCode, message: string) => {
    errors.push({ path, code, message })
  }

  if (!isRecord(data)) {
    err('', 'invalid_structure', 'パックJSONがオブジェクトではない')
    return { ok: false, errors }
  }

  if (data.schemaVersion !== 2) {
    err(
      'schemaVersion',
      'invalid_value',
      `schemaVersion は 2 のみ対応（実際: ${JSON.stringify(data.schemaVersion)}）`,
    )
  }

  validatePackMeta(data.pack, err)

  if (!Array.isArray(data.questions)) {
    err('questions', 'invalid_structure', 'questions が配列ではない')
  } else if (data.questions.length === 0) {
    err('questions', 'invalid_value', 'questions が空（問題が1件もないパックは取込不可）')
  } else {
    const seenIds = new Set<string>()
    const seenSubQuestionIds = new Set<string>()
    data.questions.forEach((q, i) => {
      validateQuestion(q, `questions[${i}]`, seenIds, seenSubQuestionIds, options, err)
    })
  }

  return { ok: errors.length === 0, errors }
}

function validatePackMeta(
  pack: unknown,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!isRecord(pack)) {
    err('pack', 'invalid_structure', 'pack がオブジェクトではない')
    return
  }
  if (!isNonEmptyString(pack.id)) {
    err('pack.id', 'missing_field', 'pack.id が必要')
  }
  if (!isNonEmptyString(pack.title)) {
    err('pack.title', 'missing_field', 'pack.title が必要')
  }
  // license / origin はコンテンツ出所の不変条件。欠落は取込拒否
  if (!isNonEmptyString(pack.license)) {
    err('pack.license', 'missing_license', 'license が必要（出所不明パックは取込拒否）')
  } else if (!LICENSES.includes(pack.license as PackLicense)) {
    err(
      'pack.license',
      'missing_license',
      `license は ${LICENSES.join(' | ')} のいずれか（実際: ${pack.license}）`,
    )
  }
  if (!isNonEmptyString(pack.origin)) {
    err('pack.origin', 'missing_origin', 'origin が必要（出所不明パックは取込拒否）')
  }
  const level = pack.targetLevel
  if (
    !Array.isArray(level) ||
    level.length !== 2 ||
    typeof level[0] !== 'number' ||
    typeof level[1] !== 'number'
  ) {
    err('pack.targetLevel', 'invalid_value', 'targetLevel は [下限, 上限] の数値2要素配列')
  } else if (level[0] > level[1]) {
    err('pack.targetLevel', 'invalid_value', 'targetLevel の下限が上限を超えている')
  }
  if (pack.sizeBytes !== undefined && (!isInt(pack.sizeBytes) || pack.sizeBytes < 0)) {
    err('pack.sizeBytes', 'invalid_value', 'sizeBytes は 0 以上の整数')
  }
}

function validateQuestion(
  q: unknown,
  path: string,
  seenIds: Set<string>,
  seenSubQuestionIds: Set<string>,
  options: ValidatePackOptions,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!isRecord(q)) {
    err(path, 'invalid_structure', '問題がオブジェクトではない')
    return
  }

  if (!isNonEmptyString(q.id)) {
    err(`${path}.id`, 'missing_field', 'id が必要')
  } else if (seenIds.has(q.id)) {
    err(`${path}.id`, 'invalid_value', `id が重複: ${q.id}`)
  } else {
    seenIds.add(q.id)
  }

  const format = q.format as QuestionFormat
  if (!FORMATS.includes(format)) {
    err(
      `${path}.format`,
      'invalid_value',
      `format は ${FORMATS.join(' | ')} のいずれか（実際: ${JSON.stringify(q.format)}）`,
    )
    // format 不明では以降の format 依存チェックができないため打ち切る
    return
  }

  if (!isInt(q.part) || q.part < 0 || q.part > 7) {
    err(`${path}.part`, 'invalid_value', 'part は 0–7 の整数')
  } else if (format === 'vocab_card' && q.part !== 0) {
    err(`${path}.part`, 'invalid_value', 'vocab_card の part は 0')
  } else if (format !== 'vocab_card' && q.part === 0) {
    err(`${path}.part`, 'invalid_value', 'part 0 は vocab_card 専用')
  } else if (format === 'text_passage' && q.part !== 6 && q.part !== 7) {
    err(`${path}.part`, 'invalid_value', 'text_passage の part は 6（Part6）または 7（Part7）')
  }

  if (!isInt(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    err(`${path}.difficulty`, 'invalid_value', 'difficulty は 1–5 の整数')
  }

  if (!Array.isArray(q.tags) || !q.tags.every(isNonEmptyString)) {
    err(`${path}.tags`, 'invalid_value', 'tags は文字列配列')
  }

  validateKeyVocab(q, format, path, err)

  // --- format 毎の必須フィールド ---
  if (AUDIO_FORMATS.includes(format)) {
    if (!isNonEmptyString(q.audio)) {
      err(`${path}.audio`, 'missing_field', `${format} には audio が必要`)
    } else if (options.audioFiles && !options.audioFiles.has(q.audio)) {
      err(`${path}.audio`, 'missing_audio_file', `音声ファイルが存在しない: ${q.audio}`)
    }
    validateAudioMeta(q.audioMeta, `${path}.audioMeta`, format, err)
    if (!isNonEmptyString(q.script)) {
      err(`${path}.script`, 'missing_field', `${format} には script が必要`)
    }
  }

  if (format === 'shadowing') {
    if (!Array.isArray(q.timing) || q.timing.length === 0 || !q.timing.every(isInt)) {
      err(`${path}.timing`, 'missing_field', 'shadowing には timing（開始msの整数配列）が必要')
    } else {
      const timing = q.timing as number[]
      if (timing.some((t) => t < 0)) {
        err(`${path}.timing`, 'invalid_value', 'timing は全て0以上でなければならない')
      }
      for (let i = 1; i < timing.length; i++) {
        if (timing[i]! < timing[i - 1]!) {
          err(`${path}.timing`, 'invalid_value', 'timing は単調増加（非減少）でなければならない')
          break
        }
      }
      const scriptWords = tokenizeScript(q.script)
      if (scriptWords.length > 0 && timing.length !== scriptWords.length) {
        err(
          `${path}.timing`,
          'invalid_value',
          `timing の要素数(${timing.length})が script の語数(${scriptWords.length})と一致しない`,
        )
      }
    }
  }

  if (format === 'dictation') {
    if (!Array.isArray(q.blanks) || q.blanks.length === 0) {
      err(`${path}.blanks`, 'missing_field', 'dictation には blanks が必要')
    } else {
      const scriptWords = tokenizeScript(q.script)
      q.blanks.forEach((b, i) => {
        if (!isRecord(b) || !isInt(b.index) || b.index < 0 || !isNonEmptyString(b.answer)) {
          err(
            `${path}.blanks[${i}]`,
            'invalid_value',
            'blanks の要素は { index: 0以上の整数, answer: 文字列 }',
          )
          return
        }
        if (scriptWords.length === 0) return
        if (b.index >= scriptWords.length) {
          err(
            `${path}.blanks[${i}].index`,
            'invalid_value',
            `index(${b.index}) が script の語数(${scriptWords.length})以上`,
          )
          return
        }
        const scriptWord = normalizeDictationWord(scriptWords[b.index]!)
        const answerWord = normalizeDictationWord(b.answer)
        if (scriptWord !== answerWord) {
          err(
            `${path}.blanks[${i}].answer`,
            'invalid_value',
            `answer "${b.answer}" が script の該当位置の語 "${scriptWords[b.index]}" と一致しない`,
          )
        }
      })
    }
  }

  if (TEXT_FORMATS.includes(format)) {
    if (!isNonEmptyString(q.question)) {
      err(`${path}.question`, 'missing_field', `${format} には question が必要`)
    }
  }

  if (CHOICE_FORMATS.includes(format)) {
    validateChoicesAndAnswer(q.choices, q.answer, path, err)
  }

  // 応答オフセット（音声のみモード用）は choices と audioMeta の両方を見るため、
  // validateAudioMeta（choices を受け取らない）とは別に検証する
  validatePart2ResponseOffsets(q, format, path, err)

  if (format === 'audio_photo') {
    if (!isNonEmptyString(q.image)) {
      err(`${path}.image`, 'missing_field', 'audio_photo には image が必要')
    }
  }

  if (format === 'audio_set') {
    validateSubQuestions(q.subQuestions, format, path, seenSubQuestionIds, err)
  }

  if (format === 'text_passage') {
    validatePassages(q.passages, q.part, path, err)
    validateSubQuestions(q.subQuestions, format, path, seenSubQuestionIds, err)
    validatePart6Markers(q, path, err)
  }

  if (format === 'vocab_card') {
    // 02の4節: 1語1フレーズ・フレーズ音声（phraseAudio）必須
    for (const field of ['front', 'phrase', 'phraseAudio', 'back'] as const) {
      if (!isNonEmptyString(q[field])) {
        err(`${path}.${field}`, 'missing_field', `vocab_card には ${field} が必要`)
      }
    }
    if (
      isNonEmptyString(q.phraseAudio) &&
      options.audioFiles &&
      !options.audioFiles.has(q.phraseAudio)
    ) {
      err(`${path}.phraseAudio`, 'missing_audio_file', `音声ファイルが存在しない: ${q.phraseAudio}`)
    }
    if (!FREQ_RANKS.includes(q.freqRank as FreqRank)) {
      err(`${path}.freqRank`, 'invalid_value', `freqRank は ${FREQ_RANKS.join(' | ')} のいずれか`)
    }
    if (typeof q.levelBand !== 'number') {
      err(`${path}.levelBand`, 'missing_field', 'vocab_card には levelBand（目標スコア帯）が必要')
    } else if (!LEVEL_BANDS.includes(q.levelBand)) {
      err(
        `${path}.levelBand`,
        'invalid_value',
        `levelBand は ${LEVEL_BANDS.join(' | ')} のいずれか（実際: ${q.levelBand}）`,
      )
    }
  }
}

/** script を空白区切りでトークン化する（dictation/shadowing の整合チェック用） */
function tokenizeScript(script: unknown): string[] {
  if (!isNonEmptyString(script)) return []
  return script.split(/\s+/).filter((w) => w.length > 0)
}

/** dictation の答え合わせ用正規化（大文字小文字無視・前後の句読点除去） */
function normalizeDictationWord(word: string): string {
  return word.toLowerCase().replace(PUNCTUATION_RE, '')
}

function validateAudioMeta(
  meta: unknown,
  path: string,
  format: QuestionFormat,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!isRecord(meta)) {
    err(path, 'missing_field', `${format} には audioMeta が必要`)
    return
  }
  if (!['US', 'UK', 'AU', 'CA'].includes(meta.accent as string)) {
    err(`${path}.accent`, 'invalid_value', 'accent は US | UK | AU | CA のいずれか')
  }
  if (typeof meta.tts !== 'boolean') {
    err(`${path}.tts`, 'invalid_value', 'tts は boolean')
  }
  if (!isNonEmptyString(meta.voice)) {
    err(`${path}.voice`, 'missing_field', 'voice が必要')
  }
  if (!isInt(meta.durationMs) || meta.durationMs <= 0) {
    err(`${path}.durationMs`, 'invalid_value', 'durationMs は正の整数')
  }
  // questionEndMs（任意。audio_qaの質問部終端）: 在るなら 0 < questionEndMs < durationMs
  if (meta.questionEndMs !== undefined && meta.questionEndMs !== null) {
    if (
      !isInt(meta.questionEndMs) ||
      meta.questionEndMs <= 0 ||
      (isInt(meta.durationMs) && meta.questionEndMs >= (meta.durationMs as number))
    ) {
      err(`${path}.questionEndMs`, 'invalid_value', 'questionEndMs は durationMs 未満の正の整数')
    }
  }
}

/**
 * audioMeta.responseOffsetsMs / responsesTextDigest を検証する（T-151。正本: docs/04 2節）。
 *
 * この2フィールドは「設問＋3応答すべて」を1ファイルに連結した音声（音声のみモード用）の
 * 各応答の開始位置を指す。省略時は従来形式＝音声のみモード非対応として扱うので、
 * 「無い」ことはエラーにしない（部分移行を許す。未対応の列挙は cli の contentLint が警告する）。
 *
 * digest 不一致をエラー（警告ではなく）にするのは、TTS後に選択肢を編集すると音声の
 * 読み上げ順と key の対応が崩れ、answer が実質誤りになるため。answer_mismatch と同じ重大度。
 */
function validatePart2ResponseOffsets(
  q: Record<string, unknown>,
  format: QuestionFormat,
  path: string,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  const meta = isRecord(q.audioMeta) ? q.audioMeta : null
  const offsets = meta?.responseOffsetsMs
  const digest = meta?.responsesTextDigest
  const hasOffsets = offsets !== undefined && offsets !== null
  const hasDigest = digest !== undefined && digest !== null

  if (!hasOffsets && !hasDigest) return

  const offsetsPath = `${path}.audioMeta.responseOffsetsMs`
  const digestPath = `${path}.audioMeta.responsesTextDigest`

  if (format !== 'audio_qa') {
    err(
      offsetsPath,
      'invalid_value',
      `responseOffsetsMs / responsesTextDigest は audio_qa 専用（実際: ${format}）`,
    )
    return
  }

  if (!hasOffsets) {
    err(
      offsetsPath,
      'missing_field',
      'responsesTextDigest があるのに responseOffsetsMs が無い（応答音声の再生成が必要）',
    )
    return
  }

  if (!Array.isArray(offsets) || offsets.length === 0) {
    err(offsetsPath, 'invalid_value', 'responseOffsetsMs は1件以上の数値配列')
    return
  }

  if (!offsets.every((v) => isInt(v) && v > 0)) {
    err(offsetsPath, 'invalid_value', 'responseOffsetsMs の要素は正の整数')
    return
  }

  const values = offsets as number[]
  for (let i = 1; i < values.length; i++) {
    if (values[i]! <= values[i - 1]!) {
      err(offsetsPath, 'invalid_value', 'responseOffsetsMs は厳密単調増加でなければならない')
      return
    }
  }

  const choices = Array.isArray(q.choices) ? q.choices : null
  if (!choices) {
    // choices 自体の不備は validateChoicesAndAnswer が報告済み。ここでは件数照合だけ諦める
    return
  }
  if (values.length !== choices.length) {
    err(
      offsetsPath,
      'invalid_value',
      `responseOffsetsMs の件数(${values.length})が choices の件数(${choices.length})と一致しない`,
    )
  }

  const questionEndMs = meta?.questionEndMs
  if (isInt(questionEndMs) && values[0]! < (questionEndMs as number)) {
    err(
      offsetsPath,
      'invalid_value',
      `最初の応答の開始(${values[0]}ms)が questionEndMs(${questionEndMs}ms)より前＝設問部と重なっている`,
    )
  }

  const durationMs = meta?.durationMs
  const last = values[values.length - 1]!
  if (isInt(durationMs) && last >= (durationMs as number)) {
    err(
      offsetsPath,
      'invalid_value',
      `最後の応答の開始(${last}ms)が durationMs(${durationMs}ms)以上`,
    )
  }

  if (!hasDigest) {
    err(
      digestPath,
      'missing_field',
      'responseOffsetsMs があるなら responsesTextDigest も必要（選択肢の後編集を検出できない）',
    )
    return
  }

  if (!isNonEmptyString(digest)) {
    err(digestPath, 'invalid_value', 'responsesTextDigest は文字列')
    return
  }

  // choices の要素が { key, text } でない場合は validateChoicesAndAnswer 側でエラー済み
  const wellFormed = choices.every(
    (c) => isRecord(c) && isNonEmptyString(c.key) && isNonEmptyString(c.text),
  )
  if (!wellFormed) return

  const expected = part2ResponsesDigest(choices as Choice[])
  if (digest !== expected) {
    err(
      digestPath,
      'invalid_value',
      `responsesTextDigest が choices と一致しない（期待: ${expected} / 実際: ${digest}）。` +
        'TTS後に選択肢を編集したため音声の読み上げ順と key の対応が崩れている。応答音声の再生成が必要',
    )
  }
}

function validateChoicesAndAnswer(
  choices: unknown,
  answer: unknown,
  path: string,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!Array.isArray(choices) || choices.length < 2) {
    err(`${path}.choices`, 'missing_field', 'choices（2件以上）が必要')
    return
  }
  const keys = new Set<string>()
  choices.forEach((c, i) => {
    if (!isRecord(c) || !isNonEmptyString(c.key) || !isNonEmptyString(c.text)) {
      err(`${path}.choices[${i}]`, 'invalid_value', '選択肢は { key, text } の文字列ペア')
      return
    }
    if (keys.has(c.key)) {
      err(`${path}.choices[${i}].key`, 'invalid_value', `選択肢 key が重複: ${c.key}`)
    }
    keys.add(c.key)
  })
  if (!isNonEmptyString(answer)) {
    err(`${path}.answer`, 'missing_field', 'answer が必要')
  } else if (!keys.has(answer)) {
    err(
      `${path}.answer`,
      'answer_mismatch',
      `answer "${answer}" が choices の key（${[...keys].join(', ')}）に存在しない`,
    )
  }
}

/**
 * audio_set / text_passage の subQuestions（1刺激にぶら下がる設問）を検証する。
 * 件数は 1〜MAX_SUB_QUESTIONS。各要素は { id（パック内一意）, question, choices+answer }。
 */
function validateSubQuestions(
  subQuestions: unknown,
  format: QuestionFormat,
  path: string,
  seenSubQuestionIds: Set<string>,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!Array.isArray(subQuestions) || subQuestions.length === 0) {
    err(`${path}.subQuestions`, 'missing_field', `${format} には subQuestions が必要`)
    return
  }
  if (subQuestions.length > MAX_SUB_QUESTIONS) {
    err(`${path}.subQuestions`, 'invalid_value', `subQuestions は${MAX_SUB_QUESTIONS}件以下`)
    return
  }
  subQuestions.forEach((sq, i) => {
    const sqPath = `${path}.subQuestions[${i}]`
    if (!isRecord(sq)) {
      err(sqPath, 'invalid_structure', 'subQuestion がオブジェクトではない')
      return
    }
    if (!isNonEmptyString(sq.id)) {
      err(`${sqPath}.id`, 'missing_field', 'id が必要')
    } else if (seenSubQuestionIds.has(sq.id)) {
      err(`${sqPath}.id`, 'invalid_value', `subQuestion id がパック内で重複: ${sq.id}`)
    } else {
      seenSubQuestionIds.add(sq.id)
    }
    if (!isNonEmptyString(sq.question)) {
      err(`${sqPath}.question`, 'missing_field', 'question が必要')
    }
    // tags は任意。指定されている場合は文字列配列であること
    if (sq.tags !== undefined && sq.tags !== null) {
      if (!Array.isArray(sq.tags) || !sq.tags.every(isNonEmptyString)) {
        err(`${sqPath}.tags`, 'invalid_value', 'tags は文字列配列')
      }
    }
    validateChoicesAndAnswer(sq.choices, sq.answer, sqPath, err)
  })
}

/**
 * text_passage の passages（刺激文書）を検証する。
 * Part6=1件、Part7=1〜3件（複数パッセージは最大3件）。各要素は { id（問題内一意）, kind, text }。
 */
function validatePassages(
  passages: unknown,
  part: unknown,
  path: string,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (!Array.isArray(passages) || passages.length === 0) {
    err(`${path}.passages`, 'missing_field', 'text_passage には passages が必要')
    return
  }
  if (part === 6 && passages.length !== 1) {
    err(`${path}.passages`, 'invalid_value', 'Part6 の passages は1件')
  }
  if (part === 7 && passages.length > 3) {
    err(
      `${path}.passages`,
      'invalid_value',
      'Part7 の passages は1〜3件（複数パッセージは最大3件）',
    )
  }
  const ids = new Set<string>()
  passages.forEach((p, i) => {
    const pPath = `${path}.passages[${i}]`
    if (!isRecord(p)) {
      err(pPath, 'invalid_structure', 'passage がオブジェクトではない')
      return
    }
    if (!isNonEmptyString(p.id)) {
      err(`${pPath}.id`, 'missing_field', 'id が必要')
    } else if (ids.has(p.id)) {
      err(`${pPath}.id`, 'invalid_value', `passage id が問題内で重複: ${p.id}`)
    } else {
      ids.add(p.id)
    }
    if (!isNonEmptyString(p.kind)) {
      err(`${pPath}.kind`, 'missing_field', 'kind が必要')
    }
    if (!isNonEmptyString(p.text)) {
      err(`${pPath}.text`, 'missing_field', 'text が必要')
    }
  })
}

/** 本文中の空所マーカー [[n]] の番号を出現順に取り出す（Part6整合チェック用） */
function extractMarkerIndices(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(PASSAGE_MARKER_RE)) {
    out.push(Number(m[1]))
  }
  return out
}

/**
 * Part6（text_passage）の空所マーカー整合を検証する。
 * 本文の [[1]]…[[n]] が 1 から連番・重複なしで、subQuestions 件数と一致すること。
 * Part7 はマーカー不要のため検査しない。passages 件数不正時は passages 側で別途エラー済みなので打ち切る。
 */
function validatePart6Markers(
  q: Record<string, unknown>,
  path: string,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  if (q.part !== 6) return
  if (!Array.isArray(q.passages) || q.passages.length !== 1) return
  const passage = q.passages[0]
  if (!isRecord(passage) || !isNonEmptyString(passage.text)) return

  const markers = extractMarkerIndices(passage.text)
  const distinct = new Set(markers)
  const contiguous =
    markers.length > 0 &&
    distinct.size === markers.length &&
    markers.every((m) => m >= 1 && m <= markers.length)
  if (!contiguous) {
    err(
      `${path}.passages[0].text`,
      'invalid_value',
      `Part6 の空所マーカーは [[1]] から連番・重複なしで埋め込む（実際: ${markers.join(', ') || 'なし'}）`,
    )
    return
  }
  const subCount = Array.isArray(q.subQuestions) ? q.subQuestions.length : 0
  if (subCount > 0 && markers.length !== subCount) {
    err(
      `${path}.subQuestions`,
      'invalid_value',
      `Part6 は空所マーカー数(${markers.length})と subQuestions 件数(${subCount})が一致すること`,
    )
  }
}

/**
 * keyVocab の検査。
 * - vocab_card 以外の format: 1件以上必須（key単語システム=03の3節 の入力になるため）
 * - vocab_card: 任意（カード自体が語彙。keyVocab は持たなくてよい）
 * - 存在チェックの検査対象フィールド（04の2節）:
 *   audio系=script / text_blank=question＋choices /
 *   text_passage=passages本文＋subQuestions（question＋choices）/ vocab_card=phrase
 * - 照合は小文字化した部分一致（活用形の揺れを許容する簡易判定）
 */
function validateKeyVocab(
  q: Record<string, unknown>,
  format: QuestionFormat,
  path: string,
  err: (path: string, code: ValidationErrorCode, message: string) => void,
): void {
  const kv = q.keyVocab
  if (!Array.isArray(kv) || (format !== 'vocab_card' && kv.length === 0)) {
    if (format !== 'vocab_card') {
      err(`${path}.keyVocab`, 'missing_key_vocab', 'keyVocab（1件以上）が必要')
    } else if (kv !== undefined && kv !== null && !Array.isArray(kv)) {
      err(`${path}.keyVocab`, 'invalid_value', 'keyVocab は配列')
    }
    return
  }

  // 検査対象テキストを format 毎に組み立てる
  let target: string
  if (AUDIO_FORMATS.includes(format)) {
    target = isNonEmptyString(q.script) ? q.script : ''
  } else if (format === 'text_passage') {
    // 本文＋各設問の question・選択肢を検査対象にする（Part6は正解語が選択肢側に来るため）
    const parts: string[] = []
    if (Array.isArray(q.passages)) {
      for (const p of q.passages) {
        if (isRecord(p) && isNonEmptyString(p.text)) parts.push(p.text)
      }
    }
    if (Array.isArray(q.subQuestions)) {
      for (const sq of q.subQuestions) {
        if (!isRecord(sq)) continue
        if (isNonEmptyString(sq.question)) parts.push(sq.question)
        if (Array.isArray(sq.choices)) {
          for (const c of sq.choices) {
            if (isRecord(c) && isNonEmptyString(c.text)) parts.push(c.text)
          }
        }
      }
    }
    target = parts.join(' ')
  } else if (TEXT_FORMATS.includes(format)) {
    const parts: string[] = []
    if (isNonEmptyString(q.question)) parts.push(q.question)
    if (Array.isArray(q.choices)) {
      for (const c of q.choices) {
        if (isRecord(c) && isNonEmptyString(c.text)) parts.push(c.text)
      }
    }
    target = parts.join(' ')
  } else {
    target = isNonEmptyString(q.phrase) ? q.phrase : ''
  }
  const targetLower = target.toLowerCase()

  kv.forEach((entry, i) => {
    const kvPath = `${path}.keyVocab[${i}]`
    if (!isRecord(entry) || !isNonEmptyString(entry.word) || !isNonEmptyString(entry.sense)) {
      err(kvPath, 'invalid_value', 'keyVocab の要素は { word, sense, freqRank }')
      return
    }
    if (!FREQ_RANKS.includes(entry.freqRank as FreqRank)) {
      err(`${kvPath}.freqRank`, 'invalid_value', `freqRank は ${FREQ_RANKS.join(' | ')} のいずれか`)
    }
    if (targetLower !== '' && !targetLower.includes(entry.word.toLowerCase())) {
      err(
        `${kvPath}.word`,
        'key_vocab_not_found',
        `key単語 "${entry.word}" が検査対象フィールドに見つからない（format=${format}）`,
      )
    }
  })
}
