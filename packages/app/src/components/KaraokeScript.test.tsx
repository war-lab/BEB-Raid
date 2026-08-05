// Q-61（docs/29 8節・docs/30 フェーズ6 T-223）: シャドーイングの文リピート用要素は
// `<span role="button" tabIndex={0}>` で、ネイティブbuttonと違いEnter/SpaceではonClickが
// 発火しない。区間リピートがキーボードだけでは操作できない不具合の再発防止テスト。
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KaraokeScript } from './KaraokeScript'

function renderScript(onSentenceTap: (...args: unknown[]) => void) {
  return render(
    <KaraokeScript
      script="Hello world. This is a test."
      timing={null}
      positionMs={0}
      durationMs={1000}
      onSentenceTap={onSentenceTap}
    />,
  )
}

describe('KaraokeScript: 区間リピートのキーボード操作（Q-61）', () => {
  it('Enterキーで onSentenceTap が発火する', () => {
    const onSentenceTap = vi.fn()
    renderScript(onSentenceTap)
    const sentence = screen.getAllByRole('button')[0]!
    fireEvent.keyDown(sentence, { key: 'Enter' })
    expect(onSentenceTap).toHaveBeenCalledTimes(1)
  })

  it('Spaceキーで onSentenceTap が発火する', () => {
    const onSentenceTap = vi.fn()
    renderScript(onSentenceTap)
    const sentence = screen.getAllByRole('button')[0]!
    fireEvent.keyDown(sentence, { key: ' ' })
    expect(onSentenceTap).toHaveBeenCalledTimes(1)
  })

  it('Enter/Space以外のキーでは発火しない', () => {
    const onSentenceTap = vi.fn()
    renderScript(onSentenceTap)
    const sentence = screen.getAllByRole('button')[0]!
    fireEvent.keyDown(sentence, { key: 'a' })
    fireEvent.keyDown(sentence, { key: 'Tab' })
    expect(onSentenceTap).not.toHaveBeenCalled()
  })

  it('クリックでも引き続き発火する（既存挙動の回帰防止）', () => {
    const onSentenceTap = vi.fn()
    renderScript(onSentenceTap)
    const sentence = screen.getAllByRole('button')[0]!
    fireEvent.click(sentence)
    expect(onSentenceTap).toHaveBeenCalledTimes(1)
  })
})
