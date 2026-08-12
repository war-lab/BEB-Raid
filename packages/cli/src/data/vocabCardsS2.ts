// 初級語彙カード（追加Sランク・600帯。ドッグフィードバック 2026-07-22「問題が難しすぎる」への対応。
// 正本: docs/04 2節・docs/02 4節）。既存 pack-vocab-s-001（会議・経理等のビジネス頻出語）より
// さらに基礎的な、日常＋簡単な職場シーンの高頻度語をそろえた入門パック（銀フレ相当の易しさ）。
//
// 【著作権】市販教材（銀のフレーズ／金のフレーズ等）の見出し語配列・例文は一切参照・転記していない。
// 語の選定・和訳・例文はすべて新規に書き下ろした自作（vocabCardsS.ts と同じ制約）。
// front は既存3パック（S/A/B）の見出し語と重複しないものだけを選び、id 衝突を避けている。
// phraseAudio の実音声は生成済み（Piper。content/audio/vocab/<word>.mp3）。人手目視レビューは未実施。

import type { VocabCardEntry } from './vocabCardsS.js'

export const VOCAB_CARDS_S2: VocabCardEntry[] = [
  { word: 'buy', tags: ['基礎語彙'], back: '買う', phrase: 'I want to buy a new laptop for work.' },
  {
    word: 'sell',
    tags: ['基礎語彙'],
    back: '売る',
    phrase: 'This store does not sell tickets on weekends.',
  },
  {
    word: 'price',
    tags: ['基礎語彙'],
    back: '値段',
    phrase: 'The price of the hotel room includes breakfast.',
  },
  { word: 'cheap', tags: ['基礎語彙'], back: '安い', phrase: 'We found a cheap flight to Osaka.' },
  {
    word: 'expensive',
    tags: ['基礎語彙'],
    back: '高い（値段が）',
    phrase: 'That restaurant is too expensive for lunch.',
  },
  {
    word: 'open',
    tags: ['基礎語彙'],
    back: '開く／開ける',
    phrase: 'The bank does not open until nine.',
  },
  {
    word: 'close',
    tags: ['基礎語彙'],
    back: '閉める',
    phrase: 'Please close the window before you leave.',
  },
  {
    word: 'early',
    tags: ['基礎語彙'],
    back: '早い／早く',
    phrase: 'She arrived early to prepare the room.',
  },
  {
    word: 'late',
    tags: ['基礎語彙'],
    back: '遅れた／遅い',
    phrase: 'Sorry, I am late because of the train.',
  },
  {
    word: 'busy',
    tags: ['基礎語彙'],
    back: '忙しい',
    phrase: 'He is too busy to answer the phone now.',
  },
  {
    word: 'help',
    tags: ['基礎語彙'],
    back: '手伝う',
    phrase: 'Can you help me carry these boxes?',
  },
  {
    word: 'need',
    tags: ['基礎語彙'],
    back: '必要とする',
    phrase: 'We need more chairs for the meeting.',
  },
  {
    word: 'use',
    tags: ['基礎語彙'],
    back: '使う',
    phrase: 'You can use this room for the interview.',
  },
  {
    word: 'learn',
    tags: ['基礎語彙'],
    back: '学ぶ',
    phrase: 'I want to learn how the new system works.',
  },
  {
    word: 'teach',
    tags: ['基礎語彙'],
    back: '教える',
    phrase: 'She will teach the new staff next week.',
  },
  {
    word: 'answer',
    tags: ['基礎語彙'],
    back: '答える／答え',
    phrase: 'He could not answer the difficult question.',
  },
  {
    word: 'question',
    tags: ['基礎語彙'],
    back: '質問',
    phrase: 'Do you have a question about the schedule?',
  },
  {
    word: 'problem',
    tags: ['基礎語彙'],
    back: '問題',
    phrase: 'There is a small problem with the printer.',
  },
  {
    word: 'easy',
    tags: ['基礎語彙'],
    back: '簡単な',
    phrase: 'The test was easy for most of the students.',
  },
  {
    word: 'difficult',
    tags: ['基礎語彙'],
    back: '難しい',
    phrase: 'This report is difficult to finish today.',
  },
  {
    word: 'large',
    tags: ['基礎語彙'],
    back: '大きい',
    phrase: 'They moved to a large office downtown.',
  },
  {
    word: 'small',
    tags: ['基礎語彙'],
    back: '小さい',
    phrase: 'We only have a small budget this month.',
  },
  {
    word: 'increase',
    tags: ['基礎語彙'],
    back: '増やす／増える',
    phrase: 'The company wants to increase its sales.',
  },
  {
    word: 'decrease',
    tags: ['基礎語彙'],
    back: '減らす／減る',
    phrase: 'Sales began to decrease after the summer.',
  },
  {
    word: 'arrive',
    tags: ['基礎語彙'],
    back: '到着する',
    phrase: 'The guests will arrive at ten in the morning.',
  },
  {
    word: 'return',
    tags: ['基礎語彙'],
    back: '戻る／返す',
    phrase: 'Please return the book by Friday.',
  },
  {
    word: 'borrow',
    tags: ['基礎語彙'],
    back: '借りる',
    phrase: 'May I borrow your pen for a moment?',
  },
  {
    word: 'lend',
    tags: ['基礎語彙'],
    back: '貸す',
    phrase: 'Could you lend me your umbrella today?',
  },
  { word: 'choose', tags: ['基礎語彙'], back: '選ぶ', phrase: 'You can choose any seat you like.' },
  {
    word: 'decide',
    tags: ['基礎語彙'],
    back: '決める',
    phrase: 'We will decide the date at the meeting.',
  },
  {
    word: 'explain',
    tags: ['基礎語彙'],
    back: '説明する',
    phrase: 'Let me explain the plan one more time.',
  },
  {
    word: 'introduce',
    tags: ['基礎語彙'],
    back: '紹介する',
    phrase: 'I would like to introduce our new manager.',
  },
  {
    word: 'improve',
    tags: ['基礎語彙'],
    back: '改善する',
    phrase: 'The team worked hard to improve the service.',
  },
  {
    word: 'prepare',
    tags: ['基礎語彙'],
    back: '準備する',
    phrase: 'She needs time to prepare for the presentation.',
  },
  {
    word: 'finish',
    tags: ['基礎語彙'],
    back: '終える',
    phrase: 'I will finish this task before lunch.',
  },
  {
    word: 'begin',
    tags: ['基礎語彙'],
    back: '始める／始まる',
    phrase: 'The class will begin in ten minutes.',
  },
  {
    word: 'repair',
    tags: ['基礎語彙'],
    back: '修理する',
    phrase: 'They came to repair the air conditioner.',
  },
  {
    word: 'compare',
    tags: ['基礎語彙'],
    back: '比べる',
    phrase: "Let's compare the two plans carefully.",
  },
  {
    word: 'contain',
    tags: ['基礎語彙'],
    back: '含む',
    phrase: 'This box does not contain any documents.',
  },
  {
    word: 'provide',
    tags: ['基礎語彙'],
    back: '提供する',
    phrase: 'The hotel will provide free parking.',
  },
  {
    word: 'receive',
    tags: ['基礎語彙'],
    back: '受け取る',
    phrase: 'Did you receive my email yesterday?',
  },
  {
    word: 'accept',
    tags: ['基礎語彙'],
    back: '受け入れる',
    phrase: 'We are happy to accept your offer.',
  },
  {
    word: 'refuse',
    tags: ['基礎語彙'],
    back: '断る',
    phrase: 'He decided to refuse the extra work.',
  },
  {
    word: 'allow',
    tags: ['基礎語彙'],
    back: '許可する',
    phrase: 'The company does not allow pets in the office.',
  },
  {
    word: 'avoid',
    tags: ['基礎語彙'],
    back: '避ける',
    phrase: 'Try to avoid the busy roads this morning.',
  },
  {
    word: 'discuss',
    tags: ['基礎語彙'],
    back: '話し合う',
    phrase: 'We will discuss the budget tomorrow.',
  },
  {
    word: 'suggest',
    tags: ['基礎語彙'],
    back: '提案する',
    phrase: 'I suggest we take a short break now.',
  },
  {
    word: 'mention',
    tags: ['基礎語彙'],
    back: '言及する',
    phrase: 'He did not mention the price in his email.',
  },
  {
    word: 'measure',
    tags: ['基礎語彙'],
    back: '測る',
    phrase: 'Please measure the room before you order the desk.',
  },
  {
    word: 'remain',
    tags: ['基礎語彙'],
    back: '残る／〜のままである',
    phrase: 'A few seats still remain for the event.',
  },
]
