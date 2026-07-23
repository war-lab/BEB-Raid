// T-123完了条件: GhostRecordPayload.consentの構造的強制（型・実行時の両面）テスト
// （docs/22 3.1節・docs/21 J-67。questionStatsのdeviceToken非構造と同じ思想）。
// 型レベルの検証（consentがboolean化されていないこと）はvitestが型検査をしないため
// ここでは検証できず、ghostRecord.ts末尾の型のみの検証（npm run buildで検査される）が担う。
// 本ファイルは実行時側（buildGhostRecordPayloadが未同意を拒否すること）を検証する
import { describe, expect, it } from 'vitest'

import { buildGhostRecordPayload, GHOST_RECORD_PAYLOAD_KEYS } from './ghostRecord.js'
import type { GhostRecordPayload } from './types.js'

describe('GhostRecordPayload: 型としての構築確認', () => {
  it('consent: true のペイロードは型として構築できる（consent: falseはghostRecord.tsの型検査が拒否する）', () => {
    const payload: GhostRecordPayload = {
      consent: true,
      displayName: 'ボス役太郎',
      records: [{ questionId: 'q-1', correct: true }],
    }
    expect(payload.consent).toBe(true)
  })
})

describe('buildGhostRecordPayload: 同意フラグの実行時強制', () => {
  it('consented=falseでは例外を投げ、ペイロードが構築できない', () => {
    expect(() =>
      buildGhostRecordPayload(false, {
        displayName: 'ボス役太郎',
        records: [{ questionId: 'q-1', correct: true }],
      }),
    ).toThrow()
  })

  it('consented=trueではconsent: trueのペイロードが構築できる', () => {
    const payload = buildGhostRecordPayload(true, {
      displayName: 'ボス役太郎',
      records: [{ questionId: 'q-1', correct: false }],
    })

    expect(payload.consent).toBe(true)
    expect(payload.displayName).toBe('ボス役太郎')
    expect(payload.records).toEqual([{ questionId: 'q-1', correct: false }])
  })

  it('出力のキーがconsent/displayName/recordsの3つだけになる', () => {
    const payload = buildGhostRecordPayload(true, {
      displayName: 'ボス役太郎',
      records: [],
    })

    expect(Object.keys(payload).sort()).toEqual([...GHOST_RECORD_PAYLOAD_KEYS].sort())
  })

  it('入力にconsent:falseが混在していても出力のconsentはtrue固定になる（実装ミスの模擬）', () => {
    // GhostRecordPayloadInput型にはconsentフィールドが無いため、呼び出し側が
    // consentを紛れ込ませるにはasキャストが必要になる（構造的強制の証左）
    const contaminatedInput = {
      displayName: 'ボス役太郎',
      records: [],
      consent: false,
    }

    const payload = buildGhostRecordPayload(true, contaminatedInput)
    expect(payload.consent).toBe(true)
  })
})
