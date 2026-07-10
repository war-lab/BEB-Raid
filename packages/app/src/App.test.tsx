// App.tsx は 'home' 画面で HomeScreen（T-21）を描画し、実際に IndexedDB を読む
// （evaluateStreak/getStreak/getSrsQueue）ため fake-indexeddb が必要
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App（配線確認）', () => {
  it('ホーム画面（HomeScreen）を描画できる', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'BEB Raid' })).toBeTruthy()
    expect(screen.getByText('今日のクエスト')).toBeTruthy()
  })
})
