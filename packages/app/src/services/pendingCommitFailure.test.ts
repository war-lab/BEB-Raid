// T-297: アンマウント時flush失敗の退避（K-23）
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'

import { BebRaidDatabase } from '../db/database'
import {
  clearPendingCommitFailure,
  loadPendingCommitFailure,
  recordPendingCommitFailure,
} from './pendingCommitFailure'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`pending-commit-failure-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('pendingCommitFailure', () => {
  it('記録が無ければloadはnullを返す', async () => {
    const db = newDb()
    expect(await loadPendingCommitFailure(db)).toBeNull()
  })

  it('recordで記録した時刻をloadで読める', async () => {
    const db = newDb()
    await recordPendingCommitFailure(db)
    const loaded = await loadPendingCommitFailure(db)
    expect(loaded).not.toBeNull()
    expect(typeof loaded).toBe('number')
  })

  it('2回連続で失敗しても最新の記録で上書きされる（settings.putは冪等）', async () => {
    const db = newDb()
    await recordPendingCommitFailure(db)
    const first = await loadPendingCommitFailure(db)
    await new Promise((resolve) => setTimeout(resolve, 2))
    await recordPendingCommitFailure(db)
    const second = await loadPendingCommitFailure(db)
    expect(second).toBeGreaterThanOrEqual(first!)
  })

  it('clearで記録が消え、以後loadはnullを返す', async () => {
    const db = newDb()
    await recordPendingCommitFailure(db)
    await clearPendingCommitFailure(db)
    expect(await loadPendingCommitFailure(db)).toBeNull()
  })

  it('記録が無い状態でclearを呼んでも例外にならない（冪等）', async () => {
    const db = newDb()
    await expect(clearPendingCommitFailure(db)).resolves.not.toThrow()
  })
})
