// 初級語彙カード（追加Sランク・600帯。ドッグフィードバック 2026-07-22「問題が難しすぎる」への対応。
// 正本: docs/04 2節・docs/02 4節）。既存 pack-vocab-s-001（会議・経理等のビジネス頻出語）より
// さらに基礎的な、日常＋簡単な職場シーンの高頻度語をそろえた入門パック（銀フレ相当の易しさ）。
//
// 【著作権】市販教材（銀のフレーズ／金のフレーズ等）の見出し語配列・例文は一切参照・転記していない。
// 語の選定・和訳・例文はすべて新規に書き下ろした自作（vocabCardsS.ts と同じ制約）。
// front は既存3パック（S/A/B）の見出し語と重複しないものだけを選び、id 衝突を避けている。
// phraseAudio は生成段階では予約パス（TTSで実音声に差し替えるまで。音声モデル導入が別途必要）。

import type { VocabCardEntry } from './vocabCardsS.js'

export const VOCAB_CARDS_S2: VocabCardEntry[] = [
  { word: 'buy', back: '買う', phrase: 'I want to buy a new laptop for work.' },
  { word: 'sell', back: '売る', phrase: 'This store does not sell tickets on weekends.' },
  { word: 'price', back: '値段', phrase: 'The price of the hotel room includes breakfast.' },
  { word: 'cheap', back: '安い', phrase: 'We found a cheap flight to Osaka.' },
  {
    word: 'expensive',
    back: '高い（値段が）',
    phrase: 'That restaurant is too expensive for lunch.',
  },
  { word: 'open', back: '開ける／開いている', phrase: 'The bank does not open until nine.' },
  { word: 'close', back: '閉める', phrase: 'Please close the window before you leave.' },
  { word: 'early', back: '早い／早く', phrase: 'She arrived early to prepare the room.' },
  { word: 'late', back: '遅れた／遅い', phrase: 'Sorry, I am late because of the train.' },
  { word: 'busy', back: '忙しい', phrase: 'He is too busy to answer the phone now.' },
  { word: 'help', back: '手伝う', phrase: 'Can you help me carry these boxes?' },
  { word: 'need', back: '必要とする', phrase: 'We need more chairs for the meeting.' },
  { word: 'use', back: '使う', phrase: 'You can use this room for the interview.' },
  { word: 'learn', back: '学ぶ', phrase: 'I want to learn how the new system works.' },
  { word: 'teach', back: '教える', phrase: 'She will teach the new staff next week.' },
  { word: 'answer', back: '答える／答え', phrase: 'He could not answer the difficult question.' },
  { word: 'question', back: '質問', phrase: 'Do you have any question about the schedule?' },
  { word: 'problem', back: '問題', phrase: 'There is a small problem with the printer.' },
  { word: 'easy', back: '簡単な', phrase: 'The test was easy for most of the students.' },
  { word: 'difficult', back: '難しい', phrase: 'This report is difficult to finish today.' },
  { word: 'large', back: '大きい', phrase: 'They moved to a large office downtown.' },
  { word: 'small', back: '小さい', phrase: 'We only have a small budget this month.' },
  { word: 'increase', back: '増やす／増える', phrase: 'The company wants to increase its sales.' },
  { word: 'decrease', back: '減らす／減る', phrase: 'Sales began to decrease after the summer.' },
  { word: 'arrive', back: '到着する', phrase: 'The guests will arrive at ten in the morning.' },
  { word: 'return', back: '戻る／返す', phrase: 'Please return the book by Friday.' },
  { word: 'borrow', back: '借りる', phrase: 'May I borrow your pen for a moment?' },
  { word: 'lend', back: '貸す', phrase: 'Could you lend me your umbrella today?' },
  { word: 'choose', back: '選ぶ', phrase: 'You can choose any seat you like.' },
  { word: 'decide', back: '決める', phrase: 'We will decide the date at the meeting.' },
  { word: 'explain', back: '説明する', phrase: 'Let me explain the plan one more time.' },
  { word: 'introduce', back: '紹介する', phrase: 'I would like to introduce our new manager.' },
  { word: 'improve', back: '改善する', phrase: 'The team worked hard to improve the service.' },
  { word: 'prepare', back: '準備する', phrase: 'She needs time to prepare for the presentation.' },
  { word: 'finish', back: '終える', phrase: 'I will finish this task before lunch.' },
  { word: 'begin', back: '始める／始まる', phrase: 'The class will begin in ten minutes.' },
  { word: 'repair', back: '修理する', phrase: 'They came to repair the air conditioner.' },
  { word: 'compare', back: '比べる', phrase: "Let's compare the two plans carefully." },
  { word: 'contain', back: '含む', phrase: 'This box does not contain any documents.' },
  { word: 'provide', back: '提供する', phrase: 'The hotel will provide free parking.' },
  { word: 'receive', back: '受け取る', phrase: 'Did you receive my email yesterday?' },
  { word: 'accept', back: '受け入れる', phrase: 'We are happy to accept your offer.' },
  { word: 'refuse', back: '断る', phrase: 'He decided to refuse the extra work.' },
  { word: 'allow', back: '許可する', phrase: 'The company does not allow pets in the office.' },
  { word: 'avoid', back: '避ける', phrase: 'Try to avoid the busy roads this morning.' },
  { word: 'discuss', back: '話し合う', phrase: 'We will discuss the budget tomorrow.' },
  { word: 'suggest', back: '提案する', phrase: 'I suggest we take a short break now.' },
  { word: 'mention', back: '言及する', phrase: 'He did not mention the price in his email.' },
  { word: 'measure', back: '測る', phrase: 'Please measure the room before you order the desk.' },
  {
    word: 'remain',
    back: '残る／〜のままである',
    phrase: 'A few seats still remain for the event.',
  },
]
