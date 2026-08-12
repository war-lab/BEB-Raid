// Part3/4（audio_set）本試験長尺化セットのデータ本体（T-85。正本: docs/15 T-85行、docs/14 3.1節・3.6節）。
//
// 【設計判断（docs未記載）】14の3.6「本試験長尺化」を受け、90〜110語（30秒級）・difficulty4の
// Part3会話5セット・Part4トーク5セット＝計10セットを追加する。J-40の指示どおり、各セットに
// 最低1問の意図推定型サブ設問（script中の特定の発言を引用し、その発言の意図・含意を問う形式。
// 例: "Why does the woman say, '...'?"）を含める。意図推定タグはT-82でshadowingの死んだタグとして
// 除去したが、J-40の計画どおり本ファイルでaudio_setの実際の出題形式として復活させる（docs/03の
// タグ表もあわせて更新する）。既存のPART34_ENTRIES_S/S2のsetId（p3-01〜p3-20・p4-01〜p4-20）と
// 重複しないよう、本ファイルはp3-21〜p3-25・p4-21〜p4-25を使う。

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

export const PART34_ENTRIES_S3: Part34RawEntry[] = [
  // ============ Part3（2話者の会話、長尺・d4）5セット ============
  {
    setId: 'p3-21',
    part: 3,
    tags: ['意図推定'],
    keyVocabWords: ['reconciliation', 'variance'],
    script:
      "A: I finished the monthly reconciliation, but there's a variance of about two thousand dollars between the ledger and the bank statement. B: That's odd. Did you check whether the transfer to the Denver office was recorded twice? A: I did, and it wasn't that. I also compared the invoice numbers, and everything matched up on our end. B: Well, I guess we'll have to call the bank first thing tomorrow. I really thought we'd wrapped this up today. A: Same here. Let's just document exactly where the numbers diverge so we don't have to start from scratch when we call.",
    subQuestions: [
      {
        question: 'What problem does the woman report?',
        correctText: 'A mismatch between the ledger and the bank statement',
        distractors: [
          'A missing invoice from the Denver office',
          'A duplicate payment to a supplier',
          'An error in the payroll system',
        ],
        explanation:
          '女性は"there\'s a variance of about two thousand dollars between the ledger and the bank statement"と述べている。',
        translation: '女性はどんな問題を報告していますか。',
      },
      {
        question:
          'What does the man mean when he says, "I really thought we\'d wrapped this up today"?',
        correctText: 'He is disappointed that the issue was not resolved as expected',
        distractors: [
          'He is confident the issue will be solved within the hour',
          'He is blaming the woman for the delay',
          'He is suggesting they stop looking into the issue',
        ],
        explanation:
          '"wrapped this up"（片付ける）が今日中にできなかったことへの落胆を表しており、単なる事実描写ではなく感情の含意を読み取る意図推定問題。他の選択肢（"He is confident the issue will be solved within the hour"／"He is blaming the woman for the delay"／"He is suggesting they stop looking into the issue"）はこの会話・トークの中で述べられていない。',
        translation:
          '男性が「今日中に片付くと本当に思っていた」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will the speakers most likely do next?',
        correctText: 'Document the discrepancy before contacting the bank',
        distractors: [
          'Ask the Denver office to resend an invoice',
          'Reverse the suspicious transaction immediately',
          'Escalate the issue to their manager',
        ],
        explanation:
          '女性は"Let\'s just document exactly where the numbers diverge so we don\'t have to start from scratch when we call"と提案している。',
        translation: '話者たちは次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p3-22',
    part: 3,
    tags: ['意図推定'],
    keyVocabWords: ['lease'],
    script:
      "A: Have you seen the numbers on the relocation proposal? Moving to the new building would cost almost double what we're paying now under the current lease. B: I saw them, and honestly, I'm not sure the extra space is worth that kind of increase. A: That's my concern too, but the current office is getting cramped, and we've had three new hires just this quarter. B: Sure, but maybe we should look at subleasing part of our current floor instead of moving entirely. A: Huh, I hadn't considered that. It could solve the space problem without the full cost of relocating. B: Exactly. Let's bring that option to Thursday's meeting and see what the finance team thinks.",
    subQuestions: [
      {
        question: 'What are the speakers mainly discussing?',
        correctText: 'Whether to move to a more expensive office',
        distractors: [
          'Whether to hire more staff this quarter',
          'Whether to renew an expired contract',
          'Whether to close their current office permanently',
        ],
        explanation:
          '会話全体は移転提案のコスト増と、それに代わる案について話している。他の選択肢（"Whether to hire more staff this quarter"／"Whether to renew an expired contract"／"Whether to close their current office permanently"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは主に何について話していますか。',
      },
      {
        question: 'What does the woman mean when she says, "Huh, I hadn\'t considered that"?',
        correctText: "She finds the man's suggestion to be a new and useful idea",
        distractors: [
          'She disagrees with the man completely',
          'She already rejected that idea earlier',
          'She thinks the suggestion is not realistic',
        ],
        explanation:
          '直前の男性の"maybe we should look at subleasing part of our current floor"という提案に対する驚き・関心の反応であり、単なる相槌ではなく新しい案への肯定的な評価を示す意図推定問題。他の選択肢（"She already rejected that idea earlier"／"She thinks the suggestion is not realistic"／"She disagrees with the man completely"）はこの会話・トークの中で述べられていない。',
        translation: '女性が「それは考えていなかった」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will the speakers most likely do next?',
        correctText: "Present the subleasing option at Thursday's meeting",
        distractors: [
          'Sign the new lease immediately',
          'Cancel the relocation proposal entirely',
          'Hire a real estate consultant',
        ],
        explanation:
          '男性は"Let\'s bring that option to Thursday\'s meeting and see what the finance team thinks"と述べている。',
        translation: '話者たちは次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p3-23',
    part: 3,
    tags: ['意図推定'],
    keyVocabWords: ['prototype', 'benchmark'],
    script:
      "A: The prototype passed every benchmark test we ran except battery life, which came in about fifteen percent below target. B: Fifteen percent is a lot. Do we know what's causing the drain? A: The engineering team thinks it's the display brightness setting, but they haven't confirmed that yet. B: If it turns out to be the display, that's a relatively easy fix. But if it's the processor, we might be looking at a redesign. A: That's exactly what worries me, honestly. We're supposed to present this to the board in two weeks. B: Let's ask engineering for a firm answer by Friday so we know what we're dealing with before the presentation.",
    subQuestions: [
      {
        question: 'What issue did the prototype have?',
        correctText: 'Battery life below the target level',
        distractors: [
          'A display that would not turn on',
          'A processor that overheated during testing',
          'A design that failed a safety inspection',
        ],
        explanation:
          '女性は"passed every benchmark test we ran except battery life, which came in about fifteen percent below target"と述べている。他の選択肢（"A display that would not turn on"／"A processor that overheated during testing"／"A design that failed a safety inspection"）はこの会話・トークの中で述べられていない。',
        translation: 'その試作品にはどんな問題がありましたか。',
      },
      {
        question:
          'What does the woman mean when she says, "That\'s exactly what worries me, honestly"?',
        correctText: 'She is concerned that fixing the issue may require a major redesign',
        distractors: [
          'She is worried the board presentation has been canceled',
          'She is confident the display setting is the cause',
          'She is relieved that the fix will be simple',
        ],
        explanation:
          '直前の"if it\'s the processor, we might be looking at a redesign"を受けた発言で、その可能性への不安を表す意図推定問題。',
        translation: '女性が「それがまさに私の心配なんです」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What does the man suggest doing?',
        correctText: 'Getting a definite answer from engineering by Friday',
        distractors: [
          'Postponing the board presentation',
          'Replacing the entire engineering team',
          'Approving the redesign immediately',
        ],
        explanation: '男性は"Let\'s ask engineering for a firm answer by Friday"と提案している。',
        translation: '男性は何をすることを提案していますか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p3-24',
    part: 3,
    tags: ['意図推定'],
    keyVocabWords: ['supplier', 'renewal'],
    script:
      "A: Procurement sent over an update on the contract renewal with our longtime supplier. They're proposing a three percent price increase starting next quarter. B: What's driving the increase? A: Rising material costs, mostly, along with a longer shipping distance since they moved their main warehouse last year. B: Three percent adds up quickly given the volume we order every month. A: I agree, but we've been a reliable customer for eight years, so we do have some leverage to negotiate. B: Good point. Let's push back and ask for one and a half percent instead, and see how they respond. A: Agreed. I'll draft a counteroffer and send it to them by Friday.",
    subQuestions: [
      {
        question: 'What are the speakers discussing?',
        correctText: 'A price increase in a supplier contract renewal',
        distractors: [
          'A new supplier selection process',
          'A budget cut across departments',
          'A customer complaint about pricing',
        ],
        explanation:
          '会話は取引先との契約更新に伴う価格上昇について話している。他の選択肢（"A customer complaint about pricing"／"A new supplier selection process"／"A budget cut across departments"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何について話していますか。',
      },
      {
        question: 'What does the man mean when he says, "Good point"?',
        correctText: 'He agrees that their long relationship gives them room to negotiate',
        distractors: [
          'He thinks the price increase is fully justified',
          'He disagrees with the woman but will not argue',
          'He wants to end the conversation quickly',
        ],
        explanation:
          '直前の女性の"we\'ve been a reliable customer for eight years, so we do have some leverage to negotiate"という論拠に同意したことを示す意図推定問題。他の選択肢（"He disagrees with the woman but will not argue"／"He wants to end the conversation quickly"／"He thinks the price increase is fully justified"）はこの会話・トークの中で述べられていない。',
        translation: '男性が「もっともな指摘だ」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will the speakers most likely do next?',
        correctText: 'Send a counteroffer to the supplier',
        distractors: [
          'Accept the price increase as proposed',
          'Switch to a different supplier',
          'Cancel the contract renewal',
        ],
        explanation:
          '女性は"I\'ll draft a counteroffer and send it to them by Friday"と述べている。',
        translation: '話者たちは次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p3-25',
    part: 3,
    tags: ['意図推定'],
    keyVocabWords: ['overhaul', 'maintenance'],
    script:
      "A: Maintenance wants to schedule the system overhaul for next weekend, but that would mean about six hours of downtime during our busiest shopping period. B: Six hours is rough, but when else could we realistically do it? A: They mentioned a weeknight could work too, though it would need to be after midnight to avoid customer impact. B: Honestly, I'd rather lose a few hours of overnight traffic than risk anything going wrong during peak weekend sales. A: That's a good point when you put it that way. I hadn't weighted it quite like that. B: Let's ask maintenance to move it to a weeknight, then, and we'll notify the team in advance.",
    subQuestions: [
      {
        question: 'What are the speakers trying to decide?',
        correctText: 'When to schedule a system overhaul',
        distractors: [
          'Whether to cancel a weekend sale',
          'How to hire more maintenance staff',
          'Which vendor to use for a new system',
        ],
        explanation:
          '会話はシステム改修のスケジュールについて話している。他の選択肢（"Whether to cancel a weekend sale"／"How to hire more maintenance staff"／"Which vendor to use for a new system"）はこの会話・トークの中で述べられていない。',
        translation: '話者たちは何を決めようとしていますか。',
      },
      {
        question:
          'What does the woman mean when she says, "That\'s a good point when you put it that way"?',
        correctText: "She is reconsidering her opinion based on the man's argument",
        distractors: [
          'She is rejecting the weeknight option outright',
          'She already agreed with him before he spoke',
          'She is changing the subject to something else',
        ],
        explanation:
          '直前の男性の"I\'d rather lose a few hours of overnight traffic than risk anything going wrong during peak weekend sales"という理由づけを受けて、自分の考えを見直していることを示す意図推定問題。',
        translation: '女性が「そう言われるとその通りだ」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will the speakers most likely do next?',
        correctText: 'Ask maintenance to reschedule the overhaul to a weeknight',
        distractors: [
          'Cancel the system overhaul entirely',
          'Proceed with the original weekend schedule',
          'Postpone the decision until next month',
        ],
        explanation: '男性は"Let\'s ask maintenance to move it to a weeknight, then"と述べている。',
        translation: '話者たちは次に何をする可能性が高いですか。',
      },
    ],
    difficulty: 4,
  },

  // ============ Part4（単一話者のトーク、長尺・d4）5セット ============
  {
    setId: 'p4-21',
    part: 4,
    tags: ['意図推定'],
    keyVocabWords: ['relocation', 'facility'],
    script:
      'Good afternoon, everyone. I want to speak candidly about the office relocation plan that was announced this morning. I know many of you have questions about how this affects your daily commute, and I want to be upfront: we will be consolidating our three current offices into a single new facility across town over the next two quarters. For anyone whose commute will be significantly longer, we will offer a transition period and remote-work flexibility while you adjust. I understand this is difficult news, and honestly, I wish I could tell you more today than I can. The facility team will be holding one-on-one sessions starting next week to answer individual questions, and I encourage everyone to attend one if you have concerns.',
    subQuestions: [
      {
        question: 'What is the main purpose of this talk?',
        correctText: 'To announce details of an office relocation',
        distractors: [
          'To introduce a new regional manager',
          'To celebrate a company anniversary',
          'To announce a new product launch',
        ],
        explanation:
          '冒頭"I want to speak candidly about the office relocation plan that was announced this morning"と述べている。',
        translation: 'この話の主な目的は何ですか。',
      },
      {
        question:
          'What does the speaker mean by saying, "I wish I could tell you more today than I can"?',
        correctText: 'Some details of the plan are not yet finalized or shareable',
        distractors: [
          'The speaker disagrees with the relocation plan',
          'The speaker has been told to hide all information',
          'The relocation plan has already been canceled',
        ],
        explanation:
          '直前の"I understand this is difficult news"に続く発言で、現時点で開示できる情報に限りがあることへの遺憾の意を示す意図推定問題。他の選択肢（"The speaker disagrees with the relocation plan"／"The speaker has been told to hide all information"／"The relocation plan has already been canceled"）はこの会話・トークの中で述べられていない。',
        translation:
          '話者が「今日お伝えできる以上のことをお伝えできればと思う」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What are employees encouraged to do next week?',
        correctText: 'Attend a one-on-one session with the facility team',
        distractors: [
          'Submit a formal complaint',
          'Apply for a transfer to another region',
          'Meet with the regional manager directly',
        ],
        explanation:
          '"The facility team will be holding one-on-one sessions starting next week...I encourage everyone to attend one"と述べている。',
        translation: '従業員は来週、何をするよう勧められていますか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p4-22',
    part: 4,
    tags: ['意図推定'],
    keyVocabWords: ['acquisition', 'integration'],
    script:
      "Thanks for joining this update on the acquisition of Northfield Instruments. As most of you know, the deal closed last week, and we're now beginning the integration process. Over the next six months, we'll be aligning our systems, combining certain departments, and, in some cases, asking employees from both companies to take on new roles. I won't pretend this transition will be seamless. There will be bumps along the way, and I'd rather be honest about that now than have anyone caught off guard later. What I can promise is that we'll communicate every major decision as soon as it's finalized, and no one will be moved into a new role without advance discussion.",
    subQuestions: [
      {
        question: 'What is this talk mainly about?',
        correctText: 'An update on integrating a recently acquired company',
        distractors: [
          'An announcement of a new company policy',
          'A summary of quarterly sales figures',
          'A warning about a data security breach',
        ],
        explanation:
          '"an update on the acquisition of Northfield Instruments...we\'re now beginning the integration process"と述べている。他の選択肢（"An announcement of a new company policy"／"A summary of quarterly sales figures"／"A warning about a data security breach"）はこの会話・トークの中で述べられていない。',
        translation: 'この話は主に何についてですか。',
      },
      {
        question:
          'What does the speaker mean by saying, "I\'d rather be honest about that now than have anyone caught off guard later"?',
        correctText: 'The speaker wants to set realistic expectations about difficulties ahead',
        distractors: [
          'The speaker is warning of layoffs that will happen immediately',
          'The speaker regrets the acquisition took place',
          'The speaker is asking employees to keep the news confidential',
        ],
        explanation:
          '直前の"There will be bumps along the way"を受けた発言で、あらかじめ現実的な期待値を伝えておきたいという意図を示す意図推定問題。',
        translation:
          '話者が「後で不意打ちされるより今正直に話しておきたい」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What does the speaker promise to do?',
        correctText: 'Communicate major decisions as soon as they are finalized',
        distractors: [
          'Guarantee that no roles will change',
          'Complete the integration within one month',
          'Allow employees to choose their own new roles',
        ],
        explanation:
          '"we\'ll communicate every major decision as soon as it\'s finalized"と述べている。他の選択肢（"Guarantee that no roles will change"／"Complete the integration within one month"／"Allow employees to choose their own new roles"）はこの会話・トークの中で述べられていない。',
        translation: '話者は何をすると約束していますか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p4-23',
    part: 4,
    tags: ['意図推定'],
    keyVocabWords: ['recall', 'liability'],
    script:
      'This is an internal briefing regarding the voluntary recall of model AX-200 units sold between March and June. Our engineering team identified a wiring defect that, in rare cases, could pose a safety risk. We are recalling approximately twelve thousand units and offering affected customers a full refund or a free replacement. Legal has confirmed that acting now, before any incidents occur, significantly limits our liability compared to waiting for a complaint. I want to be clear that this was not an easy decision given the cost involved, but it was, frankly, the only responsible one. Customer service will begin contacting affected buyers by phone starting Monday.',
    subQuestions: [
      {
        question: 'What is the purpose of this briefing?',
        correctText: 'To inform staff about a product recall',
        distractors: [
          'To announce a new product launch',
          'To report on a completed customer refund',
          'To introduce a new legal policy',
        ],
        explanation:
          '"an internal briefing regarding the voluntary recall of model AX-200 units"と述べている。他の選択肢（"To announce a new product launch"／"To report on a completed customer refund"／"To introduce a new legal policy"）はこの会話・トークの中で述べられていない。',
        translation: 'この説明会の目的は何ですか。',
      },
      {
        question:
          'What does the speaker mean by saying, "it was, frankly, the only responsible one"?',
        correctText: 'The speaker believes the recall was the right decision despite its cost',
        distractors: [
          'The speaker thinks the recall was unnecessary',
          'The speaker is blaming the engineering team',
          'The speaker wants to delay the recall further',
        ],
        explanation:
          '直前の"this was not an easy decision given the cost involved"に続く発言で、コストを踏まえてもリコールが唯一正しい判断だったという確信を示す意図推定問題。',
        translation:
          '話者が「率直に言って、それが唯一責任ある判断だった」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will happen starting Monday?',
        correctText: 'Customer service will begin contacting affected buyers',
        distractors: [
          'Engineering will begin redesigning the product',
          'Legal will file a report with regulators',
          'All units will be automatically refunded',
        ],
        explanation:
          '"Customer service will begin contacting affected buyers by phone starting Monday"と述べている。',
        translation: '月曜日から何が始まりますか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p4-24',
    part: 4,
    tags: ['意図推定'],
    keyVocabWords: ['market', 'saturation'],
    script:
      "Thank you all for coming to this planning session on our proposed expansion into the southern region. Our research shows strong demand there, but I want to flag one concern before we move forward: the market may already be approaching saturation, with three established competitors operating in the exact area we're targeting. That said, our pricing model and delivery speed give us a real advantage that none of them currently offer. I'd rather go in with our eyes open about the competition than assume this will be an easy win. If the leadership team approves the budget next week, we could open our first location there by early autumn.",
    subQuestions: [
      {
        question: 'What is the main topic of this talk?',
        correctText: 'A proposed business expansion into a new region',
        distractors: [
          'A review of a failed marketing campaign',
          'An announcement of store closures',
          'A summary of customer satisfaction surveys',
        ],
        explanation:
          '"this planning session on our proposed expansion into the southern region"と述べている。他の選択肢（"A summary of customer satisfaction surveys"／"A review of a failed marketing campaign"／"An announcement of store closures"）はこの会話・トークの中で述べられていない。',
        translation: 'この話の主な話題は何ですか。',
      },
      {
        question:
          'What does the speaker mean by saying, "I\'d rather go in with our eyes open about the competition than assume this will be an easy win"?',
        correctText: 'The speaker wants the team to be realistic about the challenges ahead',
        distractors: [
          'The speaker wants to cancel the expansion plan',
          'The speaker is confident there is no real competition',
          'The speaker is asking for more research before any discussion',
        ],
        explanation:
          '直前の"the market may already be approaching saturation, with three established competitors"を受けた発言で、楽観視せず現実的に取り組みたいという意図を示す意図推定問題。',
        translation:
          '話者が「簡単に勝てると思い込むより、競合の存在を直視して臨みたい」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What could happen if the budget is approved next week?',
        correctText: 'The first location could open by early autumn',
        distractors: [
          'The expansion plan will be canceled',
          'Three competitors will exit the market',
          'The pricing model will be revised',
        ],
        explanation:
          '"If the leadership team approves the budget next week, we could open our first location there by early autumn"と述べている。',
        translation: '来週予算が承認されれば、何が起こり得ますか。',
      },
    ],
    difficulty: 4,
  },
  {
    setId: 'p4-25',
    part: 4,
    tags: ['意図推定'],
    keyVocabWords: ['outsource', 'quality'],
    script:
      "I wanted to share an update on the decision to outsource part of our customer support to an external provider. This wasn't a decision we made lightly, given how much pride our current team takes in quality service. However, our call volume has tripled in the past year, and our in-house team simply cannot keep pace without significant additional hiring. The external provider will handle only routine inquiries at first, such as order status and returns, while our internal team continues to manage complex cases. We'll be monitoring customer satisfaction scores closely over the next quarter, and if quality drops, we will reassess this arrangement immediately.",
    subQuestions: [
      {
        question: 'What change is being announced?',
        correctText: 'Outsourcing part of customer support to an external provider',
        distractors: [
          'Hiring a large number of new in-house staff',
          'Closing the customer support department',
          'Merging with another company',
        ],
        explanation:
          '"the decision to outsource part of our customer support to an external provider"と述べている。',
        translation: 'どんな変更が発表されていますか。',
      },
      {
        question:
          'What does the speaker mean by saying, "This wasn\'t a decision we made lightly"?',
        correctText: 'The decision was made carefully and was not easy',
        distractors: [
          'The decision was made without any research',
          'The decision has already been reversed',
          'The decision was forced by upper management',
        ],
        explanation:
          '"given how much pride our current team takes in quality service"に続く発言で、外部委託が簡単な決定ではなかったことを示す意図推定問題。他の選択肢（"The decision has already been reversed"／"The decision was forced by upper management"／"The decision was made without any research"）はこの会話・トークの中で述べられていない。',
        translation:
          '話者が「この決定は軽々しく下したものではない」と言っているのはどういう意味ですか。',
      },
      {
        question: 'What will the external provider handle at first?',
        correctText: 'Routine inquiries such as order status and returns',
        distractors: [
          'All customer complaints without exception',
          'Only technical support issues',
          'Complex cases that the internal team cannot resolve',
        ],
        explanation:
          '"The external provider will handle only routine inquiries at first, such as order status and returns"と述べている。',
        translation: '外部の業者は最初、何を担当しますか。',
      },
    ],
    difficulty: 4,
  },
]
