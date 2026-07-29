// T-31 完了条件のテスト（オーケストレーション層。モックTtsProviderで実バイナリ不要）:
// - vocab_card/audio_qaは音声を合成し、text_blankはスキップする
// - audio_qaはscriptを設問/応答に分割し、synthesizeDialogueへ渡す
// - 実合成に使ったaccentでaudioMetaを上書きする（生成時のプレースホルダを破棄）
// M2・T-64 完了条件のテスト:
// - parseDialogueTurnsがPart3（A:/B:形式）を交互ターンに、Part4（話者ラベル無し）を1ターンに分解する
// - audio_setはPart3=synthesizeMultiTurnDialogue、Part4=synthesizeに振り分ける
// - dictationはscriptを1話者（primary）で合成する
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { part2ResponsesDigest, type Question } from '@beb-raid/shared-schema'
import type { GeneratedItemDraft } from './review.js'
import type {
  SynthesizeDialogueInput,
  SynthesizeInput,
  SynthesizeMultiTurnInput,
  SynthesizePart2WithResponsesInput,
  TtsProvider,
} from './tts.js'
import {
  parseDialogueTurns,
  part2ResponseTexts,
  splitDialogueScript,
  synthesizeDraftsAudio,
} from './ttsBatch.js'

describe('parseDialogueTurns（M2・T-64）', () => {
  it('Part3の"A: ... B: ..."形式を交互ターン（primary/secondary）に分解する', () => {
    const turns = parseDialogueTurns(
      'A: Do you have a minute? B: Sure, what is it? A: Could we reschedule?',
    )
    expect(turns).toEqual([
      { text: 'Do you have a minute?', role: 'primary' },
      { text: 'Sure, what is it?', role: 'secondary' },
      { text: 'Could we reschedule?', role: 'primary' },
    ])
  })

  it('話者ラベルが無いPart4のトークは1ターン（primary）として扱う', () => {
    const turns = parseDialogueTurns('Attention all passengers, the gate has changed.')
    expect(turns).toEqual([
      { text: 'Attention all passengers, the gate has changed.', role: 'primary' },
    ])
  })
})

describe('part2ResponseTexts（T-152）', () => {
  function q(choices: Question['choices']): Question {
    return {
      id: 'q',
      part: 2,
      format: 'audio_qa',
      difficulty: 2,
      tags: [],
      keyVocab: [],
      choices,
    }
  }

  it('key 昇順で応答テキストを返す（配列順に依存しない）', () => {
    expect(
      part2ResponseTexts(
        q([
          { key: 'C', text: 'c' },
          { key: 'A', text: 'a' },
          { key: 'B', text: 'b' },
        ]),
      ),
    ).toEqual(['a', 'b', 'c'])
  })

  it('選択肢が2件未満なら null（従来合成へフォールバックさせる）', () => {
    expect(part2ResponseTexts(q([{ key: 'A', text: 'a' }]))).toBeNull()
    expect(part2ResponseTexts(q(null))).toBeNull()
  })

  it('key か text が空の異常データなら null', () => {
    expect(
      part2ResponseTexts(
        q([
          { key: 'A', text: 'a' },
          { key: 'B', text: '  ' },
        ]),
      ),
    ).toBeNull()
  })
})

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
  let multiTurnCalls: SynthesizeMultiTurnInput[]
  let part2Calls: SynthesizePart2WithResponsesInput[]

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'beb-tts-batch-'))
    synthesizeCalls = []
    dialogueCalls = []
    multiTurnCalls = []
    part2Calls = []
    fakeProvider = {
      synthesize: vi.fn(async (input: SynthesizeInput) => {
        synthesizeCalls.push(input)
        return { voice: 'fake-voice', durationMs: 1234 }
      }),
      synthesizeDialogue: vi.fn(async (input: SynthesizeDialogueInput) => {
        dialogueCalls.push(input)
        return { voice: 'fake-voice-q+fake-voice-a', durationMs: 4321, questionEndMs: 2500 }
      }),
      synthesizeMultiTurnDialogue: vi.fn(async (input: SynthesizeMultiTurnInput) => {
        multiTurnCalls.push(input)
        return { voice: 'fake-voice-multi', durationMs: 9999 }
      }),
      synthesizePart2WithResponses: vi.fn(async (input: SynthesizePart2WithResponsesInput) => {
        part2Calls.push(input)
        return {
          voice: 'fake-voice-q+fake-voice-a',
          durationMs: 12000,
          questionEndMs: 2500,
          responseOffsetsMs: [2700, 5400, 8100],
        }
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

  function shadowingDraft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'shadowing',
      preview: '',
      payload: {
        id,
        part: 3,
        format: 'shadowing',
        difficulty: 2,
        tags: [],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/shadow/submit.mp3',
        audioMeta: { accent: 'AU', tts: true, voice: 'pending-tts', durationMs: 0 },
        script: 'Please submit the report by Friday.',
        timing: null,
      },
    }
  }

  function audioSetPart3Draft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'audio_set',
      preview: '',
      payload: {
        id,
        part: 3,
        format: 'audio_set',
        difficulty: 2,
        tags: [],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/part34/p3-01.mp3',
        audioMeta: { accent: 'AU', tts: true, voice: 'pending-tts', durationMs: 0 },
        script: 'A: Please submit it today. B: Sure, I will submit it now.',
        subQuestions: [
          {
            id: `${id}-q1`,
            question: 'What does A ask B to do?',
            choices: [{ key: 'A', text: 'Submit it today' }],
            answer: 'A',
          },
        ],
      },
    }
  }

  function audioSetPart4Draft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'audio_set',
      preview: '',
      payload: {
        id,
        part: 4,
        format: 'audio_set',
        difficulty: 2,
        tags: [],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/part34/p4-01.mp3',
        audioMeta: { accent: 'AU', tts: true, voice: 'pending-tts', durationMs: 0 },
        script: 'Please submit your report by the end of the day.',
        subQuestions: [
          {
            id: `${id}-q1`,
            question: 'What is the speaker asking listeners to do?',
            choices: [{ key: 'A', text: 'Submit a report' }],
            answer: 'A',
          },
        ],
      },
    }
  }

  function dictationDraft(id: string): GeneratedItemDraft {
    return {
      id,
      kind: 'dictation',
      preview: '',
      payload: {
        id,
        part: 2,
        format: 'dictation',
        difficulty: 2,
        tags: ['弱形・連結'],
        keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
        audio: 'audio/dictation/submit.mp3',
        audioMeta: { accent: 'AU', tts: true, voice: 'pending-tts', durationMs: 0 },
        script: 'Please submit the report by Friday.',
        blanks: [{ index: 1, answer: 'submit' }],
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

  it('回帰: 選択肢が1件しかないaudio_qaは従来のsynthesizeDialogueへフォールバックする', async () => {
    const drafts = [part2Draft('part2-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(dialogueCalls).toHaveLength(1)
    expect(dialogueCalls[0]?.questionText).toBe('When should I submit?')
    expect(dialogueCalls[0]?.answerText).toBe('By Friday.')
    expect(dialogueCalls[0]?.outputPath).toBe(join(dir, 'audio/part2/submit.mp3'))

    const updated = result.updatedDrafts[0]!.payload as {
      audioMeta: { accent: string; voice: string; durationMs: number; questionEndMs?: number }
    }
    expect(updated.audioMeta.voice).toBe('fake-voice-q+fake-voice-a')
    expect(updated.audioMeta.durationMs).toBe(4321)
    // 質問部終端（正答リーク対策）がproviderの実測値からaudioMetaへ記録される
    expect(updated.audioMeta.questionEndMs).toBe(2500)
    // 生成時のプレースホルダaccent('AU')は実合成に使ったaccentで上書きされる
    expect(updated.audioMeta.accent).not.toBe('AU')
    expect(['US', 'UK']).toContain(updated.audioMeta.accent)
    // 音声のみモード非対応（応答音声が無い）ため、両フィールドを付けない
    expect(part2Calls).toHaveLength(0)
    expect((updated.audioMeta as { responseOffsetsMs?: unknown }).responseOffsetsMs).toBeUndefined()
    expect(
      (updated.audioMeta as { responsesTextDigest?: unknown }).responsesTextDigest,
    ).toBeUndefined()
  })

  // T-152: 音声のみモード（本試験形式）用に3応答すべてを連結する
  it('選択肢が3件あるaudio_qaは3応答を連結し、responseOffsetsMs と digest を書き戻す', async () => {
    const draft = part2Draft('part2-submit')
    const payload = draft.payload as Question
    // key の並びをわざと逆順にして、読み上げ順が key 昇順で固定されることを確かめる
    payload.choices = [
      { key: 'C', text: 'Yes, I already did.' },
      { key: 'B', text: 'To the accounting office.' },
      { key: 'A', text: 'By Friday.' },
    ]
    const result = await synthesizeDraftsAudio([draft], fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(dialogueCalls).toHaveLength(0)
    expect(part2Calls).toHaveLength(1)
    expect(part2Calls[0]?.questionText).toBe('When should I submit?')
    // key 昇順（A→B→C）で渡す
    expect(part2Calls[0]?.responseTexts).toEqual([
      'By Friday.',
      'To the accounting office.',
      'Yes, I already did.',
    ])
    expect(part2Calls[0]?.outputPath).toBe(join(dir, 'audio/part2/submit.mp3'))

    const updated = result.updatedDrafts[0]!.payload as Question
    expect(updated.audioMeta?.durationMs).toBe(12000)
    expect(updated.audioMeta?.questionEndMs).toBe(2500)
    expect(updated.audioMeta?.responseOffsetsMs).toEqual([2700, 5400, 8100])
    // digestは choices から再計算される（後編集の検出に使う）
    expect(updated.audioMeta?.responsesTextDigest).toBe(part2ResponsesDigest(payload.choices!))
  })

  it('shadowingはscriptをprimaryで合成し、audioMetaとtiming（単語開始ms配列）を実測値から更新する', async () => {
    const drafts = [shadowingDraft('shadow-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(synthesizeCalls).toHaveLength(1)
    expect(synthesizeCalls[0]?.text).toBe('Please submit the report by Friday.')
    expect(synthesizeCalls[0]?.role).toBe('primary')
    expect(synthesizeCalls[0]?.outputPath).toBe(join(dir, 'audio/shadow/submit.mp3'))

    const updated = result.updatedDrafts[0]!.payload as {
      audioMeta: { accent: string; voice: string; durationMs: number }
      timing: number[]
      script: string
    }
    expect(updated.audioMeta.voice).toBe('fake-voice')
    expect(updated.audioMeta.durationMs).toBe(1234)
    expect(['US', 'UK']).toContain(updated.audioMeta.accent)
    expect(updated.timing).toHaveLength(updated.script.split(/\s+/).length)
    expect(updated.timing[0]).toBe(0)
    for (let i = 1; i < updated.timing.length; i++) {
      expect(updated.timing[i]).toBeGreaterThanOrEqual(updated.timing[i - 1]!)
    }
    expect(updated.timing.at(-1)!).toBeLessThanOrEqual(1234)
  })

  it('audio_set（Part3・複数ターン）はsynthesizeMultiTurnDialogueへ渡し、audioMetaを実測値で更新する', async () => {
    const drafts = [audioSetPart3Draft('p34-p3-01')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(multiTurnCalls).toHaveLength(1)
    expect(multiTurnCalls[0]?.turns).toEqual([
      { text: 'Please submit it today.', role: 'primary' },
      { text: 'Sure, I will submit it now.', role: 'secondary' },
    ])
    expect(multiTurnCalls[0]?.outputPath).toBe(join(dir, 'audio/part34/p3-01.mp3'))

    const updated = result.updatedDrafts[0]!.payload as {
      audioMeta: { accent: string; voice: string; durationMs: number }
    }
    expect(updated.audioMeta.voice).toBe('fake-voice-multi')
    expect(updated.audioMeta.durationMs).toBe(9999)
    expect(updated.audioMeta.accent).not.toBe('AU')
  })

  it('audio_set（Part4・単独トーク）はsynthesizeへ渡す（1ターンのため通常合成）', async () => {
    const drafts = [audioSetPart4Draft('p34-p4-01')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(multiTurnCalls).toHaveLength(0)
    expect(synthesizeCalls).toHaveLength(1)
    expect(synthesizeCalls[0]?.text).toBe('Please submit your report by the end of the day.')
    expect(synthesizeCalls[0]?.role).toBe('primary')
    expect(synthesizeCalls[0]?.outputPath).toBe(join(dir, 'audio/part34/p4-01.mp3'))
  })

  it('dictationはscriptをprimaryで合成し、audioMetaを実測値で更新する', async () => {
    const drafts = [dictationDraft('dictation-submit')]
    const result = await synthesizeDraftsAudio(drafts, fakeProvider, dir)

    expect(result.synthesized).toBe(1)
    expect(synthesizeCalls).toHaveLength(1)
    expect(synthesizeCalls[0]?.text).toBe('Please submit the report by Friday.')
    expect(synthesizeCalls[0]?.role).toBe('primary')
    expect(synthesizeCalls[0]?.outputPath).toBe(join(dir, 'audio/dictation/submit.mp3'))

    const updated = result.updatedDrafts[0]!.payload as {
      audioMeta: { accent: string; voice: string; durationMs: number }
    }
    expect(updated.audioMeta.voice).toBe('fake-voice')
    expect(updated.audioMeta.durationMs).toBe(1234)
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
