// T-299（K-25）: 保存失敗の原因判別
import { describe, expect, it } from 'vitest'

import { isQuotaExceededError } from './storageErrors'

describe('isQuotaExceededError', () => {
  it('name===QuotaExceededErrorのDOMExceptionを検知する', () => {
    expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true)
  })

  it('name===QuotaExceededErrorを持つ通常のErrorも検知する（Dexieのラップ後を模擬）', () => {
    const err = new Error('quota')
    err.name = 'QuotaExceededError'
    expect(isQuotaExceededError(err)).toBe(true)
  })

  it('他の名前のエラーは検知しない', () => {
    expect(isQuotaExceededError(new Error('boom'))).toBe(false)
    expect(isQuotaExceededError(new DOMException('x', 'InvalidStateError'))).toBe(false)
  })

  it('Error以外の値（文字列・undefined等）は検知しない', () => {
    expect(isQuotaExceededError('boom')).toBe(false)
    expect(isQuotaExceededError(undefined)).toBe(false)
    expect(isQuotaExceededError(null)).toBe(false)
  })
})
