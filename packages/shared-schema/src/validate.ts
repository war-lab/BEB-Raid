// 問題パックのバリデータ（T-05。正本: docs/04_データ設計.md 2節）。
//
// 検査内容: スキーマ検証 / license・origin 必須 / answer整合 / keyVocab存在チェック
// （検査対象フィールドは format 毎に定義: audio系=script、text系=question＋choices、
// vocab_card=phrase）/ 音声存在チェック（audioFiles オプション指定時のみ）。
//
// エラーはパック単位で全件レポートし、部分取込はしない（1件でもエラーがあれば ok=false）。
// ファイルシステムには触れない設計: 実ファイルの列挙はビルド側（T-32）が行い、
// audioFiles として渡す。app（ブラウザ）からも同じバリデータを使えるようにするため。

import type { FreqRank, PackLicense, QuestionFormat } from './types.js'

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
const TEXT_FORMATS: readonly QuestionFormat[] = ['text_blank', 'text_passage']
/** 単独の choices + answer を持つ format（audio_set は subQuestions 側で持つ） */
const CHOICE_FORMATS: readonly QuestionFormat[] = [
  'audio_qa',
  'audio_photo',
  'text_blank',
  'text_passage',
]

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
    data.questions.forEach((q, i) => {
      validateQuestion(q, `questions[${i}]`, seenIds, options, err)
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
    }
  }

  if (format === 'dictation') {
    if (!Array.isArray(q.blanks) || q.blanks.length === 0) {
      err(`${path}.blanks`, 'missing_field', 'dictation には blanks が必要')
    } else {
      q.blanks.forEach((b, i) => {
        if (!isRecord(b) || !isInt(b.index) || b.index < 0 || !isNonEmptyString(b.answer)) {
          err(
            `${path}.blanks[${i}]`,
            'invalid_value',
            'blanks の要素は { index: 0以上の整数, answer: 文字列 }',
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

  if (format === 'audio_set') {
    if (!Array.isArray(q.subQuestions) || q.subQuestions.length === 0) {
      err(`${path}.subQuestions`, 'missing_field', 'audio_set には subQuestions が必要')
    } else {
      q.subQuestions.forEach((sq, i) => {
        const sqPath = `${path}.subQuestions[${i}]`
        if (!isRecord(sq)) {
          err(sqPath, 'invalid_structure', 'subQuestion がオブジェクトではない')
          return
        }
        if (!isNonEmptyString(sq.id)) {
          err(`${sqPath}.id`, 'missing_field', 'id が必要')
        }
        if (!isNonEmptyString(sq.question)) {
          err(`${sqPath}.question`, 'missing_field', 'question が必要')
        }
        validateChoicesAndAnswer(sq.choices, sq.answer, sqPath, err)
      })
    }
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
    }
  }
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
 * keyVocab の検査。
 * - vocab_card 以外の format: 1件以上必須（key単語システム=03の3節 の入力になるため）
 * - vocab_card: 任意（カード自体が語彙。keyVocab は持たなくてよい）
 * - 存在チェックの検査対象フィールド（04の2節）:
 *   audio系=script / text系=question＋choices / vocab_card=phrase
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
