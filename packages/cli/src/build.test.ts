// T-32 完了条件のテスト:
// - ダミー4種相当のパック（語彙/Part2/Part5系）のビルド→manifest生成
// - license欠落パック混入でビルド（buildAllPacks）が失敗し、部分取込しない
// - ハッシュがコンテンツ変更で変わり、無変更で安定している
// T-34 完了条件: applyCorrectionsで実測補正値がdifficulty/freqRankに反映される
// M2・T-63 完了条件: explanation品質の機械検証（存在・最低文字数・実テキスト引用）が
// buildPackに組み込まれている
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import type { CorrectionsFile } from './calibrate.js'
import {
  applyCorrections,
  buildAllPacks,
  buildManifest,
  buildPack,
  scanAudioFiles,
  scanImageFiles,
  validateExplanationQuality,
  type PackSource,
} from './build.js'

function vocabQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'vocab-submit',
    part: 0,
    format: 'vocab_card',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    front: 'submit',
    phrase: 'Please submit the report.',
    phraseAudio: 'audio/vocab/submit.mp3',
    back: '提出する',
    freqRank: 'S',
    levelBand: 600,
    ...overrides,
  }
}

function part2Question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'part2-submit',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: 'audio/part2/submit.mp3',
    audioMeta: { accent: 'US', tts: true, voice: 'piper:en_US-lessac-medium', durationMs: 3000 },
    script: 'When should I submit it? — By Friday.',
    choices: [
      { key: 'A', text: 'By Friday.' },
      { key: 'B', text: 'Yes, I did.' },
    ],
    answer: 'A',
    explanation: '"By Friday."が正解。締め切りを尋ねる疑問文への具体的な回答になっている。',
    translation: '',
    ...overrides,
  }
}

function source(overrides: Partial<PackSource> = {}): PackSource {
  return {
    id: 'pack-vocab-s-001',
    title: '語彙カード テスト用',
    license: 'internal-original',
    origin: 'テストフィクスチャ',
    targetLevel: [600, 600],
    questions: [vocabQuestion()],
    ...overrides,
  }
}

const AUDIO_FILES = new Set(['audio/vocab/submit.mp3', 'audio/part2/submit.mp3'])

describe('buildPack', () => {
  it('妥当なパックはbuilt済みQuestionPackを返す（sizeBytes・16文字ハッシュが入る）', () => {
    const { built, errors } = buildPack(source(), AUDIO_FILES)
    expect(errors).toEqual([])
    expect(built).not.toBeNull()
    expect(built!.pack.pack.sizeBytes).toBeGreaterThan(0)
    expect(built!.hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it('licenseが不正だとbuilt=nullでエラーにpack idが含まれる', () => {
    const { built, errors } = buildPack(source({ license: 'unknown-license' }), AUDIO_FILES)
    expect(built).toBeNull()
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toContain('pack-vocab-s-001')
  })

  it('参照する音声ファイルが実在しないとエラーになる', () => {
    const { built, errors } = buildPack(
      source({ questions: [part2Question({ audio: 'audio/part2/not-found.mp3' })] }),
      AUDIO_FILES,
    )
    expect(built).toBeNull()
    expect(errors.some((e) => e.includes('not-found.mp3'))).toBe(true)
  })

  it('ハッシュはコンテンツが同じなら安定し、変われば変化する', () => {
    const a = buildPack(source(), AUDIO_FILES).built!
    const b = buildPack(source(), AUDIO_FILES).built!
    expect(a.hash).toBe(b.hash)

    const c = buildPack(
      source({ questions: [vocabQuestion({ phrase: 'Different phrase entirely.' })] }),
      AUDIO_FILES,
    ).built!
    expect(c.hash).not.toBe(a.hash)
  })

  it('explanationが空・短すぎる・選択肢記号のみだとbuilt=nullでエラーになる（M2・T-63）', () => {
    const missing = buildPack(
      source({ questions: [part2Question({ explanation: '' })] }),
      AUDIO_FILES,
    )
    expect(missing.built).toBeNull()
    expect(missing.errors.some((e) => e.includes('explanationが空'))).toBe(true)

    const tooShort = buildPack(
      source({ questions: [part2Question({ explanation: '短い' })] }),
      AUDIO_FILES,
    )
    expect(tooShort.built).toBeNull()
    expect(tooShort.errors.some((e) => e.includes('短すぎる'))).toBe(true)

    const bareLetter = buildPack(
      source({ questions: [part2Question({ explanation: 'Aが正解' })] }),
      AUDIO_FILES,
    )
    expect(bareLetter.built).toBeNull()
    expect(bareLetter.errors.some((e) => e.includes('実テキストの引用がない'))).toBe(true)
  })

  it('vocab_card/shadowingはexplanationが無くても検証対象外', () => {
    const { built, errors } = buildPack(source({ questions: [vocabQuestion()] }), AUDIO_FILES)
    expect(errors).toEqual([])
    expect(built).not.toBeNull()
  })
})

describe('validateExplanationQuality（M2・T-63）', () => {
  it('audio_setはsubQuestion単位で検証する', () => {
    const question: Question = {
      id: 'p34-test',
      part: 3,
      format: 'audio_set',
      difficulty: 2,
      tags: [],
      keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
      audio: 'audio/part34/test.mp3',
      audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
      script: 'A: Please submit the report. B: Sure, I will.',
      subQuestions: [
        {
          id: 'p34-test-q1',
          question: 'What does A ask B to do?',
          choices: [
            { key: 'A', text: 'Submit the report' },
            { key: 'B', text: 'Cancel the meeting' },
          ],
          answer: 'A',
          explanation: '',
        },
      ],
    }
    const problems = validateExplanationQuality([question])
    expect(problems.some((p) => p.includes('p34-test-q1'))).toBe(true)
  })

  it('妥当なexplanationは問題なしと判定する', () => {
    expect(validateExplanationQuality([part2Question()])).toEqual([])
  })

  // T-107回帰: text_passage（Part6/7）もaudio_set同様subQuestions構造だが、
  // buildPack側の判定にformatを追加し忘れるとq.explanation（存在しない）を見て
  // 常にエラー無しと誤判定する（またはトップレベル欠落として誤検出する）バグを防ぐ
  it('text_passageはsubQuestion単位で検証する', () => {
    const question: Question = {
      id: 'p6-test',
      part: 6,
      format: 'text_passage',
      difficulty: 2,
      tags: [],
      keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
      passages: [{ id: 'p6-test-doc1', kind: 'email', text: 'Subject: Test [[1]]' }],
      subQuestions: [
        {
          id: 'p6-test-q1',
          question: 'Which word best fits blank (1)?',
          choices: [
            { key: 'A', text: 'submit' },
            { key: 'B', text: 'cancel' },
          ],
          answer: 'A',
          explanation: '',
        },
      ],
    }
    const problems = validateExplanationQuality([question])
    expect(problems.some((p) => p.includes('p6-test-q1'))).toBe(true)
  })
})

describe('buildAllPacks', () => {
  it('全パックが妥当なら全件built、errorsは空', () => {
    const sources = [
      source(),
      source({
        id: 'pack-p2-s-001',
        title: 'Part2 テスト用',
        questions: [part2Question()],
      }),
    ]
    const { built, errors } = buildAllPacks(sources, AUDIO_FILES)
    expect(errors).toEqual([])
    expect(built).toHaveLength(2)
  })

  it('1パックでもエラーがあれば全体を失敗させる（部分取込なし）', () => {
    const sources = [
      source(),
      source({ id: 'pack-p2-s-001', license: '', questions: [part2Question()] }),
    ]
    const { built, errors } = buildAllPacks(sources, AUDIO_FILES)
    expect(built).toEqual([])
    expect(errors.length).toBeGreaterThan(0)
  })
})

describe('buildManifest', () => {
  it('built一覧からManifestPackEntry群を組み立てる', () => {
    const { built } = buildAllPacks(
      [source(), source({ id: 'pack-p2-s-001', questions: [part2Question()] })],
      AUDIO_FILES,
    )
    const manifest = buildManifest(built)
    expect(manifest.packs).toHaveLength(2)
    for (const entry of manifest.packs) {
      expect(entry.hash).toMatch(/^[0-9a-f]{16}$/)
      expect(entry.sizeBytes).toBeGreaterThan(0)
    }
    expect(manifest.packs.map((p) => p.id)).toEqual(['pack-vocab-s-001', 'pack-p2-s-001'])
  })
})

describe('scanAudioFiles', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-build-audio-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('audio配下を再帰的に列挙し、contentRoot基準の相対パス（/区切り）を返す', async () => {
    await mkdir(join(dir, 'audio/vocab'), { recursive: true })
    await mkdir(join(dir, 'audio/part2'), { recursive: true })
    await writeFile(join(dir, 'audio/vocab/submit.mp3'), 'dummy')
    await writeFile(join(dir, 'audio/part2/submit.mp3'), 'dummy')

    const files = await scanAudioFiles(dir)
    expect(files).toEqual(new Set(['audio/vocab/submit.mp3', 'audio/part2/submit.mp3']))
  })

  it('audioディレクトリが無ければ空集合を返す（text_blankのみのパック等）', async () => {
    const files = await scanAudioFiles(dir)
    expect(files.size).toBe(0)
  })
})

// T-239（Q-82）: image（audio_photo）は実ファイル存在チェックの対象外だった
// （audioFilesはaudio/phraseAudioのみを列挙していたため）。scanImageFilesで
// images/配下を列挙し、buildPack/buildAllPacksに渡せるようにする
describe('scanImageFiles（T-239・Q-82）', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-build-image-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('images配下を再帰的に列挙し、contentRoot基準の相対パス（/区切り）を返す', async () => {
    await mkdir(join(dir, 'images/part1'), { recursive: true })
    await writeFile(join(dir, 'images/part1/q-0001.jpg'), 'dummy')

    const files = await scanImageFiles(dir)
    expect(files).toEqual(new Set(['images/part1/q-0001.jpg']))
  })

  it('imagesディレクトリが無ければ空集合を返す（現状の全パックがこの経路）', async () => {
    const files = await scanImageFiles(dir)
    expect(files.size).toBe(0)
  })
})

describe('buildPack: audio_photoのimage存在チェック（T-239・Q-82）', () => {
  function audioPhotoQuestion(overrides: Partial<Question> = {}): Question {
    return {
      id: 'p1-photo-001',
      part: 1,
      format: 'audio_photo',
      difficulty: 1,
      tags: [],
      keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
      audio: 'audio/part1/photo-001.mp3',
      audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
      script: 'A man is submitting a report.',
      image: 'images/part1/photo-001.jpg',
      choices: [
        { key: 'A', text: 'A man is submitting a report.' },
        { key: 'B', text: 'A man is filing a form.' },
      ],
      answer: 'A',
      explanation: '"submitting a report"が写真の内容と一致する。',
      ...overrides,
    }
  }

  it('imageFilesを渡すと、一覧に無いimageを参照するパックはbuilt=nullになる', () => {
    const audioFiles = new Set(['audio/part1/photo-001.mp3'])
    const imageFiles = new Set(['images/part1/other.jpg'])
    const { built, errors } = buildPack(
      source({ questions: [audioPhotoQuestion()] }),
      audioFiles,
      imageFiles,
    )
    expect(built).toBeNull()
    expect(errors.some((e) => e.includes('photo-001.jpg'))).toBe(true)
  })

  it('imageFilesに実ファイルがあれば通る', () => {
    const audioFiles = new Set(['audio/part1/photo-001.mp3'])
    const imageFiles = new Set(['images/part1/photo-001.jpg'])
    const { built, errors } = buildPack(
      source({ questions: [audioPhotoQuestion()] }),
      audioFiles,
      imageFiles,
    )
    expect(errors).toEqual([])
    expect(built).not.toBeNull()
  })

  it('imageFiles未指定なら存在チェックはスキップされる（従来どおり）', () => {
    const audioFiles = new Set(['audio/part1/photo-001.mp3'])
    const { built, errors } = buildPack(source({ questions: [audioPhotoQuestion()] }), audioFiles)
    expect(errors).toEqual([])
    expect(built).not.toBeNull()
  })
})

describe('applyCorrections（T-34）', () => {
  function part2Question(overrides: Partial<Question> = {}): Question {
    return {
      id: 'part2-submit',
      part: 2,
      format: 'audio_qa',
      difficulty: 3,
      tags: ['疑問詞聞き取り'],
      keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'B' }],
      audio: 'audio/part2/submit.mp3',
      audioMeta: { accent: 'US', tts: true, voice: 'piper:test', durationMs: 3000 },
      script: 'When should I submit it? — By Friday.',
      choices: [
        { key: 'A', text: 'By Friday.' },
        { key: 'B', text: 'Yes, I did.' },
      ],
      answer: 'A',
      explanation: '',
      translation: '',
      ...overrides,
    }
  }

  it('correctionsが無ければsourcesをそのまま返す', () => {
    const sources: PackSource[] = [source({ questions: [part2Question()] })]
    const result = applyCorrections(sources, null)
    expect(result).toEqual(sources)
  })

  it('questionIdが一致する問題のdifficultyを上書きする', () => {
    const sources: PackSource[] = [source({ questions: [part2Question({ difficulty: 3 })] })]
    const corrections: CorrectionsFile = {
      schemaVersion: 1,
      generatedAt: 0,
      questionDifficulty: { 'part2-submit': 4 },
      wordFreqRank: {},
    }
    const result = applyCorrections(sources, corrections)
    expect(result[0]?.questions[0]?.difficulty).toBe(4)
  })

  it('keyVocabのwordが一致すればfreqRankを上書きする', () => {
    const sources: PackSource[] = [source({ questions: [part2Question()] })]
    const corrections: CorrectionsFile = {
      schemaVersion: 1,
      generatedAt: 0,
      questionDifficulty: {},
      wordFreqRank: { submit: 'S' },
    }
    const result = applyCorrections(sources, corrections)
    expect(result[0]?.questions[0]?.keyVocab[0]?.freqRank).toBe('S')
  })

  it('vocab_card自体のfreqRankもfrontの一致で上書きする', () => {
    const sources: PackSource[] = [source({ questions: [vocabQuestion({ freqRank: 'B' })] })]
    const corrections: CorrectionsFile = {
      schemaVersion: 1,
      generatedAt: 0,
      questionDifficulty: {},
      wordFreqRank: { submit: 'S' },
    }
    const result = applyCorrections(sources, corrections)
    expect(result[0]?.questions[0]?.freqRank).toBe('S')
  })

  it('元のsources配列・オブジェクトを書き換えない（純粋関数）', () => {
    const original = part2Question({ difficulty: 3 })
    const sources: PackSource[] = [source({ questions: [original] })]
    applyCorrections(sources, {
      schemaVersion: 1,
      generatedAt: 0,
      questionDifficulty: { 'part2-submit': 5 },
      wordFreqRank: {},
    })
    expect(original.difficulty).toBe(3)
  })
})
