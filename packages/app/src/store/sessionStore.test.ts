// セッション進行ストアの単体テスト（T-264。29の11節「テスト空白地帯」）。
// 何を防ぐか: begin/resetのフィールド網羅漏れ。このストアは新しい起動オプション
// （partialAudioMode・audioOnlyPart2・isGhostBossSessionのように後から増えてきた）が
// 追加されるたびに begin() と reset() の両方を更新する必要があるが、片方だけ更新して
// reset() 側を忘れると、次のセッション開始時に前回セッションの値が漏れ残る
// （例: 前回ボス役セッションのisGhostBossSessionがtrueのまま次の通常セッションへ持ち越され、
// ResultScreenの代わりにGhostBossResultScreenへ誤って振り分けられる）。
//
// 「フィールドを型で列挙する」テストは書けない（型は実行時に消える）ため、
// 関数値を除いた state 全体を toEqual で比較する。これにより将来フィールドが
// 追加されたときも、このテストの期待値を更新しない限り必ず失敗し、
// reset() の更新漏れをその場で検出する。

import type { Question } from '@beb-raid/shared-schema'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SessionSnapshot } from '../services/session'
import { useSessionStore } from './sessionStore'

/** 関数値（アクション）を除いた、比較対象のデータ部分だけを取り出す */
function dataState() {
  const state = useSessionStore.getState()
  return Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function'),
  )
}

const DEFAULT_DATA_STATE = {
  snapshot: null,
  questions: new Map(),
  results: [],
  ratingBefore: null,
  partialAudioMode: false,
  audioOnlyPart2: false,
  skippedCount: 0,
  isGhostBossSession: false,
}

function snapshot(sessionId: string): SessionSnapshot {
  return {
    sessionId,
    items: [{ questionId: 'q-1', mode: 'solo' }],
    answeredCount: 0,
    attemptIds: [],
    subAnswers: [],
    startedAt: 0,
    updatedAt: 0,
  }
}

function question(id: string): Question {
  return {
    id,
    part: 5,
    format: 'text_blank',
    difficulty: 1,
    tags: [],
    keyVocab: [],
    question: 'Please ___ it.',
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submits' },
    ],
    answer: 'A',
    explanation: '解説',
    translation: '和訳',
  }
}

beforeEach(() => {
  useSessionStore.getState().reset()
})

describe('sessionStore', () => {
  it('初期状態は既定値である', () => {
    expect(dataState()).toEqual(DEFAULT_DATA_STATE)
  })

  it('beginはoptionsを省略すると、任意フィールドをすべて既定値（false）にする', () => {
    useSessionStore.getState().begin(snapshot('s-1'), [question('q-1')], { L: 400, R: 400 })

    const state = useSessionStore.getState()
    expect(state.partialAudioMode).toBe(false)
    expect(state.audioOnlyPart2).toBe(false)
    expect(state.isGhostBossSession).toBe(false)
  })

  it('beginはoptionsで渡した任意フィールドをすべて反映する', () => {
    useSessionStore.getState().begin(
      snapshot('s-1'),
      [question('q-1')],
      { L: 500, R: 450 },
      {
        partialAudioMode: true,
        audioOnlyPart2: true,
        isGhostBossSession: true,
      },
    )

    const state = useSessionStore.getState()
    expect(state.snapshot?.sessionId).toBe('s-1')
    expect(state.questions.get('q-1')).toBeDefined()
    expect(state.ratingBefore).toEqual({ L: 500, R: 450 })
    expect(state.partialAudioMode).toBe(true)
    expect(state.audioOnlyPart2).toBe(true)
    expect(state.isGhostBossSession).toBe(true)
    // 前回セッションの結果・スキップ数は必ずクリアされる（新セッションへ持ち越さない）
    expect(state.results).toEqual([])
    expect(state.skippedCount).toBe(0)
  })

  it('reset()はbeginで設定した全フィールド・recordAnswer/incrementSkippedで変化した全フィールドを既定値へ戻す', () => {
    // 起動オプションをすべてtrueにし、resultsとskippedCountも変化させた
    // 「汚れた」状態を作る。ここから reset() で完全に既定値へ戻ることを検証する
    useSessionStore.getState().begin(
      snapshot('s-1'),
      [question('q-1')],
      { L: 600, R: 600 },
      {
        partialAudioMode: true,
        audioOnlyPart2: true,
        isGhostBossSession: true,
      },
    )
    useSessionStore
      .getState()
      .recordAnswer(snapshot('s-1'), { questionId: 'q-1', isCorrect: true, basePoints: 10 })
    useSessionStore.getState().incrementSkipped()
    useSessionStore.getState().incrementSkipped()

    // 汚れた状態であることの前提確認（この前提が崩れるとreset()の効果を検証できない）
    expect(dataState()).not.toEqual(DEFAULT_DATA_STATE)

    useSessionStore.getState().reset()

    // 関数値を除くstate全体を既定値と突き合わせる。将来フィールドが増えても、
    // このテストの期待値（DEFAULT_DATA_STATE）を更新しない限り必ず不一致で失敗するため、
    // reset()側の更新漏れを機械的に検出できる
    expect(dataState()).toEqual(DEFAULT_DATA_STATE)
  })

  it('recordAnswerはsnapshotを差し替え、resultsに追記する（他のフィールドは変えない）', () => {
    useSessionStore.getState().begin(snapshot('s-1'), [question('q-1')], { L: 400, R: 400 })
    const advanced = { ...snapshot('s-1'), answeredCount: 1 }

    useSessionStore
      .getState()
      .recordAnswer(advanced, { questionId: 'q-1', isCorrect: false, basePoints: 0 })

    const state = useSessionStore.getState()
    expect(state.snapshot).toBe(advanced)
    expect(state.results).toEqual([{ questionId: 'q-1', isCorrect: false, basePoints: 0 }])
    expect(state.ratingBefore).toEqual({ L: 400, R: 400 })
  })

  it('incrementSkippedはskippedCountだけを増やし、他のフィールドは変えない', () => {
    useSessionStore.getState().begin(snapshot('s-1'), [question('q-1')], { L: 400, R: 400 })

    useSessionStore.getState().incrementSkipped()
    useSessionStore.getState().incrementSkipped()

    const state = useSessionStore.getState()
    expect(state.skippedCount).toBe(2)
    expect(state.snapshot?.sessionId).toBe('s-1')
    expect(state.results).toEqual([])
  })
})
