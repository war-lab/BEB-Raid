import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App（配線確認）', () => {
  it('shared-schema の定数を参照して描画できる', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'BEB Raid' })).toBeTruthy()
    expect(screen.getByText(/パックスキーマ v2/)).toBeTruthy()
  })
})
