// T-32 完了条件のテスト:
// - ダミー4種相当のパック（語彙/Part2/Part5系）のビルド→manifest生成
// - license欠落パック混入でビルド（buildAllPacks）が失敗し、部分取込しない
// - ハッシュがコンテンツ変更で変わり、無変更で安定している
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Question } from '@beb-raid/shared-schema'
import {
  buildAllPacks,
  buildManifest,
  buildPack,
  scanAudioFiles,
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
    explanation: '',
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
