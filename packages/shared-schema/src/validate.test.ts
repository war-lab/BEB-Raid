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

  it('audioMeta.questionEndMs（質問部終端。正答リーク対策）が durationMs 未満の正の整数なら通る', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).audioMeta!.questionEndMs = 3100
    expect(validatePack(pack).ok).toBe(true)
  })
})

describe('validatePack: audioMeta.questionEndMs の異常系', () => {
  it.each([
    ['durationMs 以上', 6200],
    ['0', 0],
    ['負値', -100],
    ['非整数', 3100.5],
  ])('questionEndMs が %s なら invalid_value', (_label, value) => {
    const pack = docsSamplePack()
    firstQuestion(pack).audioMeta!.questionEndMs = value
    const result = validatePack(pack)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.path.endsWith('questionEndMs'))).toBe(true)
  })

  it('null は「未設定」として通る（旧生成分との互換）', () => {
    const pack = docsSamplePack()
    firstQuestion(pack).audioMeta!.questionEndMs = null
    expect(validatePack(pack).ok).toBe(true)
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

describe('validatePack: M2 format検証強化（T-41=C-1改訂）', () => {
  it('audio_photo で image 欠落を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [{ ...firstQuestion(pack), format: 'audio_photo', part: 1, image: null }]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].image', code: 'missing_field' }),
    )
  })

  it('audio_photo で image ありなら通る', () => {
    const pack = docsSamplePack()
    pack.questions = [
      { ...firstQuestion(pack), format: 'audio_photo', part: 1, image: 'images/q-0001.jpg' },
    ]
    expect(validatePack(pack).ok).toBe(true)
  })

  it('vocab_card の levelBand が enum 外なら拒否する', () => {
    const pack = docsSamplePack()
    pack.questions.push({ ...vocabCard(), levelBand: 700 })
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[1].levelBand', code: 'invalid_value' }),
    )
  })

  it('vocab_card の levelBand が600/730/860/990のいずれかなら通る', () => {
    const pack = docsSamplePack()
    pack.questions.push({ ...vocabCard(), levelBand: 730 })
    expect(validatePack(pack).ok).toBe(true)
  })

  it('dictation の blanks.index が script の語数以上なら拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'dictation',
        script: 'Please submit the report today', // 5語
        blanks: [{ index: 10, answer: 'submit' }],
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].blanks[0].index', code: 'invalid_value' }),
    )
  })

  it('dictation の blanks.answer が script の該当語と一致しなければ拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'dictation',
        script: 'Please submit the report today',
        blanks: [{ index: 1, answer: 'send' }], // 該当語は submit
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].blanks[0].answer', code: 'invalid_value' }),
    )
  })

  it('dictation の blanks.answer が大文字小文字・句読点違いでも一致すれば通る', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'dictation',
        script: 'Please submit the report, today.',
        blanks: [{ index: 4, answer: 'Today' }], // 該当語は today.（句読点付き）
        choices: null,
        answer: null,
      },
    ]
    expect(validatePack(pack).ok).toBe(true)
  })

  it('shadowing の timing が単調増加でなければ拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'shadowing',
        script: 'Please submit the report',
        timing: [0, 500, 300, 900],
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].timing', code: 'invalid_value' }),
    )
  })

  it('shadowing の timing 要素数が script の語数と一致しなければ拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'shadowing',
        script: 'Please submit the report',
        timing: [0, 500, 900], // 3個だが語数は4
        choices: null,
        answer: null,
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].timing', code: 'invalid_value' }),
    )
  })

  it('shadowing の timing が単調増加かつ語数一致なら通る', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'shadowing',
        script: 'Please submit the report',
        timing: [0, 300, 700, 1100],
        choices: null,
        answer: null,
      },
    ]
    expect(validatePack(pack).ok).toBe(true)
  })

  it('audio_set の subQuestions が5件を超えたら拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'audio_set',
        part: 3,
        choices: null,
        answer: null,
        subQuestions: Array.from({ length: 6 }, (_, i) => ({
          id: `q-0001-${i}`,
          question: `設問${i}`,
          choices: [
            { key: 'A', text: 'a' },
            { key: 'B', text: 'b' },
          ],
          answer: 'A',
        })),
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].subQuestions', code: 'invalid_value' }),
    )
  })

  it('audio_set の subQuestions.id がパック内で重複したら拒否する', () => {
    const pack = docsSamplePack()
    const base = firstQuestion(pack)
    pack.questions = [
      {
        ...base,
        format: 'audio_set',
        part: 3,
        choices: null,
        answer: null,
        subQuestions: [
          {
            id: 'dup-id',
            question: '設問1',
            choices: [
              { key: 'A', text: 'a' },
              { key: 'B', text: 'b' },
            ],
            answer: 'A',
          },
          {
            id: 'dup-id',
            question: '設問2',
            choices: [
              { key: 'A', text: 'a' },
              { key: 'B', text: 'b' },
            ],
            answer: 'A',
          },
        ],
      },
    ]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].subQuestions[1].id', code: 'invalid_value' }),
    )
  })
})

describe('validatePack: text_passage（Part6/7・T-103）', () => {
  /** Part6（1パッセージ・4空所）。本文の [[1]]…[[4]] が subQuestions と対応する */
  function part6Question(): Question {
    return {
      id: 'tp6-0001',
      part: 6,
      format: 'text_passage',
      difficulty: 3,
      tags: ['文法', '接続語'],
      keyVocab: [{ word: 'renew', sense: '更新する', freqRank: 'A' }],
      passages: [
        {
          id: 'tp6-0001-p1',
          kind: 'email',
          text: 'Your subscription is about to expire. Please [[1]] your plan this week. [[2]], you will lose access. We now [[3]] a discount for early renewal. Thank you for your continued [[4]].',
        },
      ],
      subQuestions: [
        {
          id: 'tp6-0001-1',
          question: '(1)',
          choices: [
            { key: 'A', text: 'renew' },
            { key: 'B', text: 'renewal' },
            { key: 'C', text: 'renewed' },
            { key: 'D', text: 'renewing' },
          ],
          answer: 'A',
        },
        {
          id: 'tp6-0001-2',
          question: '(2)',
          choices: [
            { key: 'A', text: 'Otherwise' },
            { key: 'B', text: 'Moreover' },
            { key: 'C', text: 'For example' },
            { key: 'D', text: 'Similarly' },
          ],
          answer: 'A',
        },
        {
          id: 'tp6-0001-3',
          question: '(3)',
          choices: [
            { key: 'A', text: 'offer' },
            { key: 'B', text: 'offers' },
            { key: 'C', text: 'offering' },
            { key: 'D', text: 'offered' },
          ],
          answer: 'A',
        },
        {
          id: 'tp6-0001-4',
          question: '(4)',
          choices: [
            { key: 'A', text: 'support' },
            { key: 'B', text: 'supports' },
            { key: 'C', text: 'supporting' },
            { key: 'D', text: 'supported' },
          ],
          answer: 'A',
        },
      ],
    }
  }

  /** Part7単一（1パッセージ・複数設問） */
  function part7SingleQuestion(): Question {
    return {
      id: 'tp7-0001',
      part: 7,
      format: 'text_passage',
      difficulty: 3,
      tags: ['読解', '目的把握'],
      keyVocab: [{ word: 'venue', sense: '会場', freqRank: 'A' }],
      passages: [
        {
          id: 'tp7-0001-p1',
          kind: 'notice',
          text: 'The annual staff meeting has been moved to a larger venue to accommodate all departments. It will be held on Friday at 2 P.M.',
        },
      ],
      subQuestions: [
        {
          id: 'tp7-0001-1',
          question: 'Why was the location changed?',
          choices: [
            { key: 'A', text: 'To fit more people' },
            { key: 'B', text: 'To reduce costs' },
            { key: 'C', text: 'To improve parking' },
          ],
          answer: 'A',
        },
        {
          id: 'tp7-0001-2',
          question: 'When will the meeting take place?',
          choices: [
            { key: 'A', text: 'Friday afternoon' },
            { key: 'B', text: 'Monday morning' },
            { key: 'C', text: 'Thursday evening' },
          ],
          answer: 'A',
        },
      ],
    }
  }

  /** Part7複数パッセージ（2文書・相互参照設問に tags 付き） */
  function part7MultiQuestion(): Question {
    return {
      id: 'tp7m-0001',
      part: 7,
      format: 'text_passage',
      difficulty: 4,
      tags: ['読解', '相互参照'],
      keyVocab: [{ word: 'invoice', sense: '請求書', freqRank: 'A' }],
      passages: [
        {
          id: 'tp7m-0001-p1',
          kind: 'email',
          text: 'Please find attached the invoice for last month. Payment is due within 30 days.',
        },
        {
          id: 'tp7m-0001-p2',
          kind: 'email',
          text: 'I noticed the invoice lists 12 units, but we received only 10. Could you adjust it?',
        },
      ],
      subQuestions: [
        {
          id: 'tp7m-0001-1',
          question: 'What problem does the second writer mention?',
          choices: [
            { key: 'A', text: 'A quantity mismatch' },
            { key: 'B', text: 'A late payment' },
            { key: 'C', text: 'A wrong address' },
          ],
          answer: 'A',
          tags: ['cross-reference'],
        },
        {
          id: 'tp7m-0001-2',
          question: 'When is payment due?',
          choices: [
            { key: 'A', text: 'Within 30 days' },
            { key: 'B', text: 'Within a week' },
            { key: 'C', text: 'Immediately' },
          ],
          answer: 'A',
        },
      ],
    }
  }

  it('Part6（1パッセージ・空所数と設問数が一致）が通る', () => {
    const pack = docsSamplePack()
    pack.questions = [part6Question()]
    const result = validatePack(pack)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('Part7単一が通る', () => {
    const pack = docsSamplePack()
    pack.questions = [part7SingleQuestion()]
    expect(validatePack(pack).ok).toBe(true)
  })

  it('Part7複数パッセージ（相互参照タグ付き）が通る', () => {
    const pack = docsSamplePack()
    pack.questions = [part7MultiQuestion()]
    const result = validatePack(pack)
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  it('passages 欠落を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [{ ...part7SingleQuestion(), passages: null }]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].passages', code: 'missing_field' }),
    )
  })

  it('subQuestions 欠落を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [{ ...part7SingleQuestion(), subQuestions: null }]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].subQuestions', code: 'missing_field' }),
    )
  })

  it('part が 6/7 以外の text_passage を拒否する', () => {
    const pack = docsSamplePack()
    pack.questions = [{ ...part7SingleQuestion(), part: 5 }]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].part', code: 'invalid_value' }),
    )
  })

  it('Part6 で空所マーカー数と設問数が一致しなければ拒否する', () => {
    const pack = docsSamplePack()
    const q = part6Question()
    q.subQuestions = q.subQuestions!.slice(0, 3) // マーカーは4個だが設問は3件
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].subQuestions', code: 'invalid_value' }),
    )
  })

  it('Part6 で空所マーカーが連番でなければ拒否する', () => {
    const pack = docsSamplePack()
    const q = part6Question()
    q.passages = [{ id: 'p', kind: 'email', text: 'Please [[1]] and [[3]] the renew form.' }]
    q.subQuestions = q.subQuestions!.slice(0, 2)
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].passages[0].text', code: 'invalid_value' }),
    )
  })

  it('Part6 で空所マーカーが無ければ拒否する', () => {
    const pack = docsSamplePack()
    const q = part6Question()
    q.passages = [{ id: 'p', kind: 'email', text: 'Please renew your plan today.' }]
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].passages[0].text', code: 'invalid_value' }),
    )
  })

  it('Part7 複数パッセージが4件以上なら拒否する', () => {
    const pack = docsSamplePack()
    const q = part7MultiQuestion()
    q.passages = [
      { id: 'p1', kind: 'email', text: 'invoice one' },
      { id: 'p2', kind: 'email', text: 'invoice two' },
      { id: 'p3', kind: 'email', text: 'invoice three' },
      { id: 'p4', kind: 'email', text: 'invoice four' },
    ]
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].passages', code: 'invalid_value' }),
    )
  })

  it('subQuestion の answer 不整合を拒否する', () => {
    const pack = docsSamplePack()
    const q = part7SingleQuestion()
    q.subQuestions![0]!.answer = 'Z'
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'questions[0].subQuestions[0].answer',
        code: 'answer_mismatch',
      }),
    )
  })

  it('keyVocab の word が本文にも設問にも無ければ拒否する', () => {
    const pack = docsSamplePack()
    const q = part7SingleQuestion()
    q.keyVocab = [{ word: 'negotiate', sense: '交渉する', freqRank: 'A' }]
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        path: 'questions[0].keyVocab[0].word',
        code: 'key_vocab_not_found',
      }),
    )
  })

  it('subQuestion の tags が文字列配列でなければ拒否する', () => {
    const pack = docsSamplePack()
    const q = part7MultiQuestion()
    ;(q.subQuestions![0] as unknown as { tags: unknown }).tags = [1, 2]
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].subQuestions[0].tags', code: 'invalid_value' }),
    )
  })

  it('Part7単一で passages/subQuestions の id 重複を拒否する', () => {
    const pack = docsSamplePack()
    const q = part7SingleQuestion()
    q.passages = [
      { id: 'dup', kind: 'notice', text: 'venue A' },
      { id: 'dup', kind: 'notice', text: 'venue B' },
    ]
    pack.questions = [q]
    const result = validatePack(pack)
    expect(result.errors).toContainEqual(
      expect.objectContaining({ path: 'questions[0].passages[1].id', code: 'invalid_value' }),
    )
  })
})
