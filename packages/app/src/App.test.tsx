// App.tsx は起動時にprofile有無（T-20 P0診断）をチェックし、未診断ならDiagnosticScreen、
// 診断済みなら'home'画面でHomeScreen（T-21）を描画する。どちらも実際にIndexedDBを読むため
// fake-indexeddb が必要
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { getDb } from './db/database'
import { createProfile } from './services/profile'
import { useAppStore } from './store/appStore'

beforeEach(() => {
  useAppStore.setState({ screen: 'home' })
})

afterEach(async () => {
  await getDb().profile.clear()
})

describe('App（配線確認）', () => {
  it('未診断（初回起動）の場合はDiagnosticScreenから始まる', async () => {
    render(<App />)
    expect(await screen.findByText('診断を始める')).toBeTruthy()
  })

  it('診断済みの場合はホーム画面（HomeScreen）を描画できる', async () => {
    await createProfile(getDb(), { displayName: 'てすと', initialToeic: null })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'BEB Raid' })).toBeTruthy()
    expect(screen.getByText('今日のクエスト')).toBeTruthy()
  })
})
