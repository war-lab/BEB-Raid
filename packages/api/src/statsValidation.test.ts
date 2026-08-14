// statsValidation.tsの検証テスト（T-333・K-68）。
// questionIdがパックのID規則（小文字英数字のハイフン区切り）に限定されていることを確認する
import { describe, expect, it } from 'vitest'

import { isQuestionReportPayload, isQuestionStatsRequest } from './statsValidation'

function statPayload(questionId: string) {
  return { questionId, correct: 1, wrong: 0, timeout: 0 }
}

describe('isQuestionStatsRequest: questionIdの形式強制（T-333・K-68）', () => {
  it('実際のパックのquestionId形式（小文字英数字＋ハイフン）は受理される', () => {
    for (const id of [
      'part2-submit',
      'p34-p3-01',
      'similar-account-1',
      'vocab-meeting',
      'dictation-shipment',
      'p6-001-q0', // 読解サブ設問の合成ID
    ]) {
      expect(isQuestionStatsRequest({ stats: [statPayload(id)] })).toBe(true)
    }
  })

  // 何を防ぐか（T-333・K-68）: 旧実装は「1〜200字の非空文字列」しか検証しておらず、
  // question_statsが任意の文字列で無制限に増えうる構造的な弱点だった（bossIdのT-243と同種）
  it('パック規則から外れる形式（大文字・記号・空白・過長）は拒否される', () => {
    expect(isQuestionStatsRequest({ stats: [statPayload('Part2-Submit')] })).toBe(false)
    expect(isQuestionStatsRequest({ stats: [statPayload('part2_submit')] })).toBe(false)
    expect(isQuestionStatsRequest({ stats: [statPayload('part2 submit')] })).toBe(false)
    expect(isQuestionStatsRequest({ stats: [statPayload('../../etc/passwd')] })).toBe(false)
    expect(isQuestionStatsRequest({ stats: [statPayload('a'.repeat(101))] })).toBe(false)
    expect(isQuestionStatsRequest({ stats: [statPayload('')] })).toBe(false)
  })
})

describe('isQuestionReportPayload: questionIdの形式強制（T-333・K-68）', () => {
  it('妥当な形式は受理され、不正な形式は拒否される', () => {
    expect(isQuestionReportPayload({ questionId: 'part2-submit', reason: 'unnatural' })).toBe(true)
    expect(isQuestionReportPayload({ questionId: 'Part2 Submit!', reason: 'unnatural' })).toBe(
      false,
    )
  })
})
