// T-78完了条件のテスト: 完了カードが今日の実施数・ストリーク日数・メッセージを表示する
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CompletionCard } from './CompletionCard'

describe('CompletionCard', () => {
  it('今日の実施数・ストリーク日数・メッセージを表示する', () => {
    render(
      <CompletionCard
        countLabel="今日の実施数 12問"
        streakDays={3}
        message="この調子で続けましょう"
      />,
    )

    expect(screen.getByText('今日の実施数 12問')).toBeTruthy()
    expect(screen.getByText('🔥3')).toBeTruthy()
    expect(screen.getByText('この調子で続けましょう')).toBeTruthy()
  })

  it('ストリーク日数が0のときは炎の表示を出さない', () => {
    render(
      <CompletionCard countLabel="今日の実施数 1問" streakDays={0} message="お疲れさまでした" />,
    )

    expect(screen.queryByText(/🔥/)).toBeNull()
  })
})
