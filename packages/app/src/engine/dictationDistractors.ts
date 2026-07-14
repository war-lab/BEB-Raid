// ディクテーションのダミー語プール（M2・T-47。正本: docs/13 3.4節）。
// 弱形・混同されやすい機能語の静的リスト。他問題のblanks正解語だけでは
// ワードバンクの6語に満たない場合のフォールバックとして使う

export const DICTATION_DISTRACTOR_POOL: readonly string[] = [
  'would',
  'should',
  'could',
  'them',
  'their',
  'there',
  'for',
  'from',
  'to',
  'too',
  'of',
  'have',
  'has',
  'had',
  'been',
  'being',
  'that',
  'this',
  'these',
  'those',
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
]
