// T-31 完了条件のテスト（オーケストレーション層。モックTtsProviderで実バイナリ不要）:
// - vocab_card/audio_qaは音声を合成し、text_blankはスキップする
// - audio_qaはscriptを設問/応答に分割し、synthesizeDialogueへ渡す
// - 実合成に使ったaccentでaudioMetaを上書きする（生成時のプレースホルダを破棄）
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedItemDraft } from './review.js'
import type { SynthesizeDialogueInput, SynthesizeInput, TtsProvider } from './tts.js'
import { splitDialogueScript, synthesizeDraftsAudio } from './ttsBatch.js'

describe('splitDialogueScript', () => {
  it('em dashで設問と応答に分割する', () => {
    expect(splitDialogueScript('When should I submit? — By Friday.')).toEqual([
      'When should I submit?',
      'By Friday.',
    ])
  })

  it('区切り文字が無ければエラー', () => {
    expect(() => splitDialogueScript('No separator here.')).toThrow()
  })
})

describe('synthesizeDraftsAudio', () => {
  let dir: string
  let fakeProvider: TtsProvider
  let synthesizeCalls: SynthesizeInput[]
  let dialogueCalls: SynthesizeDialogueInput[]

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-tts-batch-'))
    synthesizeCalls = []
    dialogueCalls = []
    fakeProvider = {
      synthesize: vi.fn(async (input: SynthesizeInput) => {
        synthesizeCalls.push(input)
        return { voice: 'fake-voice', durationMs: 1234 }
      }),
      synthesizeDialogue: vi.fn(async (input: SynthesizeDialogueInput) => {
        dialogueCalls.push(input)
        return { voice: 'fake-voice-q+fake-voice-a', durationMs: 4321 }
      }),
    }
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  function vocabDraft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'vocab_card',
      preview: '',
      payload: {
        id,
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
      },
    }
  }

  function part2Draft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'audio_qa',
      preview: '',
      payload: {
        id,
        part: 2,
        format: 'audio_qa',
        difficulty: 2,
        tags: ['疑問詞聞き取り'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/part2/submit.mp3',
        audioMeta: { accent: 'AU', tts: true, voice: 'pending-tts', durationMs: 3000 },
        script: 'When should I submit? — By Friday.',
        choices: [{ key: 'A', text: 'By Friday.' }],
        answer: 'A',
        explanation: '',
        translation: '',
      },
    }
  }

  function part5Draft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'text_blank',
      preview: '',
      payload: {
        id,
        part: 5,
        format: 'text_blank',
        difficulty: 2,
        tags: ['品詞'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        question: 'Please ___ the report.',
        choices: [{ key: 'A', text: 'submit' }],
        answer: 'A',
        explanation: '',
        translation: '',
      },
    }
  }

  it('vocab_cardはphraseをprimaryで合成する', async () => {
    const drafts = [vocabDraft('vocab-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(result.skipped).toBe(0)
    expect(synthesizeCalls).toHaveLength(1)
    expect(synthesizeCalls[0]?.text).toBe('Please submit the report.')
    expect(synthesizeCalls[0]?.role).toBe('primary')
    expect(synthesizeCalls[0]?.outputPath).toBe(join(dir, 'audio/vocab/submit.mp3'))
  })

  it('audio_qaはscriptを設問/応答に分割してsynthesizeDialogueへ渡し、audioMetaを実測値で更新する', async () => {
    const drafts = [part2Draft('part2-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(dialogueCalls).toHaveLength(1)
    expect(dialogueCalls[0]?.questionText).toBe('When should I submit?')
    expect(dialogueCalls[0]?.answerText).toBe('By Friday.')
    expect(dialogueCalls[0]?.outputPath).toBe(join(dir, 'audio/part2/submit.mp3'))

    const updated = result.updatedDrafts[0]!.payload as {
      audioMeta: { accent: string; voice: string; durationMs: number }
    }
    expect(updated.audioMeta.voice).toBe('fake-voice-q+fake-voice-a')
    expect(updated.audioMeta.durationMs).toBe(4321)
    // 生成時のプレースホルダaccent('AU')は実合成に使ったaccentで上書きされる
    expect(updated.audioMeta.accent).not.toBe('AU')
    expect(['US', 'UK']).toContain(updated.audioMeta.accent)
  })

  it('text_blankは音声不要のためスキップする', async () => {
    const drafts = [part5Draft('part5-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(0)
    expect(result.skipped).toBe(1)
    expect(synthesizeCalls).toHaveLength(0)
    expect(dialogueCalls).toHaveLength(0)
    expect(result.updatedDrafts[0]).toEqual(drafts[0])
  })

  it('混在するドラフト一覧を正しく仕分ける', async () => {
    const drafts = [vocabDraft('v-1'), part2Draft('p2-1'), part5Draft('p5-1')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)
    expect(result.synthesized).toBe(2)
    expect(result.skipped).toBe(1)
  })

  it('アクセントはindexでローテーションする（米→英→米→...）', async () => {
    const drafts = [part2Draft('p2-1'), part2Draft('p2-2'), part2Draft('p2-3')]
    await synthesizeDraftsAudio(drafts, fakeProvider, dir)
    expect(dialogueCalls.map((c) => c.accent)).toEqual(['US', 'UK', 'US'])
  })
})
