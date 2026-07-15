// Part3/4（audio_set）セットのデータ本体（M2・T-62。正本: docs/13 T-62行・3.6節、docs/04 2節）。
// Part3（会話）10セット・Part4（トーク）10セット、各3設問=計60設問。
// scriptの話者表記は"A: ... B: ..."（Part3のみ。Part4は単一話者のため話者表記なし）。
// T-64でttsBatch.tsを拡張しA/Bを交互にprimary/secondary話者へ割り当てる想定
// （synthesizeDialogueの拡張。T-31のPart2実装と同様の2話者交互ローテーション）。
// keyVocabWordsはS/A/B語彙カード（600語）から選び、scriptに文字列として実在する語のみを使う。
// 各設問はcorrectText/distractorsの形で書き、part34Question.tsのrotateSubQuestionChoicesが
// 4択A〜Dへの決定的ローテーションを行う（M1レビュー⑦の方式。全60設問を通した連番で分散）。
// 設問タイプは概要（Q1）/詳細（Q2）/意図・次の行動（Q3）を1セット3問で混在させる。

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

export const PART34_ENTRIES_S: Part34RawEntry[] = [
  // ============ Part3（2話者の会話）10セット ============
  {
    setId: 'p3-01',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['reschedule'],
    script:
      "A: Do you have a few minutes to talk about tomorrow's budget meeting? B: Actually, I just found out I have a client call at the same time. Could we reschedule it to Thursday afternoon? A: That should work — most of the team is free then. I'll send a new invite this afternoon. B: Great, thanks for being so flexible.",
    subQuestions: [
      {
        question: 'What are the speakers mainly discussing?',
        correctText: 'Changing the time of a meeting',
        distractors: [
          'Canceling a client contract',
          'Hiring a new team member',
          'Reviewing a budget report',
        ],
        explanation:
          '会話全体はB氏が予定重複のため会議の時間変更を依頼する内容。契約解除・採用・予算内容の検討自体は話題になっていない。',
        translation: '話者たちは主に何について話していますか。',
      },
      {
        question: 'Why does B want to change the meeting time?',
        correctText: 'B has a client call scheduled at the same time',
        distractors: [
          'B will be out of the office all week',
          'B has not finished the budget report',
          'B is waiting for a new team member',
        ],
        explanation:
          'Bは"I just found out I have a client call at the same time"と述べている。他の理由はscript中に出てこない。',
        translation: 'Bはなぜ会議の時間を変更したいのですか。',
      },
      {
        question: 'What will A most likely do next?',
        correctText: 'Send a new meeting invitation',
        distractors: [
          'Call the client directly',
          'Cancel the meeting entirely',
          'Ask B to lead the meeting',
        ],
        explanation: 'Aは"I\'ll send a new invite this afternoon"と明言している。',
        translation: 'Aは次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-02',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['malfunction', 'technician'],
    script:
      "A: The shared server seems to be malfunctioning again — I can't access any of the project files. B: I noticed that too. I already called the technician, but he said he can't come until tomorrow morning. A: That's a problem. Do we have a backup we can use in the meantime? B: I'll check with IT and email you a temporary link within the hour.",
    subQuestions: [
      {
        question: 'What problem are the speakers discussing?',
        correctText: 'A shared server is not working properly',
        distractors: [
          'A printer has run out of ink',
          'An email account was hacked',
          'A conference room is already booked',
        ],
        explanation: '冒頭でAが"the shared server seems to be malfunctioning"と述べている。',
        translation: '話者たちはどんな問題について話していますか。',
      },
      {
        question: 'When will the technician arrive?',
        correctText: 'Tomorrow morning',
        distractors: ['Later this afternoon', 'Next week', 'He has already arrived'],
        explanation: 'Bが"he can\'t come until tomorrow morning"と述べている。',
        translation: '技術者はいつ到着しますか。',
      },
      {
        question: 'What does B imply will happen next?',
        correctText: 'A temporary way to access the files will be provided',
        distractors: [
          'The server will be fixed immediately without help',
          'A will be asked to work from home',
          "The day's meetings will be canceled",
        ],
        explanation:
          'Bは"I\'ll check with IT and email you a temporary link"と述べており、代替アクセス手段を提供する意図を示している。',
        translation: 'Bは次に何をするつもりだとほのめかしていますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-03',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['submit'],
    script:
      "A: We're almost out of printer paper and toner in the supply closet. B: Really? I thought we just placed an order last month. A: We did, but the new interns have been printing a lot of training materials. B: Let's submit a request today so it arrives before the weekend.",
    subQuestions: [
      {
        question: 'What is the conversation mainly about?',
        correctText: 'Running low on office supplies',
        distractors: [
          'Hiring new interns',
          'Planning a training session',
          'Scheduling a delivery truck',
        ],
        explanation: '冒頭でAが用紙とトナーの残量が少ないことを伝えている。',
        translation: '会話は主に何についてですか。',
      },
      {
        question: 'According to A, why are supplies running low?',
        correctText: 'New interns have been printing a lot of materials',
        distractors: [
          'The supplier raised its prices',
          'The order from last month never arrived',
          'The printer is broken',
        ],
        explanation:
          'Aが"the new interns have been printing a lot of training materials"と説明している。',
        translation: 'Aによると、なぜ備品が少なくなっているのですか。',
      },
      {
        question: 'What does B suggest doing?',
        correctText: 'Submitting a new order today',
        distractors: [
          'Asking the interns to stop printing',
          'Waiting until next month',
          'Borrowing supplies from another office',
        ],
        explanation: 'Bは"Let\'s submit a request today"と提案している。',
        translation: 'Bは何をすることを提案していますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-04',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['backlog'],
    script:
      "A: I just got off the phone with the client — their shipment still hasn't arrived. B: That's the third delay this quarter. Did the carrier give a reason? A: They mentioned a warehouse backlog, but they couldn't give a firm delivery date. B: Let's offer the client a discount on their next order as an apology.",
    subQuestions: [
      {
        question: 'What is the main issue being discussed?',
        correctText: "A client's shipment has been delayed",
        distractors: [
          'A client canceled an order',
          'A carrier raised its shipping rates',
          'A client requested a refund',
        ],
        explanation: '冒頭でAが顧客の荷物がまだ届いていないと伝えている。',
        translation: '主に話し合われている問題は何ですか。',
      },
      {
        question: 'What reason did the carrier give for the delay?',
        correctText: 'A backlog at the warehouse',
        distractors: [
          'A shortage of delivery trucks',
          'Bad weather along the route',
          'An error in the shipping address',
        ],
        explanation: 'Aは"a warehouse backlog"と述べている。',
        translation: '運送業者は遅延の理由として何を挙げましたか。',
      },
      {
        question: 'What does B propose doing for the client?',
        correctText: 'Offering a discount on a future order',
        distractors: [
          "Canceling the client's account",
          'Filing a complaint against the carrier',
          'Sending a written apology letter only',
        ],
        explanation: 'Bは"offer the client a discount on their next order"と提案している。',
        translation: 'Bは顧客に対して何をすることを提案していますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-05',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['candidate'],
    script:
      "A: What did you think of the candidate we interviewed this morning? B: I was impressed — her experience matches the role closely, and she asked great questions. A: Agreed. Should we move forward with a second interview? B: Yes, let's schedule it for early next week and loop in the department manager.",
    subQuestions: [
      {
        question: 'What are the speakers mainly discussing?',
        correctText: "A job candidate's interview",
        distractors: [
          'A performance review',
          "An employee's resignation",
          'A training program schedule',
        ],
        explanation: '会話は今朝面接した候補者についての感想と次のステップを話している。',
        translation: '話者たちは主に何について話していますか。',
      },
      {
        question: 'According to B, what was impressive about the candidate?',
        correctText: 'Her relevant experience and thoughtful questions',
        distractors: [
          'Her availability to start immediately',
          'Her salary expectations',
          "Her previous employer's reputation",
        ],
        explanation:
          'Bは"her experience matches the role closely, and she asked great questions"と述べている。',
        translation: 'Bは候補者の何に感心したと言っていますか。',
      },
      {
        question: 'What will most likely happen next?',
        correctText: 'A second interview will be scheduled',
        distractors: [
          'The candidate will be offered the job immediately',
          'The position will be reopened for more applicants',
          'The candidate will be rejected',
        ],
        explanation:
          'Bは"let\'s schedule it for early next week"と述べ、2回目の面接の設定を提案している。',
        translation: '次に何が起こる可能性が高いですか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-06',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['attendee', 'finalize'],
    script:
      "A: Have we finalized the catering order for Friday's event? B: Almost — I'm still waiting to hear back about how many guests are vegetarian. A: I'll send a quick survey to the attendee list this afternoon. B: Perfect, let's finalize the order by tomorrow morning at the latest.",
    subQuestions: [
      {
        question: 'What are the speakers preparing for?',
        correctText: 'An upcoming event',
        distractors: [
          'A quarterly budget review',
          "A new employee's first day",
          'A software rollout',
        ],
        explanation: '会話全体が金曜日のイベントのケータリング手配について。',
        translation: '話者たちは何の準備をしていますか。',
      },
      {
        question: 'What information is B still waiting for?',
        correctText: 'The number of vegetarian guests',
        distractors: [
          'The total event budget',
          "The venue's opening time",
          'The guest list itself',
        ],
        explanation: 'Bは"waiting to hear back about how many guests are vegetarian"と述べている。',
        translation: 'Bはまだどんな情報を待っていますか。',
      },
      {
        question: 'What will A do this afternoon?',
        correctText: 'Send a survey to attendees',
        distractors: [
          'Call the caterer directly',
          'Cancel part of the order',
          'Book a larger venue',
        ],
        explanation:
          'Aは"I\'ll send a quick survey to the attendee list this afternoon"と述べている。',
        translation: 'Aは今日の午後、何をしますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-07',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['synchronize'],
    script:
      "A: Did you see the notice about the software upgrade this weekend? B: Yes, IT said all our files will automatically synchronize before the update starts. A: Good, I was worried I'd lose my project files. B: Same here — let's just save everything one more time on Friday to be safe.",
    subQuestions: [
      {
        question: 'What is the conversation mainly about?',
        correctText: 'An upcoming software upgrade',
        distractors: [
          'A hardware replacement plan',
          'A new employee training session',
          'A change in office hours',
        ],
        explanation: '会話は週末のソフトウェアアップグレードの通知について。',
        translation: '会話は主に何についてですか。',
      },
      {
        question: 'According to B, what will happen before the update?',
        correctText: 'Files will be automatically synchronized',
        distractors: [
          'All computers will be replaced',
          'Employees will be asked to work from home',
          'The office will be closed',
        ],
        explanation:
          'Bは"all our files will automatically synchronize before the update starts"と述べている。',
        translation: 'Bによると、更新前に何が起こりますか。',
      },
      {
        question: 'What does B suggest doing on Friday?',
        correctText: 'Saving all files again as a precaution',
        distractors: [
          'Postponing the update',
          'Calling the IT department',
          'Backing up only the largest files',
        ],
        explanation:
          'Bは"let\'s just save everything one more time on Friday to be safe"と提案している。',
        translation: 'Bは金曜日に何をすることを提案していますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p3-08',
    part: 3,
    tags: ['先読み'],
    keyVocabWords: ['itinerary', 'confirm'],
    script:
      "A: Have you finished putting together my itinerary for the conference next month? B: Almost — I booked your flight and hotel, but I'm still waiting on the shuttle reservation. A: No rush, just make sure I land with enough time before the opening reception. B: Understood, I'll confirm everything by the end of the week.",
    subQuestions: [
      {
        question: 'What is B helping A prepare for?',
        correctText: 'An upcoming business trip',
        distractors: ['A job interview', 'A product demonstration', 'A performance review'],
        explanation: '会話は来月のカンファレンスに向けた旅程の準備について。',
        translation: 'Bは何のためにAをサポートしていますか。',
      },
      {
        question: 'What has B not finished yet?',
        correctText: 'Booking the shuttle reservation',
        distractors: ['Booking the flight', 'Booking the hotel', 'Printing the conference badge'],
        explanation: 'Bは"I\'m still waiting on the shuttle reservation"と述べている。',
        translation: 'Bはまだ何を終えていませんか。',
      },
      {
        question: 'What does A ask B to make sure of?',
        correctText: 'That there is enough time to arrive before the opening reception',
        distractors: [
          'That the hotel has a gym',
          'That the flight is nonstop',
          'That the shuttle is free of charge',
        ],
        explanation:
          'Aは"make sure I land with enough time before the opening reception"と述べている。',
        translation: 'Aは何を確実にするようBに求めていますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-09',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['restock'],
    script:
      "A: The shelves in the front section look almost empty again. B: I know, our best-selling items keep selling out faster than we can restock them. A: Should we increase the order size for next month? B: Yes, and let's also move some inventory from the stockroom out front today.",
    subQuestions: [
      {
        question: 'What problem does A point out?',
        correctText: 'The shelves are nearly empty',
        distractors: [
          'The store is losing customers',
          'Prices are too high',
          'The store is understaffed',
        ],
        explanation: 'Aは"the shelves in the front section look almost empty again"と述べている。',
        translation: 'Aはどんな問題を指摘していますか。',
      },
      {
        question: 'Why are the shelves emptying quickly, according to B?',
        correctText: 'Best-selling items sell out faster than they can restock',
        distractors: [
          'A delivery truck broke down',
          'The store reduced its order size',
          'Customers are returning items',
        ],
        explanation:
          'Bは"our best-selling items keep selling out faster than we can restock them"と述べている。',
        translation: 'Bによると、なぜ棚がすぐ空になるのですか。',
      },
      {
        question: 'What will the speakers do today?',
        correctText: 'Move inventory from the stockroom to the front',
        distractors: [
          'Place a new supplier order',
          'Close the front section',
          'Interview new staff',
        ],
        explanation:
          'Bは"let\'s also move some inventory from the stockroom out front today"と述べている。',
        translation: '話者たちは今日、何をしますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p3-10',
    part: 3,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['negotiate', 'renewal'],
    script:
      "A: The vendor sent over the new contract terms for next year. B: How do the numbers compare to our current agreement? A: The overall cost is about the same, but they want to shorten the renewal period to six months. B: Let's negotiate for a full year before we sign anything.",
    subQuestions: [
      {
        question: 'What are the speakers discussing?',
        correctText: 'Terms of a vendor contract renewal',
        distractors: [
          'A new vendor selection process',
          'A budget cut across departments',
          'A customer complaint about pricing',
        ],
        explanation: '会話は来年度の契約条件についてで、更新期間の交渉が話題。',
        translation: '話者たちは何について話し合っていますか。',
      },
      {
        question: 'What change does the vendor want to make?',
        correctText: 'Shortening the renewal period to six months',
        distractors: [
          'Raising the overall cost significantly',
          'Ending the contract early',
          'Adding a new service fee',
        ],
        explanation: 'Aは"they want to shorten the renewal period to six months"と述べている。',
        translation: '業者はどんな変更を望んでいますか。',
      },
      {
        question: 'What does B want to do before signing?',
        correctText: 'Negotiate for a full-year term',
        distractors: [
          'Cancel the contract entirely',
          "Accept the vendor's terms as is",
          'Switch to a different vendor',
        ],
        explanation: 'Bは"Let\'s negotiate for a full year before we sign anything"と述べている。',
        translation: 'Bは署名する前に何をしたいと考えていますか。',
      },
    ],
    difficulty: 3,
  },

  // ============ Part4（単一話者のトーク）10セット ============
  {
    setId: 'p4-01',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['tenant'],
    script:
      'Attention all building tenants: the east elevator will be out of service for routine maintenance from nine to eleven tomorrow morning. During that time, please use the west elevator or the stairs near the lobby. We apologize for any inconvenience and expect the elevator to be back in service by early afternoon.',
    subQuestions: [
      {
        question: 'Who is this announcement most likely for?',
        correctText: 'People who work or live in the building',
        distractors: [
          'Job applicants visiting for interviews',
          'Customers of a retail store',
          'Airline passengers',
        ],
        explanation:
          '冒頭"Attention all building tenants"から建物のテナント（入居者）向けの案内だと分かる。',
        translation: 'この案内はおそらく誰に向けたものですか。',
      },
      {
        question: 'When will the east elevator be unavailable?',
        correctText: 'From nine to eleven tomorrow morning',
        distractors: ['All day tomorrow', 'This afternoon only', 'For the entire week'],
        explanation: '"out of service...from nine to eleven tomorrow morning"と明示されている。',
        translation: '東側のエレベーターはいつ使用できませんか。',
      },
      {
        question: 'What are listeners advised to do during the maintenance?',
        correctText: 'Use the west elevator or the stairs',
        distractors: [
          'Wait in the lobby until it reopens',
          'Contact building management',
          'Use the loading dock entrance',
        ],
        explanation: '"please use the west elevator or the stairs near the lobby"と案内している。',
        translation: 'メンテナンス中、聞き手は何をするよう勧められていますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-02',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['merchandise', 'complimentary'],
    script:
      "This weekend only, visit Harbor Outlet for our biggest clearance sale of the year. Every item in the store is marked down, with select merchandise up to seventy percent off. Doors open early at eight, and the first fifty customers will receive a complimentary gift bag. Don't miss this once-a-year event.",
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: "A store's clearance sale",
        distractors: ['A new store opening', 'A job fair', 'A charity fundraiser'],
        explanation: '冒頭で"our biggest clearance sale of the year"と明言している。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'How much can customers save on select merchandise?',
        correctText: 'Up to seventy percent off',
        distractors: [
          'Up to twenty percent off',
          'A flat ten-dollar discount',
          'Buy one, get one free',
        ],
        explanation: '"select merchandise up to seventy percent off"と述べている。',
        translation: '一部の商品では、顧客はいくら節約できますか。',
      },
      {
        question: 'What will the first fifty customers receive?',
        correctText: 'A complimentary gift bag',
        distractors: [
          'A discount coupon for next time',
          'A free membership card',
          'A raffle ticket',
        ],
        explanation:
          '"the first fifty customers will receive a complimentary gift bag"と述べている。',
        translation: '最初の50人の客は何を受け取りますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-03',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['confirm'],
    script:
      "Hi, this is Dana calling from Crestview Dental. I'm calling to let you know that your appointment originally scheduled for Tuesday at ten needs to be moved due to a scheduling conflict. We have an opening on Wednesday at the same time. Please call us back at your convenience to confirm.",
    subQuestions: [
      {
        question: 'Why is Dana calling?',
        correctText: 'To reschedule an appointment',
        distractors: [
          'To confirm a payment was received',
          'To cancel a membership',
          'To remind about an annual checkup',
        ],
        explanation:
          '"your appointment...needs to be moved due to a scheduling conflict"と述べている。',
        translation: 'デイナはなぜ電話をかけていますか。',
      },
      {
        question: 'What day was the appointment originally scheduled for?',
        correctText: 'Tuesday',
        distractors: ['Monday', 'Wednesday', 'Thursday'],
        explanation: '"originally scheduled for Tuesday at ten"と述べている。',
        translation: '予約はもともと何曜日に予定されていましたか。',
      },
      {
        question: 'What does Dana ask the listener to do?',
        correctText: 'Call back to confirm the new time',
        distractors: [
          'Arrive early for the new appointment',
          'Bring updated insurance information',
          'Cancel the appointment entirely',
        ],
        explanation: '"Please call us back at your convenience to confirm"と述べている。',
        translation: 'デイナは聞き手に何をするよう頼んでいますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-04',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['boarding'],
    script:
      'Attention passengers on flight two-fourteen to Denver: your departure gate has changed from gate twelve to gate twenty-three. Boarding will begin in approximately twenty minutes. Please proceed to the new gate as soon as possible, and have your boarding pass ready for the agent.',
    subQuestions: [
      {
        question: 'What is the purpose of this announcement?',
        correctText: 'To inform passengers of a gate change',
        distractors: [
          'To announce a flight delay',
          'To announce a flight cancellation',
          'To call for volunteers to give up seats',
        ],
        explanation:
          '"your departure gate has changed from gate twelve to gate twenty-three"と述べている。',
        translation: 'この案内の目的は何ですか。',
      },
      {
        question: 'What is the new gate number?',
        correctText: 'Gate twenty-three',
        distractors: ['Gate twelve', 'Gate twenty-one', 'Gate thirty'],
        explanation: '"changed from gate twelve to gate twenty-three"と述べている。',
        translation: '新しい搭乗ゲートの番号は何番ですか。',
      },
      {
        question: 'What are passengers asked to have ready?',
        correctText: 'Their boarding pass',
        distractors: [
          'Their passport only',
          'Their baggage claim ticket',
          'Their seat upgrade voucher',
        ],
        explanation: '"have your boarding pass ready for the agent"と述べている。',
        translation: '乗客は何を準備しておくよう求められていますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-05',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['itinerary'],
    script:
      "Welcome, everyone, to the Riverside History Museum. My name is Carlos, and I'll be your guide for the next hour. Let me walk you through today's itinerary: we'll begin in the main hall, where you'll see artifacts dating back over two hundred years, before moving on to the interactive exhibit on the second floor. Please feel free to ask questions along the way.",
    subQuestions: [
      {
        question: 'Who most likely is Carlos?',
        correctText: 'A museum tour guide',
        distractors: [
          'A museum security officer',
          'A ticket sales clerk',
          'A history professor giving a lecture',
        ],
        explanation: '"I\'ll be your guide for the next hour"と自己紹介している。',
        translation: 'カルロスはおそらく誰ですか。',
      },
      {
        question: 'Where will the tour begin?',
        correctText: 'In the main hall',
        distractors: ['On the second floor', 'In the gift shop', 'Outside the building'],
        explanation: '"We\'ll begin in the main hall"と述べている。',
        translation: 'ツアーはどこから始まりますか。',
      },
      {
        question: 'What are listeners invited to do?',
        correctText: 'Ask questions during the tour',
        distractors: [
          'Take photos only at the end',
          'Purchase souvenirs before starting',
          'Wait silently until the tour ends',
        ],
        explanation: '"Please feel free to ask questions along the way"と述べている。',
        translation: '聞き手は何をするよう勧められていますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-06',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['revenue', 'retail'],
    script:
      "Good afternoon, everyone. Before we wrap up today's meeting, I want to share a quick update on our quarterly results. Revenue grew twelve percent compared to last quarter, largely thanks to strong sales in the retail division. I want to thank each of you for your hard work, and I look forward to sharing more details at next month's review.",
    subQuestions: [
      {
        question: 'What is the main purpose of this talk?',
        correctText: 'To share quarterly financial results',
        distractors: [
          'To announce a new product launch',
          'To introduce a new employee',
          'To explain a change in company policy',
        ],
        explanation: '"I want to share a quick update on our quarterly results"と述べている。',
        translation: 'この話の主な目的は何ですか。',
      },
      {
        question: 'By how much did revenue grow?',
        correctText: 'Twelve percent',
        distractors: ['Two percent', 'Twenty percent', 'It stayed the same'],
        explanation: '"Revenue grew twelve percent compared to last quarter"と述べている。',
        translation: '収益はどれくらい増加しましたか。',
      },
      {
        question: 'What does the speaker say contributed most to the growth?',
        correctText: 'Strong sales in the retail division',
        distractors: [
          'A reduction in expenses',
          'A new marketing campaign',
          'An increase in prices',
        ],
        explanation: '"largely thanks to strong sales in the retail division"と述べている。',
        translation: '話者は何が最も成長に貢献したと述べていますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-07',
    part: 4,
    tags: ['パラフレーズ照合'],
    keyVocabWords: ['streamline', 'feedback'],
    script:
      "Thank you all for coming today. I'm excited to introduce our newest product line, designed specifically to help small businesses streamline their daily operations. After months of testing and customer feedback, we're confident this launch will set a new standard in the industry. We'll be taking questions after a short demonstration.",
    subQuestions: [
      {
        question: 'What is the speaker mainly doing?',
        correctText: 'Introducing a new product',
        distractors: [
          'Announcing a company merger',
          'Reviewing customer complaints',
          'Explaining a pricing change',
        ],
        explanation: '"I\'m excited to introduce our newest product line"と述べている。',
        translation: '話者は主に何をしていますか。',
      },
      {
        question: 'Who is the new product designed for?',
        correctText: 'Small businesses',
        distractors: ['Large corporations only', 'Individual consumers', 'Government agencies'],
        explanation:
          '"designed specifically to help small businesses streamline their daily operations"と述べている。',
        translation: '新製品は誰のために設計されていますか。',
      },
      {
        question: 'What will happen after the demonstration?',
        correctText: 'The audience will be able to ask questions',
        distractors: [
          'The product will go on sale immediately',
          'The event will end without further discussion',
          'Refreshments will be served',
        ],
        explanation: '"We\'ll be taking questions after a short demonstration"と述べている。',
        translation: 'デモンストレーションの後、何が行われますか。',
      },
    ],
    difficulty: 3,
  },
  {
    setId: 'p4-08',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['mortgage', 'inquiry'],
    script:
      'Thank you for calling Meridian Bank customer service. For account balance and recent transactions, press one. To report a lost or stolen card, press two. To speak with a representative about a loan or mortgage, press three. For any other inquiry, please stay on the line and the next available representative will assist you.',
    subQuestions: [
      {
        question: 'What kind of business most likely recorded this message?',
        correctText: 'A bank',
        distractors: ['An airline', 'A retail store', 'A dental office'],
        explanation: '"Thank you for calling Meridian Bank customer service"と述べている。',
        translation: 'この案内はおそらくどんな業種の企業が録音したものですか。',
      },
      {
        question: 'What should callers do to report a lost card?',
        correctText: 'Press two',
        distractors: ['Press one', 'Press three', 'Stay on the line'],
        explanation: '"To report a lost or stolen card, press two"と述べている。',
        translation: 'カードの紛失を報告するには何をすべきですか。',
      },
      {
        question: 'What should callers with other inquiries do?',
        correctText: 'Stay on the line for a representative',
        distractors: ['Press three', 'Hang up and call back later', 'Visit a local branch'],
        explanation:
          '"For any other inquiry, please stay on the line and the next available representative will assist you"と述べている。',
        translation: 'それ以外の問い合わせがある発信者はどうすべきですか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-09',
    part: 4,
    tags: ['先読み'],
    keyVocabWords: ['orientation', 'supervisor', 'mentor'],
    script:
      "Good morning, and welcome to your first day of orientation. Over the next two days, you'll learn about our company policies, meet your department supervisor, and complete a few required training modules. Please keep your employee badge visible at all times, and don't hesitate to ask your mentor if you have any questions.",
    subQuestions: [
      {
        question: 'Who is this talk intended for?',
        correctText: 'New employees',
        distractors: [
          'Job candidates being interviewed',
          'Long-time employees receiving an award',
          'Visiting clients',
        ],
        explanation: '"welcome to your first day of orientation"と述べている。',
        translation: 'この話は誰に向けたものですか。',
      },
      {
        question: 'What will listeners do over the next two days?',
        correctText: 'Learn policies, meet a supervisor, and complete training',
        distractors: ['Travel to a company retreat', 'Take a final exam', 'Sign a new contract'],
        explanation:
          '"you\'ll learn about our company policies, meet your department supervisor, and complete a few required training modules"と述べている。',
        translation: '聞き手は今後2日間で何をしますか。',
      },
      {
        question: 'What are listeners told to do if they have questions?',
        correctText: 'Ask their mentor',
        distractors: [
          'Email human resources',
          'Wait until the second day',
          "Ask their supervisor's supervisor",
        ],
        explanation: '"don\'t hesitate to ask your mentor if you have any questions"と述べている。',
        translation: '質問がある場合、聞き手は何をするよう言われていますか。',
      },
    ],
    difficulty: 2,
  },
  {
    setId: 'p4-10',
    part: 4,
    tags: ['数字・時刻'],
    keyVocabWords: ['commute'],
    script:
      "Good morning, commuters. Traffic on the downtown expressway is moving slowly this morning due to ongoing construction near exit seven. Drivers should expect delays of up to twenty minutes and may want to consider the riverside route as an alternative. We'll have another update in thirty minutes.",
    subQuestions: [
      {
        question: 'What is this report mainly about?',
        correctText: 'Traffic conditions during the morning commute',
        distractors: ['A change in bus fares', 'A new highway opening', 'A weather warning'],
        explanation:
          '"Good morning, commuters. Traffic on the downtown expressway is moving slowly"と述べている。',
        translation: 'この報道は主に何についてですか。',
      },
      {
        question: 'Why is traffic moving slowly?',
        correctText: 'Ongoing construction near exit seven',
        distractors: ['A traffic accident', 'A public event downtown', 'Heavy rain'],
        explanation: '"due to ongoing construction near exit seven"と述べている。',
        translation: 'なぜ交通の流れが遅くなっていますか。',
      },
      {
        question: 'What alternative does the reporter suggest?',
        correctText: 'Taking the riverside route',
        distractors: [
          'Waiting until after exit seven reopens',
          'Using public transportation instead',
          'Leaving earlier than usual',
        ],
        explanation: '"may want to consider the riverside route as an alternative"と述べている。',
        translation: '話者はどんな代替案を提案していますか。',
      },
    ],
    difficulty: 2,
  },
]
