// Part7複数パッセージ（text_passage）2〜3文書＋設問5問の初期在庫データ本体
// （T-144。正本: docs/24 3.1節・3.4節・3.6節）。
//
// 各設問はcorrectText/distractorsの形で書き、textPassageQuestion.tsの
// rotateTextPassageChoicesが4択A〜Dへの決定的ローテーションを行う
// （part7SinglePassagesS.ts / part34SetsS.ts と同じM1レビュー⑦の方式）。
//
// keyVocabWordsはS/A/B語彙カード（600語）から選び、passages本文またはsubQuestionsの
// question/choicesに実在する語のみを使う（shared-schema validate.tsのvalidateKeyVocab参照）。
//
// tagsはdocs/24 3.4節の読解解法タグ。**複数パッセージでは 'cross-reference' が主役**で、
// 「どの設問が文書の突き合わせを要求するか」は各subQuestionの crossReference フラグで示す
// （セット単位のtagsとは別。docs/24 3.1節）。
//
// 全文・設問はエージェント直接執筆のオリジナル（市販教材の流用なし。CLAUDE.mdの不変条件）。
// 人物名・社名は架空のものを使う。
//
// 【配信ゲート】本データから生成したドラフトは beb review-export → 人手レビュー（H-R1）→
// review-import を経て初めて build.ts の PACK_DEFINITIONS へ追加してよい
// （ADR 0006 判断5。AIクロスレビューでの代替を認めない）。本ファイル追加時点では
// PACK_DEFINITIONS 未追加＝配信対象外である。
//
// 【在庫の現状】docs/24 3.6節の目標は15セット（75問）。本ファイルは第1バッチの5セット
// （25問）で、残り10セットは追記で足す（型・生成器・検証は在庫数に依存しない）。

import type { Part7MultiRawEntry } from '../textPassageQuestion.js'

export const PART7_MULTI_ENTRIES_S: Part7MultiRawEntry[] = [
  {
    setId: 'p7m-001',
    difficulty: 4,
    tags: ['cross-reference', 'スキャン', '推論'],
    keyVocabWords: ['invoice', 'deadline'],
    passages: [
      {
        kind: 'email',
        text: 'Subject: Outstanding Invoice #4821\n\nDear Mr. Tanaka,\n\nOur records show that invoice #4821, issued on March 3 for consulting services in February, has not yet been paid. The original deadline was March 31. The total amount due is $4,800.\n\nIf payment has already been sent, please disregard this message. Otherwise, we would appreciate settlement by April 15. Payments made after that date are subject to a two percent late fee.\n\nPlease note that our banking details changed on April 1. The updated account information is listed on our website under "Billing".\n\nSincerely,\nRuth Mbeki\nAccounts Receivable, Halden Consulting',
      },
      {
        kind: 'email',
        text: 'Subject: RE: Outstanding Invoice #4821\n\nDear Ms. Mbeki,\n\nThank you for the reminder. I checked with our finance department this morning. The payment was submitted on March 28, but it was sent to the account listed on the invoice itself.\n\nCould you confirm whether that transfer reached you? If it did not, we will arrange a second transfer to the updated account this week. We would like to avoid the late fee you mentioned, since the original payment was made before the stated deadline.\n\nBest regards,\nKenji Tanaka\nOperations, Sanwa Foods',
      },
    ],
    subQuestions: [
      {
        question: 'What is the purpose of the first email?',
        correctText: 'To request payment for a service already provided',
        distractors: [
          'To announce a change in consulting fees',
          'To confirm that a payment has been received',
          'To offer a discount on future services',
        ],
        explanation:
          '1通目は2月の業務に対する請求が未払いであると伝え、支払いを求める内容である。料金改定・入金確認・割引の案内ではない。',
        translation: '1通目のメールの目的は何ですか。',
      },
      {
        question: 'According to the first email, what happened on April 1?',
        correctText: "The company's banking details changed",
        distractors: [
          'A late fee was added to the invoice',
          'The consulting services were completed',
          'The invoice was issued to Mr. Tanaka',
        ],
        explanation:
          '1通目に「our banking details changed on April 1」と明記されている。延滞料は4月15日以降、業務は2月、請求書発行は3月3日。',
        translation: '1通目のメールによると、4月1日に何が起きましたか。',
      },
      {
        question: 'Why does Mr. Tanaka believe the late fee should not apply?',
        correctText: 'His company sent the payment before the original deadline',
        distractors: [
          'He was never informed about the invoice',
          'The consulting work was finished late',
          'He has already paid the two percent fee',
        ],
        explanation:
          '2通目で「the original payment was made before the stated deadline」と述べている。1通目の期限は3月31日で、送金は3月28日である。',
        translation: 'Tanakaさんはなぜ延滞料が適用されるべきでないと考えていますか。',
        crossReference: true,
      },
      {
        question: 'What problem is suggested by the two emails together?',
        correctText: 'The payment may have been sent to an account that is no longer used',
        distractors: [
          'The invoice was issued for the wrong amount',
          'Mr. Tanaka never received the original invoice',
          'The consulting services were never delivered',
        ],
        explanation:
          '1通目で口座が4月1日に変わったと伝えられ、2通目では請求書記載の口座へ3月28日に送金したとある。旧口座へ送られた可能性が問題である。',
        translation: '2通のメールから示唆される問題は何ですか。',
        crossReference: true,
      },
      {
        question: 'What does Mr. Tanaka ask Ms. Mbeki to do?',
        correctText: 'Verify whether the earlier transfer arrived',
        distractors: [
          'Send a revised invoice with a new total',
          'Extend the deadline by two additional weeks',
          'Provide a receipt for the late fee',
        ],
        explanation:
          '2通目で「Could you confirm whether that transfer reached you?」と依頼している。請求書の再発行・期限延長・領収書の要求ではない。',
        translation: 'TanakaさんはMbekiさんに何をするよう求めていますか。',
      },
    ],
  },
  {
    setId: 'p7m-002',
    difficulty: 4,
    tags: ['cross-reference', '先読み', 'スキャン'],
    keyVocabWords: ['attend', 'budget'],
    passages: [
      {
        kind: 'notice',
        text: 'Riverside Community Center — Spring Workshop Series\n\nAll workshops are held in the Maple Room and last ninety minutes.\n\nSaturday, May 4, 10:00 a.m. — Introduction to Container Gardening (Instructor: Dana Whitfield)\nSaturday, May 11, 10:00 a.m. — Basic Home Repairs (Instructor: Luis Ferrero)\nSaturday, May 18, 2:00 p.m. — Digital Photography for Beginners (Instructor: Amara Osei)\nSaturday, May 25, 2:00 p.m. — Everyday Cooking on a Budget (Instructor: Dana Whitfield)\n\nMembers pay $12 per workshop; non-members pay $20. Registration closes three days before each session. Space is limited to twenty participants.',
      },
      {
        kind: 'email',
        text: 'Subject: Workshop on the 18th\n\nHello,\n\nI would like to attend the photography workshop later this month. I am not a member of the community center, but my partner is, and we would both like to register.\n\nOne question about the schedule: I finish work at 1:30 p.m. on Saturdays and the center is a twenty-minute walk from my office. Will latecomers still be admitted? I would rather not take a seat if arriving a few minutes late means missing the introduction.\n\nThank you,\nPriya Raman',
      },
    ],
    subQuestions: [
      {
        question: 'What is indicated about the workshop series?',
        correctText: 'Each session is the same length',
        distractors: [
          'All sessions begin at the same hour',
          'Each session is taught by a different instructor',
          'Sessions are held on weekdays',
        ],
        explanation:
          '掲示に「last ninety minutes」と全共通で書かれている。開始時刻は10時と14時があり、Whitfieldは2回担当し、開催は土曜である。',
        translation: 'ワークショップ series について何が示されていますか。',
      },
      {
        question: 'By when must someone register for the May 18 workshop?',
        correctText: 'May 15',
        distractors: ['May 11', 'May 17', 'May 18'],
        explanation:
          '「Registration closes three days before each session」より、5月18日の3日前＝5月15日である。',
        translation: '5月18日のワークショップにはいつまでに登録する必要がありますか。',
      },
      {
        question: 'How much will Ms. Raman most likely pay for the workshop she wants to attend?',
        correctText: '$20',
        distractors: ['$12', '$32', '$40'],
        explanation:
          'Ramanさんはメールで非会員だと述べており、掲示の非会員料金は20ドルである。パートナーは会員だが、支払うのは本人分。',
        translation: 'Ramanさんが参加したいワークショップにいくら支払うと考えられますか。',
        crossReference: true,
      },
      {
        question: 'What concern does Ms. Raman raise about the session she selected?',
        correctText: 'She may arrive after it has started',
        distractors: [
          'The room may be too small for her group',
          'The instructor may change before the session',
          'The fee may increase for non-members',
        ],
        explanation:
          '仕事が13時30分に終わり徒歩20分かかるため、14時開始の回に遅れる可能性を心配している。',
        translation: 'Ramanさんは選んだ回についてどんな懸念を示していますか。',
        crossReference: true,
      },
      {
        question: 'Who teaches more than one workshop in the series?',
        correctText: 'Dana Whitfield',
        distractors: ['Luis Ferrero', 'Amara Osei', 'Priya Raman'],
        explanation: '掲示で5月4日と5月25日の2回をWhitfieldが担当している。',
        translation: 'このシリーズで2回以上担当している講師は誰ですか。',
      },
    ],
  },
  {
    setId: 'p7m-003',
    difficulty: 5,
    tags: ['cross-reference', '推論', 'パラフレーズ照合'],
    keyVocabWords: ['budget', 'approve'],
    passages: [
      {
        kind: 'email',
        text: 'Subject: Q3 Equipment Requests\n\nTeam leads,\n\nPlease submit your equipment requests for the third quarter by June 20. Each department has been allocated a budget of $9,000. Requests above that amount require written justification and will be reviewed by the finance committee, which meets on the first Monday of each month.\n\nAs a reminder, laptop replacements on a three-year cycle do not count against your departmental budget; they are handled centrally. Furniture, software licenses, and specialized tools do count.\n\nThank you,\nHelen Vos\nDirector of Operations',
      },
      {
        kind: 'form',
        text: 'Q3 Equipment Request — Design Department\nSubmitted by: Omar Haddad\nDate: June 18\n\n1. Two graphics tablets — $2,400\n2. Color-calibrated monitor — $1,900\n3. Annual license, illustration software (4 seats) — $3,200\n4. Replacement laptop for M. Chen (purchased 2022) — $1,700\n5. Adjustable desk — $1,100\n\nTotal listed: $10,300\n\nNote: Item 4 is a scheduled replacement.',
      },
      {
        kind: 'email',
        text: 'Subject: RE: Q3 Equipment Requests — Design\n\nOmar,\n\nThank you for submitting early. I have reviewed your form and one item does not belong in the departmental total, so the amount charged to your budget is lower than the figure you listed. As it stands, your request does not need to go to the committee.\n\nI will approve it today. Please hold the desk order until July 1, when the new quarter opens.\n\nHelen',
      },
    ],
    subQuestions: [
      {
        question: 'What is the main purpose of the first email?',
        correctText: 'To explain how to submit requests for the coming quarter',
        distractors: [
          'To announce an increase in departmental budgets',
          'To report the results of a finance committee meeting',
          'To introduce a new laptop replacement cycle',
        ],
        explanation:
          '1通目は提出期限・予算枠・超過時の扱いを説明する案内である。増額の告知・委員会の結果報告・新方針の導入ではない。',
        translation: '1通目のメールの主な目的は何ですか。',
      },
      {
        question: 'Which item on the form does NOT count against the design department budget?',
        correctText: 'The replacement laptop',
        distractors: [
          'The color-calibrated monitor',
          'The illustration software license',
          'The adjustable desk',
        ],
        explanation:
          '1通目に「laptop replacements on a three-year cycle do not count against your departmental budget」とあり、フォームの項目4は予定された交換である。',
        translation: 'フォームのどの項目が設計部門の予算に計上されませんか。',
        crossReference: true,
      },
      {
        question: 'What amount will actually be charged to the design department?',
        correctText: '$8,600',
        distractors: ['$10,300', '$9,000', '$7,500'],
        explanation:
          'フォームの合計10,300ドルからノートPC交換の1,700ドルを除くと8,600ドルで、予算9,000ドル以内に収まる。',
        translation: '設計部門に実際に計上される金額はいくらですか。',
        crossReference: true,
      },
      {
        question: 'Why does Ms. Vos say the request will not go to the committee?',
        correctText: 'The chargeable total stays within the allocated budget',
        distractors: [
          'The request was submitted before the deadline',
          'The committee does not meet during the third quarter',
          'Mr. Haddad provided written justification',
        ],
        explanation:
          '委員会審査は予算超過時の手続きである。除外項目を差し引くと枠内に収まるため審査が不要になる。早期提出や理由書は条件ではない。',
        translation: 'Vosさんはなぜこの申請が委員会に回らないと述べていますか。',
        crossReference: true,
      },
      {
        question: 'What does Ms. Vos ask Mr. Haddad to postpone?',
        correctText: 'Ordering the desk',
        distractors: [
          'Submitting the request form',
          'Replacing Mr. Chen’s laptop',
          'Renewing the software license',
        ],
        explanation:
          '3通目で「Please hold the desk order until July 1」と依頼している。他の項目の延期には触れていない。',
        translation: 'VosさんはHaddadさんに何を延期するよう求めていますか。',
      },
    ],
  },
  {
    setId: 'p7m-004',
    difficulty: 4,
    tags: ['cross-reference', 'スキャン', '語彙推測'],
    keyVocabWords: ['confirm', 'meeting'],
    passages: [
      {
        kind: 'advertisement',
        text: 'Northgate Serviced Offices — Now Leasing\n\nSuite A — 45 sq m, second floor, no window. $1,400/month.\nSuite B — 60 sq m, third floor, corner windows. $2,050/month.\nSuite C — 60 sq m, first floor, street entrance. $1,850/month.\nSuite D — 95 sq m, third floor, corner windows. $2,900/month.\n\nAll suites include high-speed internet, weekly cleaning, and access to two shared meeting rooms. Parking is available for an extra $90 per space per month. Minimum lease: twelve months. Suites on the third floor are reached by stairs only.',
      },
      {
        kind: 'email',
        text: 'Subject: Office space inquiry\n\nHello,\n\nMy translation agency is relocating in September. We are four people and expect to add one more next year, so roughly 60 square meters would suit us. Natural light matters to us — we spend the whole day reading.\n\nTwo constraints: one of our translators uses a wheelchair, so a step-free entrance is essential, and we will need two parking spaces.\n\nCould you confirm which suite you would recommend and the total monthly cost including parking?\n\nRegards,\nSofia Lindqvist\nLindqvist Language Services',
      },
    ],
    subQuestions: [
      {
        question: 'What is included in the price of every suite?',
        correctText: 'Weekly cleaning service',
        distractors: [
          'Two reserved parking spaces',
          'A private meeting room',
          'Furniture for four people',
        ],
        explanation:
          '広告に「include high-speed internet, weekly cleaning, and access to two shared meeting rooms」とある。駐車場は別料金、会議室は共用である。',
        translation: 'すべてのスイートの料金に含まれるものは何ですか。',
      },
      {
        question: 'Which suite best meets all of Ms. Lindqvist’s stated requirements?',
        correctText: 'Suite C',
        distractors: ['Suite A', 'Suite B', 'Suite D'],
        explanation:
          '60平米・自然光・段差なしの入口が条件。BとDは3階で階段のみ、Aは窓なし。1階で street entrance のCが唯一すべてを満たす。',
        translation: 'Lindqvistさんの条件をすべて満たすスイートはどれですか。',
        crossReference: true,
      },
      {
        question: 'What would the total monthly cost be for the recommended suite with parking?',
        correctText: '$2,030',
        distractors: ['$1,940', '$2,230', '$1,850'],
        explanation:
          'Suite Cの1,850ドルに駐車場2台分（90ドル×2＝180ドル）を加えて2,030ドルである。',
        translation: '推奨されるスイートに駐車場を加えた月額の合計はいくらですか。',
        crossReference: true,
      },
      {
        question: 'Why are the third-floor suites unsuitable for the agency?',
        correctText: 'They can be reached only by stairs',
        distractors: [
          'They are smaller than the agency needs',
          'They do not include internet access',
          'They are not available until next year',
        ],
        explanation:
          '広告に「Suites on the third floor are reached by stairs only」とあり、車椅子利用者がいるため条件に合わない。',
        translation: 'なぜ3階のスイートはこの事務所に適さないのですか。',
        crossReference: true,
      },
      {
        question: 'In the email, the word “constraints” is closest in meaning to',
        correctText: 'limitations',
        distractors: ['preferences', 'expenses', 'deadlines'],
        explanation:
          '段差なしの入口と駐車場2台は「譲れない制約」として挙げられている。好み・費用・期限ではない。',
        translation: 'メール中の constraints に最も意味が近いのは',
      },
    ],
  },
  {
    setId: 'p7m-005',
    difficulty: 5,
    tags: ['cross-reference', '推論', 'スキャン'],
    keyVocabWords: ['shipment', 'order'],
    passages: [
      {
        kind: 'notice',
        text: 'Vendor Notice — Warehouse Transition\n\nBetween August 5 and August 16, our distribution operations will move from the Eastport warehouse to the larger Kellerman facility. During this period:\n\n• Orders placed before August 5 will ship from Eastport on the original schedule.\n• Orders placed between August 5 and August 16 will be held and shipped from Kellerman starting August 19.\n• Express delivery will be unavailable for the entire transition period.\n\nWe expect a two- to three-business-day delay for orders placed during the window. Standard shipping rates will not change.',
      },
      {
        kind: 'email',
        text: 'Subject: Order 77-3120\n\nHello,\n\nI placed order 77-3120 on August 8 and selected express delivery at checkout, but the confirmation page showed standard shipping instead. The order is for display materials we need for a trade fair that opens on August 26.\n\nCould you tell me when the shipment will actually leave your facility, and whether it will arrive in time? If there is any risk of it arriving after the 24th, I would rather cancel and source locally.\n\nThanks,\nGreg Okafor\nOkafor Displays',
      },
    ],
    subQuestions: [
      {
        question: 'What is the notice mainly about?',
        correctText: 'A temporary change in how orders are shipped',
        distractors: [
          'A permanent increase in shipping rates',
          'The closing of the company’s only warehouse',
          'A new express delivery service',
        ],
        explanation:
          '倉庫移転に伴う一時的な出荷方法の変更を知らせる内容である。料金は変わらず、倉庫は移転先があり、速達は逆に停止する。',
        translation: 'この通知は主に何についてですか。',
      },
      {
        question: 'Why did Mr. Okafor’s order not include express delivery?',
        correctText: 'Express delivery was suspended during the transition',
        distractors: [
          'He placed the order after the trade fair deadline',
          'His order was too large for express shipping',
          'Express delivery is offered only to new customers',
        ],
        explanation:
          '通知に「Express delivery will be unavailable for the entire transition period」とあり、8月8日はその期間内である。',
        translation: 'Okaforさんの注文に速達が付かなかったのはなぜですか。',
        crossReference: true,
      },
      {
        question: 'When will order 77-3120 most likely ship?',
        correctText: 'On or shortly after August 19',
        distractors: ['On August 8', 'Before August 5', 'After August 26'],
        explanation:
          '8月5日〜16日の注文はKellermanから8月19日以降に出荷される。8月8日の注文はこの区分に入る。',
        translation: '注文77-3120はいつ出荷されると考えられますか。',
        crossReference: true,
      },
      {
        question: 'What does Mr. Okafor say he will do if the shipment arrives too late?',
        correctText: 'Cancel the order and buy the materials nearby',
        distractors: [
          'Ask for a refund of the express delivery fee',
          'Postpone his company’s trade fair booth',
          'Request that the order ship from Eastport',
        ],
        explanation:
          'メールで「I would rather cancel and source locally」と述べている。返金要求・出展延期・出荷元の指定ではない。',
        translation: '配送が遅すぎる場合、Okaforさんは何をすると述べていますか。',
      },
      {
        question: 'What is suggested about the delay for orders placed during the window?',
        correctText: 'It is expected to be a few business days',
        distractors: [
          'It will apply to orders placed before August 5',
          'It will be longer for standard shipping',
          'It cannot be estimated at this time',
        ],
        explanation:
          '通知に「a two- to three-business-day delay for orders placed during the window」とある。8月5日以前の注文は通常どおり出荷される。',
        translation: '該当期間の注文の遅れについて何が示唆されていますか。',
      },
    ],
  },
]
