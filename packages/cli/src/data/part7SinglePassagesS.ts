// Part7単一（text_passage）1文書＋設問2〜4問の初期在庫データ本体（T-107。正本: docs/24 3.1節・3.6節）。
//
// 40セット・設問合計120問（2問x10・3問x20・4問x10セット）。各設問はcorrectText/distractorsの
// 形で書き、textPassageQuestion.tsのrotateTextPassageChoicesが4択A〜Dへの決定的ローテーションを
// 行う（part34Question.ts/part6PassagesS.tsと同じM1レビュー⑦の方式）。
// keyVocabWordsはS/A/B語彙カード（600語）から選び、passages本文またはsubQuestionsの
// question/choicesに実在する語のみを使う（shared-schema validate.tsのvalidateKeyVocab参照）。
// tagsはdocs/24 3.4節の読解解法タグ（先読み/スキャン/パラフレーズ照合/推論/語彙推測）を
// 各セットの設問構成に応じて付与する（相互参照はPart7複数専用のためここでは使わない）。
// 全文・設問はエージェント直接執筆のオリジナル（市販教材の流用なし。CLAUDE.md不変条件）。

import type { PassageKind } from '@beb-raid/shared-schema'

export interface Part7SingleRawSubQuestion {
  question: string
  correctText: string
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
}

export interface Part7SingleRawEntry {
  setId: string
  difficulty: number
  tags: string[]
  keyVocabWords: string[]
  passageKind: PassageKind
  passageText: string
  subQuestions: readonly Part7SingleRawSubQuestion[]
}

export const PART7_SINGLE_ENTRIES_S: Part7SingleRawEntry[] = [
  {
    setId: 'p7s-001',
    difficulty: 3,
    tags: ['先読み', 'スキャン', '推論'],
    keyVocabWords: ['resume', 'interview'],
    passageKind: 'email',
    passageText:
      'Subject: Interview Invitation — Marketing Coordinator Position\n\nDear Ms. Alvarez,\n\nThank you for applying for the Marketing Coordinator position at Brightview Media. After reviewing your resume, we would like to invite you to an interview with our hiring team on Tuesday, June 10, at 2 p.m. at our downtown office. The interview will last approximately forty-five minutes and will include a short writing exercise related to social media planning. Please bring a copy of your portfolio if you have one. If this time does not work for you, please reply to this email within two business days so we can arrange an alternative. We look forward to speaking with you.\n\nBest regards,\nHiring Team, Brightview Media',
    subQuestions: [
      {
        question: 'Why was the email written?',
        correctText: 'To schedule a job interview',
        distractors: [
          'To offer Ms. Alvarez a job',
          'To request additional references',
          'To reject a job application',
        ],
        explanation:
          'メールは面接の日時と場所を伝える内容であり、採用決定・追加の推薦者要求・不採用通知ではない。',
        translation: 'このメールはなぜ書かれましたか。',
      },
      {
        question: 'What will most likely happen during the interview?',
        correctText: 'Candidates will complete a writing exercise',
        distractors: [
          'Candidates will give a formal presentation',
          'Candidates will meet with company clients',
          'Candidates will take a technical coding test',
        ],
        explanation:
          '本文に"a short writing exercise related to social media planning"と明記されている。プレゼン・顧客対応・コーディングテストへの言及はない。',
        translation: '面接ではどのようなことが行われると考えられますか。',
      },
      {
        question: 'What should Ms. Alvarez do if the proposed time is inconvenient?',
        correctText: 'Reply by email within two business days',
        distractors: [
          'Call the hiring manager immediately',
          'Visit the office in person',
          'Wait for a follow-up phone call',
        ],
        explanation:
          '本文に"please reply to this email within two business days"とあり、返信の方法と期限が明記されている。',
        translation: '提案された時間が都合が悪い場合、Alvarezさんは何をすべきですか。',
      },
    ],
  },
  {
    setId: 'p7s-002',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['facility', 'notify'],
    passageKind: 'notice',
    passageText:
      'FIRE DRILL NOTICE\n\nA scheduled fire drill will take place in this facility on Wednesday, May 14, at 10:30 a.m. All employees and visitors must exit through the nearest marked stairwell and gather in the parking lot on the east side of the building. Elevators should not be used during the drill. The entire exercise is expected to take about fifteen minutes. Department managers will notify their teams of the exact meeting point before the drill begins.',
    subQuestions: [
      {
        question: 'What is the purpose of the notice?',
        correctText: 'To inform employees about an upcoming fire drill',
        distractors: [
          'To report the results of a past inspection',
          'To announce a change in office hours',
          'To request volunteers for a safety committee',
        ],
        explanation:
          '本文冒頭で"A scheduled fire drill will take place"と述べており、今後実施される避難訓練の案内であることが分かる。',
        translation: 'この案内の目的は何ですか。',
      },
      {
        question: 'According to the notice, where should people gather during the drill?',
        correctText: 'In the parking lot on the east side',
        distractors: ['In the main lobby', 'On the roof of the building', 'In the west stairwell'],
        explanation:
          '本文に"gather in the parking lot on the east side of the building"と明記されている。',
        translation: '訓練中、人々はどこに集まるべきですか。',
      },
    ],
  },
  {
    setId: 'p7s-003',
    difficulty: 3,
    tags: ['パラフレーズ照合', '推論', 'スキャン'],
    keyVocabWords: ['campaign', 'endorsement', 'coordinate'],
    passageKind: 'article',
    passageText:
      "Local Charity Drive Raises Record Amount\n\nThe annual charity drive organized by the Riverside Business Association raised more than forty thousand dollars this year, the highest total in the event's twelve-year history. The campaign, which ran for three weeks in April, was supported by an endorsement from the city's mayor and coordinated by a team of volunteers from local businesses. Funds raised will be split between the regional food bank and a scholarship program for high school students. Organizers said the increase was largely due to a new online donation platform that allowed contributions from outside the immediate area. Next year's drive is expected to run for an additional week to build on this momentum.",
    subQuestions: [
      {
        question: 'What is mainly being reported in the article?',
        correctText: 'A charity event raised an unusually large amount of money',
        distractors: [
          'A new business association was formed in the city',
          'A scholarship program was canceled due to low funding',
          'The mayor announced a new tax policy',
        ],
        explanation:
          '記事全体は今年のチャリティー活動が過去最高額を集めたことを報じており、他の選択肢は本文の主題ではない。',
        translation: 'この記事では主に何が報じられていますか。',
      },
      {
        question: 'What most likely contributed to the increase in donations?',
        correctText: 'A new way for people outside the area to donate online',
        distractors: [
          'A reduction in the number of volunteers needed',
          'A shorter campaign period than in previous years',
          'A decrease in the number of participating businesses',
        ],
        explanation:
          '本文に"a new online donation platform that allowed contributions from outside the immediate area"とあり、これが増加の主な要因として述べられている。',
        translation: '寄付額の増加には何が主に寄与したと考えられますか。',
      },
      {
        question: 'How will the money raised be used?',
        correctText: 'It will support a food bank and a scholarship program',
        distractors: [
          'It will fund a new business association office',
          'It will be donated to the city government',
          "It will be used to organize next year's event only",
        ],
        explanation:
          '本文に"Funds raised will be split between the regional food bank and a scholarship program"と明記されている。',
        translation: '集まった資金はどのように使われますか。',
      },
    ],
  },
  {
    setId: 'p7s-004',
    difficulty: 2,
    tags: ['推論', 'スキャン'],
    keyVocabWords: ['shipment', 'delivery'],
    passageKind: 'chat',
    passageText:
      "Dana Lee [10:02 a.m.]\nHi Marco, do we have an update on the shipment for the Grant account? They're asking again.\n\nMarco Diaz [10:04 a.m.]\nJust checked with the warehouse. The delivery left this morning and should arrive by Thursday.\n\nDana Lee [10:05 a.m.]\nThat's later than we told them. Can we let them know today?\n\nMarco Diaz [10:06 a.m.]\nSure, I'll send them an update this afternoon with the new delivery date and tracking number.",
    subQuestions: [
      {
        question: 'What are Dana Lee and Marco Diaz mainly discussing?',
        correctText: 'The status of a delayed shipment',
        distractors: [
          'A problem with a warehouse employee',
          'A request to cancel an order',
          'A change in delivery pricing',
        ],
        explanation:
          '会話は出荷状況とその遅延について話しており、従業員の問題・注文取消・料金変更には触れていない。',
        translation: 'Dana LeeとMarco Diazは主に何について話していますか。',
      },
      {
        question:
          'At 10:06 a.m., what does Marco Diaz mean when he writes, "I\'ll send them an update"?',
        correctText: 'He will contact the client about the delivery date',
        distractors: [
          'He will send a new invoice to the client',
          'He will update the warehouse inventory system',
          'He will schedule a meeting with Dana Lee',
        ],
        explanation:
          '直前でDanaが「今日中に知らせられるか」と尋ね、Marcoが新しい配達日と追跡番号を伝えると答えているため、顧客への連絡を指している。',
        translation:
          '午前10時6分にMarco Diazが「アップデートを送る」と書いているのはどういう意味ですか。',
      },
    ],
  },
  {
    setId: 'p7s-005',
    difficulty: 3,
    tags: ['スキャン'],
    keyVocabWords: ['registration', 'venue', 'itinerary'],
    passageKind: 'form',
    passageText:
      'ANNUAL INDUSTRY SUMMIT — REGISTRATION FORM (INSTRUCTIONS)\n\nThank you for your interest in the Annual Industry Summit, taking place October 8–9 at the Lakeside Convention Center. To register, complete all fields below and submit payment by September 1 to receive the early registration rate of $250. Registrations submitted after this date will be charged the standard rate of $325. Please note that the registration fee includes access to all sessions, a printed itinerary, and lunch on both days. Hotel accommodations near the venue are not included and must be booked separately. A confirmation email with your badge information will be sent within five business days of payment.',
    subQuestions: [
      {
        question: 'What is included in the registration fee?',
        correctText: 'Session access, a printed itinerary, and lunch',
        distractors: [
          'Hotel accommodations near the venue',
          'Transportation to and from the airport',
          'A one-year subscription to an industry magazine',
        ],
        explanation:
          '本文に"the registration fee includes access to all sessions, a printed itinerary, and lunch on both days"と明記されている。ホテルは別途手配が必要と述べられている。',
        translation: '登録料には何が含まれていますか。',
      },
      {
        question: 'What happens if payment is submitted after September 1?',
        correctText: 'The registration fee increases to $325',
        distractors: [
          'The registration is automatically canceled',
          'A late fee of $50 is added to the early rate',
          'The registrant is placed on a waiting list',
        ],
        explanation:
          '本文に"Registrations submitted after this date will be charged the standard rate of $325"とあり、早期割引が適用されなくなることが分かる。',
        translation: '9月1日以降に支払いを提出した場合、どうなりますか。',
      },
      {
        question: 'How will registrants receive their badge information?',
        correctText: 'By email, within five business days of payment',
        distractors: [
          'By mail, two weeks before the event',
          'At the venue on the first day of the summit',
          'By phone call from the organizing committee',
        ],
        explanation:
          '本文に"A confirmation email with your badge information will be sent within five business days of payment"と明記されている。',
        translation: '登録者はどのようにバッジ情報を受け取りますか。',
      },
    ],
  },
  {
    setId: 'p7s-006',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['merchandise', 'discount'],
    passageKind: 'advertisement',
    passageText:
      'GRAND OPENING — Parkside Home Goods\n\nJoin us this Saturday for the grand opening of Parkside Home Goods, your new neighborhood store for kitchenware, furniture, and decor. The first fifty customers will receive a free gift, and all merchandise in the store will be offered at a twenty percent discount for opening weekend only. Doors open at 9 a.m. Free parking is available in the lot behind the building.',
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: 'The opening of a new store',
        distractors: [
          'A clearance sale before a store closes',
          'A home renovation service',
          'A furniture delivery company',
        ],
        explanation:
          '見出しと本文全体が新規開店のイベントを案内しており、閉店セール・リフォームサービス・配送会社ではない。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'What will the first fifty customers receive?',
        correctText: 'A free gift',
        distractors: [
          'A store credit card',
          'A discount on future purchases only',
          'A membership to a loyalty program',
        ],
        explanation: '本文に"The first fifty customers will receive a free gift"と明記されている。',
        translation: '最初の50名の顧客は何を受け取りますか。',
      },
    ],
  },
  {
    setId: 'p7s-007',
    difficulty: 4,
    tags: ['推論', 'パラフレーズ照合', '語彙推測'],
    keyVocabWords: ['refund', 'compensate', 'apologize'],
    passageKind: 'email',
    passageText:
      "Subject: Re: Order 8834 — Damaged Item\n\nDear Mr. Owusu,\n\nThank you for letting us know about the damaged item you received in order 8834. We sincerely apologize for the inconvenience this has caused. After reviewing your account, we would like to compensate you in one of two ways: a full refund of the item's price, or a replacement shipped at no charge with a fifteen percent discount code for a future purchase. Please reply with your preference by Friday, and we will process it the same day. We have also flagged this order with our warehouse team so they can review the packaging process for fragile items. We value your business and hope to resolve this quickly.\n\nSincerely,\nCustomer Care Team",
    subQuestions: [
      {
        question: 'Why did the customer contact the company?',
        correctText: 'An item in the order arrived damaged',
        distractors: [
          'The order was never delivered',
          'The wrong item was shipped',
          'The customer was charged twice for one order',
        ],
        explanation:
          '本文冒頭に"the damaged item you received in order 8834"とあり、届いた商品が破損していたことが分かる。',
        translation: '顧客はなぜ会社に連絡しましたか。',
      },
      {
        question: 'What is Mr. Owusu asked to do?',
        correctText: 'Choose between a refund and a replacement',
        distractors: [
          'Send a photo of the damaged item',
          'Return the item to a physical store',
          'Contact the shipping carrier directly',
        ],
        explanation:
          '本文に"we would like to compensate you in one of two ways"とあり、返金か交換のどちらかを選ぶよう依頼されている。',
        translation: 'Owusuさんは何をするよう求められていますか。',
      },
      {
        question: "What is suggested about the company's response to this incident?",
        correctText: 'It plans to review how fragile items are packaged',
        distractors: [
          'It will stop selling the damaged item',
          'It will switch to a new shipping carrier',
          'It will offer the same discount to all customers',
        ],
        explanation:
          '本文に"flagged this order with our warehouse team so they can review the packaging process for fragile items"とあり、包装工程の見直しを行うことが読み取れる。',
        translation: 'この件への会社の対応について何が示唆されていますか。',
      },
      {
        question: 'The word "flagged" in the email is closest in meaning to',
        correctText: 'marked for attention',
        distractors: ['canceled', 'shipped again', 'discounted'],
        explanation:
          '"flagged this order with our warehouse team"は「この注文を倉庫チームに注意喚起として伝えた」という意味で、marked for attentionが最も近い。',
        translation: 'メール中の"flagged"に最も意味が近いのは。',
      },
    ],
  },
  {
    setId: 'p7s-008',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['notify'],
    passageKind: 'notice',
    passageText:
      'OFFICE CLOSURE NOTICE\n\nThe office will be closed on Monday, September 2, in observance of the public holiday. Normal business hours will resume on Tuesday, September 3. Employees who need to submit urgent requests should notify their supervisor before the closure. Voicemail and email will not be checked until the office reopens.',
    subQuestions: [
      {
        question: 'Why will the office be closed?',
        correctText: 'For a public holiday',
        distractors: [
          'For a building inspection',
          'For a company-wide training event',
          'For a scheduled power outage',
        ],
        explanation: '本文に"in observance of the public holiday"と明記されている。',
        translation: 'オフィスはなぜ休業しますか。',
      },
      {
        question: 'What should employees do if they have an urgent request?',
        correctText: 'Notify their supervisor before the closure',
        distractors: [
          'Leave a detailed voicemail message',
          'Wait until the office reopens',
          'Send an email marked as high priority',
        ],
        explanation:
          '本文に"should notify their supervisor before the closure"とあり、休業前に上司へ知らせるよう求めている。',
        translation: '緊急の依頼がある場合、従業員は何をすべきですか。',
      },
    ],
  },
  {
    setId: 'p7s-009',
    difficulty: 3,
    tags: ['先読み', 'パラフレーズ照合', '推論'],
    keyVocabWords: ['sustainability', 'benchmark'],
    passageKind: 'article',
    passageText:
      "Local Manufacturer Recognized for Sustainability Efforts\n\nGreenline Manufacturing received the Regional Sustainability Award last week for its efforts to reduce waste and energy use across its production facilities. The company set a new benchmark in the region by cutting water use by forty percent over the past three years through a closed-loop cooling system. Company representatives said the recognition reflects years of investment in equipment upgrades rather than a single recent change. The award committee noted that Greenline's approach could serve as a model for other manufacturers in the area. Company leaders said they plan to share details of their process at an upcoming industry conference.",
    subQuestions: [
      {
        question: 'Why did Greenline Manufacturing receive the award?',
        correctText: 'For reducing waste and energy use in its facilities',
        distractors: [
          'For opening a new production facility',
          'For donating to a local environmental group',
          'For winning a regional sales competition',
        ],
        explanation:
          '本文冒頭に"received the Regional Sustainability Award...for its efforts to reduce waste and energy use"と明記されている。',
        translation: 'Greenline製造はなぜこの賞を受賞しましたか。',
      },
      {
        question: "What is suggested about the company's achievement?",
        correctText: 'It resulted from several years of investment, not a recent change',
        distractors: [
          'It happened by accident during a routine inspection',
          'It was required by a new government regulation',
          'It was achieved within the last few months',
        ],
        explanation:
          '本文に"the recognition reflects years of investment in equipment upgrades rather than a single recent change"とあり、長期的な投資の結果であることが読み取れる。',
        translation: '会社の成果について何が示唆されていますか。',
      },
      {
        question: 'What does the company plan to do next?',
        correctText: 'Share details of its process at an industry conference',
        distractors: [
          'Apply for additional government funding',
          'Expand its facilities to a new region',
          'Reduce the number of employees in production',
        ],
        explanation:
          '本文最後に"plan to share details of their process at an upcoming industry conference"と明記されている。',
        translation: '会社は次に何をする予定ですか。',
      },
    ],
  },
  {
    setId: 'p7s-010',
    difficulty: 4,
    tags: ['推論', 'スキャン', 'パラフレーズ照合'],
    keyVocabWords: ['reschedule', 'confirm'],
    passageKind: 'chat',
    passageText:
      "Priya Nair [3:12 p.m.]\nHey, are we still on for the client meeting tomorrow at 10?\n\nTom Fischer [3:14 p.m.]\nActually, the client just asked to reschedule to Thursday at the same time. Is that okay with you?\n\nPriya Nair [3:16 p.m.]\nThursday works for me, but I have a call at 11 that day, so we'd need to keep it short.\n\nTom Fischer [3:17 p.m.]\nGot it. I'll confirm Thursday at 10 and let them know we'll need to wrap up by 10:45.\n\nPriya Nair [3:18 p.m.]\nSounds good, thanks for handling that.",
    subQuestions: [
      {
        question: 'What are Priya Nair and Tom Fischer discussing?',
        correctText: 'Rescheduling a client meeting',
        distractors: [
          'Canceling a meeting with a client',
          'Preparing materials for a presentation',
          'Hiring a new team member',
        ],
        explanation:
          '会話全体は顧客からの日程変更依頼への対応について話しており、キャンセル・資料準備・採用の話題ではない。',
        translation: 'Priya NairとTom Fischerは何について話し合っていますか。',
      },
      {
        question: 'Why does Priya Nair say the meeting will need to be short?',
        correctText: 'She has another call scheduled at 11 a.m. that day',
        distractors: [
          'She will be out of the office on Thursday',
          'The client requested a shorter meeting',
          'She has not finished preparing the materials',
        ],
        explanation:
          '本文に"I have a call at 11 that day, so we\'d need to keep it short"と明記されている。',
        translation: 'Priya Nairはなぜ会議を短くする必要があると言っていますか。',
      },
      {
        question: 'At 3:17 p.m., what does Tom Fischer mean when he writes, "Got it"?',
        correctText: 'He understands and accepts the new time constraint',
        distractors: [
          'He has received a document from the client',
          'He has already spoken with the client',
          'He disagrees with the proposed schedule',
        ],
        explanation:
          '直前でPriyaが11時に電話があるため短くする必要があると述べたことへの応答であり、その制約を了解したという意味。',
        translation: '午後3時17分にTom Fischerが「了解」と書いているのはどういう意味ですか。',
      },
    ],
  },
  {
    setId: 'p7s-011',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['renewal', 'deadline'],
    passageKind: 'form',
    passageText:
      'MEMBERSHIP RENEWAL — INSTRUCTIONS\n\nYour annual membership with the Downtown Fitness Club expires at the end of this month. To continue enjoying your current benefits, including unlimited class access and locker rental, please complete the renewal section below and return it to the front desk by the 25th. Members who renew before the deadline will keep their current rate. Renewals submitted after the deadline will be charged the new rate that takes effect next month.',
    subQuestions: [
      {
        question: 'What is the purpose of this form?',
        correctText: 'To renew a fitness club membership',
        distractors: [
          'To cancel a fitness club membership',
          'To sign up for a new fitness class',
          'To report a problem with locker access',
        ],
        explanation:
          '見出しと本文全体が会員更新の手続きを説明しており、解約・新規クラス登録・ロッカーの不具合報告ではない。',
        translation: 'このフォームの目的は何ですか。',
      },
      {
        question: 'What happens to members who renew after the 25th?',
        correctText: 'They will be charged a new, higher rate',
        distractors: [
          'They will lose access to the gym immediately',
          'They will receive a discount for renewing late',
          'They will need to reapply as new members',
        ],
        explanation:
          '本文に"Renewals submitted after the deadline will be charged the new rate that takes effect next month"と明記されている。',
        translation: '25日以降に更新した会員はどうなりますか。',
      },
    ],
  },
  {
    setId: 'p7s-012',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['upgrade'],
    passageKind: 'advertisement',
    passageText:
      "Limited-Time Offer: Save on CloudDesk Software\n\nUpgrade your team's productivity with CloudDesk, the project management software trusted by thousands of businesses. For a limited time, new subscribers can save thirty percent on their first year when signing up for an annual plan. Monthly plans are also available but are not included in this discount. All plans include unlimited projects, file storage, and customer support. Sign up before the end of the month to lock in this rate for a full year.",
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: 'A discount on project management software',
        distractors: [
          'A new smartphone application',
          'A free trial of a customer support service',
          'A hardware upgrade for office computers',
        ],
        explanation:
          '本文全体がCloudDeskというプロジェクト管理ソフトウェアの割引を案内しており、他の選択肢の内容は述べられていない。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'Who is eligible for the thirty percent discount?',
        correctText: 'New subscribers who choose an annual plan',
        distractors: [
          'All current subscribers regardless of plan',
          'New subscribers who choose a monthly plan',
          'Businesses with more than fifty employees',
        ],
        explanation:
          '本文に"new subscribers can save thirty percent...when signing up for an annual plan"とあり、月額プランは対象外と明記されている。',
        translation: 'この30%割引の対象となるのは誰ですか。',
      },
      {
        question: 'What is suggested about monthly plans?',
        correctText: 'They do not qualify for the current discount',
        distractors: [
          'They are no longer offered by the company',
          'They include more features than annual plans',
          'They require a separate customer support fee',
        ],
        explanation:
          '本文に"Monthly plans are also available but are not included in this discount"とあり、月額プランは今回の割引対象外であることが分かる。',
        translation: '月額プランについて何が示唆されていますか。',
      },
    ],
  },
  {
    setId: 'p7s-013',
    difficulty: 3,
    tags: ['先読み', 'スキャン'],
    keyVocabWords: ['headquarters', 'branch'],
    passageKind: 'email',
    passageText:
      'Subject: Introducing Our New Chief Financial Officer\n\nDear Colleagues,\n\nI am pleased to announce that Rina Kobayashi will join our headquarters team as Chief Financial Officer starting next month. Rina previously served as finance director at a regional branch of a national logistics company, where she led a successful cost-reduction program. In her new role, she will oversee the finance and accounting departments and report directly to the CEO. Please join me in welcoming Rina when she begins her new position. A welcome reception will be held in the main office on her first day.',
    subQuestions: [
      {
        question: 'What is the main purpose of the email?',
        correctText: 'To announce a new executive hire',
        distractors: [
          'To announce a change in office location',
          'To request feedback on a recent hire',
          'To announce a retirement',
        ],
        explanation:
          'メール全体が新しいCFOの就任を知らせる内容であり、オフィス移転・フィードバック依頼・退職の話題ではない。',
        translation: 'このメールの主な目的は何ですか。',
      },
      {
        question: 'What did Rina Kobayashi do in her previous position?',
        correctText: 'She led a cost-reduction program',
        distractors: [
          'She managed a marketing campaign',
          'She opened a new regional branch',
          'She trained new finance employees',
        ],
        explanation: '本文に"led a successful cost-reduction program"と明記されている。',
        translation: 'Rina Kobayashiさんは以前の職務で何をしましたか。',
      },
      {
        question: "What will happen on Rina Kobayashi's first day?",
        correctText: 'A welcome reception will be held',
        distractors: [
          'She will meet with the board of directors',
          'She will visit the regional branch office',
          'She will give a presentation to all staff',
        ],
        explanation:
          '本文最後に"A welcome reception will be held in the main office on her first day"と明記されている。',
        translation: 'Rina Kobayashiさんの初日には何が行われますか。',
      },
    ],
  },
  {
    setId: 'p7s-014',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['maintenance', 'inspection'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Parking Garage Closure\n\nThe main parking garage will be closed from Monday, March 3, through Friday, March 7, for scheduled maintenance and a structural inspection. During this period, employees should use the overflow lot on Elm Street, located about a five-minute walk from the building. A shuttle will run every fifteen minutes between the overflow lot and the main entrance from 7 a.m. to 7 p.m. Visitors should be directed to the overflow lot as well, and reception staff will provide shuttle information at check-in.',
    subQuestions: [
      {
        question: 'Why is the parking garage being closed?',
        correctText: 'For maintenance and a structural inspection',
        distractors: [
          'For a special company event',
          'Because of a recent accident',
          'To add more parking spaces',
        ],
        explanation:
          '本文に"for scheduled maintenance and a structural inspection"と明記されている。',
        translation: '駐車場はなぜ閉鎖されますか。',
      },
      {
        question: 'How can employees get from the overflow lot to the building?',
        correctText: 'By taking a shuttle that runs every fifteen minutes',
        distractors: [
          'By walking through an underground tunnel',
          'By requesting a ride from security staff',
          'By using a temporary bus pass',
        ],
        explanation:
          '本文に"A shuttle will run every fifteen minutes between the overflow lot and the main entrance"と明記されている。',
        translation: '従業員はオーバーフロー駐車場から建物までどのように移動できますか。',
      },
      {
        question: 'What are reception staff expected to do during the closure?',
        correctText: 'Provide shuttle information to visitors',
        distractors: [
          'Direct visitors to a different building entirely',
          'Collect parking fees from visitors',
          'Escort visitors to the overflow lot personally',
        ],
        explanation:
          '本文最後に"reception staff will provide shuttle information at check-in"と明記されている。',
        translation: '閉鎖期間中、受付スタッフは何をすると想定されていますか。',
      },
    ],
  },
  {
    setId: 'p7s-015',
    difficulty: 4,
    tags: ['推論', 'パラフレーズ照合', '語彙推測'],
    keyVocabWords: ['revenue', 'projection', 'expenditure'],
    passageKind: 'article',
    passageText:
      'Annual Report Highlights Strong Growth\n\nParkway Consulting released its annual report this week, showing total revenue grew twelve percent compared to the previous year, exceeding earlier projections. The report attributes much of the growth to a new division focused on digital strategy consulting, which was launched eighteen months ago and now accounts for nearly a quarter of total revenue. At the same time, overall expenditure rose only slightly, as the company avoided major new hiring outside the digital division. Company leaders said they expect growth to continue but at a more moderate pace next year, citing broader economic uncertainty. Investors reacted positively to the report, with company shares rising shortly after it was released.',
    subQuestions: [
      {
        question: 'What is mainly being reported in the article?',
        correctText: 'A company reported revenue growth that exceeded expectations',
        distractors: [
          'A company announced a merger with a competitor',
          'A company reported a decline in overall profit',
          'A company opened a new office overseas',
        ],
        explanation:
          '記事全体が今年度の増収と予測を上回った成長について報じており、他の選択肢の出来事は述べられていない。',
        translation: 'この記事では主に何が報じられていますか。',
      },
      {
        question: 'What contributed most to the revenue growth?',
        correctText: 'A relatively new digital strategy consulting division',
        distractors: [
          'A significant increase in overall hiring',
          'A reduction in operating costs company-wide',
          'A new partnership with a larger firm',
        ],
        explanation:
          '本文に"attributes much of the growth to a new division focused on digital strategy consulting"と明記されている。',
        translation: '増収に最も貢献したものは何ですか。',
      },
      {
        question: 'What do company leaders expect for next year?',
        correctText: 'Growth will continue but at a slower rate',
        distractors: [
          'Revenue will decline sharply',
          'The digital division will be closed',
          'Growth will accelerate significantly',
        ],
        explanation:
          '本文に"they expect growth to continue but at a more moderate pace next year"と明記されている。',
        translation: '経営陣は来年について何を予想していますか。',
      },
      {
        question: 'The word "moderate" in the article is closest in meaning to',
        correctText: 'not extreme',
        distractors: ['very fast', 'uncertain', 'declining'],
        explanation:
          '"a more moderate pace"は「より緩やかな速度」という意味で、極端でない、という意味のnot extremeが最も近い。',
        translation: '記事中の"moderate"に最も意味が近いのは。',
      },
    ],
  },
  {
    setId: 'p7s-016',
    difficulty: 2,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['presentation', 'client'],
    passageKind: 'chat',
    passageText:
      "Yusuf Demir [9:05 a.m.]\nHow's the client presentation coming along for Friday?\n\nBecca Lin [9:07 a.m.]\nMostly done, just need to add the updated pricing slide. Can you send me the final numbers?\n\nYusuf Demir [9:10 a.m.]\nSending them now. Let me know if you want me to look over the slides before Friday.\n\nBecca Lin [9:11 a.m.]\nThat would help — could you check it tomorrow afternoon?",
    subQuestions: [
      {
        question: 'What is Becca Lin currently working on?',
        correctText: 'A presentation for a client meeting',
        distractors: [
          'A budget report for her manager',
          'A training session for new employees',
          "A schedule for next week's meetings",
        ],
        explanation:
          '会話冒頭で"the client presentation coming along for Friday"と述べられており、顧客向けプレゼンの準備をしていることが分かる。',
        translation: 'Becca Linは現在何に取り組んでいますか。',
      },
      {
        question: 'What does Becca Lin ask Yusuf Demir to do?',
        correctText: 'Review the presentation slides tomorrow afternoon',
        distractors: [
          'Attend the client meeting on Friday',
          'Reserve a meeting room for Friday',
          'Reschedule the presentation to next week',
        ],
        explanation:
          '本文最後に"could you check it tomorrow afternoon?"とあり、翌日午後にスライドを確認してほしいと依頼している。',
        translation: 'Becca LinはYusuf Demirに何をするよう頼んでいますか。',
      },
    ],
  },
  {
    setId: 'p7s-017',
    difficulty: 3,
    tags: ['スキャン'],
    keyVocabWords: ['reimbursement', 'itemize'],
    passageKind: 'form',
    passageText:
      "EXPENSE REIMBURSEMENT FORM — INSTRUCTIONS\n\nUse this form to request reimbursement for business-related expenses incurred while traveling or entertaining clients. All expenses must be itemized, and receipts must be attached for any single expense over ten dollars. Meals with clients require the client's name and company to be listed in the notes section. Forms without complete receipts will be returned to the employee for correction before processing. Completed forms should be submitted to the accounting department within fourteen days of the expense date.",
    subQuestions: [
      {
        question: 'What is required for expenses over ten dollars?',
        correctText: 'A receipt must be attached',
        distractors: [
          'Manager approval must be obtained in advance',
          'A written explanation of the expense is required',
          'The expense must be paid in cash',
        ],
        explanation:
          '本文に"receipts must be attached for any single expense over ten dollars"と明記されている。',
        translation: '10ドルを超える費用には何が必要ですか。',
      },
      {
        question: 'What information must be included for client meals?',
        correctText: "The client's name and company",
        distractors: [
          "The restaurant's phone number",
          'The total number of attendees',
          "The employee's department code",
        ],
        explanation:
          '本文に"Meals with clients require the client\'s name and company to be listed in the notes section"と明記されている。',
        translation: '顧客との食事についてはどのような情報を記載する必要がありますか。',
      },
      {
        question: 'What happens if a form is missing a required receipt?',
        correctText: 'It will be returned to the employee for correction',
        distractors: [
          'It will be automatically rejected without notice',
          'The expense will be reimbursed at a reduced rate',
          'The employee will be asked to visit the accounting office',
        ],
        explanation:
          '本文に"Forms without complete receipts will be returned to the employee for correction before processing"と明記されている。',
        translation: '必要なレシートが不足している場合、フォームはどうなりますか。',
      },
    ],
  },
  {
    setId: 'p7s-018',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['conference', 'discount'],
    passageKind: 'advertisement',
    passageText:
      "Early-Bird Registration Now Open\n\nRegister for the Northeast Business Conference before July 15 and save fifteen percent off the standard registration fee. This year's conference features keynote speakers from several major industries and more than thirty breakout sessions. Group discounts are available for companies registering five or more attendees. Space is limited, so early registration is recommended.",
    subQuestions: [
      {
        question: 'What is the benefit of registering before July 15?',
        correctText: 'A fifteen percent discount on registration',
        distractors: [
          "A free ticket to next year's conference",
          'Priority seating at all sessions',
          'A private meeting with a keynote speaker',
        ],
        explanation:
          '本文に"save fifteen percent off the standard registration fee"と明記されている。',
        translation: '7月15日より前に登録するとどのような利点がありますか。',
      },
      {
        question: 'What is available for companies with five or more attendees?',
        correctText: 'A group discount',
        distractors: [
          'A dedicated conference room',
          'Free hotel accommodations',
          'An extended registration deadline',
        ],
        explanation:
          '本文に"Group discounts are available for companies registering five or more attendees"と明記されている。',
        translation: '5名以上の参加者がいる企業には何が利用できますか。',
      },
    ],
  },
  {
    setId: 'p7s-019',
    difficulty: 4,
    tags: ['スキャン', '推論', '語彙推測'],
    keyVocabWords: ['freight', 'carrier', 'logistics'],
    passageKind: 'email',
    passageText:
      'Subject: Update on Shipment Tracking Number 5521-A\n\nDear Ms. Alonso,\n\nWe are writing to update you on the status of shipment 5521-A. Due to a change in freight carriers at our logistics partner, the shipment was transferred to a new carrier on Tuesday, which added an unexpected day to the delivery timeline. The shipment is now expected to arrive at your facility on Friday instead of Thursday as originally planned. Tracking information has been updated on our website and should reflect the new carrier within a few hours. We understand this delay may affect your schedule, and we are happy to discuss options such as expedited handling for your next order at no additional cost. Please let us know if you have any questions in the meantime.\n\nSincerely,\nLogistics Support Team',
    subQuestions: [
      {
        question: 'Why is the email being sent?',
        correctText: 'To inform the customer of a delivery delay',
        distractors: [
          'To confirm that a shipment has been canceled',
          'To request payment for a shipment',
          'To apologize for a billing error',
        ],
        explanation:
          'メール全体が配送の遅延とその理由を説明する内容であり、キャンセル・支払い依頼・請求誤りの話題ではない。',
        translation: 'このメールはなぜ送られていますか。',
      },
      {
        question: 'What caused the change in the delivery timeline?',
        correctText: 'A change in freight carriers',
        distractors: [
          'A shortage of available trucks',
          'An error in the shipping address',
          'A delay at the customs office',
        ],
        explanation:
          '本文に"Due to a change in freight carriers at our logistics partner"と明記されている。',
        translation: '配送スケジュールの変更の原因は何ですか。',
      },
      {
        question: "What does the company offer to do for Ms. Alonso's next order?",
        correctText: 'Provide expedited handling at no extra cost',
        distractors: [
          'Provide a full refund on the current order',
          'Assign a dedicated account manager',
          'Offer a discount on future shipments',
        ],
        explanation:
          '本文に"we are happy to discuss options such as expedited handling for your next order at no additional cost"と明記されている。',
        translation: '会社はAlonsoさんの次の注文について何を提案していますか。',
      },
      {
        question: 'The word "reflect" in the email is closest in meaning to',
        correctText: 'show',
        distractors: ['question', 'delay', 'remove'],
        explanation:
          '"should reflect the new carrier"は「新しい配送業者の情報を反映して表示する」という意味で、showが最も近い。',
        translation: 'メール中の"reflect"に最も意味が近いのは。',
      },
    ],
  },
  {
    setId: 'p7s-020',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['catering', 'renovation'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Cafeteria Renovation Schedule\n\nThe employee cafeteria will be closed for renovation from June 16 to June 27. During this time, a limited catering service will be set up in the first-floor lobby, offering sandwiches, salads, and beverages from 11:30 a.m. to 1:30 p.m. each weekday. The cafeteria is expected to reopen on June 30 with new seating and an expanded menu.',
    subQuestions: [
      {
        question: 'Why will the cafeteria be closed?',
        correctText: 'For renovation',
        distractors: [
          'For a health inspection',
          'Because of low employee attendance',
          'Because of a staffing shortage',
        ],
        explanation: '見出しと本文に改装のための休業であると明記されている。',
        translation: 'カフェテリアはなぜ閉鎖されますか。',
      },
      {
        question: 'Where will food be available during the closure?',
        correctText: 'In the first-floor lobby',
        distractors: [
          'In the parking garage',
          'On the rooftop terrace',
          "In each department's break room",
        ],
        explanation:
          '本文に"a limited catering service will be set up in the first-floor lobby"と明記されている。',
        translation: '閉鎖期間中、食事はどこで利用できますか。',
      },
    ],
  },
  {
    setId: 'p7s-021',
    difficulty: 3,
    tags: ['先読み', 'パラフレーズ照合'],
    keyVocabWords: ['branch', 'coordinate'],
    passageKind: 'article',
    passageText:
      "New Branch Manager Brings Retail Experience\n\nSarita Menon has been named the new branch manager of Coastal Bank's downtown location, replacing a manager who retired earlier this year. Menon previously spent eight years at a national retail chain, where she coordinated store operations across multiple locations. She said her retail background taught her the importance of customer service, which she plans to emphasize in her new role. Menon's first project will be extending the branch's hours on weekends, a change she says was frequently requested by customers. She will officially begin the position on the first of next month.",
    subQuestions: [
      {
        question: 'What is the article mainly about?',
        correctText: 'A new manager taking over a bank branch',
        distractors: [
          'The closing of a retail store',
          'A bank announcing new interest rates',
          'A retirement celebration for a former employee',
        ],
        explanation:
          '記事全体が新しい支店長の就任について述べており、他の選択肢の内容は述べられていない。',
        translation: 'この記事は主に何についてのものですか。',
      },
      {
        question: 'What experience does Sarita Menon bring to her new role?',
        correctText: 'Experience coordinating operations at a retail chain',
        distractors: [
          "Experience managing a bank's investment portfolio",
          'Experience training new bank tellers',
          'Experience handling customer complaints',
        ],
        explanation:
          '本文に"she coordinated store operations across multiple locations"と明記されている。',
        translation: 'Sarita Menonさんは新しい役職にどのような経験を持っていますか。',
      },
      {
        question: "What will be Menon's first project?",
        correctText: "Extending the branch's weekend hours",
        distractors: [
          'Hiring several new tellers',
          'Opening a second downtown branch',
          'Redesigning the branch lobby',
        ],
        explanation:
          '本文に"Menon\'s first project will be extending the branch\'s hours on weekends"と明記されている。',
        translation: 'Menonさんの最初のプロジェクトは何になりますか。',
      },
    ],
  },
  {
    setId: 'p7s-022',
    difficulty: 2,
    tags: ['推論', 'スキャン'],
    keyVocabWords: ['malfunction', 'troubleshoot', 'technician'],
    passageKind: 'chat',
    passageText:
      "Owen Baxter [1:20 p.m.]\nThe printer on the third floor is jammed again and won't print anything.\n\nMei Zhang [1:22 p.m.]\nI tried to troubleshoot it earlier but couldn't find the paper causing the jam. Might be a bigger malfunction.\n\nOwen Baxter [1:23 p.m.]\nOkay, I'll put in a request for a technician to come take a look.\n\nMei Zhang [1:24 p.m.]\nGood idea. In the meantime, I'll let the team know to use the printer on the fourth floor.",
    subQuestions: [
      {
        question: 'What problem are Owen Baxter and Mei Zhang discussing?',
        correctText: 'A malfunctioning printer',
        distractors: ['A slow internet connection', 'A broken elevator', 'A missing shipment'],
        explanation:
          '会話冒頭で"The printer on the third floor is jammed again"と述べられており、プリンターの不具合について話していることが分かる。',
        translation: 'Owen BaxterとMei Zhangは何の問題について話し合っていますか。',
      },
      {
        question: 'What will Owen Baxter most likely do next?',
        correctText: 'Submit a request for a technician',
        distractors: [
          'Attempt to repair the printer himself',
          'Order a replacement printer',
          'Move the printer to another floor',
        ],
        explanation:
          '本文に"I\'ll put in a request for a technician to come take a look"と明記されている。',
        translation: 'Owen Baxterは次に何をすると考えられますか。',
      },
      {
        question: 'What does Mei Zhang say she will do?',
        correctText: 'Tell the team to use a different printer',
        distractors: [
          'Contact the technician directly',
          'Buy more paper for the printer',
          'File a report with building management',
        ],
        explanation:
          '本文最後に"I\'ll let the team know to use the printer on the fourth floor"と明記されている。',
        translation: 'Mei Zhangは何をすると言っていますか。',
      },
    ],
  },
  {
    setId: 'p7s-023',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['vacation', 'supervisor'],
    passageKind: 'form',
    passageText:
      'VACATION REQUEST FORM — POLICY NOTICE\n\nAll vacation requests must be submitted at least two weeks in advance and approved by your supervisor before time off is confirmed. Requests submitted with less notice will only be approved in exceptional circumstances. Employees should not make non-refundable travel arrangements until they receive written approval. Vacation balances can be checked at any time through the employee portal.',
    subQuestions: [
      {
        question: 'When must vacation requests be submitted?',
        correctText: 'At least two weeks in advance',
        distractors: [
          'One week in advance at the latest',
          'By the end of each quarter',
          'After receiving written approval',
        ],
        explanation:
          '本文に"All vacation requests must be submitted at least two weeks in advance"と明記されている。1週間前では遅く、四半期末や承認後の提出は本文の規定と合わない。',
        translation: '休暇申請はいつまでに提出しなければなりませんか。',
      },
      {
        question: 'What are employees advised not to do before receiving approval?',
        correctText: 'Make non-refundable travel arrangements',
        distractors: [
          'Check their vacation balance online',
          'Discuss their plans with their supervisor',
          'Submit the form more than two weeks early',
        ],
        explanation:
          '本文に"should not make non-refundable travel arrangements until they receive written approval"と明記されている。',
        translation: '承認を受ける前に、従業員は何をしないよう助言されていますか。',
      },
    ],
  },
  {
    setId: 'p7s-024',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['recruit', 'candidate'],
    passageKind: 'advertisement',
    passageText:
      'Job Fair — Meet Local Employers\n\nJoin us on Saturday, April 12, at the Riverside Convention Center for a job fair featuring more than thirty local employers looking to recruit new staff. Candidates are encouraged to bring several copies of their resume and dress professionally, as some employers may conduct brief interviews on the spot. Free resume review sessions will be offered throughout the day by career counselors. Admission is free, and the event runs from 10 a.m. to 3 p.m.',
    subQuestions: [
      {
        question: 'What is the purpose of the event?',
        correctText: 'To connect job seekers with local employers',
        distractors: [
          'To train employees in a new skill',
          'To celebrate the opening of a convention center',
          'To collect donations for a local charity',
        ],
        explanation:
          '本文全体が求職者と地元企業を結びつける就職フェアの案内であり、他の選択肢の内容は述べられていない。',
        translation: 'このイベントの目的は何ですか。',
      },
      {
        question: 'What are candidates encouraged to bring?',
        correctText: 'Several copies of their resume',
        distractors: [
          'A letter of recommendation',
          'A completed job application',
          'A list of references',
        ],
        explanation:
          '本文に"Candidates are encouraged to bring several copies of their resume"と明記されている。',
        translation: '参加者は何を持参するよう勧められていますか。',
      },
      {
        question: 'What is suggested about some of the employers at the event?',
        correctText: 'They may interview candidates on the spot',
        distractors: [
          'They will only accept online applications',
          'They require a second interview at their office',
          'They are hiring exclusively for management roles',
        ],
        explanation:
          '本文に"some employers may conduct brief interviews on the spot"とあり、当日その場で面接を行う可能性があることが読み取れる。',
        translation: '参加企業の一部について何が示唆されていますか。',
      },
    ],
  },
  {
    setId: 'p7s-025',
    difficulty: 4,
    tags: ['パラフレーズ照合', 'スキャン'],
    keyVocabWords: ['markup', 'consolidate'],
    passageKind: 'email',
    passageText:
      'Subject: Notice of Price Adjustment — Effective Next Quarter\n\nDear Valued Partner,\n\nAfter reviewing our costs, we must inform you that prices for several product lines will increase by an average of six percent starting next quarter. This adjustment reflects rising material costs and is intended to keep our markup at a sustainable level rather than to expand profit margins. To help offset the impact, we plan to consolidate several smaller shipments into fewer, larger deliveries, which should reduce your overall shipping costs. Customers who sign a twelve-month supply agreement before the increase takes effect will be able to lock in current pricing for that period. Please contact your account representative if you would like to discuss this option.\n\nSincerely,\nSales Department',
    subQuestions: [
      {
        question: 'Why is the email being sent?',
        correctText: 'To notify customers of an upcoming price increase',
        distractors: [
          'To announce a new product line',
          'To apologize for a shipping delay',
          'To offer a refund on recent orders',
        ],
        explanation:
          'メール全体が価格改定の通知であり、新製品発表・配送遅延の謝罪・返金の話題ではない。',
        translation: 'このメールはなぜ送られていますか。',
      },
      {
        question: 'What is given as the reason for the price increase?',
        correctText: 'Rising material costs',
        distractors: [
          'A decrease in customer demand',
          'A new government tax on shipping',
          'An expansion into new markets',
        ],
        explanation: '本文に"This adjustment reflects rising material costs"と明記されている。',
        translation: '価格上昇の理由として何が挙げられていますか。',
      },
      {
        question: 'How does the company plan to reduce the impact on customers?',
        correctText: 'By combining shipments into larger deliveries',
        distractors: [
          'By offering a permanent discount to all customers',
          'By delaying the price increase by one year',
          'By reducing the number of available product lines',
        ],
        explanation:
          '本文に"we plan to consolidate several smaller shipments into fewer, larger deliveries, which should reduce your overall shipping costs"と明記されている。',
        translation: '会社は顧客への影響をどのように減らす予定ですか。',
      },
      {
        question: 'What can customers do to keep the current price?',
        correctText: 'Sign a twelve-month supply agreement before the increase',
        distractors: [
          "Switch to a competitor's product",
          'Pay for a full year of orders in advance',
          'Reduce the size of their typical order',
        ],
        explanation:
          '本文に"Customers who sign a twelve-month supply agreement before the increase takes effect will be able to lock in current pricing"と明記されている。',
        translation: '顧客は現在の価格を維持するために何をすればよいですか。',
      },
    ],
  },
  {
    setId: 'p7s-026',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['inspection', 'maintenance'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Elevator Inspection Results\n\nThe annual elevator inspection was completed last week, and both elevators in the East Building passed all safety requirements. Routine maintenance will still take place on the first Monday of each month, during which one elevator may be temporarily out of service. The inspection certificate is posted inside each elevator car as required by local regulations.',
    subQuestions: [
      {
        question: 'What is the notice mainly about?',
        correctText: 'The results of an elevator safety inspection',
        distractors: [
          'A plan to install new elevators',
          'A complaint about elevator noise',
          'A change in building operating hours',
        ],
        explanation:
          '本文全体がエレベーターの安全検査結果について述べており、他の選択肢の内容は述べられていない。',
        translation: 'この案内は主に何についてのものですか。',
      },
      {
        question: 'When does routine maintenance take place?',
        correctText: 'On the first Monday of each month',
        distractors: [
          'On the last Friday of each month',
          'Every weekend',
          'Only when a problem is reported',
        ],
        explanation:
          '本文に"Routine maintenance will still take place on the first Monday of each month"と明記されている。',
        translation: '定期メンテナンスはいつ行われますか。',
      },
    ],
  },
  {
    setId: 'p7s-027',
    difficulty: 3,
    tags: ['先読み', 'パラフレーズ照合'],
    keyVocabWords: ['launch', 'sample', 'feedback'],
    passageKind: 'article',
    passageText:
      "New Product Line Debuts to Positive Response\n\nHomeware brand Everclare launched its new line of kitchen storage containers at a company event last Friday, drawing a larger crowd than expected. Attendees were given free samples to try at home and asked to submit feedback through an online form within two weeks. Early feedback has focused on the containers' stackable design, which many attendees said would help save space in small kitchens. The company said it plans to use this feedback to adjust the product line before a wider retail launch planned for early next year.",
    subQuestions: [
      {
        question: 'What is the article mainly about?',
        correctText: 'The launch of a new product line',
        distractors: [
          "A company's decision to close a product line",
          'A recall of a defective kitchen product',
          'A partnership between two companies',
        ],
        explanation:
          '記事全体が新製品ラインの発表イベントについて述べており、他の選択肢の内容は述べられていない。',
        translation: 'この記事は主に何についてのものですか。',
      },
      {
        question: 'What did attendees receive at the event?',
        correctText: 'Free samples of the new product',
        distractors: [
          'A discount coupon for future purchases',
          'A gift card to a local store',
          'A printed catalog of all products',
        ],
        explanation: '本文に"Attendees were given free samples to try at home"と明記されている。',
        translation: '参加者はこのイベントで何を受け取りましたか。',
      },
      {
        question: 'What will the company do with the feedback it receives?',
        correctText: 'Use it to adjust the product before a wider launch',
        distractors: [
          'Use it to decide whether to end the product line',
          'Share it publicly on social media',
          'Use it to set a lower retail price',
        ],
        explanation:
          '本文に"plans to use this feedback to adjust the product line before a wider retail launch"と明記されている。',
        translation: '会社は受け取ったフィードバックをどのように活用しますか。',
      },
    ],
  },
  {
    setId: 'p7s-028',
    difficulty: 2,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['catering'],
    passageKind: 'chat',
    passageText:
      "Nadia Petrov [11:40 a.m.]\nThe catering order for today's lunch meeting came with the wrong sandwiches — we ordered vegetarian and got all turkey.\n\nJerome Wallace [11:42 a.m.]\nOh no. I'll call the caterer and ask them to send a correction right away.\n\nNadia Petrov [11:43 a.m.]\nThanks. The meeting starts at noon, so we don't have much time.\n\nJerome Wallace [11:44 a.m.]\nUnderstood, I'll ask them to rush it and let you know what they say.",
    subQuestions: [
      {
        question: 'What problem is being discussed?',
        correctText: 'A catering order was incorrect',
        distractors: [
          'A meeting room was double-booked',
          'A guest speaker canceled at the last minute',
          'The meeting was moved to a different time',
        ],
        explanation:
          '本文冒頭で"came with the wrong sandwiches"と述べられており、ケータリング注文の間違いについて話していることが分かる。',
        translation: 'どのような問題について話し合われていますか。',
      },
      {
        question: 'What will Jerome Wallace most likely do next?',
        correctText: 'Contact the caterer about the mistake',
        distractors: [
          'Go to the store to buy replacement food',
          'Cancel the lunch meeting',
          'Ask Nadia Petrov to call the caterer instead',
        ],
        explanation:
          '本文に"I\'ll call the caterer and ask them to send a correction right away"と明記されている。',
        translation: 'Jerome Wallaceは次に何をすると考えられますか。',
      },
    ],
  },
  {
    setId: 'p7s-029',
    difficulty: 3,
    tags: ['スキャン'],
    keyVocabWords: ['training'],
    passageKind: 'form',
    passageText:
      'TRAINING SESSION SIGN-UP FORM — INSTRUCTIONS\n\nUse this form to register for one of the upcoming software training sessions offered by the IT department. Sessions are limited to fifteen participants each, so early sign-up is recommended. Each session runs for two hours and covers the same material, so employees only need to attend one session. A laptop will be provided for the session, but participants may bring their own if preferred. Confirmation of your registered session will be sent by email within two business days.',
    subQuestions: [
      {
        question: 'What is this form used for?',
        correctText: 'Signing up for a software training session',
        distractors: [
          'Requesting a new laptop for work',
          'Reporting a problem with software',
          'Applying for a position in the IT department',
        ],
        explanation:
          '見出しと本文全体が研修セッションへの登録手続きを説明しており、他の選択肢の内容ではない。',
        translation: 'このフォームは何のために使われますか。',
      },
      {
        question: 'Why are employees advised to sign up early?',
        correctText: 'Sessions are limited to fifteen participants',
        distractors: [
          'The form will be removed after one week',
          'Only three sessions will be offered this year',
          'Late sign-ups are charged an additional fee',
        ],
        explanation:
          '本文に"Sessions are limited to fifteen participants each, so early sign-up is recommended"と明記されている。',
        translation: '従業員はなぜ早めに登録するよう勧められていますか。',
      },
      {
        question: 'What is provided for participants during the session?',
        correctText: 'A laptop, although participants may bring their own',
        distractors: [
          'A printed manual for each participant',
          'Lunch and refreshments',
          'A certificate of completion',
        ],
        explanation:
          '本文に"A laptop will be provided for the session, but participants may bring their own if preferred"と明記されている。',
        translation: '参加者にはセッション中に何が提供されますか。',
      },
    ],
  },
  {
    setId: 'p7s-030',
    difficulty: 3,
    tags: ['スキャン', 'パラフレーズ照合'],
    keyVocabWords: ['lease', 'tenant', 'maintenance'],
    passageKind: 'advertisement',
    passageText:
      'Office Space Available for Lease\n\nA newly renovated office suite is now available for lease in the downtown business district. The premises include three private offices, an open work area, and a shared conference room, totaling approximately 2,000 square feet. The lease term is flexible, with options ranging from one to five years. Interested tenants should contact the property manager to schedule a viewing. Utilities and building maintenance are included in the monthly rate.',
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: 'An office space available for rent',
        distractors: [
          'A house for sale',
          'A warehouse for short-term storage',
          'A retail store for lease',
        ],
        explanation:
          '本文全体がオフィススペースの賃貸案内であり、他の選択肢の内容は述べられていない。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'What is included in the monthly rate?',
        correctText: 'Utilities and building maintenance',
        distractors: [
          'Office furniture and equipment',
          'Parking for all employees',
          'Cleaning services twice a week',
        ],
        explanation:
          '本文に"Utilities and building maintenance are included in the monthly rate"と明記されている。',
        translation: '月額料金には何が含まれていますか。',
      },
      {
        question: 'What should interested tenants do next?',
        correctText: 'Contact the property manager to schedule a viewing',
        distractors: [
          'Submit a deposit online',
          'Sign the lease agreement immediately',
          'Visit the building without an appointment',
        ],
        explanation:
          '本文に"Interested tenants should contact the property manager to schedule a viewing"と明記されている。',
        translation: '興味を持ったテナントは次に何をすべきですか。',
      },
    ],
  },
  {
    setId: 'p7s-031',
    difficulty: 4,
    tags: ['先読み', 'スキャン'],
    keyVocabWords: ['contractor', 'proposal'],
    passageKind: 'email',
    passageText:
      'Subject: Request for Proposal — Office Renovation Project\n\nDear Mr. Ibrahim,\n\nWe are seeking a contractor for a renovation project at our downtown office and would like to invite your company to submit a proposal. The project includes updating the second-floor conference rooms and replacing outdated lighting throughout the building. Please include a detailed cost estimate, a proposed timeline, and references from at least two similar projects completed within the past three years. Proposals must be submitted by August 15, and we plan to select a contractor by the end of the month. Work would need to begin no later than mid-September to avoid conflicts with our busiest season. Please let us know if you have any questions about the scope of work.\n\nBest regards,\nFacilities Management',
    subQuestions: [
      {
        question: 'What is the purpose of the email?',
        correctText: 'To request a proposal for a renovation project',
        distractors: [
          'To confirm a contract has been signed',
          'To cancel a previously planned project',
          'To report a problem with recent construction work',
        ],
        explanation:
          'メール全体が改装工事の提案書提出依頼であり、契約締結の確認・計画中止・工事の不具合報告ではない。',
        translation: 'このメールの目的は何ですか。',
      },
      {
        question: 'What must be included in the proposal?',
        correctText: 'A cost estimate, a timeline, and references',
        distractors: [
          'A list of subcontractors only',
          'A sample floor plan of the office',
          "A copy of the contractor's business license",
        ],
        explanation:
          '本文に"a detailed cost estimate, a proposed timeline, and references from at least two similar projects"と明記されている。',
        translation: '提案書には何を含める必要がありますか。',
      },
      {
        question: 'When must the work begin?',
        correctText: 'No later than mid-September',
        distractors: [
          'Immediately after the proposal is submitted',
          'By the end of August',
          'Before the references are checked',
        ],
        explanation:
          '本文に"Work would need to begin no later than mid-September"と明記されている。',
        translation: '工事はいつまでに開始する必要がありますか。',
      },
      {
        question: 'Why does the work need to begin by that time?',
        correctText: 'To avoid conflicts with the busiest season',
        distractors: [
          'Because the building will be sold soon',
          'Because the lighting is a safety hazard',
          'Because the current contractor is unavailable later',
        ],
        explanation: '本文に"to avoid conflicts with our busiest season"と明記されている。',
        translation: 'なぜその時期までに工事を開始する必要があるのですか。',
      },
    ],
  },
  {
    setId: 'p7s-032',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['compliance', 'authorize'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Security Badge Policy Reminder\n\nAll employees are reminded to wear their security badge visibly while inside the building, in compliance with company policy. Badges must be authorized by your department before they can be used to access restricted floors. Employees who lose their badge should report it to the security desk immediately so it can be deactivated. Temporary badges are available for same-day use while a replacement is processed.',
    subQuestions: [
      {
        question: 'What are employees reminded to do?',
        correctText: 'Wear their security badge visibly',
        distractors: [
          'Report to a new department',
          'Change their password monthly',
          'Attend a compliance training session',
        ],
        explanation: '本文冒頭に"reminded to wear their security badge visibly"と明記されている。',
        translation: '従業員は何をするよう注意喚起されていますか。',
      },
      {
        question: 'What should employees do if they lose their badge?',
        correctText: 'Report it to the security desk immediately',
        distractors: [
          'Wait until the next business day to report it',
          'Ask a coworker to lend them a badge',
          'Submit a written incident report by email',
        ],
        explanation:
          '本文に"should report it to the security desk immediately so it can be deactivated"と明記されている。',
        translation: 'バッジを紛失した場合、従業員は何をすべきですか。',
      },
      {
        question: 'What is available while a replacement badge is processed?',
        correctText: 'A temporary badge for same-day use',
        distractors: [
          'A permanent exemption from the badge policy',
          'Access to only the ground floor',
          'A discount on the replacement fee',
        ],
        explanation:
          '本文に"Temporary badges are available for same-day use while a replacement is processed"と明記されている。',
        translation: '交換バッジの手続き中には何が利用できますか。',
      },
    ],
  },
  {
    setId: 'p7s-033',
    difficulty: 4,
    tags: ['推論', 'パラフレーズ照合'],
    keyVocabWords: ['headquarters', 'lease', 'infrastructure'],
    passageKind: 'article',
    passageText:
      "Tech Firm to Relocate Headquarters\n\nBrightline Technologies announced this week that it will relocate its headquarters from the suburbs to a larger building in the downtown core, citing the need for better infrastructure to support its growing workforce. The company's current lease expires at the end of the year, which company leaders said made this an ideal time to move rather than renew in a building that no longer meets its needs. The new headquarters will include expanded server rooms and additional meeting space, both of which have been in short supply at the current location. The move is expected to be completed over a single weekend to minimize disruption, with most employees working remotely during the transition. Some employees have expressed concern about longer commute times, though the company says the new location is closer to major public transit lines.",
    subQuestions: [
      {
        question: 'Why is the company relocating its headquarters?',
        correctText: 'To gain better infrastructure for its growing workforce',
        distractors: [
          'To reduce the total number of employees',
          'Because the current building will be demolished',
          'Because the company is merging with another firm',
        ],
        explanation:
          '本文に"citing the need for better infrastructure to support its growing workforce"と明記されている。',
        translation: '会社はなぜ本社を移転するのですか。',
      },
      {
        question: 'What is suggested about the timing of the move?',
        correctText: 'It coincides with the expiration of the current lease',
        distractors: [
          'It was delayed due to a construction problem',
          'It was moved earlier than originally planned',
          'It depends on approval from local government',
        ],
        explanation:
          '本文に"The company\'s current lease expires at the end of the year, which...made this an ideal time to move"とあり、リース期限と移転時期が関連していることが分かる。',
        translation: '移転のタイミングについて何が示唆されていますか。',
      },
      {
        question: 'How will employees most likely be affected during the move?',
        correctText: 'Most will work remotely for a short period',
        distractors: [
          'Most will be temporarily laid off',
          'Most will need to relocate their homes',
          'Most will be assigned to a different department',
        ],
        explanation:
          '本文に"with most employees working remotely during the transition"と明記されている。',
        translation: '移転中、従業員はどのような影響を受けると考えられますか。',
      },
      {
        question: 'What concern have some employees raised about the new location?',
        correctText: 'Longer commute times',
        distractors: [
          'A lack of meeting space',
          'Higher parking costs',
          'Limited access to public transit',
        ],
        explanation:
          '本文に"Some employees have expressed concern about longer commute times"と明記されている。',
        translation: '一部の従業員は新しい場所についてどのような懸念を示していますか。',
      },
    ],
  },
  {
    setId: 'p7s-034',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['reschedule', 'confirm'],
    passageKind: 'chat',
    passageText:
      "Elena Voss [4:05 p.m.]\nHeads up, the webinar platform we booked is having technical issues today. Should we still go ahead tomorrow?\n\nCarlos Mendez [4:07 p.m.]\nProbably not worth the risk. Let's reschedule to Thursday and give the platform time to fix things.\n\nElena Voss [4:08 p.m.]\nAgreed. I'll email the registered attendees today to let them know.\n\nCarlos Mendez [4:09 p.m.]\nSounds good. I'll confirm the new time with the platform support team as well.",
    subQuestions: [
      {
        question: 'What are Elena Voss and Carlos Mendez discussing?',
        correctText: 'Postponing a webinar because of a technical problem',
        distractors: [
          'Canceling a webinar due to low registration',
          'Choosing a new platform for future webinars',
          'Preparing slides for an upcoming presentation',
        ],
        explanation:
          '会話全体が技術的な問題によるウェビナーの延期について話しており、他の選択肢の話題ではない。',
        translation: 'Elena VossとCarlos Mendezは何について話し合っていますか。',
      },
      {
        question: 'What will Elena Voss most likely do next?',
        correctText: 'Email the registered attendees',
        distractors: [
          'Cancel the webinar completely',
          'Contact the platform support team',
          'Reschedule the webinar to next week',
        ],
        explanation:
          '本文に"I\'ll email the registered attendees today to let them know"と明記されている。',
        translation: 'Elena Vossは次に何をすると考えられますか。',
      },
      {
        question: 'What does Carlos Mendez say he will do?',
        correctText: 'Confirm the new time with platform support',
        distractors: [
          'Notify the registered attendees himself',
          'Look for a different webinar platform',
          'Ask Elena Voss to lead the webinar instead',
        ],
        explanation:
          '本文最後に"I\'ll confirm the new time with the platform support team as well"と明記されている。',
        translation: 'Carlos Mendezは何をすると言っていますか。',
      },
    ],
  },
  {
    setId: 'p7s-035',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['survey', 'satisfaction', 'feedback'],
    passageKind: 'form',
    passageText:
      'CUSTOMER SATISFACTION SURVEY — INSTRUCTIONS\n\nThank you for choosing Parkview Appliance Repair. Please take a few minutes to complete this satisfaction survey about your recent service visit. Your feedback helps us train our technicians and improve our scheduling process. The survey includes ten short questions and should take about five minutes to complete. All responses are kept confidential and are not shared with the technician who visited your home. Customers who complete the survey within one week of their service visit will receive a small discount on their next repair.',
    subQuestions: [
      {
        question: 'What is the purpose of the survey?',
        correctText: 'To gather feedback about a recent service visit',
        distractors: [
          'To schedule a new repair appointment',
          'To collect payment for a completed service',
          'To advertise new appliance products',
        ],
        explanation:
          '本文全体が最近のサービス訪問についてのフィードバック収集を目的としており、他の選択肢の内容ではない。',
        translation: 'この調査の目的は何ですか。',
      },
      {
        question: 'How long is the survey expected to take?',
        correctText: 'About five minutes',
        distractors: ['About thirty minutes', 'Less than one minute', 'About one hour'],
        explanation: '本文に"should take about five minutes to complete"と明記されている。',
        translation: 'この調査にはどのくらいの時間がかかると予想されますか。',
      },
      {
        question: 'What is stated about customer responses?',
        correctText: 'They are not shared with the technician',
        distractors: [
          'They are posted publicly online',
          'They are shared with the technician after thirty days',
          'They are reviewed only by the customer service team',
        ],
        explanation:
          '本文に"are not shared with the technician who visited your home"と明記されている。',
        translation: '顧客の回答についてどのように述べられていますか。',
      },
      {
        question: 'What benefit is offered for completing the survey quickly?',
        correctText: 'A discount on the next repair',
        distractors: [
          'A free appliance inspection',
          'A gift card to a local store',
          'An extended warranty on the repaired appliance',
        ],
        explanation:
          '本文に"Customers who complete the survey within one week...will receive a small discount on their next repair"と明記されている。',
        translation: '早めに調査に回答すると、どのような特典がありますか。',
      },
    ],
  },
  {
    setId: 'p7s-036',
    difficulty: 3,
    tags: ['スキャン'],
    keyVocabWords: ['warehouse', 'inventory', 'shipment'],
    passageKind: 'advertisement',
    passageText:
      'Now Hiring: Warehouse Associate\n\nParkline Distribution is looking for full-time warehouse associates to join our growing team. Responsibilities include receiving shipments, managing inventory records, and preparing orders for delivery. No previous warehouse experience is required, as full training will be provided during the first two weeks. Candidates must be able to lift up to fifty pounds and stand for extended periods. This position offers a starting wage above the local minimum along with health benefits after ninety days of employment.',
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: 'A job opening at a warehouse',
        distractors: [
          'A training course in logistics',
          'A warehouse space for rent',
          'A shipment tracking service',
        ],
        explanation: '本文全体が倉庫作業員の求人であり、他の選択肢の内容は述べられていない。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'What is stated about previous experience?',
        correctText: 'It is not required',
        distractors: [
          'At least one year is required',
          'It is preferred but not required',
          'It is required only for night shifts',
        ],
        explanation:
          '本文に"No previous warehouse experience is required, as full training will be provided"と明記されている。',
        translation: '以前の経験についてどのように述べられていますか。',
      },
      {
        question: 'When do health benefits begin?',
        correctText: 'After ninety days of employment',
        distractors: [
          'Immediately upon hiring',
          'After one year of employment',
          'After the two-week training period',
        ],
        explanation: '本文に"health benefits after ninety days of employment"と明記されている。',
        translation: '健康保険の福利厚生はいつから始まりますか。',
      },
    ],
  },
  {
    setId: 'p7s-037',
    difficulty: 4,
    tags: ['推論', 'パラフレーズ照合'],
    keyVocabWords: ['invoice', 'reconcile', 'apologize'],
    passageKind: 'email',
    passageText:
      'Subject: Apology for Duplicate Billing\n\nDear Mr. Fontaine,\n\nWe recently discovered that your account was billed twice for invoice 7729 due to an error in our new billing system. We sincerely apologize for this mistake and any confusion it may have caused. Our accounting team has already reconciled your account, and the duplicate charge of $340 has been refunded to the card on file. You should see the refund reflected on your statement within three to five business days. We have also flagged this account to ensure no similar errors occur with future invoices. As a gesture of goodwill, we would like to offer a ten percent discount on your next order. Please let us know if the refund does not appear as expected.\n\nSincerely,\nBilling Department',
    subQuestions: [
      {
        question: 'Why was the email sent?',
        correctText: 'To apologize for being charged twice for one invoice',
        distractors: [
          'To request payment for an overdue invoice',
          'To announce a change in billing software',
          'To inform the customer of a canceled order',
        ],
        explanation:
          'メール全体が二重課金についての謝罪であり、支払い依頼・システム変更の告知・注文取消の話題ではない。',
        translation: 'このメールはなぜ送られましたか。',
      },
      {
        question: 'What caused the billing error?',
        correctText: 'An error in a new billing system',
        distractors: [
          'A mistake made by the customer',
          'A delay in processing payments',
          'An outdated invoice template',
        ],
        explanation: '本文に"due to an error in our new billing system"と明記されている。',
        translation: '課金の誤りの原因は何でしたか。',
      },
      {
        question: 'What has already been done to resolve the issue?',
        correctText: 'The duplicate charge has been refunded',
        distractors: [
          "The customer's account has been closed",
          'A new invoice has been issued',
          'The billing department has been reorganized',
        ],
        explanation:
          '本文に"the duplicate charge of $340 has been refunded to the card on file"と明記されている。',
        translation: 'この問題を解決するために既に何が行われましたか。',
      },
      {
        question: 'What is offered as a gesture of goodwill?',
        correctText: 'A ten percent discount on the next order',
        distractors: [
          'A full refund of the original invoice',
          'Free shipping for one year',
          'A complimentary product sample',
        ],
        explanation:
          '本文に"we would like to offer a ten percent discount on your next order"と明記されている。',
        translation: '誠意のしるしとして何が提供されていますか。',
      },
    ],
  },
  {
    setId: 'p7s-038',
    difficulty: 3,
    tags: ['スキャン'],
    keyVocabWords: ['network', 'technician'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Scheduled Network Maintenance\n\nThe company network will undergo scheduled maintenance this Saturday from 1 a.m. to 5 a.m. During this window, remote access to shared files and internal systems will be unavailable. Technicians will be monitoring the process throughout the night and expect no disruption to services once maintenance is complete. Employees do not need to take any action, but anyone working remotely during this time should plan accordingly.',
    subQuestions: [
      {
        question: 'What will happen this Saturday?',
        correctText: 'Scheduled network maintenance will take place',
        distractors: [
          'The office will be closed for cleaning',
          'A new network system will be installed permanently',
          'All employees will receive new equipment',
        ],
        explanation: '見出しと本文全体が予定されたネットワークメンテナンスについて述べている。',
        translation: '今週土曜日に何が行われますか。',
      },
      {
        question: 'What will be unavailable during the maintenance window?',
        correctText: 'Remote access to shared files and internal systems',
        distractors: [
          "The company's public website",
          'Employee email accounts only',
          "The building's security system",
        ],
        explanation:
          '本文に"remote access to shared files and internal systems will be unavailable"と明記されている。',
        translation: 'メンテナンス中は何が利用できなくなりますか。',
      },
      {
        question: 'What should employees working remotely during this time do?',
        correctText: 'Plan accordingly',
        distractors: [
          'Come into the office instead',
          'Contact the help desk in advance',
          'Complete a special access request form',
        ],
        explanation:
          '本文に"anyone working remotely during this time should plan accordingly"と明記されている。',
        translation: 'その間リモートで働く従業員は何をすべきですか。',
      },
    ],
  },
  {
    setId: 'p7s-039',
    difficulty: 4,
    tags: ['先読み', 'パラフレーズ照合', '推論'],
    keyVocabWords: ['milestone', 'loyalty', 'testimonial'],
    passageKind: 'article',
    passageText:
      "Family-Owned Bakery Celebrates Twenty Years\n\nMillhouse Bakery marked a significant milestone this month, celebrating twenty years of business in the same downtown location. The bakery, still run by its founding family, held a weekend celebration featuring free samples and a display of photographs from its early years. Longtime customers were invited to share testimonials about their favorite memories, several of which will be featured on the bakery's newly redesigned website. The owner said the bakery's loyalty program, launched five years ago, has played a major role in maintaining a steady customer base despite competition from larger chains. Looking ahead, the family plans to open a second, smaller location within the next two years.",
    subQuestions: [
      {
        question: 'What is the article mainly about?',
        correctText: 'A bakery celebrating its twentieth anniversary',
        distractors: [
          'A bakery closing after twenty years',
          'A new bakery opening downtown',
          'A bakery changing ownership',
        ],
        explanation:
          '記事全体が創業20周年の祝賀イベントについて述べており、他の選択肢の内容ではない。',
        translation: 'この記事は主に何についてのものですか。',
      },
      {
        question: 'What were longtime customers invited to do?',
        correctText: 'Share testimonials about their memories',
        distractors: [
          'Vote for a new bakery logo',
          'Suggest new menu items',
          'Volunteer at the celebration event',
        ],
        explanation:
          '本文に"Longtime customers were invited to share testimonials about their favorite memories"と明記されている。',
        translation: '長年の顧客は何をするよう招かれましたか。',
      },
      {
        question: 'What does the owner credit for maintaining a steady customer base?',
        correctText: "The bakery's loyalty program",
        distractors: [
          'A recent expansion of the menu',
          'A partnership with a larger chain',
          'A reduction in prices',
        ],
        explanation:
          '本文に"the bakery\'s loyalty program...has played a major role in maintaining a steady customer base"と明記されている。',
        translation: '経営者は安定した顧客基盤の維持について何が要因だと考えていますか。',
      },
      {
        question: "What are the bakery's future plans?",
        correctText: 'To open a second, smaller location',
        distractors: [
          'To sell the business to a larger chain',
          'To move to a larger downtown building',
          'To focus only on online orders',
        ],
        explanation:
          '本文最後に"the family plans to open a second, smaller location within the next two years"と明記されている。',
        translation: 'このベーカリーの今後の計画は何ですか。',
      },
    ],
  },
  {
    setId: 'p7s-040',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['itinerary', 'conference', 'coordinate'],
    passageKind: 'chat',
    passageText:
      "Kwame Asante [8:15 a.m.]\nAre you driving to the conference next week, or should we coordinate a carpool?\n\nLucia Ferreira [8:17 a.m.]\nI was planning to drive. Happy to pick you up if that helps.\n\nKwame Asante [8:18 a.m.]\nThat would be great, thanks. Priya mentioned she might need a ride too.\n\nLucia Ferreira [8:19 a.m.]\nNo problem, my car fits three easily. I'll send over my address and a pickup time based on the conference itinerary.",
    subQuestions: [
      {
        question: 'What are Kwame Asante and Lucia Ferreira discussing?',
        correctText: 'Arranging transportation to a conference',
        distractors: [
          'Planning the agenda for a conference',
          'Booking hotel rooms for a trip',
          'Choosing which sessions to attend',
        ],
        explanation: '会話全体が会議への相乗り手配について話しており、他の選択肢の話題ではない。',
        translation: 'Kwame AsanteとLucia Ferreiraは何について話し合っていますか。',
      },
      {
        question: 'What does Lucia Ferreira offer to do?',
        correctText: 'Drive Kwame Asante to the conference',
        distractors: [
          'Book a rental car for the group',
          'Ask Priya to drive instead',
          "Pay for Kwame's parking at the venue",
        ],
        explanation: '本文に"Happy to pick you up if that helps"と明記されている。',
        translation: 'Lucia Ferreiraは何をすると申し出ていますか。',
      },
      {
        question: 'What will Lucia Ferreira do next?',
        correctText: 'Send her address and a pickup time',
        distractors: [
          'Confirm the booking with the conference organizer',
          'Ask Priya for her home address',
          'Print a copy of the conference itinerary',
        ],
        explanation:
          '本文最後に"I\'ll send over my address and a pickup time based on the conference itinerary"と明記されている。',
        translation: 'Lucia Ferreiraは次に何をしますか。',
      },
    ],
  },
]
