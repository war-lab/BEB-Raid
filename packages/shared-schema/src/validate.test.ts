// バリデータのテスト（T-05 完了条件）:
// - docs/04 2節のサンプルJSONが通る
// - license欠落 / answer不整合 / keyVocab欠落 の各異常データが全件列挙付きで拒否される
import { describe, expect, it } from 'vitest'

import type { Question, QuestionPack } from './types.js'
import { validatePack } from './validate.js'

/** docs/04_データ設計.md 2節のサンプルJSON（コメントを除きそのまま） */
function docsSamplePack(): QuestionPack {
  return {
    schemaVersion: 2,
    pack: {
      id: 'pack-p2-listening-001',
      title: 'Part2瞬発 基礎01',
      license: 'internal-original',
      origin: 'LLM生成+レビュー済 2026-07',
      targetLevel: [300, 500],
      sizeBytes: 4200000,
    },
    questions: [
      {
        id: 'q-0001',
        part: 2,
        format: 'audio_qa',
        difficulty: 2,
        tags: ['疑問詞聞き取り', '弱形・連結'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/q-0001.mp3',
        audioMeta: { accent: 'US', tts: true, voice: 'en-US-Andrew', durationMs: 6200 },
        timing: null,
        image: null,
        script: 'Where should I submit the expense report?',
        translation: '経費精算書はどこに提出すればよいですか。',
        question: null,
        choices: [
          { key: 'A', text: 'To the accounting portal.' },
          { key: 'B', text: 'By Friday afternoon.' },
          { key: 'C', text: 'Yes, I reported it.' },
        ],
        answer: 'A',
        explanation: 'Where への応答は場所。B は When、C は音のひっかけ（report）。',
        blanks: null,
      },
    ],
  }
}

/** noUncheckedIndexedAccess 対応: 先頭の問題を非 undefined で取り出す */
function firstQuestion(pack: QuestionPack): Question {
  const q = pack.questions[0]
  if (!q) throw new Error('テストデータに questions[0] がない')
  return q
}

function vocabCard(): Question {
  return {
    id: 'v-0001',
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: ['語彙'],
    keyVocab: [],
    front: 'submit',
    phrase: 'submit the expense report',
    phraseAudio: 'audio/v-0001.mp3',
    back: '提出する',
    freqRank: 'S',
    levelBand: 600,
  }
}

describe('validatePack: 正常系', () => {
  it('docs/04 2節のサンプルJSONが通る', () => {
    const result = validatePack(docsSamplePack())
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('JSON.parse したプレーンオブジェクトでも通る（型情報なし）', () => {
    const result = validatePack(JSON.parse(JSON.stringify(docsSamplePack())))
    expect(result.ok).toBe(true)
  })

  it('vocab_card（1語1フレーズ・phraseAudio付き）が通る', () => {
    const pack = docsSamplePack()
    pack.questions.push(vocabCard())
    expect(validatePack(pack).ok).toBe(true)
  })

  it('sizeBytes 省略（生成段階でビルド前）でも通る', () => {
    const pack = docsSamplePack()
    delete pack.pack.sizeBytes
    expect(validatePack(pack).ok).toBe(true)
  })

  it('audioFiles 指定時、参照する音声が全て実在すれば通る', () => {
    const pack = docsSamplePack()
    pack.questions.push(vocabCard())
    const result = validatePack(pack, {
      audioFiles: new Set(['audio/q-0001.mp3', 'audio/v-0001.mp3']),
    })
    expect(result.ok).toBe(true)
  })
})

describe('validatePack: 取込拒否（完了条件の3異常系）', () => {
  it('license欠落を拒否する', () => {
    const pack = docsSamplePack() as unknown as { pack: Record<string, unknown> }
    delete pack.pack.license
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'pack.license', code: 'missing_license' }),
    )
  })

  it('license が enum 外の値を拒否する', () => {
    const pack = docsSamplePack() as unknown as { pack: Record<string, unknown> }
    pack.pack.license = '市販教材コピー'
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('missing_license')
  })

  it('origin欠落を拒否する', () => {
    const pack = docsSamplePack() as unknown as { pack: Record<string, unknown> }
    delete pack.pack.origin
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'pack.origin', code: 'missing_origin' }),
    )
  })

  it('answer不整合（choices に無い key）を拒否する', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).answer = 'D'
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].answer', code: 'answer_mismatch' }),
    )
  })

  it('keyVocab欠落（空配列）を拒否する', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).keyVocab = []
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].keyVocab', code: 'missing_key_vocab' }),
    )
  })

  it('keyVocab の word が script に存在しない場合を拒否する', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).keyVocab = [{ word: 'negotiate', sense: '交渉する', freqRank: 'A' }]
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'questions[0].keyVocab[0].word',
        code: 'key_vocab_not_found',
      }),
    )
  })
})

describe('validatePack: 全件列挙・部分取込なし', () => {
  it('複数問題に複数エラーがある場合、全件が列挙される', () => {
    const base = firstQuestion(docsSamplePack())
    const pack = docsSamplePack() as unknown as {
      pack: Record<string, unknown>
      questions: Record<string, unknown>[]
    }
    delete pack.pack.license // 1件目: license欠落
    pack.questions.push(
      { ...base, id: 'q-0002', answer: 'X' }, // 2件目: answer不整合
      { ...base, id: 'q-0003', keyVocab: [] }, // 3件目: keyVocab欠落
      { ...base, id: 'q-0001' }, // 4件目: id重複
    )

    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    const codes = result.errors.map((e) => e.code)
    expect(codes).toContain('missing_license')
    expect(codes).toContain('answer_mismatch')
    expect(codes).toContain('missing_key_vocab')
    expect(codes).toContain('invalid_value') // id重複
    expect(result.errors.length).toBeGreaterThanOrEqual(4)
  })
})

describe('validatePack: format毎の必須フィールド', () => {
  it('audio_qa で audio 欠落を拒否する', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).audio = null
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].audio', code: 'missing_field' }),
    )
  })

  it('shadowing で timing 欠落を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [
      {
        ...firstQuestion(pack),
        format: 'shadowing',
        timing: null,
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].timing', code: 'missing_field' }),
    )
  })

  it('dictation で blanks 欠落を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [
      {
        ...firstQuestion(pack),
        format: 'dictation',
        blanks: null,
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].blanks', code: 'missing_field' }),
    )
  })

  it('vocab_card で phraseAudio 欠落を拒否する（フレーズ音声必須=02の4節）', () => {
    const pack = docsSamplePack()
    pack.questions.push({ ...vocabCard(), phraseAudio: null })
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[1].phraseAudio', code: 'missing_field' }),
    )
  })

  it('audio_set は subQuestions 必須で、各設問の answer 整合も検査する', () => {
    const pack = docsSamplePack()
    pack.questions = [
      {
        ...firstQuestion(pack),
        format: 'audio_set',
        part: 3,
        choices: null,
        answer: null,
        subQuestions: [
          {
            id: 'q-0001-1',
            question: 'What does the man want to submit?',
            choices: [
              { key: 'A', text: 'A report.' },
              { key: 'B', text: 'A receipt.' },
            ],
            answer: 'C', // 不整合
          },
        ],
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'questions[0].subQuestions[0].answer',
        code: 'answer_mismatch',
      }),
    )
  })
})

describe('validatePack: 音声存在チェック（audioFiles 指定時）', () => {
  it('参照する音声ファイルが一覧に無い場合を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions.push(vocabCard())
    const result = validatePack(pack, { audioFiles: new Set(['audio/q-0001.mp3']) })
    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[1].phraseAudio', code: 'missing_audio_file' }),
    )
  })

  it('audioFiles 未指定なら存在チェックはスキップされる', () => {
    expect(validatePack(docsSamplePack()).ok).toBe(true)
  })
})

describe('validatePack: 構造エラー', () => {
  it('オブジェクトでない入力を拒否する', () => {
    const result = validatePack('not a pack')
    expect(result.ok).toBe(false)
    expect(result.errors[0]?.code).toBe('invalid_structure')
  })

  it('schemaVersion 不一致を拒否する', () => {
    const pack = docsSamplePack() as unknown as Record<string, unknown>
    pack.schemaVersion = 1
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'schemaVersion', code: 'invalid_value' }),
    )
  })

  it('questions が空のパックを拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = []
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions', code: 'invalid_value' }),
    )
  })
})
