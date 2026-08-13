// Part3/4（audio_set）追加セットのデータ本体（T-84。正本: docs/15 T-84行・14の3.4節）。
// part34SetsS.tsと同じ規約: Part3（会話）10セット・Part4（トーク）10セット、各3設問=計60設問。
// scriptの話者表記は"A: ... B: ..."（Part3のみ）。keyVocabWordsはS/A/B語彙カード（600語）から選び、
// scriptに文字列として実在する語のみを使う。各設問はcorrectText/distractorsの形で書き、
// part34Question.tsのrotateSubQuestionChoicesが4択A〜Dへの決定的ローテーションを行う。
// 意図推定型サブ設問（Why does the speaker say ...型）はJ-40によりT-85で導入予定のため、
// 本ファイルでは既存3タグ（先読み・パラフレーズ照合・数字・時刻）の範囲に留める。

export interface Part34RawSubQuestion {
  question: string
  correctText: string
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
}

export interface Part34RawEntry {
  setId: string
  part: 3 | 4
  tags: string[]
  keyVocabWords: string[]
  script: string
  subQuestions: readonly [Part34RawSubQuestion, Part34RawSubQuestion, Part34RawSubQuestion]
  difficulty: number
}

export const PART34_ENTRIES_S2: Part34RawEntry[] = [
  // ============ Part3（2話者の会話）10セット ============
  {
    setId: 'p3-11',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['procurement', 'supplier'],
    script:
      "A: Have you heard back from the procurement team about the new laptops? B: Yes, they sent an estimate this morning, but the price is higher than we budgeted. A: How much higher are we talking about? B: About fifteen percent, mostly because of the upgraded graphics card they included by default. A: We probably don't need that upgrade for most of the team. B: That's true — I think we should ask two more suppliers before we decide, and see if a lower-spec model brings the price back in line. A: Good idea — let's compare all three quotes by Friday and bring whichever is cheapest to the department head for final approval.",
    subQuestions: [
      {
        question: 'What are the speakers mainly discussing?',
        correctText: 'The cost of new laptops',
        distractors: [
          'A delayed job interview',
          'A software installation problem',
          'An upcoming office move',
        ],
        explanation:
          '会話全体は新しいノートPCの見積もり価格について話している。他の選択肢（"An upcoming office move"／"A delayed job interview"／"A software installation problem"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは主に何について話していますか。',
      },
      {
        question: 'What problem does the man mention about the estimate?',
        correctText: 'It is higher than the budget',
        distractors: [
          'It arrived after the deadline',
          'It does not include installation',
          'It was sent to the wrong department',
        ],
        explanation:
          '男性は"the price is higher than we budgeted"と述べている。他の選択肢（"It arrived after the deadline"／"It does not include installation"／"It was sent to the wrong department"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '男性は見積もりについてどんな問題を挙げていますか。',
      },
      {
        question: 'What does the man suggest doing next?',
        correctText: 'Getting quotes from two more suppliers',
        distractors: [
          'Canceling the laptop purchase',
          'Approving the estimate immediately',
          'Asking for a discount from the same supplier',
        ],
        explanation:
          '男性は"we should ask two more suppliers before we decide"と提案している。他の選択肢（"Asking for a discount from the same supplier"／"Canceling the laptop purchase"／"Approving the estimate immediately"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '男性は次に何をすることを提案していますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-12',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['conference', 'attendee'],
    script:
      "A: How many attendees have registered for the conference so far? B: About three hundred, but registration doesn't close until next week, so the final number could be higher. A: That's more than last year already, and we haven't even sent the last reminder email yet. Should we book a bigger hall just in case? B: I'll check with the venue today and let you know by tomorrow. If the current hall can't be expanded, we might need to look at the convention center down the street instead. A: That works, as long as it doesn't push our budget too far over what we planned.",
    subQuestions: [
      {
        question: 'What are the speakers discussing?',
        correctText: 'Registration numbers for a conference',
        distractors: [
          'A schedule for a training workshop',
          "Complaints from last year's attendees",
          'A budget cut for the event',
        ],
        explanation:
          '会話は会議への登録者数について話している。他の選択肢（"A schedule for a training workshop"／"Complaints from last year\'s attendees"／"A budget cut for the event"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何について話していますか。',
      },
      {
        // クロスレビュー: 比較対象(登録者数)を設問文で明示（正答一意性は元から保たれているが設問が不完全だった）
        question: "How does this year's registration compare to last year's?",
        correctText: 'More people have registered already',
        distractors: [
          'Fewer people have registered',
          'The numbers are exactly the same',
          'No one has registered yet',
        ],
        explanation:
          '女性は"That\'s more than last year already"と述べている。他の選択肢（"Fewer people have registered"／"The numbers are exactly the same"／"No one has registered yet"）はこの会話・トークの中で述べられていない。',
        translation: '今年の登録者数は去年と比べてどうですか。',
      },
      {
        question: 'What will the man most likely do next?',
        correctText: 'Contact the venue about a larger hall',
        distractors: [
          'Cancel the conference',
          'Close registration early',
          'Ask the woman to lead the conference',
        ],
        explanation:
          '男性は"I\'ll check with the venue today"と述べている。他の選択肢（"Close registration early"／"Ask the woman to lead the conference"／"Cancel the conference"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '男性は次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-13',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['tenant', 'lease'],
    script:
      "A: A tenant on the fourth floor called about renewing their lease. B: Right, it expires at the end of next month. Did they say if they want to stay? A: Yes, they'd like to renew for another two years, but they're asking about a small discount because of some noise complaints last winter. B: That's understandable, given how long the construction next door dragged on. Do you know if they've been consistent with their payments otherwise? A: As far as I can tell, yes — no late payments in the file. B: Good. Let's review their payment history first, then get back to them by Wednesday with an answer on the discount.",
    subQuestions: [
      {
        question: 'What is the conversation mainly about?',
        correctText: 'Renewing a lease for a tenant',
        distractors: [
          'Repairing a broken elevator',
          'Hiring a new building manager',
          'Selling an office building',
        ],
        explanation:
          '会話は入居者の賃貸契約更新について話している。他の選択肢（"Selling an office building"／"Repairing a broken elevator"／"Hiring a new building manager"）はこの会話・トークの中で述べられていない。',
        translation: '会話は主に何についてですか。',
      },
      {
        question: 'What does the tenant want in addition to renewing?',
        correctText: 'A small discount',
        distractors: ['A larger unit', 'A shorter lease term', 'A private parking space'],
        explanation:
          'Aは"they\'re asking about a small discount"と述べている。他の選択肢（"A larger unit"／"A shorter lease term"／"A private parking space"）はこの会話・トークの中で述べられていない。',
        translation: 'その入居者は更新に加えて何を求めていますか。',
      },
      {
        question: 'What will the speakers do before responding to the tenant?',
        correctText: "Review the tenant's payment history",
        distractors: ['Raise the rent immediately', 'Ask the tenant to move out', 'Call a lawyer'],
        explanation:
          'Bは"Let\'s review their payment history first"と述べている。他の選択肢（"Call a lawyer"／"Raise the rent immediately"／"Ask the tenant to move out"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '話者たちは入居者に返答する前に何をしますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-14',
    part: 3,
    tags: ['数字・時刻'],
    keyVocabWords: ['workforce', 'overhead'],
    script:
      "A: The report says our workforce grew by twelve percent this quarter. B: That explains why overhead costs went up too — I noticed the utilities bill was much higher than usual. Do we have a plan to manage that? A: We're reviewing office space needs, since a few departments are already running out of desks, and a decision should come by the end of March. B: Should we consider a satellite office instead of expanding this building? A: That's on the table too, but for now the review is focused on this location. B: Good — let's revisit the numbers again in April once the review is finished.",
    subQuestions: [
      {
        question: 'What increased by twelve percent?',
        correctText: "The company's workforce",
        distractors: [
          "The company's annual revenue",
          'The number of office locations',
          'The marketing budget',
        ],
        explanation:
          'Aが"our workforce grew by twelve percent"と述べている。他の選択肢（"The marketing budget"／"The company\'s annual revenue"／"The number of office locations"）はこの会話・トークの中で述べられていない。',
        translation: '何が12パーセント増加しましたか。',
      },
      {
        question: 'When will a decision about office space be made?',
        correctText: 'By the end of March',
        distractors: ['By the end of this week', 'Sometime next year', 'It has already been made'],
        explanation:
          'Aは"a decision should come by the end of March"と述べている。他の選択肢（"By the end of this week"／"Sometime next year"／"It has already been made"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'オフィススペースについての決定はいつ下されますか。',
      },
      {
        question: 'What will the speakers do in April?',
        correctText: 'Look at the numbers again',
        distractors: [
          'Hire more staff',
          'Close one of the offices',
          'Present the report to clients',
        ],
        explanation:
          'Bは"let\'s revisit the numbers again in April"と述べている。他の選択肢（"Hire more staff"／"Close one of the offices"／"Present the report to clients"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '話者たちは4月に何をしますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-15',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['vacancy', 'candidate'],
    script:
      "A: We still haven't filled the vacancy in the accounting department. B: I know, but we did get a strong candidate yesterday. Her interview went really well, and she had a lot of relevant experience with the software we use. A: That's great news. When can we schedule a second round? B: She's available this Thursday afternoon, if that works for the hiring panel, though I should double-check with the finance director since he's traveling this week. A: Let's try to lock in the time regardless, and we can always move it if he's unavailable. B: Sounds good, I'll send the invite as soon as I hear back from him.",
    subQuestions: [
      {
        question: 'What department has an open position?',
        correctText: 'Accounting',
        distractors: ['Marketing', 'Human resources', 'Customer service'],
        explanation:
          'Aが"the vacancy in the accounting department"と述べている。他の選択肢（"Customer service"／"Marketing"／"Human resources"）はこの会話・トークの中で述べられていない。',
        translation: 'どの部署に欠員がありますか。',
      },
      {
        question: "How did the candidate's interview go?",
        correctText: 'It went very well',
        distractors: [
          'It was canceled at the last minute',
          'It did not go well',
          'It has not happened yet',
        ],
        explanation:
          'Bは"Her interview went really well"と述べている。他の選択肢（"It was canceled at the last minute"／"It did not go well"／"It has not happened yet"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その候補者の面接はどうでしたか。',
      },
      {
        question: 'When is the candidate available for a second interview?',
        correctText: 'Thursday afternoon',
        distractors: ['Tomorrow morning', 'Next Monday', 'She is not available this week'],
        explanation:
          'Bは"She\'s available this Thursday afternoon"と述べている。他の選択肢（"Tomorrow morning"／"Next Monday"／"She is not available this week"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その候補者はいつ2次面接に対応できますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-16',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['courier', 'dispatch'],
    // クロスレビュー: 原因が「適切なサイズの箱の在庫切れ」なので "replacement box"(代替) より
    // "the right size box" が状況に整合。scriptを変えるため要音声再生成
    script:
      "A: The courier just called — the package for the client wasn't dispatched this morning as planned. B: Why not? A: Apparently the warehouse ran out of the right size box, and the packing team didn't notice until they were ready to seal it. B: That's frustrating, especially since this client already complained about a late delivery last month. Can we get the right size box sent over so it can still go out today? A: I'll call the other warehouse across town — they usually keep extra stock of that size. B: Perfect, and let's ask the courier to hold the pickup window open a bit longer just in case.",
    subQuestions: [
      {
        question: 'What problem is being discussed?',
        correctText: 'A package was not sent out as planned',
        distractors: [
          'A courier lost a package',
          'A client canceled an order',
          'The warehouse closed early',
        ],
        explanation:
          '女性は荷物が予定どおり発送されなかったと述べている。他の選択肢（"A client canceled an order"／"The warehouse closed early"／"A courier lost a package"）はこの会話・トークの中で述べられていない。',
        translation: 'どんな問題について話していますか。',
      },
      {
        question: 'Why was the package not dispatched?',
        correctText: 'The warehouse ran out of the right size box',
        distractors: [
          'The courier company went on strike',
          'The client changed the delivery address',
          'The package was damaged',
        ],
        explanation:
          '女性は"the warehouse ran out of the right size box"と述べている。他の選択肢（"The package was damaged"／"The courier company went on strike"／"The client changed the delivery address"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'なぜその荷物は発送されなかったのですか。',
      },
      {
        question: 'What does the man want to do?',
        correctText: 'Send the right size box so it can still ship today',
        distractors: [
          'Cancel the shipment entirely',
          'Wait until tomorrow to ship it',
          'Ask the client to pick it up',
        ],
        explanation:
          '男性は"Can we get the right size box sent over so it can still go out today?"と述べている。他の選択肢（"Ask the client to pick it up"／"Cancel the shipment entirely"／"Wait until tomorrow to ship it"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '男性は何をしたいと考えていますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-17',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['discount', 'subscription'],
    script:
      "A: Are we still offering a discount for annual subscription renewals? B: Yes, ten percent if customers renew before their plan expires, though the terms page hasn't been updated in a while. A: A few customers have asked whether that applies to the premium tier too, since the current wording is a little vague. B: It should — the original policy was meant to cover every tier equally. Let me confirm with the billing team and update the website today so there's no more confusion. A: That would help a lot, especially with renewals picking up this month. B: Agreed, I'll also flag it to customer support so they can answer consistently.",
    subQuestions: [
      {
        question: 'What are the speakers discussing?',
        correctText: 'A discount for renewing a subscription',
        distractors: [
          'A price increase for new customers',
          'A refund policy change',
          'A new premium feature',
        ],
        explanation:
          '会話は年間契約更新の割引について話している。他の選択肢（"A price increase for new customers"／"A refund policy change"／"A new premium feature"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何について話していますか。',
      },
      {
        question: 'What condition applies to the discount?',
        correctText: 'Customers must renew before their plan expires',
        distractors: [
          'Customers must pay by credit card',
          'Customers must contact support first',
          'Customers must upgrade to the premium tier',
        ],
        explanation:
          '男性は"ten percent if customers renew before their plan expires"と述べている。他の選択肢（"Customers must pay by credit card"／"Customers must contact support first"／"Customers must upgrade to the premium tier"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その割引にはどんな条件が付きますか。',
      },
      {
        question: 'What will the man do next?',
        correctText: 'Confirm with the billing team and update the website',
        distractors: [
          'Cancel the discount program',
          'Call each customer individually',
          'Raise the discount to twenty percent',
        ],
        explanation:
          '男性は"let me confirm with the billing team and update the website today"と述べている。他の選択肢（"Cancel the discount program"／"Call each customer individually"／"Raise the discount to twenty percent"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '男性は次に何をしますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-18',
    part: 3,
    tags: ['数字・時刻'],
    keyVocabWords: ['probation', 'onboarding'],
    script:
      "A: How is the new hire doing during her probation period? B: Really well, actually. Her onboarding went smoothly, and her manager gave positive feedback last week about how quickly she picked up the new software. A: That's good to hear — I remember her previous role didn't use anything similar. When does the ninety-day period end? B: In about two weeks, on the fifteenth. A: Should we start preparing the paperwork for a permanent offer now, or wait until closer to the date? B: Let's wait until the manager submits the final review, just to be safe.",
    subQuestions: [
      {
        question: 'What is the topic of this conversation?',
        correctText: "A new employee's probation period",
        distractors: ['A delayed job offer', 'A performance complaint', 'A training budget'],
        explanation:
          '会話は新入社員の試用期間について話している。他の選択肢（"A delayed job offer"／"A performance complaint"／"A training budget"）はこの会話・トークの中で述べられていない。',
        translation: 'この会話の話題は何ですか。',
      },
      {
        question: "How did the new hire's onboarding go?",
        correctText: 'It went smoothly',
        distractors: ['It was delayed by a week', 'It did not go well', 'It has not started yet'],
        explanation:
          'Bは"Her onboarding went smoothly"と述べている。他の選択肢（"It has not started yet"／"It was delayed by a week"／"It did not go well"）はこの会話・トークの中で述べられていない。',
        translation: 'その新入社員の新人研修はどうでしたか。',
      },
      {
        question: 'When does the ninety-day period end?',
        correctText: 'In about two weeks',
        distractors: ['Tomorrow', 'In three months', 'It already ended'],
        explanation:
          'Bは"In about two weeks, on the fifteenth"と述べている。他の選択肢（"It already ended"／"Tomorrow"／"In three months"）はこの会話・トークの中で述べられていない。',
        translation: '90日間の期間はいつ終わりますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-19',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['sponsor', 'testimonial'],
    script:
      "A: The marketing team wants a local business to sponsor this year's charity run. B: I already spoke with a few shops downtown, and one bakery seemed interested, though they wanted to know how much visibility they'd get in return. A: We could offer their logo on the runner shirts and a mention on the event website, similar to what we did last year. Could you also collect a testimonial from last year's sponsor for the proposal, so the bakery can see how it worked out? B: Sure, I'll reach out to them this afternoon and put together a short summary for the pitch.",
    subQuestions: [
      {
        question: 'What are the speakers trying to arrange?',
        correctText: 'A sponsor for a charity run',
        distractors: [
          'A venue for a company party',
          'A new supplier for office snacks',
          'A speaker for a conference',
        ],
        explanation:
          '会話はチャリティーランのスポンサー探しについて話している。他の選択肢（"A venue for a company party"／"A new supplier for office snacks"／"A speaker for a conference"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何を手配しようとしていますか。',
      },
      {
        question: 'Who has shown interest so far?',
        correctText: 'A bakery downtown',
        distractors: [
          'A national supermarket chain',
          'A hotel across the street',
          'No one has shown interest',
        ],
        explanation:
          '男性は"one bakery seemed interested"と述べている。他の選択肢（"No one has shown interest"／"A national supermarket chain"／"A hotel across the street"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'これまでに関心を示したのは誰ですか。',
      },
      {
        question: 'What does the woman ask the man to collect?',
        correctText: "A testimonial from last year's sponsor",
        distractors: [
          'A quote from the bakery owner',
          'A list of past donors',
          "A photo from last year's event",
        ],
        explanation:
          '女性は"could you also collect a testimonial from last year\'s sponsor"と述べている。他の選択肢（"A quote from the bakery owner"／"A list of past donors"／"A photo from last year\'s event"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '女性は何を集めるよう男性に依頼していますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-20',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['zoning', 'permit'],
    script:
      "A: Have we heard back about the zoning permit for the new parking lot? B: Not yet. The city said it could take another three weeks to review, mostly because of a backlog from other pending applications. A: That's later than we planned for, especially since we told the client the lot would be ready by early summer. Will it affect the construction schedule? B: A little, but the contractor said they can adjust the start date if needed, since a couple of their other jobs are also running behind. A: As long as we can still finish before the client's grand opening, I think we're fine either way. B: I agree — I'll keep checking with the city every few days for an update.",
    subQuestions: [
      {
        question: 'What are the speakers waiting for?',
        correctText: 'Approval of a zoning permit',
        distractors: [
          'A final construction bill',
          'A response from a job applicant',
          'A shipment of building materials',
        ],
        explanation:
          '会話は用途地域の許可証の承認待ちについて話している。他の選択肢（"A response from a job applicant"／"A shipment of building materials"／"A final construction bill"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何を待っていますか。',
      },
      {
        question: 'How long might the review take?',
        correctText: 'Another three weeks',
        distractors: ['One more day', 'Six months', 'It has already been approved'],
        explanation:
          'Bは"it could take another three weeks to review"と述べている。他の選択肢（"One more day"／"Six months"／"It has already been approved"）はこの会話・トークの中で述べられていない。',
        translation: '審査にはどのくらいかかる可能性がありますか。',
      },
      {
        question: 'What did the contractor say?',
        correctText: 'They can adjust the start date if needed',
        distractors: [
          'They will cancel the project',
          'They need more workers',
          'They already started construction',
        ],
        explanation:
          'Bは"the contractor said they can adjust the start date if needed"と述べている。他の選択肢（"They will cancel the project"／"They need more workers"／"They already started construction"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '請負業者は何と言いましたか。',
      },
    ],
    difficulty: 3,
  },

  // ============ Part4（単一話者のトーク）10セット ============
  {
    setId: 'p4-11',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['survey', 'feedback'],
    script:
      "Thank you for shopping with us today. Before you leave, we would appreciate it if you could complete a short survey about your experience, either on your phone using the receipt code or on one of the tablets near the exit. It only takes about five minutes, and your feedback helps us improve our service, from checkout speed to how our staff greet customers on the floor. As a thank-you, everyone who finishes the survey this month will receive a small discount on their next visit, and a few respondents will be randomly selected for a larger gift card. We read every response personally, so please feel free to be as detailed as you'd like.",
    subQuestions: [
      {
        question: 'What are listeners being asked to do?',
        correctText: 'Complete a survey about their experience',
        distractors: [
          'Sign up for a loyalty card',
          'Return an item for a refund',
          'Attend a store event',
        ],
        explanation:
          '"we would appreciate it if you could complete a short survey"と依頼している。他の選択肢（"Attend a store event"／"Sign up for a loyalty card"／"Return an item for a refund"）はこの会話・トークの中で述べられていない。',
        translation: '聞き手は何をするよう求められていますか。',
      },
      {
        question: 'How long does the survey take?',
        correctText: 'About five minutes',
        distractors: ['About thirty minutes', 'About one hour', 'Less than one minute'],
        explanation:
          '"It only takes about five minutes"と述べている。他の選択肢（"About thirty minutes"／"About one hour"／"Less than one minute"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その調査にはどのくらい時間がかかりますか。',
      },
      {
        question: 'What will listeners receive for completing the survey?',
        correctText: 'A discount on their next visit',
        distractors: ['A free gift today', 'A membership card', 'Nothing extra'],
        explanation:
          '"everyone who finishes the survey this month will receive a small discount"と述べている。他の選択肢（"A free gift today"／"A membership card"／"Nothing extra"）はこの会話・トークの中で述べられていない。',
        translation: '聞き手はその調査を完了すると何を受け取りますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-12',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['inventory', 'restock'],
    script:
      'Attention warehouse staff: we will be conducting a full inventory count this Saturday, starting at eight in the morning. Everyone scheduled for that shift should plan to arrive fifteen minutes early so we can go over the counting procedure together. Please make sure all shelves are labeled correctly before Friday evening, since mislabeled sections tend to slow the count down significantly. Any items that need to be restocked should be flagged in the system so the count reflects accurate numbers rather than temporary shortages. We expect the count to finish by early afternoon, and lunch will be provided for everyone who stays through the full shift.',
    subQuestions: [
      {
        question: 'What event is being announced?',
        correctText: 'A full inventory count',
        distractors: [
          'A fire safety inspection',
          'A staff training session',
          'A visit from company executives',
        ],
        explanation:
          '"we will be conducting a full inventory count this Saturday"と述べている。他の選択肢（"A visit from company executives"／"A fire safety inspection"／"A staff training session"）はこの会話・トークの中で述べられていない。',
        translation: 'どんな出来事が案内されていますか。',
      },
      {
        question: 'What should staff do before Friday evening?',
        correctText: 'Make sure all shelves are labeled correctly',
        distractors: [
          'Submit their weekly time sheets',
          'Clean the entire warehouse floor',
          'Return all borrowed equipment',
        ],
        explanation:
          '"Please make sure all shelves are labeled correctly before Friday evening"と述べている。他の選択肢（"Submit their weekly time sheets"／"Clean the entire warehouse floor"／"Return all borrowed equipment"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '金曜の夕方までにスタッフは何をすべきですか。',
      },
      {
        question: 'When is the count expected to finish?',
        correctText: 'By early afternoon',
        // クロスレビュー: "By midnight" は「早afternoonまでに終わる」を論理的に包含し第2正答化するため、
        // 開始時刻(scriptの "starting at eight in the morning")との混同を狙う誤答へ差し替え
        distractors: ['At eight in the morning', 'The following Monday', 'It has no set end time'],
        explanation:
          '"We expect the count to finish by early afternoon"と述べている。他の選択肢（"At eight in the morning"／"The following Monday"／"It has no set end time"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その棚卸しはいつ終わる見込みですか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-13',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['registration'],
    script:
      "Good morning, everyone. This is a reminder that registration for the leadership seminar closes at five o'clock this Friday, and we've already received more than half of the available spots. The seminar itself will run from nine to noon next Tuesday in the main conference room, and light refreshments will be served during the short break at ten thirty. Seats are limited to forty participants, so please register as soon as possible if you plan to attend, since we cannot guarantee a spot after the deadline. A recording will be made available afterward, but only for staff who were unable to attend due to a scheduling conflict.",
    subQuestions: [
      {
        question: 'What is this announcement mainly about?',
        correctText: 'A leadership seminar',
        distractors: [
          'A change in office hours',
          'A new employee handbook',
          'A building safety drill',
        ],
        explanation:
          '案内全体はリーダーシップセミナーについてである。他の選択肢（"A building safety drill"／"A change in office hours"／"A new employee handbook"）はこの会話・トークの中で述べられていない。',
        translation: 'この案内は主に何についてですか。',
      },
      {
        question: 'When does registration close?',
        correctText: "Five o'clock this Friday",
        distractors: ["Nine o'clock Tuesday morning", 'Next Monday', 'It has already closed'],
        explanation:
          '"registration for the leadership seminar closes at five o\'clock this Friday"と述べている。他の選択肢（"It has already closed"／"Nine o\'clock Tuesday morning"／"Next Monday"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '登録はいつ締め切られますか。',
      },
      {
        question: 'How many participants can attend?',
        correctText: 'Forty',
        distractors: ['Ten', 'One hundred', 'There is no limit'],
        explanation:
          '"Seats are limited to forty participants"と述べている。他の選択肢（"Ten"／"One hundred"／"There is no limit"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '何人まで参加できますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-14',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['renovation', 'detour'],
    script:
      'Please be advised that the main lobby will be closed for renovation starting Monday and continuing for approximately two weeks, as crews replace the flooring and update the lighting fixtures. During this period, visitors should use the side entrance near the parking garage, which will remain open and staffed during regular business hours. Signs will be posted throughout the building to guide you along the detour, and security will also be available to provide directions if needed. We appreciate your patience while the work is completed, and we expect the finished lobby to look considerably brighter and more welcoming once everything is finished.',
    subQuestions: [
      {
        question: 'What is happening starting Monday?',
        correctText: 'The main lobby will be closed for renovation',
        distractors: [
          'The parking garage will be repaved',
          'The building will close for a holiday',
          'A new tenant will move in',
        ],
        explanation:
          '"the main lobby will be closed for renovation starting Monday"と述べている。他の選択肢（"A new tenant will move in"／"The parking garage will be repaved"／"The building will close for a holiday"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '月曜日から何が起こりますか。',
      },
      {
        question: 'What should visitors do during this period?',
        correctText: 'Use the side entrance near the parking garage',
        distractors: [
          'Enter through the loading dock only',
          'Avoid the building completely',
          'Call ahead before visiting',
        ],
        explanation:
          '"visitors should use the side entrance near the parking garage"と述べている。他の選択肢（"Avoid the building completely"／"Call ahead before visiting"／"Enter through the loading dock only"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'この期間中、訪問者は何をすべきですか。',
      },
      {
        question: 'How long will the renovation last?',
        correctText: 'Approximately two weeks',
        // クロスレビュー: メタ選択肢 "It is not mentioned" は本番形式に不自然なため具体的な期間の誤答へ
        distractors: ['One day', 'Six months', 'About two months'],
        explanation:
          '"continuing for approximately two weeks"と述べている。他の選択肢（"Six months"／"About two months"／"One day"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その改装はどれくらい続きますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-15',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['printer', 'malfunction'],
    script:
      "A quick notice for everyone on the third floor: the color printer near the break room is malfunctioning and has been taken offline for repair after it started jamming repeatedly this morning. Please use the black-and-white printer near the elevators until further notice, or the color printer on the fifth floor if your document truly needs to be printed in color. A technician has already been contacted and should arrive sometime this afternoon, though the exact time is not yet confirmed. We'll send another update once the printer is back online and working properly.",
    subQuestions: [
      {
        question: 'What problem is being reported?',
        correctText: 'A printer is malfunctioning',
        distractors: [
          'The elevators are out of service',
          'The break room is being renovated',
          'A technician did not show up',
        ],
        explanation:
          '"the color printer near the break room is malfunctioning"と述べている。他の選択肢（"The break room is being renovated"／"A technician did not show up"／"The elevators are out of service"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'どんな問題が報告されていますか。',
      },
      {
        question: 'What should staff do until further notice?',
        correctText: 'Use the black-and-white printer near the elevators',
        distractors: [
          'Print only urgent documents',
          'Ask IT before printing anything',
          'Print from home instead',
        ],
        explanation:
          '"Please use the black-and-white printer near the elevators until further notice"と述べている。他の選択肢（"Print only urgent documents"／"Ask IT before printing anything"／"Print from home instead"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '追って連絡があるまで、スタッフは何をすべきですか。',
      },
      {
        question: 'When is the technician expected to arrive?',
        correctText: 'This afternoon',
        distractors: ['Tomorrow morning', 'Next week', 'The technician has already left'],
        explanation:
          '"should arrive sometime this afternoon"と述べている。他の選択肢（"Tomorrow morning"／"Next week"／"The technician has already left"）はこの会話・トークの中で述べられていない。',
        translation: '技術者はいつ到着する見込みですか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-16',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['transcript', 'applicant'],
    // クロスレビュー: 一斉メール文体でPart4トークとして不自然だったため録音メッセージ体裁へ。要音声再生成
    script:
      "This is a recorded message from the recruiting office for all applicants who completed an interview last week. Thank you for your patience during what has been a longer process than usual due to the high number of qualified applicants this year. We are currently waiting on an official transcript from each candidate's university before making a final decision, since academic verification is a required step in our hiring policy. Once all transcripts are received, the hiring committee will meet to review each candidate's full file, and we expect to notify candidates within ten business days. If you have any questions in the meantime, please email the recruiting office rather than calling, as our phone lines are quite busy this week.",
    subQuestions: [
      {
        question: 'Who is this message intended for?',
        correctText: 'Job applicants who were recently interviewed',
        distractors: [
          'Current employees requesting a transfer',
          'University professors',
          'Vendors submitting bids',
        ],
        explanation:
          '"a recorded message from the recruiting office for all applicants who completed an interview last week"と述べている。他の選択肢（"Current employees requesting a transfer"／"University professors"／"Vendors submitting bids"）はこの会話・トークの中で述べられていない。',
        translation: 'このメッセージは誰を対象にしていますか。',
      },
      {
        question: 'What is the company waiting for?',
        correctText: "An official transcript from each candidate's university",
        distractors: [
          'A signed offer letter',
          'A background check report',
          'A reference letter from a former employer',
        ],
        explanation:
          '"We are currently waiting on an official transcript from each candidate\'s university"と述べている。他の選択肢（"A background check report"／"A reference letter from a former employer"／"A signed offer letter"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '会社は何を待っていますか。',
      },
      {
        question: 'When will candidates be notified?',
        correctText: 'Within ten business days',
        // クロスレビュー: "Within one month" は "within ten business days" を包含し第2正答化するため、
        // 包含関係にならない短い期間（scriptから保証されない）へ差し替え
        distractors: ['Immediately', 'Within two business days', 'They have already been notified'],
        explanation:
          '"we expect to notify candidates within ten business days"と述べている。他の選択肢（"Within two business days"／"They have already been notified"／"Immediately"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '候補者はいつ連絡を受けますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-17',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['discount', 'clearance'],
    script:
      "Attention shoppers: for the next two hours only, all winter clothing is available at a twenty percent discount, including coats, boots, and accessories from every brand we carry. This is part of our seasonal clearance to make room for new spring inventory, which will begin arriving on the sales floor later this week. The sale ends at six o'clock sharp, so be sure to visit the second floor before then, and remember that the discount is applied automatically at checkout with no coupon needed. Fitting rooms may be busy, so we appreciate your patience during this popular event.",
    subQuestions: [
      {
        question: 'What is being announced?',
        correctText: 'A limited-time discount on winter clothing',
        distractors: [
          'A permanent price increase',
          'A new store opening',
          'A change in store hours',
        ],
        explanation:
          '"all winter clothing is available at a twenty percent discount"と述べている。他の選択肢（"A new store opening"／"A change in store hours"／"A permanent price increase"）はこの会話・トークの中で述べられていない。',
        translation: '何が案内されていますか。',
      },
      {
        question: 'Why is the store having this sale?',
        correctText: 'To make room for new spring inventory',
        distractors: [
          'Because the store is closing permanently',
          'Because of a pricing error',
          'Because of a delivery delay',
        ],
        explanation:
          '"to make room for new spring inventory"と述べている。他の選択肢（"Because the store is closing permanently"／"Because of a pricing error"／"Because of a delivery delay"）はこの会話・トークの中で述べられていない。',
        translation: 'なぜこの店はこのセールを行っているのですか。',
      },
      {
        question: 'When does the sale end?',
        correctText: "At six o'clock",
        distractors: ['At noon', 'At midnight', 'It has already ended'],
        explanation:
          '"The sale ends at six o\'clock sharp"と述べている。他の選択肢（"It has already ended"／"At noon"／"At midnight"）はこの会話・トークの中で述べられていない。',
        translation: 'そのセールはいつ終わりますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-18',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['logistics'],
    script:
      'This message is for all staff in the design department. As part of our office relocation, the logistics team will begin packing your desks this coming Thursday, starting with the workstations near the windows and working toward the interior. Please remove any personal items and back up important files before then, since boxed equipment will not be accessible again until after the move. The new office space should be ready for move-in by the following Monday, and it includes larger monitors and adjustable desks for the whole team. If you have any large equipment that needs special handling, please let the logistics team know by Wednesday.',
    subQuestions: [
      {
        question: 'What is happening to the design department?',
        correctText: 'The department is relocating to a new office',
        distractors: [
          'The department is being closed',
          'The department is merging with another team',
          'The department is hiring new staff',
        ],
        explanation:
          '"As part of our office relocation"と述べている。他の選択肢（"The department is being closed"／"The department is merging with another team"／"The department is hiring new staff"）はこの会話・トークの中で述べられていない。',
        translation: 'デザイン部門に何が起こっていますか。',
      },
      {
        question: 'What are staff asked to do before Thursday?',
        correctText: 'Remove personal items and back up important files',
        distractors: [
          'Submit a request for new furniture',
          'Attend a mandatory meeting',
          'Return their office keys',
        ],
        explanation:
          '"Please remove any personal items and back up important files before then"と述べている。他の選択肢（"Return their office keys"／"Submit a request for new furniture"／"Attend a mandatory meeting"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '木曜日までにスタッフは何をするよう求められていますか。',
      },
      {
        question: 'When should the new office be ready?',
        correctText: 'By the following Monday',
        distractors: ['By Thursday', 'By the end of the year', 'It is already ready'],
        explanation:
          '"should be ready for move-in by the following Monday"と述べている。他の選択肢（"It is already ready"／"By Thursday"／"By the end of the year"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '新しいオフィスはいつまでに準備できる予定ですか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-19',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['vacancy', 'recruit'],
    script:
      "Good afternoon. I want to update the team on our plan to recruit for the open vacancy in customer support, which has been open since our last representative moved to a different department. We have posted the job listing on three websites, and interviews are expected to begin within two weeks once we've had time to screen the initial applications. If anyone on the team knows a strong candidate, please forward their resume to human resources rather than to me directly, so it can be properly logged in the system. We're hoping to have someone in place before the busy season begins next month.",
    subQuestions: [
      {
        question: 'What is the main purpose of this talk?',
        correctText: 'To update the team on hiring for an open position',
        distractors: [
          'To announce a new customer support policy',
          'To introduce a new team member',
          "To review last quarter's sales",
        ],
        explanation:
          '"I want to update the team on our plan to recruit for the open vacancy"と述べている。他の選択肢（"To announce a new customer support policy"／"To introduce a new team member"／"To review last quarter\'s sales"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'この話の主な目的は何ですか。',
      },
      {
        question: 'Where has the job listing been posted?',
        correctText: 'On three websites',
        distractors: ['In a local newspaper', 'On one website only', 'It has not been posted yet'],
        explanation:
          '"We have posted the job listing on three websites"と述べている。他の選択肢（"It has not been posted yet"／"In a local newspaper"／"On one website only"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'その求人はどこに掲載されていますか。',
      },
      {
        question: 'What are staff asked to do if they know a candidate?',
        correctText: "Forward the candidate's resume to human resources",
        distractors: [
          'Schedule the interview themselves',
          'Contact the candidate directly',
          'Wait until the listing closes',
        ],
        explanation:
          '"please forward their resume to human resources"と述べている。他の選択肢（"Schedule the interview themselves"／"Contact the candidate directly"／"Wait until the listing closes"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '候補者を知っている場合、スタッフは何をするよう求められていますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-20',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['subsidy', 'workforce'],
    script:
      "Welcome to today's briefing on the new regional employment subsidy. Starting next month, companies that expand their workforce by more than ten employees may qualify for a partial subsidy on training costs, covering both onboarding programs and ongoing skills development. This initiative is part of a broader effort to encourage local hiring across several industries hit hardest by recent economic changes. Applications will open on the first of the month and will be reviewed within thirty days of submission, so companies planning to expand soon should begin preparing their paperwork now. We'll be holding a follow-up session next week for anyone with detailed questions about eligibility.",
    subQuestions: [
      {
        question: 'What is this briefing about?',
        correctText: 'A new employment subsidy for companies',
        distractors: [
          'A change in the minimum wage',
          'A new tax on large companies',
          'A hiring freeze',
        ],
        explanation:
          '"today\'s briefing on the new regional employment subsidy"と述べている。他の選択肢（"A hiring freeze"／"A change in the minimum wage"／"A new tax on large companies"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'この説明会は何についてですか。',
      },
      {
        question: 'Which companies may qualify for the subsidy?',
        correctText: 'Companies that add more than ten employees',
        distractors: [
          'Companies with fewer than ten employees',
          'Companies that reduce their workforce',
          'Only companies in the technology sector',
        ],
        explanation:
          '"companies that expand their workforce by more than ten employees may qualify"と述べている。他の選択肢（"Companies with fewer than ten employees"／"Companies that reduce their workforce"／"Only companies in the technology sector"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: 'どの企業がその補助金の対象になり得ますか。',
      },
      {
        question: 'How long will applications take to review?',
        correctText: 'Within thirty days',
        // クロスレビュー: "Within one year" は "within thirty days" を包含し第2正答化するため、
        // 申請開始日(scriptの "open on the first of the month")との混同を狙う誤答へ差し替え
        distractors: [
          'Within one week',
          'On the first of the month',
          'Reviews have already started',
        ],
        explanation:
          '"will be reviewed within thirty days of submission"と述べている。他の選択肢（"Within one week"／"On the first of the month"／"Reviews have already started"）は、本文でこの設問の答えとして裏づけられていない。',
        translation: '申請の審査にはどのくらいかかりますか。',
      },
    ],
    difficulty: 3,
  },
]
