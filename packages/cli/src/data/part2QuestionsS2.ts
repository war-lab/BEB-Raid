// Part2（audio_qa）追加100問のデータ本体（M2・T-60。正本: docs/13 3.10節、docs/03 7.1節）。
// keyVocabWordはS/A/B語彙カード（600語）から選び、単語帳との循環を成立させる
// （T-27のSランク50問と重複しない語を選定）。
// tags[0]は音声知覚系タグ必須（疑問詞聞き取り/弱形・連結/数字・時刻/米英アクセント）。
// 難易度は2〜4に分散し、間接応答問（応答が疑問文の型に素直に対応しない、推論を要する応答）を
// 2割程度含める（difficulty=4扱い。02の3.1のL2基礎訓練の位置づけは維持しつつ、
// M1レビューで見送った提案を回収）。
// 正答キーはcorrectText/distractorsの形で書き、part2Question.tsのrotatePart2Choicesが
// index%3の決定的ローテーションでA/B/Cへの機械的な分散を行う（著者は正答位置を気にしない）。

export interface Part2RawEntry {
  keyVocabWord: string
  tags: string[]
  script: string
  correctText: string
  distractors: readonly [string, string]
  explanation: string
  translation: string
  difficulty: number
}

export const PART2_ENTRIES_S2_RAW: Part2RawEntry[] = [
  // --- 疑問詞聞き取り（直接応答） ---
  {
    keyVocabWord: 'summarize',
    tags: ['疑問詞聞き取り'],
    script: 'Who is going to summarize the survey results for the board? — I will.',
    correctText: 'I will.',
    distractors: ['Every quarter.', 'In the main office.'],
    explanation:
      'Who（誰）への応答は人物。「Every quarter.」は頻度（How often）、「In the main office.」は場所（Where）への応答で、Whoの質問には合わない。',
    translation: '誰が理事会向けにアンケート結果を要約するのですか？ — 私がやります。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'revise',
    tags: ['疑問詞聞き取り'],
    script: 'When do you need me to revise the proposal? — By Wednesday morning.',
    correctText: 'By Wednesday morning.',
    distractors: ['With the sales team.', 'About ten pages.'],
    explanation:
      'When（いつ）への応答は時。「With the sales team.」は相手（Who/With whom）、「About ten pages.」は数量への応答で、Whenの質問には合わない。',
    translation: 'いつまでに提案書を修正してほしいですか？ — 水曜の午前中までに。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'qualification',
    tags: ['疑問詞聞き取り'],
    script:
      'What qualification is required for this role? — A certification in project management.',
    correctText: 'A certification in project management.',
    distractors: ['Sometime next month.', 'The floor above ours.'],
    explanation:
      'What（何）への応答は内容。「Sometime next month.」は時（When）、「The floor above ours.」は場所（Where）への応答で、Whatの質問には合わない。',
    translation: 'この職に必要な資格は何ですか？ — プロジェクト管理の認定資格です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'mentor',
    tags: ['疑問詞聞き取り'],
    script: 'Who will be my mentor during the onboarding period? — Someone from the design team.',
    correctText: 'Someone from the design team.',
    distractors: ['For about two weeks.', 'Yes, I already signed up.'],
    explanation:
      'Who（誰）への応答は人物。「For about two weeks.」は期間（How long）、「Yes, I already signed up.」はYes/No疑問文への応答で、Whoの質問には合わない。',
    translation: '研修期間中、誰が私のメンターになりますか？ — デザインチームの誰かです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'workforce',
    tags: ['疑問詞聞き取り'],
    script:
      'Why is the company expanding its workforce this year? — Demand has grown faster than expected.',
    correctText: 'Demand has grown faster than expected.',
    distractors: ['In the new branch office.', 'About fifty new positions.'],
    explanation:
      'Why（なぜ）への応答は理由。「In the new branch office.」は場所、「About fifty new positions.」は数量への応答で、Whyの質問には合わない。',
    translation:
      'なぜ会社は今年労働力を拡大しているのですか？ — 需要が予想より早く伸びたからです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'depreciation',
    tags: ['疑問詞聞き取り'],
    script: 'Over what period is the equipment depreciation calculated? — Over a five-year period.',
    correctText: 'Over a five-year period.',
    distractors: ['The finance department.', 'Because the machines are old.'],
    explanation:
      '期間を尋ねる質問には具体的な期間で答える。「The finance department.」は主体（Who）、「Because the machines are old.」は理由（Why）への応答で、期間を尋ねる質問には合わない。',
    translation:
      '設備の減価償却はどのくらいの期間で計算されますか？ — 5年間にわたって計算されます。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'reconcile',
    tags: ['疑問詞聞き取り'],
    script: 'When should we reconcile the accounts this month? — Before the end of the week.',
    correctText: 'Before the end of the week.',
    distractors: ['The accounting manager.', 'Around three thousand dollars.'],
    explanation:
      'When（いつ）への応答は時。「The accounting manager.」は人物（Who）、「Around three thousand dollars.」は金額への応答で、Whenの質問には合わない。',
    translation: '今月はいつ口座を照合すべきですか？ — 今週末までに。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'prototype',
    tags: ['疑問詞聞き取り'],
    script: 'Where should we test the new prototype? — In the engineering lab downstairs.',
    correctText: 'In the engineering lab downstairs.',
    distractors: ['Sometime next week.', 'Because the design changed.'],
    explanation:
      'Where（どこ）への応答は場所。「Sometime next week.」は時（When）、「Because the design changed.」は理由（Why）への応答で、Whereの質問には合わない。',
    translation: '新しい試作品はどこでテストすべきですか？ — 下の階のエンジニアリング研究室です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'bottleneck',
    tags: ['疑問詞聞き取り'],
    script:
      'What is causing the bottleneck on the production line? — A shortage of packaging materials.',
    correctText: 'A shortage of packaging materials.',
    distractors: ['Last Tuesday afternoon.', 'The night shift supervisor.'],
    explanation:
      'What（何）への応答は内容。「Last Tuesday afternoon.」は時、「The night shift supervisor.」は人物への応答で、Whatの質問には合わない。',
    translation: '何が生産ラインのボトルネックの原因ですか？ — 梱包資材の不足です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'demographic',
    tags: ['疑問詞聞き取り'],
    script:
      'Which demographic is the new campaign targeting? — Young professionals in their twenties.',
    correctText: 'Young professionals in their twenties.',
    distractors: ['Twice a month.', 'Through social media only.'],
    explanation:
      'Which（どちらの）は選択・対象を尋ねる。「Twice a month.」は頻度、「Through social media only.」は手段への応答で、対象を尋ねる質問には合わない。',
    translation: '新しいキャンペーンはどの層をターゲットにしていますか？ — 20代の若い社会人です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'outreach',
    tags: ['疑問詞聞き取り'],
    script:
      'Who organized the community outreach event last month? — The public relations team did.',
    correctText: 'The public relations team did.',
    distractors: ['At the downtown community center.', 'For about three hours.'],
    explanation:
      'Who（誰）への応答は人物・組織。「At the downtown community center.」は場所、「For about three hours.」は時間への応答で、Whoの質問には合わない。',
    translation: '先月の地域向け啓発イベントは誰が企画したのですか？ — 広報チームです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'compensate',
    tags: ['疑問詞聞き取り'],
    script: 'How will the airline compensate passengers for the delay? — With a travel voucher.',
    correctText: 'With a travel voucher.',
    distractors: ['Around four hours late.', 'Because of the storm.'],
    explanation:
      'How（どのように）への応答は方法。「Around four hours late.」は程度、「Because of the storm.」は理由への応答で、Howの質問には合わない。',
    translation: '航空会社は遅延について乗客にどう補償しますか？ — 旅行券で補償します。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'dispute',
    tags: ['疑問詞聞き取り'],
    script: 'Why did the two suppliers have a dispute? — They disagreed on the delivery terms.',
    correctText: 'They disagreed on the delivery terms.',
    distractors: ['Last quarter, I believe.', 'The regional sales director.'],
    explanation:
      'Why（なぜ）への応答は理由。「Last quarter, I believe.」は時、「The regional sales director.」は人物への応答で、Whyの質問には合わない。',
    translation: 'なぜ2社の仕入先は揉めたのですか？ — 納期の条件で意見が合わなかったからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'checkpoint',
    tags: ['疑問詞聞き取り'],
    script: 'Where is the nearest security checkpoint? — Just past the main entrance.',
    correctText: 'Just past the main entrance.',
    distractors: ['Every visitor must go through it.', 'It takes about five minutes.'],
    explanation:
      'Where（どこ）への応答は場所。「Every visitor must go through it.」は説明、「It takes about five minutes.」は所要時間への応答で、Whereの質問には合わない。',
    translation: '一番近い保安検査場はどこですか？ — 正面入口を過ぎたところです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'shuttle',
    tags: ['疑問詞聞き取り'],
    script: 'When does the airport shuttle leave? — Every thirty minutes.',
    correctText: 'Every thirty minutes.',
    distractors: ['At gate number twelve.', 'It seats about twenty people.'],
    explanation:
      'When（いつ）への応答は時・頻度。「At gate number twelve.」は場所、「It seats about twenty people.」は定員への応答で、Whenの質問には合わない。',
    translation: '空港送迎バスはいつ出発しますか？ — 30分おきです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'firewall',
    tags: ['疑問詞聞き取り'],
    script:
      'Who is responsible for updating the firewall settings? — Someone on the IT security team.',
    correctText: 'Someone on the IT security team.',
    distractors: ['Once every quarter.', 'Because of a new threat.'],
    explanation:
      'Who（誰）への応答は人物。「Once every quarter.」は頻度、「Because of a new threat.」は理由への応答で、Whoの質問には合わない。',
    translation:
      'ファイアウォールの設定更新は誰が担当していますか？ — ITセキュリティチームの誰かです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'encryption',
    tags: ['疑問詞聞き取り'],
    script:
      'Why does the app require stronger encryption now? — New privacy regulations took effect.',
    correctText: 'New privacy regulations took effect.',
    distractors: ['Roughly two months ago.', 'The development team lead.'],
    explanation:
      'Why（なぜ）への応答は理由。「Roughly two months ago.」は時、「The development team lead.」は人物への応答で、Whyの質問には合わない。',
    translation:
      'なぜアプリは今より強い暗号化を必要としているのですか？ — 新しいプライバシー規制が施行されたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'contractor',
    tags: ['疑問詞聞き取り'],
    script: 'Which contractor is handling the office renovation? — The same one from last year.',
    correctText: 'The same one from last year.',
    distractors: ['About six weeks.', 'On the third floor.'],
    explanation:
      'Which（どちらの）は対象を尋ねる。「About six weeks.」は期間、「On the third floor.」は場所への応答で、対象を尋ねる質問には合わない。',
    translation: 'どの請負業者がオフィス改装を担当していますか？ — 去年と同じ業者です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'blueprint',
    tags: ['疑問詞聞き取り'],
    script: 'Who approved the final blueprint for the building? — The city planning office.',
    correctText: 'The city planning office.',
    distractors: ['Two weeks from now.', 'Because of a zoning issue.'],
    explanation:
      'Who（誰）への応答は組織・人物。「Two weeks from now.」は時、「Because of a zoning issue.」は理由への応答で、Whoの質問には合わない。',
    translation: 'その建物の最終設計図を承認したのは誰ですか？ — 市の都市計画局です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'franchise',
    tags: ['疑問詞聞き取り'],
    script: 'How many franchise locations does the company have now? — Just over two hundred.',
    correctText: 'Just over two hundred.',
    distractors: ['Since the early nineties.', 'Mostly in shopping malls.'],
    explanation:
      'How many（いくつ）への応答は数量。「Since the early nineties.」は時期、「Mostly in shopping malls.」は場所への応答で、数量を尋ねる質問には合わない。',
    translation:
      '同社は現在いくつのフランチャイズ店舗を持っていますか？ — 200店舗を少し超えています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'ceremony',
    tags: ['疑問詞聞き取り'],
    script: 'Where will the opening ceremony be held? — In the main conference hall.',
    correctText: 'In the main conference hall.',
    distractors: ['At nine in the morning.', 'About two hundred guests.'],
    explanation:
      'Where（どこ）への応答は場所。「At nine in the morning.」は時刻、「About two hundred guests.」は人数への応答で、Whereの質問には合わない。',
    translation: '開会式はどこで行われますか？ — メイン会議場で行われます。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'regulation',
    tags: ['疑問詞聞き取り'],
    script:
      'Why was the new safety regulation introduced? — After several accidents at the factory.',
    correctText: 'After several accidents at the factory.',
    distractors: ['The labor ministry.', 'Starting next January.'],
    explanation:
      'Why（なぜ）への応答は理由。「The labor ministry.」は主体、「Starting next January.」は時への応答で、Whyの質問には合わない。',
    translation: 'なぜ新しい安全規制が導入されたのですか？ — 工場で複数の事故が起きた後です。',
    difficulty: 3,
  },

  // --- 数字・時刻 ---
  {
    keyVocabWord: 'briefing',
    tags: ['数字・時刻'],
    script: 'What time does the briefing start? — At ten o’clock sharp.',
    correctText: 'At ten o’clock sharp.',
    distractors: ['In conference room B.', 'The regional managers.'],
    explanation:
      '時刻を尋ねる質問には具体的な時間で答える。他の2つは場所・人物の応答で噛み合わない。',
    translation: '説明会は何時に始まりますか？ — 10時ちょうどです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'headcount',
    tags: ['数字・時刻'],
    script:
      'How many people are included in this year’s headcount increase? — Around thirty new hires.',
    correctText: 'Around thirty new hires.',
    distractors: ['Mostly in the sales division.', 'Because business is growing.'],
    explanation:
      '数量を尋ねる質問には具体的な人数で答える。他の2つは部門・理由の応答で噛み合わない。',
    translation: '今年の増員には何人が含まれますか？ — 新規採用約30人です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'consignment',
    tags: ['数字・時刻'],
    script: 'How long was the consignment delayed at customs? — About two full days.',
    correctText: 'About two full days.',
    distractors: ['Because of a missing form.', 'The shipping company.'],
    explanation:
      '期間を尋ねる質問には具体的な日数で答える。他の2つは理由・主体の応答で噛み合わない。',
    translation: '委託貨物は税関でどれくらい遅れましたか？ — まるまる2日ほどです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subsidy',
    tags: ['数字・時刻'],
    script: 'What percentage of the cost does the subsidy cover? — Up to forty percent.',
    correctText: 'Up to forty percent.',
    distractors: ['Small manufacturing firms.', 'Once a year, in March.'],
    explanation: '割合を尋ねる質問には数値で答える。他の2つは対象・時期の応答で噛み合わない。',
    translation: 'その補助金は費用の何パーセントをカバーしますか？ — 最大40パーセントです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'levy',
    tags: ['数字・時刻'],
    script: 'When will the new tax levy take effect? — Starting from the first of next month.',
    correctText: 'Starting from the first of next month.',
    distractors: ['The city council decided.', 'On rental properties only.'],
    explanation:
      '時を尋ねる質問には具体的な日付で答える。他の2つは主体・対象の応答で噛み合わない。',
    translation: '新しい課税はいつから発効しますか？ — 来月1日からです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'throughput',
    tags: ['数字・時刻'],
    script: 'By how much did the new line increase throughput? — By nearly thirty percent.',
    correctText: 'By nearly thirty percent.',
    distractors: ['Since last spring.', 'The production manager.'],
    explanation: '増加量を尋ねる質問には数値で答える。他の2つは時期・人物の応答で噛み合わない。',
    translation:
      '新しいラインでどれだけ処理能力が上がりましたか？ — 30パーセント近く上がりました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'occupancy',
    tags: ['数字・時刻'],
    script: 'What is the current occupancy rate of the building? — About ninety percent.',
    correctText: 'About ninety percent.',
    distractors: ['Since it opened in June.', 'The property management firm.'],
    explanation: '割合を尋ねる質問には数値で答える。他の2つは時期・主体の応答で噛み合わない。',
    translation: 'その建物の現在の入居率はどれくらいですか？ — 約90パーセントです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'liquidity',
    tags: ['数字・時刻'],
    script:
      'How much did liquidity improve after the new policy? — Nearly fifteen percent within a year.',
    correctText: 'Nearly fifteen percent within a year.',
    distractors: ['The chief financial officer.', 'Because of tighter budgeting.'],
    explanation: '増加量を尋ねる質問には数値で答える。他の2つは人物・理由の応答で噛み合わない。',
    translation: 'その新方針の後、流動性はどれくらい改善しましたか？ — 1年でほぼ15パーセントです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'footfall',
    tags: ['数字・時刻'],
    script:
      'How much has footfall increased since the renovation? — Roughly twenty percent on weekends.',
    correctText: 'Roughly twenty percent on weekends.',
    distractors: ['Since early spring.', 'The mall management office.'],
    explanation: '増加量を尋ねる質問には数値で答える。他の2つは時期・主体の応答で噛み合わない。',
    translation: '改装後、来店客数はどれくらい増えましたか？ — 週末はおよそ20パーセントです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'attrition',
    tags: ['数字・時刻'],
    script: 'What is the company’s current attrition rate? — Around eight percent annually.',
    correctText: 'Around eight percent annually.',
    distractors: ['The human resources director.', 'Mainly younger employees.'],
    explanation: '割合を尋ねる質問には数値で答える。他の2つは人物・対象の応答で噛み合わない。',
    translation: '会社の現在の離職率はどれくらいですか？ — 年間約8パーセントです。',
    difficulty: 3,
  },

  // --- 弱形・連結（縮約・連結発音を意識した口語表現） ---
  {
    keyVocabWord: 'proofread',
    tags: ['弱形・連結'],
    script: 'Could you proofread this before I send it? — Sure, give me a minute.',
    correctText: 'Sure, give me a minute.',
    distractors: ['I sent it yesterday.', 'It’s in the shared folder.'],
    explanation:
      '依頼（Could you ...?）への応答は承諾か断り。「I sent it yesterday.」「It’s in the shared folder.」は依頼への直接的な返答になっていない。',
    translation: '送る前にこれを校正してもらえますか？ — もちろん、少し時間をください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'onboarding',
    tags: ['弱形・連結'],
    script: 'Do you want to sit in on the onboarding session tomorrow? — I’d love to, actually.',
    correctText: 'I’d love to, actually.',
    distractors: ['It lasted two hours.', 'She joined last week.'],
    explanation:
      '勧誘（Want to...?）への応答は同意か辞退。「It lasted two hours.」「She joined last week.」は勧誘への返答になっていない。',
    translation: '明日の新人研修に同席したい？ — ぜひ参加したいです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'expedite',
    tags: ['弱形・連結'],
    script: 'Could ya expedite this order for us? — I’ll check with the warehouse right away.',
    correctText: 'I’ll check with the warehouse right away.',
    distractors: ['It arrived on time last week.', 'The order number is 4521.'],
    explanation:
      '依頼（Could you...?）への応答は対応の意思表示。他の2つは過去の実績や番号情報で、依頼への直接的な返答になっていない。',
    translation: 'この注文を急いでもらえますか？ — すぐに倉庫に確認します。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'reconciliation',
    tags: ['弱形・連結'],
    script: 'Did you finish the reconciliation for March yet? — Almost, just one account left.',
    correctText: 'Almost, just one account left.',
    distractors: ['The finance team handles that.', 'It was due last Friday.'],
    explanation:
      '進捗を尋ねる質問（Did you...?）には状況で答える。他の2つは主体や期限の情報で、進捗を尋ねる質問には合わない。',
    translation: '3月分の照合はもう終わった？ — もうすぐです、あと1口座だけ残っています。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'streamline',
    tags: ['弱形・連結'],
    script:
      'Are you going to streamline the approval process this quarter? — That’s the plan, yes.',
    correctText: 'That’s the plan, yes.',
    distractors: ['It took three weeks last time.', 'The operations team suggested it.'],
    explanation:
      '意図を尋ねる質問（Going to...?）には計画の有無で答える。他の2つは過去の所要時間や提案者の情報で噛み合わない。',
    translation: '今四半期は承認プロセスを合理化するつもり？ — その予定です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'incentivize',
    tags: ['弱形・連結'],
    script: 'Should we incentivize early sign-ups this time? — I think that’s worth trying.',
    correctText: 'I think that’s worth trying.',
    distractors: ['About two hundred people signed up.', 'The marketing team is in charge.'],
    explanation:
      '提案（Should we...?）への応答は賛成・反対の意見。他の2つは人数や担当者の情報で、提案への返答になっていない。',
    translation: '今回は早期申込に特典をつけるべきかな？ — 試してみる価値はあると思う。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'appraisal',
    tags: ['弱形・連結'],
    script: 'Do you know when my appraisal is scheduled? — I believe it’s next Monday.',
    correctText: 'I believe it’s next Monday.',
    distractors: ['Your manager conducted it.', 'It usually takes an hour.'],
    explanation:
      '時を尋ねる質問（Do you know when...?）には具体的な日で答える。他の2つは主体・所要時間の情報で噛み合わない。',
    translation: '私の人事評価がいつ予定されているか知ってる？ — 来週の月曜だと思う。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'retention',
    tags: ['弱形・連結'],
    script:
      'Do you want to review the retention numbers together this afternoon? — Sounds good to me.',
    correctText: 'Sounds good to me.',
    distractors: ['They improved last quarter.', 'The HR analyst prepared them.'],
    explanation:
      '勧誘（Want to...?）への応答は同意か辞退。他の2つは実績や作成者の情報で、勧誘への返答になっていない。',
    translation: '今日の午後、一緒に定着率の数字を確認しない？ — いいね、そうしよう。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'automate',
    tags: ['弱形・連結'],
    script:
      'Are you going to automate the invoicing this year? — We’re still discussing the budget for it.',
    correctText: 'We’re still discussing the budget for it.',
    distractors: ['It saved us a lot of time.', 'The software vendor called yesterday.'],
    explanation:
      '意図を尋ねる質問（Going to...?）には計画の状況で答える。他の2つは過去の効果や連絡の情報で噛み合わない。',
    translation: '今年、請求業務を自動化するつもり？ — まだ予算について話し合っているところです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'diversify',
    tags: ['弱形・連結'],
    script:
      'Should the fund diversify into overseas markets? — That’s what the advisor recommends.',
    correctText: 'That’s what the advisor recommends.',
    distractors: ['It grew by ten percent last year.', 'The meeting is at noon.'],
    explanation:
      '提案（Should...?）への応答は意見・根拠。他の2つは実績や時刻の情報で、提案への返答になっていない。',
    translation:
      'そのファンドは海外市場にも分散投資すべきかな？ — アドバイザーはそう勧めています。',
    difficulty: 3,
  },

  // --- 米英アクセント（発話者の言い回しの違いに注意する想定の対話） ---
  {
    keyVocabWord: 'amenity',
    tags: ['米英アクセント'],
    script: 'What amenity does the office building offer? — A gym and a rooftop terrace.',
    correctText: 'A gym and a rooftop terrace.',
    distractors: ['It opened last spring.', 'The property developer.'],
    explanation:
      'What（何）への応答は内容。他の2つは時期・主体の応答で、施設内容を尋ねる質問には合わない。',
    translation: 'このオフィスビルにはどんな設備がありますか？ — ジムと屋上テラスです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'concierge',
    tags: ['米英アクセント'],
    script: 'Who can help me book a restaurant tonight? — Ask the concierge at the front desk.',
    correctText: 'Ask the concierge at the front desk.',
    distractors: ['It opens at six.', 'The hotel has three restaurants.'],
    explanation:
      'Who（誰）への応答は人物・窓口。他の2つは営業時間や施設数の情報で、Whoの質問には合わない。',
    translation:
      '今夜レストランを予約する手伝いを誰に頼めますか？ — フロントのコンシェルジュに聞いてください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'chartered',
    tags: ['米英アクセント'],
    script:
      'Why did we book a chartered bus for the delegates? — The regular shuttle doesn’t run that late.',
    correctText: 'The regular shuttle doesn’t run that late.',
    distractors: ['It seats forty people.', 'The travel agency arranged it.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは定員・手配者の情報で、Whyの質問には合わない。',
    translation:
      'なぜ代表団のために貸し切りバスを予約したのですか？ — 通常のシャトルはその時間には走っていないからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'punctual',
    tags: ['米英アクセント'],
    script: 'Is the courier usually punctual? — Yes, almost always right on time.',
    correctText: 'Yes, almost always right on time.',
    distractors: ['They deliver twice a day.', 'The warehouse is downtown.'],
    explanation:
      'Yes/No疑問文には賛否で答える。他の2つは頻度・場所の情報で、Yes/No疑問文への直接応答になっていない。',
    translation: '配達員はいつも時間に正確ですか？ — はい、ほとんどいつも時間通りです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'gateway',
    tags: ['米英アクセント'],
    script:
      'Why is this airport considered a gateway to the region? — It connects to over thirty countries.',
    correctText: 'It connects to over thirty countries.',
    distractors: ['It was built ten years ago.', 'The airline added new routes.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは建設時期・追加路線の情報で、Whyの質問には合わない。',
    translation:
      'なぜこの空港はこの地域の玄関口とみなされているのですか？ — 30カ国以上とつながっているからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'hospitality',
    tags: ['米英アクセント'],
    script:
      'What did the guests say about the hotel’s hospitality? — They praised the friendly staff.',
    correctText: 'They praised the friendly staff.',
    distractors: ['It has two hundred rooms.', 'It was renovated last year.'],
    explanation:
      'What（何）への応答は内容。他の2つは客室数・改装時期の情報で、Whatの質問には合わない。',
    translation:
      'ゲストはホテルのもてなしについて何と言っていましたか？ — フレンドリーなスタッフを褒めていました。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'commute',
    tags: ['米英アクセント'],
    script: 'How long is your commute to the new office? — About forty minutes by train.',
    correctText: 'About forty minutes by train.',
    distractors: ['It’s near the harbor.', 'I started last month.'],
    explanation:
      'How long（どのくらい）への応答は所要時間。他の2つは場所・開始時期の情報で、How longの質問には合わない。',
    translation: '新しいオフィスまでの通勤時間はどのくらいですか？ — 電車で約40分です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'congestion',
    tags: ['米英アクセント'],
    script:
      'Why was there so much congestion this morning? — There was an accident on the highway.',
    correctText: 'There was an accident on the highway.',
    distractors: ['It happens every Friday.', 'The city added a new lane.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは頻度・道路改良の情報で、Whyの質問には合わない。',
    translation: '今朝はなぜあんなに渋滞していたのですか？ — 高速道路で事故があったからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'immigration',
    tags: ['米英アクセント'],
    script: 'How long was the line at immigration? — Surprisingly short today.',
    correctText: 'Surprisingly short today.',
    distractors: ['Two officers were on duty.', 'It closes at midnight.'],
    explanation:
      'How long（どのくらい）は程度・長さを尋ねる。他の2つは人員数・営業時間の情報で、質問には合わない。',
    translation: '入国審査の列はどのくらいの長さでしたか？ — 今日は驚くほど短かったです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'stopover',
    tags: ['米英アクセント'],
    script:
      'Why did you choose a flight with a stopover? — It was much cheaper than the direct one.',
    correctText: 'It was much cheaper than the direct one.',
    distractors: ['It leaves at midnight.', 'The airline is based overseas.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは出発時刻・拠点の情報で、Whyの質問には合わない。',
    translation: 'なぜ乗り継ぎのある便を選んだのですか？ — 直行便よりずっと安かったからです。',
    difficulty: 3,
  },

  // --- 間接応答（difficulty4。素直な語り口対応でなく推論を要する応答） ---
  {
    keyVocabWord: 'ratify',
    tags: ['米英アクセント'],
    script:
      'Has the board voted to ratify the merger agreement yet? — They’re meeting again this afternoon.',
    correctText: 'They’re meeting again this afternoon.',
    distractors: ['It was signed last year.', 'The lawyers drafted it.'],
    explanation:
      '間接応答: 「今日の午後また会議がある」は「まだ承認していない（結果待ち）」ことを暗に示す。他の2つは直接的だが文脈に合わない情報。',
    translation: '取締役会は合併契約をもう批准しましたか？ — 今日の午後また会議があります。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'disclose',
    tags: ['米英アクセント'],
    script:
      'Did the company disclose its full earnings report? — Only a summary was released so far.',
    correctText: 'Only a summary was released so far.',
    distractors: ['The CFO wrote it.', 'The cafeteria is closed for renovation.'],
    explanation:
      '間接応答: 「これまでは要約のみ公開された」は「全文はまだ開示されていない」ことを示す。他の2つは直接的だが質問の核心（開示の有無）に答えていない。',
    translation:
      '会社は決算報告を全面的に開示しましたか？ — 今のところ要約だけが公表されています。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'reimbursement',
    tags: ['米英アクセント'],
    script:
      'Isn’t the travel expense reimbursement already processed? — I haven’t checked my account yet.',
    correctText: 'I haven’t checked my account yet.',
    distractors: [
      'The parking garage is full today.',
      'The finance office is on the second floor.',
    ],
    explanation:
      '間接応答: 「まだ口座を確認していない」は「分からない・まだ確認できていない」ことを示す間接的な回答。他の2つは質問の核心に答えていない。',
    translation: '出張費はもう払い戻されていませんか？ — まだ自分の口座を確認していません。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'troubleshoot',
    tags: ['米英アクセント'],
    script:
      'Wasn’t IT supposed to troubleshoot the printer by now? — The technician just left, actually.',
    correctText: 'The technician just left, actually.',
    distractors: ['It broke down twice.', 'The warranty covers repairs.'],
    explanation:
      '間接応答: 「技術者がちょうど帰ったところ」は「（今なら）直っているはず」であることを暗に伝える。他の2つは質問（直っているか）に直接答えていない。',
    translation: 'プリンターはもう直っているはずでは？ — ちょうど技術者が帰ったところです。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'overbook',
    tags: ['米英アクセント'],
    script: 'Did we overbook the conference room again? — Let me check the calendar right now.',
    correctText: 'Let me check the calendar right now.',
    distractors: ['It seats twenty people.', 'The marketing team reserved it.'],
    explanation:
      '間接応答: 「今カレンダーを確認する」は「今のところ分からない、確認して答える」という保留の返答。他の2つは質問（重複予約か）に直接答えていない。',
    translation: 'また会議室がダブルブッキングされていますか？ — 今カレンダーを確認します。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'profitability',
    tags: ['米英アクセント'],
    script:
      'Has the new product line improved profitability? — We’ll know more after the next quarterly report.',
    correctText: 'We’ll know more after the next quarterly report.',
    distractors: ['It launched in March.', 'The design team is in Chicago.'],
    explanation:
      '間接応答: 「次の四半期報告の後にもっと分かる」は「まだ確定的には言えない」ことを示す間接的な回答。他の2つは質問（収益性が改善したか）に直接答えていない。',
    translation:
      'その新製品ラインは収益性を改善しましたか？ — 次の四半期報告の後にもっと分かるでしょう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'growth',
    tags: ['米英アクセント'],
    script: 'Has the company’s growth slowed down this year? — The final numbers aren’t in yet.',
    correctText: 'The final numbers aren’t in yet.',
    distractors: ['It was founded ten years ago.', 'The CEO gave a speech last week.'],
    explanation:
      '間接応答: 「最終的な数字はまだ出ていない」は「まだ分からない」ことを暗に示す。他の2つは質問に直接答えていない。',
    translation: '今年、その会社の成長は鈍化しましたか？ — 最終的な数字はまだ出ていません。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'obsolete',
    tags: ['数字・時刻'],
    script:
      'Isn’t this software already obsolete? — We’re actually rolling out an update next week.',
    correctText: 'We’re actually rolling out an update next week.',
    distractors: ['The manual is on the intranet.', 'The IT team installed it.'],
    explanation:
      '間接応答: 「来週アップデートを配信する予定」は「まだ完全に旧式ではない、対応中」であることを示す。他の2つは質問に直接答えていない。',
    translation: 'このソフトはもう旧式なのでは？ — 実は来週アップデートを配信する予定です。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'investment',
    tags: ['米英アクセント'],
    script: 'Did the board approve the new investment? — They’re meeting again on Friday.',
    correctText: 'They’re meeting again on Friday.',
    distractors: ['The proposal was ten pages long.', 'The office is on the fifth floor.'],
    explanation:
      '間接応答: 「金曜にまた会議がある」は「まだ決まっていない」ことを示す。他の2つは質問に直接答えていない。',
    translation: '取締役会は新しい投資を承認しましたか？ — 金曜にまた会議があります。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'sustainability',
    tags: ['米英アクセント'],
    script:
      'Doesn’t the new factory meet sustainability standards? — The certification is still pending.',
    correctText: 'The certification is still pending.',
    distractors: ['It opened last spring.', 'The manager toured it yesterday.'],
    explanation:
      '間接応答: 「認証はまだ保留中」は「まだ正式には基準を満たしたと確認されていない」ことを示す。他の2つは質問に直接答えていない。',
    translation: '新しい工場は持続可能性の基準を満たしていないのですか？ — 認証はまだ保留中です。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'relocation',
    tags: ['米英アクセント'],
    script: 'Has the office relocation been confirmed? — We’re still comparing a few buildings.',
    correctText: 'We’re still comparing a few buildings.',
    distractors: ['It was built in 1998.', 'The parking lot is quite small.'],
    explanation:
      '間接応答: 「まだ複数の建物を比較検討中」は「まだ確定していない」ことを示す。他の2つは質問（移転が確定したか）に直接答えていない。',
    translation: 'オフィスの移転は確定しましたか？ — まだ複数の建物を比較検討しているところです。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'permit',
    tags: ['米英アクセント'],
    script:
      'Did the city issue a permit for the old building? — Inspectors are coming back tomorrow to decide.',
    correctText: 'Inspectors are coming back tomorrow to decide.',
    distractors: ['It was built in the 1950s.', 'The tenants moved out already.'],
    explanation:
      '間接応答: 「明日また検査員が来て判断する」は「まだ正式決定していない」ことを示す。他の2つは質問（許可証が発行されたか）に直接答えていない。',
    translation: 'その古い建物に許可証は発行されたのですか？ — 明日また検査員が来て判断します。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'complaint',
    tags: ['米英アクセント'],
    script: 'Was the complaint a surprise to everyone? — Honestly, most of us saw it coming.',
    correctText: 'Honestly, most of us saw it coming.',
    distractors: ['It was filed last Tuesday.', 'The manager reviewed it already.'],
    explanation:
      '間接応答: 「予想はついていた（saw it coming）」は「驚きではなかった」ことを示す。他の2つは質問（驚きだったか）に直接答えていない。',
    translation:
      'その苦情はみんなにとって驚きでしたか？ — 正直、私たちの多くは予想がついていました。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'turnaround',
    tags: ['米英アクセント'],
    script: 'Is the turnaround plan working so far? — It’s really too early to tell.',
    correctText: 'It’s really too early to tell.',
    distractors: ['The plan was announced in April.', 'The consultant flew in from Boston.'],
    explanation:
      '間接応答: 「判断するにはまだ早すぎる」は「まだ分からない」ことを示す。他の2つは質問（うまくいっているか）に直接答えていない。',
    translation: '立て直し計画は今のところうまくいっていますか？ — 判断するにはまだ早すぎます。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'modernization',
    tags: ['米英アクセント'],
    script: 'Is the modernization plan finalized? — We’re still waiting to hear from headquarters.',
    correctText: 'We’re still waiting to hear from headquarters.',
    distractors: ['It affects the sales team.', 'It was announced in May.'],
    explanation:
      '間接応答: 「本社からの連絡待ち」は「まだ確定していない」ことを示す。他の2つは質問（計画が確定したか）に直接答えていない。',
    translation: '近代化計画は確定しましたか？ — まだ本社からの連絡を待っているところです。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'nonrefundable',
    tags: ['米英アクセント'],
    script: 'Is this ticket really nonrefundable? — Let me double-check the terms for you.',
    correctText: 'Let me double-check the terms for you.',
    distractors: ['It costs two hundred dollars.', 'The flight leaves at noon.'],
    explanation:
      '間接応答: 「規約を確認してみる」は「今すぐには断言できない」という保留の返答。他の2つは質問に直接答えていない。',
    translation: 'このチケットは本当に払い戻し不可なのですか？ — 規約を確認してみますね。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'variance',
    tags: ['米英アクセント'],
    script:
      'Did the city approve the zoning variance? — We won’t know until the next council meeting.',
    correctText: 'We won’t know until the next council meeting.',
    distractors: ['The property is near the river.', 'The architect submitted the plans.'],
    explanation:
      '間接応答: 「次の議会まで分からない」は「まだ承認されたか不明」であることを示す。他の2つは質問に直接答えていない。',
    translation: '市は用途地域の例外許可を承認しましたか？ — 次の議会まで分かりません。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'inquiry',
    tags: ['米英アクセント'],
    script: 'Has the inquiry been completed yet? — We are still gathering information.',
    correctText: 'We are still gathering information.',
    distractors: ['It was submitted last week.', 'The customer called twice.'],
    explanation:
      '間接応答: 「まだ情報を集めている最中」は「まだ完了していない」ことを示す。他の2つは質問（問い合わせ対応が完了したか）に直接答えていない。',
    translation: 'その問い合わせ対応はもう完了しましたか？ — まだ情報を集めているところです。',
    difficulty: 4,
  },

  // --- 追加の直接応答（数字・時刻／疑問詞・弱形バランス調整） ---
  {
    keyVocabWord: 'scalability',
    tags: ['疑問詞聞き取り'],
    script: 'Why did the client choose this platform? — Its scalability fit their long-term plans.',
    correctText: 'Its scalability fit their long-term plans.',
    distractors: ['It launched last year.', 'The sales rep is based abroad.'],
    explanation: 'Why（なぜ）への応答は理由。他の2つは時期・人物情報で、Whyの質問には合わない。',
    translation:
      'なぜクライアントはこのプラットフォームを選んだのですか？ — その拡張性が長期計画に合っていたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'authentication',
    tags: ['疑問詞聞き取り'],
    script:
      'What kind of authentication does the system use? — Two-factor authentication with a mobile app.',
    correctText: 'Two-factor authentication with a mobile app.',
    distractors: ['It was installed last month.', 'The IT team manages it.'],
    explanation: 'What（何）への応答は内容。他の2つは時期・主体の応答で、Whatの質問には合わない。',
    translation:
      'このシステムはどんな認証を使っていますか？ — モバイルアプリを使った二段階認証です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'middleware',
    tags: ['疑問詞聞き取り'],
    script: 'Who is maintaining the middleware now? — A contractor from the vendor.',
    correctText: 'A contractor from the vendor.',
    distractors: ['It was updated last week.', 'Because of a licensing issue.'],
    explanation: 'Who（誰）への応答は人物。他の2つは時期・理由の応答で、Whoの質問には合わない。',
    translation:
      '今そのミドルウェアの保守を担当しているのは誰ですか？ — ベンダー側の契約社員です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'protocol',
    tags: ['疑問詞聞き取り'],
    script: 'Why was the security protocol changed? — An audit revealed a weakness.',
    correctText: 'An audit revealed a weakness.',
    distractors: ['The IT director.', 'It takes effect next Monday.'],
    explanation: 'Why（なぜ）への応答は理由。他の2つは主体・時期の応答で、Whyの質問には合わない。',
    translation: 'なぜセキュリティ手順が変更されたのですか？ — 監査で弱点が見つかったからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'endpoint',
    tags: ['数字・時刻'],
    script: 'How many endpoint devices need the update? — Roughly four hundred across all offices.',
    correctText: 'Roughly four hundred across all offices.',
    distractors: ['It takes ten minutes each.', 'The IT team scheduled it.'],
    explanation: '数量を尋ねる質問には数値で答える。他の2つは所要時間・主体の応答で噛み合わない。',
    translation:
      'いくつの端末デバイスが更新を必要としていますか？ — 全オフィス合わせておよそ400台です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'password',
    tags: ['米英アクセント'],
    script: 'Where can employees reset their password? — Right at the IT helpdesk.',
    correctText: 'Right at the IT helpdesk.',
    distractors: ['It was installed last year.', 'The security team manages it.'],
    explanation:
      'Where（どこ）への応答は場所。他の2つは時期・主体の応答で、Whereの質問には合わない。',
    translation: '従業員はどこでパスワードをリセットできますか？ — ちょうどITヘルプデスクです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'provisioning',
    tags: ['疑問詞聞き取り'],
    script: 'How long does server provisioning usually take? — Just a few minutes now.',
    correctText: 'Just a few minutes now.',
    distractors: ['The cloud team handles it.', 'It used to be much slower.'],
    explanation:
      'How long（どのくらい）への応答は所要時間。他の2つは主体・過去との比較で、質問には合わない。',
    translation:
      'サーバーのプロビジョニングは通常どれくらいかかりますか？ — 今ではほんの数分です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'virtualization',
    tags: ['疑問詞聞き取り'],
    script: 'Why did the company move to virtualization? — It cut hardware costs significantly.',
    correctText: 'It cut hardware costs significantly.',
    distractors: ['A year.', 'The IT director.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは期間・提案者の情報で、Whyの質問には合わない。',
    translation:
      'なぜ会社は仮想化に移行したのですか？ — ハードウェア費用を大幅に削減できたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'deprecate',
    tags: ['疑問詞聞き取り'],
    script: 'When will the old API be deprecated? — At the end of this year.',
    correctText: 'At the end of this year.',
    distractors: ['About two hundred clients use it.', 'The development team built it.'],
    explanation: 'When（いつ）への応答は時。他の2つは数量・主体の情報で、Whenの質問には合わない。',
    translation: '古いAPIはいつ非推奨になりますか？ — 今年の終わりです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'cybersecurity',
    tags: ['数字・時刻'],
    script:
      'How much is the company spending on cybersecurity this year? — About twice last year’s budget.',
    correctText: 'About twice last year’s budget.',
    distractors: ['The board approved it in March.', 'It’s managed by an outside firm.'],
    explanation:
      '金額・程度を尋ねる質問には数値で答える。他の2つは時期・主体の情報で噛み合わない。',
    translation:
      '今年、会社はサイバーセキュリティにどれくらい費やしていますか？ — 去年の予算のほぼ2倍です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'phishing',
    tags: ['疑問詞聞き取り'],
    script:
      'What should employees do if they suspect a phishing email? — Report it to the IT helpdesk immediately.',
    correctText: 'Report it to the IT helpdesk immediately.',
    distractors: ['It happened last Tuesday.', 'The finance department was targeted.'],
    explanation:
      'What（何を）への応答は取るべき行動。他の2つは時期・標的の情報で、質問には合わない。',
    translation:
      '従業員はフィッシングメールと思われるものを見つけたらどうすべきですか？ — すぐにITヘルプデスクに報告すべきです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'allocate',
    tags: ['疑問詞聞き取り'],
    script:
      'Why did the office allocate extra funds for new chairs? — Several employees complained of back pain.',
    correctText: 'Several employees complained of back pain.',
    distractors: ['They were delivered last week.', 'The supplier is based locally.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは配達時期・仕入先の情報で、Whyの質問には合わない。',
    translation:
      'なぜオフィスは新しい椅子のために追加予算を割り当てたのですか？ — 何人かの従業員が腰痛を訴えていたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subsidiary',
    tags: ['疑問詞聞き取り'],
    script: 'Who leads the newly formed subsidiary? — A former regional director.',
    correctText: 'A former regional director.',
    distractors: ['It was formed two years ago.', 'It focuses on renewable energy.'],
    explanation:
      'Who（誰）への応答は人物。他の2つは設立時期・分野の情報で、Whoの質問には合わない。',
    translation: '新しく設立された子会社を率いているのは誰ですか？ — 元地域担当ディレクターです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'integration',
    tags: ['疑問詞聞き取り'],
    script:
      'How does the new app support our system integration? — It connects directly to the main platform.',
    correctText: 'It connects directly to the main platform.',
    distractors: ['It was released in June.', 'The design team built it.'],
    explanation:
      'How（どのように）への応答は方法・関係性。他の2つは時期・主体の情報で、Howの質問には合わない。',
    translation:
      '新しいアプリは我々のシステム統合をどう支えますか？ — メインプラットフォームに直接接続します。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'newsletter',
    tags: ['疑問詞聞き取り'],
    script: 'Who designed the newsletter for the annual report? — A freelance graphic designer.',
    correctText: 'A freelance graphic designer.',
    distractors: ['It took about a week.', 'It highlights sales growth.'],
    explanation:
      'Who（誰）への応答は人物。他の2つは所要時間・内容の情報で、Whoの質問には合わない。',
    translation:
      '年次報告書のニュースレターを制作したのは誰ですか？ — フリーランスのグラフィックデザイナーです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'facilitate',
    tags: ['疑問詞聞き取り'],
    script:
      'Why did the team change the process to facilitate approvals? — The old process caused too many delays.',
    correctText: 'The old process caused too many delays.',
    distractors: ['It was implemented last year.', 'The operations manager led it.'],
    explanation: 'Why（なぜ）への応答は理由。他の2つは時期・主体の情報で、Whyの質問には合わない。',
    translation:
      'なぜチームは承認をスムーズにするためにプロセスを変更したのですか？ — 旧プロセスが遅延を多く引き起こしていたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'orientation',
    tags: ['疑問詞聞き取り'],
    script: 'Where will the new orientation take place? — At the regional office next door.',
    correctText: 'At the regional office next door.',
    distractors: ['It starts at nine.', 'About twenty employees will attend.'],
    explanation:
      'Where（どこ）への応答は場所。他の2つは時刻・人数の情報で、Whereの質問には合わない。',
    translation: '新人研修はどこで行われますか？ — 隣の地域オフィスです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'benchmark',
    tags: ['数字・時刻'],
    script:
      'How does our performance compare to the industry benchmark? — We’re about ten percent above average.',
    correctText: 'We’re about ten percent above average.',
    distractors: ['The report came out last week.', 'A consulting firm prepared it.'],
    explanation:
      '比較・程度を尋ねる質問には数値で答える。他の2つは時期・主体の情報で噛み合わない。',
    translation: '我々の実績は業界基準と比べてどうですか？ — 平均より約10パーセント上です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'niche',
    tags: ['疑問詞聞き取り'],
    script: 'Why did the startup focus on such a small niche? — It faced less competition there.',
    correctText: 'It faced less competition there.',
    distractors: ['It was founded three years ago.', 'The CEO used to work in finance.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは設立時期・経歴の情報で、Whyの質問には合わない。',
    translation:
      'なぜそのスタートアップはそんな小さな隙間市場に集中したのですか？ — そこでは競争が少なかったからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'testimonial',
    tags: ['疑問詞聞き取り'],
    script:
      'Where can customers find testimonials about the product? — On the company website, under reviews.',
    correctText: 'On the company website, under reviews.',
    distractors: ['It launched two years ago.', 'The marketing team wrote the copy.'],
    explanation:
      'Where（どこ）への応答は場所。他の2つは時期・主体の情報で、Whereの質問には合わない。',
    translation:
      '顧客はどこでその製品の推薦の声を見つけられますか？ — 会社のウェブサイトのレビュー欄です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'clientele',
    tags: ['疑問詞聞き取り'],
    script:
      'What kind of clientele does this restaurant attract? — Mostly local business professionals.',
    correctText: 'Mostly local business professionals.',
    distractors: ['It opened five years ago.', 'The chef trained in Paris.'],
    explanation:
      'What kind（どんな種類）への応答は内容。他の2つは開業時期・経歴の情報で、質問には合わない。',
    translation:
      'このレストランはどんな客層を惹きつけていますか？ — 主に地元のビジネスパーソンです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'affiliate',
    tags: ['疑問詞聞き取り'],
    script: 'How much revenue comes from affiliate partners? — Almost a quarter of total sales.',
    correctText: 'Almost a quarter of total sales.',
    distractors: ['We signed them last spring.', 'The partnerships team manages them.'],
    explanation: '割合を尋ねる質問には数値で答える。他の2つは時期・主体の情報で噛み合わない。',
    translation:
      'アフィリエイトのパートナーからの収益はどれくらいですか？ — 総売上のほぼ4分の1です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'engagement',
    tags: ['数字・時刻'],
    script:
      'How much did customer engagement grow after the app update? — Nearly forty percent in two months.',
    correctText: 'Nearly forty percent in two months.',
    distractors: ['The update took six months to build.', 'The design team led the project.'],
    explanation:
      '増加量を尋ねる質問には数値で答える。他の2つは開発期間・主体の情報で噛み合わない。',
    translation:
      'アプリ更新後、顧客エンゲージメントはどれくらい伸びましたか？ — 2カ月でほぼ40パーセントです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'segmentation',
    tags: ['疑問詞聞き取り'],
    script:
      'Why did marketing recommend more segmentation? — Different regions respond very differently to ads.',
    correctText: 'Different regions respond very differently to ads.',
    distractors: ['The campaign launched last week.', 'The agency is based overseas.'],
    explanation:
      'Why（なぜ）への応答は理由。他の2つは開始時期・所在地の情報で、Whyの質問には合わない。',
    translation:
      'なぜマーケティングはより細かなセグメンテーションを勧めたのですか？ — 地域ごとに広告への反応がかなり違うからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'upsell',
    tags: ['疑問詞聞き取り'],
    script: 'How are staff trained to upsell warranties? — Through a short role-play session.',
    correctText: 'Through a short role-play session.',
    distractors: ['It increased sales last quarter.', 'The store manager suggested it.'],
    explanation:
      '方法を尋ねる質問には手段で答える。他の2つは結果・提案者の情報で、Howの質問には合わない。',
    translation:
      'スタッフは保証をアップセルするようにどう研修されていますか？ — 短いロールプレイ研修を通じてです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'appease',
    tags: ['疑問詞聞き取り'],
    script:
      'How did the manager appease the upset customer? — By offering a full refund on the spot.',
    correctText: 'By offering a full refund on the spot.',
    distractors: ['The complaint came in yesterday.', 'The customer bought it online.'],
    explanation:
      '方法を尋ねる質問には手段で答える。他の2つは時期・購入経路の情報で、Howの質問には合わない。',
    translation:
      'マネージャーはどのように不満を持った顧客をなだめましたか？ — その場で全額返金を申し出ることによってです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'rectify',
    tags: ['疑問詞聞き取り'],
    script: 'How quickly did support rectify the billing error? — Within the same business day.',
    correctText: 'Within the same business day.',
    distractors: ['The customer called twice.', 'The finance team was notified.'],
    explanation:
      '速さ・時間を尋ねる質問には期間で答える。他の2つは行動・通知先の情報で、質問には合わない。',
    translation: 'サポートは請求ミスをどれくらい早く是正しましたか？ — 同じ営業日中にです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'goodwill',
    tags: ['疑問詞聞き取り'],
    script:
      'How did the company build so much goodwill in the community? — It has sponsored local events for years.',
    correctText: 'It has sponsored local events for years.',
    distractors: ['It was founded downtown.', 'The CEO grew up nearby.'],
    explanation:
      'How（どのように）への応答は方法。他の2つは設立場所・経歴の情報で、Howの質問には合わない。',
    translation:
      'その会社は地域でどのように信用を築いたのですか？ — 何年も地元イベントに協賛してきたからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'liaison',
    tags: ['疑問詞聞き取り'],
    script:
      'Who acts as the liaison between the two departments? — A project coordinator was appointed for that.',
    correctText: 'A project coordinator was appointed for that.',
    distractors: ['It happened last month.', 'Both departments are on the same floor.'],
    explanation:
      'Who（誰）への応答は人物・役職。他の2つは時期・場所の情報で、Whoの質問には合わない。',
    translation:
      '2つの部署間の連絡調整役を務めているのは誰ですか？ — そのためにプロジェクト調整役が任命されました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'mitigate',
    tags: ['疑問詞聞き取り'],
    script:
      'How does the company mitigate supply chain risk? — By sourcing materials from multiple regions.',
    correctText: 'By sourcing materials from multiple regions.',
    distractors: ['It happened after a shortage.', 'The logistics director proposed it.'],
    explanation:
      '方法を尋ねる質問には手段で答える。他の2つは経緯・提案者の情報で、Howの質問には合わない。',
    translation:
      '会社はどのようにサプライチェーンのリスクを軽減していますか？ — 複数の地域から資材を調達することによってです。',
    difficulty: 3,
  },
]
