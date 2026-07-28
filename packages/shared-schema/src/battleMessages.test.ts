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
      participants: [{ displayName: '太郎' }, { displayName: '花子' }],
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
        { displayName: '太郎', totalPoints: 48 },
        { displayName: '花子', totalPoints: 40 },
      ],
    }
    expect(roundTrip(msg)).toEqual(msg)
    expect(isBattleServerMessage(roundTrip(msg))).toBe(true)
  })

  it('result（bestGrowth込み）', () => {
    const msg: BattleResultMessage = {
      type: 'result',
      entries: [
        { displayName: '太郎', totalPoints: 240 },
        { displayName: '花子', totalPoints: 200 },
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
