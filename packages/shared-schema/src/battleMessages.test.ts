// T-123完了条件③: イベントバトルWebSocketメッセージのJSON往復＋未知typeの判別テスト
// （docs/22 3.1節・3.2節）
import { describe, expect, it } from 'vitest'

import {
  isBattleClientMessage,
  isBattleCloseReason,
  isBattleServerMessage,
} from './battleMessages.js'
import type {
  BattleAnswerMessage,
  BattleClientMessage,
  BattleCloseQuestionMessage,
  BattleErrorMessage,
  BattleFinishMessage,
  BattleJoinMessage,
  BattleOpenQuestionMessage,
  BattleQuestionOpenMessage,
  BattleResultMessage,
  BattleRoomStateMessage,
  BattleServerMessage,
  BattleStandingsMessage,
} from './types.js'

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('BattleClientMessage: JSON往復', () => {
  it('join', () => {
    const msg: BattleJoinMessage = {
      type: 'join',
      displayName: '太郎',
      expectedPointsPerQuestion: 40,
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleClientMessage(roundTrip(msg))).toBe(true)
  })

  it('answer', () => {
    const msg: BattleAnswerMessage = { type: 'answer', questionIndex: 2, points: 0 }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleClientMessage(roundTrip(msg))).toBe(true)
  })

  it('openQuestion（ホスト専用）', () => {
    const msg: BattleOpenQuestionMessage = {
      type: 'openQuestion',
      questionIndex: 0,
      questionId: 'q-101',
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleClientMessage(roundTrip(msg))).toBe(true)
  })

  it('closeQuestion（ホスト専用）', () => {
    const msg: BattleCloseQuestionMessage = { type: 'closeQuestion', questionIndex: 0 }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleClientMessage(roundTrip(msg))).toBe(true)
  })

  it('finish（ホスト専用）', () => {
    const msg: BattleFinishMessage = { type: 'finish' }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleClientMessage(roundTrip(msg))).toBe(true)
  })
})

describe('BattleServerMessage: JSON往復', () => {
  it('roomState', () => {
    const msg: BattleRoomStateMessage = {
      type: 'roomState',
      participants: [
        { displayName: '太郎', connected: true },
        { displayName: '花子', connected: false },
      ],
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })

  it('questionOpen', () => {
    const msg: BattleQuestionOpenMessage = {
      type: 'questionOpen',
      questionIndex: 0,
      questionId: 'q-101',
      deadlineAt: 1_700_000_030_000,
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })

  it('standings', () => {
    const msg: BattleStandingsMessage = {
      type: 'standings',
      entries: [
        { displayName: '太郎', totalPoints: 48, connected: true },
        { displayName: '花子', totalPoints: 40, connected: false },
      ],
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })

  it('result（bestGrowth込み）', () => {
    const msg: BattleResultMessage = {
      type: 'result',
      entries: [
        { displayName: '太郎', totalPoints: 240, connected: true },
        { displayName: '花子', totalPoints: 200, connected: false },
      ],
      bestGrowth: { displayName: '花子' },
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })

  it('error', () => {
    const msg: BattleErrorMessage = { type: 'error', code: 'unregistered' }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })
})

describe('未知typeの判別（discriminated unionの受信側ガード）', () => {
  it('未知のtypeを持つClientメッセージ相当のJSONはisBattleClientMessageでfalseになる', () => {
    const unknownMessage = { type: 'sabotage', payload: 'x' }
    expect(isBattleClientMessage(unknownMessage)).toBe(false)
  })

  it('未知のtypeを持つServerメッセージ相当のJSONはisBattleServerMessageでfalseになる', () => {
    const unknownMessage = { type: 'sabotage', payload: 'x' }
    expect(isBattleServerMessage(unknownMessage)).toBe(false)
  })

  it('typeフィールドが無いJSONはどちらの判別関数もfalseになる', () => {
    const noType = { displayName: '太郎' }
    expect(isBattleClientMessage(noType)).toBe(false)
    expect(isBattleServerMessage(noType)).toBe(false)
  })

  it('Server専用type（roomState）はisBattleClientMessageではfalseになる（役割の取り違え検出）', () => {
    const serverMessage: BattleServerMessage = { type: 'roomState', participants: [] }
    expect(isBattleClientMessage(serverMessage)).toBe(false)
  })

  it('Client専用type（join）はisBattleServerMessageではfalseになる（役割の取り違え検出）', () => {
    const clientMessage: BattleClientMessage = {
      type: 'join',
      displayName: '太郎',
      expectedPointsPerQuestion: 40,
    }
    expect(isBattleServerMessage(clientMessage)).toBe(false)
  })

  it('nullや文字列などtype以前に構造がおかしい値もfalseになる', () => {
    expect(isBattleClientMessage(null)).toBe(false)
    expect(isBattleClientMessage('join')).toBe(false)
    expect(isBattleServerMessage(undefined)).toBe(false)
  })
})

describe('isBattleClientMessage: ペイロード検証（T-182・Q-19）', () => {
  // 修正前は type しか見ていないため、下記はいずれも誤って true になっていた
  // （29の所見Q-19: 得点を任意値で送れる／表示名が無制限）
  it('answer.points が負数のメッセージは拒否する', () => {
    expect(isBattleClientMessage({ type: 'answer', questionIndex: 0, points: -1 })).toBe(false)
  })

  it('answer.points が NaN のメッセージは拒否する', () => {
    expect(isBattleClientMessage({ type: 'answer', questionIndex: 0, points: Number.NaN })).toBe(
      false,
    )
  })

  it('answer.points が文字列のメッセージは拒否する', () => {
    expect(isBattleClientMessage({ type: 'answer', questionIndex: 0, points: '999' })).toBe(false)
  })

  it('answer.points が桁違いに大きいメッセージは拒否する', () => {
    expect(
      isBattleClientMessage({ type: 'answer', questionIndex: 0, points: Number.MAX_SAFE_INTEGER }),
    ).toBe(false)
  })

  it('answer.questionIndex が負数・非数のメッセージは拒否する', () => {
    expect(isBattleClientMessage({ type: 'answer', questionIndex: -1, points: 10 })).toBe(false)
    expect(isBattleClientMessage({ type: 'answer', questionIndex: 'x', points: 10 })).toBe(false)
  })

  it('join.displayName が空文字のメッセージは拒否する', () => {
    expect(
      isBattleClientMessage({ type: 'join', displayName: '', expectedPointsPerQuestion: 10 }),
    ).toBe(false)
  })

  it('join.displayName が上限を超えるメッセージは拒否する', () => {
    expect(
      isBattleClientMessage({
        type: 'join',
        displayName: 'あ'.repeat(1000),
        expectedPointsPerQuestion: 10,
      }),
    ).toBe(false)
  })

  it('join.expectedPointsPerQuestion が数値でないメッセージは拒否する', () => {
    expect(
      isBattleClientMessage({
        type: 'join',
        displayName: '太郎',
        expectedPointsPerQuestion: 'たくさん',
      }),
    ).toBe(false)
  })

  it('openQuestion.questionIndex／questionId が不正なメッセージは拒否する', () => {
    expect(
      isBattleClientMessage({ type: 'openQuestion', questionIndex: -1, questionId: 'q-1' }),
    ).toBe(false)
    expect(isBattleClientMessage({ type: 'openQuestion', questionIndex: 0, questionId: '' })).toBe(
      false,
    )
    expect(isBattleClientMessage({ type: 'openQuestion', questionIndex: 0, questionId: 123 })).toBe(
      false,
    )
  })

  it('closeQuestion.questionIndex が不正なメッセージは拒否する', () => {
    expect(isBattleClientMessage({ type: 'closeQuestion', questionIndex: -1 })).toBe(false)
    expect(isBattleClientMessage({ type: 'closeQuestion', questionIndex: 'x' })).toBe(false)
  })

  it('正当な値の各メッセージは引き続き true になる（回帰防止）', () => {
    expect(
      isBattleClientMessage({ type: 'join', displayName: '太郎', expectedPointsPerQuestion: 40 }),
    ).toBe(true)
    expect(isBattleClientMessage({ type: 'answer', questionIndex: 2, points: 0 })).toBe(true)
    expect(
      isBattleClientMessage({ type: 'openQuestion', questionIndex: 0, questionId: 'q-101' }),
    ).toBe(true)
    expect(isBattleClientMessage({ type: 'closeQuestion', questionIndex: 0 })).toBe(true)
    expect(isBattleClientMessage({ type: 'finish' })).toBe(true)
  })
})

describe('isBattleCloseReason', () => {
  it('サーバーが付与する既知の切断理由はtrueになる', () => {
    expect(isBattleCloseReason('unauthorized')).toBe(true)
    expect(isBattleCloseReason('room_not_found')).toBe(true)
    expect(isBattleCloseReason('room_closed')).toBe(true)
  })

  it('通信断（理由なし＝空文字）や未知の理由はfalseになる', () => {
    expect(isBattleCloseReason('')).toBe(false)
    expect(isBattleCloseReason('something_unexpected')).toBe(false)
  })
})
