// T-20 完了条件のテスト（profileサービス層）:
// - createProfile後はhasProfileがtrueになる（初回起動判定）
// - 未作成時はfalse
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import { createProfile, hasProfile } from './profile'

let seq = 0
const dbs: BebRaidDatabase[] = []

function newDb(): BebRaidDatabase {
  const db = new BebRaidDatabase(`profile-service-test-${++seq}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((db) => db.delete()))
})

describe('hasProfile / createProfile', () => {
  it('profile未作成時はfalse', async () => {
    const db = newDb()
    expect(await hasProfile(db)).toBe(false)
  })

  it('createProfile後はtrueになり、deviceTokenが発行される', async () => {
    const db = newDb()
    const record = await createProfile(db, { displayName: 'てすと', initialToeic: 650 })
    expect(await hasProfile(db)).toBe(true)
    expect(record.id).toBe(PROFILE_ID)
    expect(record.displayName).toBe('てすと')
    expect(record.initialToeic).toBe(650)
    expect(record.deviceToken.length).toBeGreaterThan(0)
  })

  it('自己申告なし（initialToeic=null）でも作成できる', async () => {
    const db = newDb()
    const record = await createProfile(db, { displayName: 'てすと2', initialToeic: null })
    expect(record.initialToeic).toBeNull()
  })
})
