// Part2（audio_qa）50問のデータ本体（T-27。正本: docs/04 2節・docs/03 7.1節）。
// keyVocabWordはSランク200語（freqList.ts/vocabCardsS.ts）から選び、単語帳との循環を成立させる。
// tags[0]は音声知覚系タグ必須（03の7.1: 疑問詞聞き取り/弱形・連結/数字・時刻/米英豪加アクセント）。
// 正答キーはA〜Cに分散させている（レビュー対応: 常に同じ記号が正答だとテストとして破綻するため）。
// explanationは選択肢記号でなく実テキストを引用する（並び替えに耐性を持たせるため）。

export interface Part2Entry {
  keyVocabWord: string
  tags: string[]
  script: string
  choices: { key: string; text: string }[]
  answer: string
  explanation: string
  translation: string
  difficulty: number
}

export const PART2_ENTRIES_S: Part2Entry[] = [
  {
    keyVocabWord: 'submit',
    tags: ['疑問詞聞き取り'],
    script: 'When should I submit the expense report? — By the end of this week.',
    choices: [
      { key: 'A', text: 'By the end of this week.' },
      { key: 'B', text: 'To the accounting office.' },
      { key: 'C', text: 'Yes, I already did.' },
    ],
    answer: 'A',
    explanation:
      'When（いつ）への応答は時。「To the accounting office.」は場所（Where）への応答、「Yes, I already did.」はYes/No疑問文への応答で、いずれもWhen疑問文には合わない。',
    translation: '経費報告書はいつ提出すればいいですか？ — 今週末までに。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'reschedule',
    tags: ['疑問詞聞き取り'],
    script: 'Why did you reschedule the meeting? — The client had a conflict.',
    choices: [
      { key: 'A', text: 'At two o’clock.' },
      { key: 'B', text: 'In the main conference room.' },
      { key: 'C', text: 'The client had a conflict.' },
    ],
    answer: 'C',
    explanation:
      'Why（なぜ）への応答は理由。「At two o’clock.」は時刻（When）、「In the main conference room.」は場所（Where）への応答で、Whyの質問には合わない。',
    translation: 'なぜ会議の予定を変更したのですか？ — 取引先の予定が重なってしまったからです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'invoice',
    tags: ['疑問詞聞き取り'],
    script: 'Who prepared this invoice? — Someone from the accounting team.',
    choices: [
      { key: 'A', text: 'Because the client requested it.' },
      { key: 'B', text: 'Someone from the accounting team.' },
      { key: 'C', text: 'Last Tuesday.' },
    ],
    answer: 'B',
    explanation:
      'Who（誰）への応答は人物。「Last Tuesday.」は時（When）、「Because the client requested it.」は理由（Why）への応答であり、Whoの質問には合わない。',
    translation: 'この請求書は誰が作成しましたか？ — 経理チームの誰かです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'warehouse',
    tags: ['疑問詞聞き取り'],
    script: 'Where should we store the extra chairs? — In the warehouse next door.',
    choices: [
      { key: 'A', text: 'In the warehouse next door.' },
      { key: 'B', text: 'Around fifty of them.' },
      { key: 'C', text: 'Yes, we ordered more.' },
    ],
    answer: 'A',
    explanation:
      'Where（どこ）への応答は場所。「Around fifty of them.」は数量（How many）、「Yes, we ordered more.」はYes/No疑問文への応答で、Whereには合わない。',
    translation: '余分な椅子はどこに保管すればいいですか？ — 隣の倉庫にお願いします。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'candidate',
    tags: ['弱形・連結'],
    script: 'How many candidates applied for the position? — About thirty, I believe.',
    choices: [
      { key: 'A', text: 'She did a great job.' },
      { key: 'B', text: 'Next Monday afternoon.' },
      { key: 'C', text: 'About thirty, I believe.' },
    ],
    answer: 'C',
    explanation:
      'How many（いくつ）への応答は数量。「She did a great job.」は評価に関する応答、「Next Monday afternoon.」は時（When）への応答で、質問に合わない。',
    translation: 'その職に何人の候補者が応募しましたか？ — 30人くらいだと思います。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'budget',
    tags: ['疑問詞聞き取り'],
    script: 'What is the budget for this project? — Around fifty thousand dollars.',
    choices: [
      { key: 'A', text: 'It starts next month.' },
      { key: 'B', text: 'Around fifty thousand dollars.' },
      { key: 'C', text: 'The marketing department.' },
    ],
    answer: 'B',
    explanation:
      'What（何）への応答は内容・金額。「The marketing department.」は部署（Which department）、「It starts next month.」は開始時期に関する応答で、質問の意図に合わない。',
    translation: 'このプロジェクトの予算はいくらですか？ — 約5万ドルです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'delivery',
    tags: ['数字・時刻'],
    script: 'When will the delivery arrive? — Sometime around three o’clock.',
    choices: [
      { key: 'A', text: 'Sometime around three o’clock.' },
      { key: 'B', text: 'From the main warehouse.' },
      { key: 'C', text: 'Twenty boxes in total.' },
    ],
    answer: 'A',
    explanation:
      'When（いつ）への応答は時刻。「From the main warehouse.」は場所（Where）、「Twenty boxes in total.」は数量（How many）への応答で、Whenには合わない。',
    translation: '配達はいつ届きますか？ — 3時頃です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'contract',
    tags: ['疑問詞聞き取り'],
    script: 'Who signed the new contract? — Our sales director did.',
    choices: [
      { key: 'A', text: 'It expires next year.' },
      { key: 'B', text: 'At the downtown office.' },
      { key: 'C', text: 'Our sales director did.' },
    ],
    answer: 'C',
    explanation:
      'Who（誰）への応答は人物。「It expires next year.」は有効期限に関する応答、「At the downtown office.」は場所（Where）への応答であり、質問に合わない。',
    translation: '新しい契約書には誰がサインしましたか？ — 営業部長です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'inspection',
    tags: ['弱形・連結'],
    script: 'Has the inspection been completed yet? — Yes, it finished this morning.',
    choices: [
      { key: 'A', text: 'About two hours.' },
      { key: 'B', text: 'Yes, it finished this morning.' },
      { key: 'C', text: 'By the quality team.' },
    ],
    answer: 'B',
    explanation:
      'Yes/No疑問文には端的な肯定・否定＋補足で応じる「Yes, this morning.」が自然。「By the quality team.」は行為者（Who）、「About two hours.」は所要時間（How long）への応答で合わない。',
    translation: '検査はもう終わりましたか？ — はい、今朝終わりました。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'venue',
    tags: ['疑問詞聞き取り'],
    script: 'Where is the venue for the conference? — At the downtown convention center.',
    choices: [
      { key: 'A', text: 'At the downtown convention center.' },
      { key: 'B', text: 'Next Wednesday.' },
      { key: 'C', text: 'About two hundred people.' },
    ],
    answer: 'A',
    explanation:
      'Where（どこ）への応答は場所。「Next Wednesday.」は日時（When）、「About two hundred people.」は人数（How many）への応答であり、質問に合わない。',
    translation: '会議の会場はどこですか？ — 中心街のコンベンションセンターです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'refund',
    tags: ['疑問詞聞き取り'],
    script: 'How can I request a refund? — Please contact the customer service desk.',
    choices: [
      { key: 'A', text: 'Within thirty days.' },
      { key: 'B', text: 'Because it was defective.' },
      { key: 'C', text: 'Please contact the customer service desk.' },
    ],
    answer: 'C',
    explanation:
      'How（どうやって）への応答は方法。「Within thirty days.」は期限（When）、「Because it was defective.」は理由（Why）への応答であり、質問には合わない。',
    translation: '返金はどうすれば請求できますか？ — カスタマーサービスにご連絡ください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'training',
    tags: ['数字・時刻'],
    script: 'When does the new employee training start? — It starts at nine tomorrow morning.',
    choices: [
      { key: 'A', text: 'Around twenty new employees.' },
      { key: 'B', text: 'It starts at nine tomorrow morning.' },
      { key: 'C', text: 'In the third-floor conference room.' },
    ],
    answer: 'B',
    explanation:
      'When（いつ）への応答は時刻。「In the third-floor conference room.」は場所（Where）、「Around twenty new employees.」は人数（How many）への応答であり、質問に合わない。',
    translation: '新入社員研修はいつ始まりますか？ — 明朝9時に始まります。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'quality',
    tags: ['疑問詞聞き取り'],
    script: 'Why was the shipment rejected? — The quality did not meet our standards.',
    choices: [
      { key: 'A', text: 'The quality did not meet our standards.' },
      { key: 'B', text: 'Last Thursday.' },
      { key: 'C', text: 'By the logistics team.' },
    ],
    answer: 'A',
    explanation:
      'Why（なぜ）への応答は理由。「Last Thursday.」は時（When）、「By the logistics team.」は行為者（Who）への応答であり、Whyには合わない。',
    translation: 'なぜ出荷分は却下されたのですか？ — 品質が基準を満たしていなかったからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'account',
    tags: ['弱形・連結'],
    script: 'Could you check the balance on this account? — Sure, let me look it up.',
    choices: [
      { key: 'A', text: 'It opened last year.' },
      { key: 'B', text: 'At the branch downtown.' },
      { key: 'C', text: 'Sure, let me look it up.' },
    ],
    answer: 'C',
    explanation:
      '依頼（Could you...）への応答は快諾・応対がまず自然。「It opened last year.」は口座の開設時期、「At the branch downtown.」は場所への応答で、依頼への返答として噛み合わない。',
    translation: 'この口座の残高を確認していただけますか？ — もちろんです、少々お待ちください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'proposal',
    tags: ['疑問詞聞き取り'],
    script: 'What did the client think of our proposal? — They seemed very impressed.',
    choices: [
      { key: 'A', text: 'About ten pages long.' },
      { key: 'B', text: 'They seemed very impressed.' },
      { key: 'C', text: 'Next Monday morning.' },
    ],
    answer: 'B',
    explanation:
      'What（何）への応答は意見・感想。「Next Monday morning.」は日時（When）、「About ten pages long.」は分量（How long）への応答であり、質問には合わない。',
    translation:
      'クライアントは私たちの提案書についてどう思いましたか？ — とても感心していました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'warranty',
    tags: ['疑問詞聞き取り'],
    script: 'How long is the warranty on this printer? — It comes with a two-year warranty.',
    choices: [
      { key: 'A', text: 'It comes with a two-year warranty.' },
      { key: 'B', text: 'In the electronics department.' },
      { key: 'C', text: 'Because it stopped working.' },
    ],
    answer: 'A',
    explanation:
      'How long（どのくらいの期間）への応答は期間。「In the electronics department.」は場所（Where）、「Because it stopped working.」は理由（Why）への応答であり、質問に合わない。',
    translation: 'このプリンターの保証期間はどのくらいですか？ — 2年間の保証が付いています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'itinerary',
    tags: ['弱形・連結'],
    script:
      'Have you finished the itinerary for the business trip? — Almost, just one more stop to add.',
    choices: [
      { key: 'A', text: 'By plane and then by train.' },
      { key: 'B', text: 'Because the flight was delayed.' },
      { key: 'C', text: 'Almost, just one more stop to add.' },
    ],
    answer: 'C',
    explanation:
      'Yes/No系の進捗確認には「ほぼ終わった」のような端的な応答が自然。「By plane and then by train.」は手段（How）、「Because the flight was delayed.」は理由（Why）への応答であり合わない。',
    translation: '出張の旅程表は仕上がりましたか？ — ほぼ完成です、あと1件追加するだけです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'headquarters',
    tags: ['疑問詞聞き取り'],
    script: 'Where is the company headquarters located? — It’s in downtown Chicago.',
    choices: [
      { key: 'A', text: 'About five hundred employees.' },
      { key: 'B', text: 'It’s in downtown Chicago.' },
      { key: 'C', text: 'Since the company was founded.' },
    ],
    answer: 'B',
    explanation:
      'Where（どこ）への応答は場所。「Since the company was founded.」は時期（Since when）、「About five hundred employees.」は人数（How many）への応答であり、質問には合わない。',
    translation: '会社の本社はどこにありますか？ — シカゴのダウンタウンにあります。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'merger',
    tags: ['疑問詞聞き取り'],
    script: 'When was the merger announced? — Just last week, actually.',
    choices: [
      { key: 'A', text: 'Just last week, actually.' },
      { key: 'B', text: 'Between two software companies.' },
      { key: 'C', text: 'For a much lower price.' },
    ],
    answer: 'A',
    explanation:
      'When（いつ）への応答は時。「Between two software companies.」は対象（Between whom）、「For a much lower price.」は価格に関する応答であり、質問に合わない。',
    translation: 'その合併はいつ発表されましたか？ — 実はつい先週です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'reception',
    tags: ['疑問詞聞き取り'],
    script: 'Who is organizing the reception tonight? — The events team is handling it.',
    choices: [
      { key: 'A', text: 'Starting at seven o’clock.' },
      { key: 'B', text: 'On the top floor.' },
      { key: 'C', text: 'The events team is handling it.' },
    ],
    answer: 'C',
    explanation:
      'Who（誰）への応答は人物・組織。「Starting at seven o’clock.」は時刻（When）、「On the top floor.」は場所（Where）への応答であり、質問には合わない。',
    translation: '今夜の歓迎会は誰が企画していますか？ — イベントチームが担当しています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'shipment',
    tags: ['数字・時刻'],
    script: 'When can we expect the next shipment? — It should arrive by Thursday.',
    choices: [
      { key: 'A', text: 'Through our regular carrier.' },
      { key: 'B', text: 'It should arrive by Thursday.' },
      { key: 'C', text: 'Two hundred units.' },
    ],
    answer: 'B',
    explanation:
      'When（いつ）への応答は時。「Two hundred units.」は数量（How many）、「Through our regular carrier.」は手段（How）への応答であり、質問には合わない。',
    translation: '次の出荷はいつ届く予定ですか？ — 木曜日までには届くはずです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'promotion',
    tags: ['疑問詞聞き取り'],
    script: 'Why did she get the promotion? — Her performance has been outstanding.',
    choices: [
      { key: 'A', text: 'Her performance has been outstanding.' },
      { key: 'B', text: 'Starting next quarter.' },
      { key: 'C', text: 'In the finance department.' },
    ],
    answer: 'A',
    explanation:
      'Why（なぜ）への応答は理由。「Starting next quarter.」は時期（When）、「In the finance department.」は部署（Which department）への応答であり、質問には合わない。',
    translation: 'なぜ彼女は昇進したのですか？ — 業績が非常に優れていたからです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'compliance',
    tags: ['弱形・連結'],
    script:
      'Is the factory in compliance with the new regulations? — Yes, we passed the audit last week.',
    choices: [
      { key: 'A', text: 'The regional inspector.' },
      { key: 'B', text: 'For safety reasons.' },
      { key: 'C', text: 'Yes, we passed the audit last week.' },
    ],
    answer: 'C',
    explanation:
      'Yes/No疑問文への応答はまず肯定・否定で答える「Yes, we passed the audit.」が自然。「The regional inspector.」は行為者（Who）、「For safety reasons.」は理由（Why）への応答であり合わない。',
    translation: '工場は新しい規制を遵守していますか？ — はい、先週の監査に合格しました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subscription',
    tags: ['疑問詞聞き取り'],
    script: 'How much does the subscription cost per month? — It’s fifteen dollars a month.',
    choices: [
      { key: 'A', text: 'Through the company website.' },
      { key: 'B', text: 'It’s fifteen dollars a month.' },
      { key: 'C', text: 'It renews automatically.' },
    ],
    answer: 'B',
    explanation:
      'How much（いくら）への応答は金額。「It renews automatically.」は更新方法、「Through the company website.」は手段（Where/How）への応答であり、質問には合わない。',
    translation: '購読料は月にいくらですか？ — 月15ドルです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'inventory',
    tags: ['数字・時刻'],
    script: 'How often do you check the inventory? — We check it twice a month.',
    choices: [
      { key: 'A', text: 'We check it twice a month.' },
      { key: 'B', text: 'In the back storage room.' },
      { key: 'C', text: 'Because stock levels were low.' },
    ],
    answer: 'A',
    explanation:
      'How often（どのくらいの頻度で）への応答は頻度。「In the back storage room.」は場所（Where）、「Because stock levels were low.」は理由（Why）への応答であり、質問には合わない。',
    translation: '在庫はどのくらいの頻度で確認していますか？ — 月に2回確認しています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'renovation',
    tags: ['疑問詞聞き取り'],
    script: 'When will the office renovation be finished? — Probably by the end of next month.',
    choices: [
      { key: 'A', text: 'The construction crew.' },
      { key: 'B', text: 'Because the lobby was outdated.' },
      { key: 'C', text: 'Probably by the end of next month.' },
    ],
    answer: 'C',
    explanation:
      'When（いつ）への応答は時期。「The construction crew.」は行為者（Who）、「Because the lobby was outdated.」は理由（Why）への応答であり、質問には合わない。',
    translation: 'オフィスの改装はいつ終わりますか？ — おそらく来月末までには終わります。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'vendor',
    tags: ['疑問詞聞き取り'],
    script:
      'Which vendor supplies our office furniture? — We usually order from Grantline Supplies.',
    choices: [
      { key: 'A', text: 'Because the old vendor closed.' },
      { key: 'B', text: 'We usually order from Grantline Supplies.' },
      { key: 'C', text: 'Twice a year.' },
    ],
    answer: 'B',
    explanation:
      'Which（どちらの）への応答は具体的な業者名。「Twice a year.」は頻度（How often）、「Because the old vendor closed.」は理由（Why）への応答であり、質問には合わない。',
    translation:
      'どの業者が私たちのオフィス家具を納入していますか？ — 通常はGrantline Suppliesに発注しています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'audit',
    tags: ['弱形・連結'],
    script: 'Did the audit find any problems? — No, everything looked fine.',
    choices: [
      { key: 'A', text: 'No, everything looked fine.' },
      { key: 'B', text: 'The external accounting firm.' },
      { key: 'C', text: 'It took about three days.' },
    ],
    answer: 'A',
    explanation:
      'Yes/No疑問文には端的な肯定・否定がまず自然。「The external accounting firm.」は行為者（Who）、「It took about three days.」は所要時間（How long）への応答であり合わない。',
    translation: '監査で問題は見つかりましたか？ — いいえ、全て問題ありませんでした。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'extension',
    tags: ['疑問詞聞き取り'],
    script:
      'Why do you need an extension on the deadline? — We are still waiting on client feedback.',
    choices: [
      { key: 'A', text: 'Two more weeks.' },
      { key: 'B', text: 'The project manager.' },
      { key: 'C', text: 'We are still waiting on client feedback.' },
    ],
    answer: 'C',
    explanation:
      'Why（なぜ）への応答は理由。「Two more weeks.」は期間（How long）、「The project manager.」は人物（Who）への応答であり、質問には合わない。',
    translation:
      'なぜ締切の延長が必要なのですか？ — まだクライアントからのフィードバック待ちだからです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'estate',
    tags: ['疑問詞聞き取り'],
    script: 'Who is handling the real estate sale? — A local agency is handling it.',
    choices: [
      { key: 'A', text: 'For a reasonable price.' },
      { key: 'B', text: 'A local agency is handling it.' },
      { key: 'C', text: 'Next spring.' },
    ],
    answer: 'B',
    explanation:
      'Who（誰）への応答は人物・組織。「Next spring.」は時期（When）、「For a reasonable price.」は価格に関する応答であり、質問には合わない。',
    translation: 'その不動産売却は誰が担当していますか？ — 地元の代理店が担当しています。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'utility',
    tags: ['疑問詞聞き取り'],
    script: 'How much are the utility bills this month? — A bit higher than usual.',
    choices: [
      { key: 'A', text: 'A bit higher than usual.' },
      { key: 'B', text: 'From the property manager.' },
      { key: 'C', text: 'Every month on the first.' },
    ],
    answer: 'A',
    explanation:
      'How much（どのくらい）への応答は程度・金額。「From the property manager.」は送付元（Who/From whom）、「Every month on the first.」は時期（When）への応答であり、質問には合わない。',
    translation: '今月の公共料金はどのくらいですか？ — いつもより少し高めです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'catering',
    tags: ['疑問詞聞き取り'],
    script:
      'Which company is providing the catering for the event? — Riverside Catering, as usual.',
    choices: [
      { key: 'A', text: 'About one hundred guests.' },
      { key: 'B', text: 'Starting at noon.' },
      { key: 'C', text: 'Riverside Catering, as usual.' },
    ],
    answer: 'C',
    explanation:
      'Which（どちらの）への応答は具体的な業者名。「About one hundred guests.」は人数（How many）、「Starting at noon.」は時刻（When）への応答であり、質問には合わない。',
    translation:
      'どの会社がそのイベントのケータリングを担当していますか？ — いつも通りRiverside Cateringです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'malfunction',
    tags: ['弱形・連結'],
    script:
      'Did the server malfunction again last night? — Yes, but the technician already fixed it.',
    choices: [
      { key: 'A', text: 'The IT department ordered it.' },
      { key: 'B', text: 'Yes, but the technician already fixed it.' },
      { key: 'C', text: 'In the server room.' },
    ],
    answer: 'B',
    explanation:
      'Yes/No疑問文には端的な肯定・否定がまず自然。「In the server room.」は場所への応答、「The IT department ordered it.」は無関係な内容であり、故障の有無を尋ねる質問には合わない。',
    translation: '昨夜またサーバーが故障したのですか？ — はい、でも技術者がもう直してくれました。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'occupant',
    tags: ['疑問詞聞き取り'],
    script: 'How many occupants are currently in the building? — Around two hundred, I think.',
    choices: [
      { key: 'A', text: 'Around two hundred, I think.' },
      { key: 'B', text: 'Since last January.' },
      { key: 'C', text: 'The building manager.' },
    ],
    answer: 'A',
    explanation:
      'How many（何人）への応答は人数。「Since last January.」は時期（Since when）、「The building manager.」は人物（Who）への応答であり、質問には合わない。',
    translation: '現在この建物には何人の入居者がいますか？ — 200人くらいだと思います。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'freight',
    tags: ['数字・時刻'],
    script: 'How long does the freight take to arrive by sea? — Usually about three weeks.',
    choices: [
      { key: 'A', text: 'From the southern port.' },
      { key: 'B', text: 'Because of the weather.' },
      { key: 'C', text: 'Usually about three weeks.' },
    ],
    answer: 'C',
    explanation:
      'How long（どのくらいの期間）への応答は期間。「From the southern port.」は出発地（Where from）、「Because of the weather.」は理由（Why）への応答であり、質問には合わない。',
    translation: '船便の貨物はどのくらいで届きますか？ — 通常は3週間ほどです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'outsource',
    tags: ['疑問詞聞き取り'],
    script:
      'Why did the company decide to outsource its customer service? — To reduce operating costs.',
    choices: [
      { key: 'A', text: 'A team in another country.' },
      { key: 'B', text: 'To reduce operating costs.' },
      { key: 'C', text: 'Starting next quarter.' },
    ],
    answer: 'B',
    explanation:
      'Why（なぜ）への応答は理由。「Starting next quarter.」は時期（When）、「A team in another country.」は対象（Whom）への応答であり、質問には合わない。',
    translation:
      'なぜ会社は顧客サービスを外部委託することにしたのですか？ — 運営コストを削減するためです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'endorsement',
    tags: ['弱形・連結'],
    script:
      'Has the athlete signed the endorsement deal yet? — Not yet, they’re still negotiating.',
    choices: [
      { key: 'A', text: 'Not yet, they’re still negotiating.' },
      { key: 'B', text: 'For three years.' },
      { key: 'C', text: 'A well-known sportswear brand.' },
    ],
    answer: 'A',
    explanation:
      'Yes/No疑問文への応答は端的な肯定・否定がまず自然。「For three years.」は契約期間（How long）、「A well-known sportswear brand.」は相手（Which company）への応答であり合わない。',
    translation: 'その選手はもう広告契約にサインしましたか？ — まだです、まだ交渉中です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'brochure',
    tags: ['疑問詞聞き取り'],
    script:
      'Where can I pick up a brochure about the new product? — There’s a stack at the front desk.',
    choices: [
      { key: 'A', text: 'Around fifty copies.' },
      { key: 'B', text: 'Next Monday.' },
      { key: 'C', text: 'There’s a stack at the front desk.' },
    ],
    answer: 'C',
    explanation:
      'Where（どこ）への応答は場所。「Around fifty copies.」は数量（How many）、「Next Monday.」は時（When）への応答であり、質問には合わない。',
    translation: '新製品のパンフレットはどこで受け取れますか？ — 受付にたくさん置いてあります。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'stakeholder',
    tags: ['疑問詞聞き取り'],
    script:
      'Who are the key stakeholders in this project? — Mainly the investors and the city council.',
    choices: [
      { key: 'A', text: 'About three million dollars.' },
      { key: 'B', text: 'Mainly the investors and the city council.' },
      { key: 'C', text: 'It began two years ago.' },
    ],
    answer: 'B',
    explanation:
      'Who（誰）への応答は人物・関係者。「It began two years ago.」は開始時期（When）、「About three million dollars.」は金額に関する応答であり、質問には合わない。',
    translation: 'このプロジェクトの主な利害関係者は誰ですか？ — 主に投資家と市議会です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'facility',
    tags: ['疑問詞聞き取り'],
    script:
      'How large is the new manufacturing facility? — It covers about ten thousand square meters.',
    choices: [
      { key: 'A', text: 'It covers about ten thousand square meters.' },
      { key: 'B', text: 'It opened last spring.' },
      { key: 'C', text: 'Around three hundred workers.' },
    ],
    answer: 'A',
    explanation:
      'How large（どのくらいの広さ）への応答は面積・規模。「It opened last spring.」は開設時期（When）、「Around three hundred workers.」は人数（How many）への応答であり、質問には合わない。',
    translation: '新しい製造施設はどのくらいの広さですか？ — 約1万平方メートルあります。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'liability',
    tags: ['弱形・連結'],
    script:
      'Does the company carry liability insurance? — Yes, it’s required for all our contracts.',
    choices: [
      { key: 'A', text: 'Since the company was founded.' },
      { key: 'B', text: 'A national insurance provider.' },
      { key: 'C', text: 'Yes, it’s required for all our contracts.' },
    ],
    answer: 'C',
    explanation:
      'Yes/No疑問文には端的な肯定・否定がまず自然。「Since the company was founded.」は時期（Since when）、「A national insurance provider.」は提供元（Which company）への応答であり合わない。',
    translation: '会社は賠償責任保険に加入していますか？ — はい、全ての契約で必須です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'projection',
    tags: ['疑問詞聞き取り'],
    script:
      'What do the sales projections look like for next quarter? — Quite optimistic, actually.',
    choices: [
      { key: 'A', text: 'Around March.' },
      { key: 'B', text: 'Quite optimistic, actually.' },
      { key: 'C', text: 'By the finance team.' },
    ],
    answer: 'B',
    explanation:
      'What（どのような）への応答は様子・内容。「By the finance team.」は作成者（Who）、「Around March.」は時期（When）への応答であり、質問には合わない。',
    translation: '来四半期の売上予測はどのような感じですか？ — 実はかなり楽観的です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'certification',
    tags: ['疑問詞聞き取り'],
    script: 'When did she earn her project management certification? — Just last year.',
    choices: [
      { key: 'A', text: 'Just last year.' },
      { key: 'B', text: 'From an online course.' },
      { key: 'C', text: 'Because her manager suggested it.' },
    ],
    answer: 'A',
    explanation:
      'When（いつ）への応答は時。「From an online course.」は方法（How）、「Because her manager suggested it.」は理由（Why）への応答であり、質問には合わない。',
    translation: '彼女はいつプロジェクトマネジメントの認定を取得したのですか？ — つい昨年です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'lease',
    tags: ['疑問詞聞き取り'],
    script: 'When does the office lease expire? — At the end of this calendar year.',
    choices: [
      { key: 'A', text: 'The building owner.' },
      { key: 'B', text: 'About two thousand dollars a month.' },
      { key: 'C', text: 'At the end of this calendar year.' },
    ],
    answer: 'C',
    explanation:
      'When（いつ）への応答は時期。「The building owner.」は人物（Who）、「About two thousand dollars a month.」は金額（How much）への応答であり、質問には合わない。',
    translation: 'オフィスの賃貸借契約はいつ切れますか？ — 今年の年末です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'supervisor',
    tags: ['疑問詞聞き取り'],
    script: 'Who is your direct supervisor these days? — Ms. Alvarez, since last month.',
    choices: [
      { key: 'A', text: 'Because of the reorganization.' },
      { key: 'B', text: 'Ms. Alvarez, since last month.' },
      { key: 'C', text: 'In the human resources office.' },
    ],
    answer: 'B',
    explanation:
      'Who（誰）への応答は人物。「In the human resources office.」は場所（Where）、「Because of the reorganization.」は理由（Why）への応答であり、質問には合わない。',
    translation: '最近のあなたの直属の上司は誰ですか？ — 先月からAlvarezさんです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'defect',
    tags: ['弱形・連結'],
    script: 'Did the inspector find any defects in the batch? — Just a few minor ones.',
    choices: [
      { key: 'A', text: 'Just a few minor ones.' },
      { key: 'B', text: 'The quality control team.' },
      { key: 'C', text: 'It took most of the morning.' },
    ],
    answer: 'A',
    explanation:
      'Yes/No疑問文には端的な回答（結果）がまず自然。「The quality control team.」は行為者（Who）、「It took most of the morning.」は所要時間（How long）への応答であり合わない。',
    translation: '検査官はそのロットに欠陥を見つけましたか？ — 軽微なものが少しだけありました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'strategy',
    tags: ['疑問詞聞き取り'],
    script:
      'What is our strategy for entering the Asian market? — We plan to partner with a local distributor.',
    choices: [
      { key: 'A', text: 'Sometime next year.' },
      { key: 'B', text: 'The regional sales manager.' },
      { key: 'C', text: 'We plan to partner with a local distributor.' },
    ],
    answer: 'C',
    explanation:
      'What（何を）への応答は内容・方針。「Sometime next year.」は時期（When）、「The regional sales manager.」は担当者（Who）への応答であり、質問には合わない。',
    translation: 'アジア市場に参入する戦略は何ですか？ — 現地の販売代理店と提携する予定です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'negotiate',
    tags: ['疑問詞聞き取り'],
    script:
      'Who will negotiate the price with the supplier? — Our procurement manager will handle it.',
    choices: [
      { key: 'A', text: 'A ten percent discount.' },
      { key: 'B', text: 'Our procurement manager will handle it.' },
      { key: 'C', text: 'Sometime this Friday.' },
    ],
    answer: 'B',
    explanation:
      'Who（誰）への応答は人物。「Sometime this Friday.」は時期（When）、「A ten percent discount.」は金額に関する応答であり、質問には合わない。',
    translation: '仕入れ先との価格交渉は誰が行いますか？ — 調達マネージャーが担当します。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'branch',
    tags: ['疑問詞聞き取り'],
    script: 'How many branches does the bank have in this city? — About a dozen, I think.',
    choices: [
      { key: 'A', text: 'About a dozen, I think.' },
      { key: 'B', text: 'Since the early nineties.' },
      { key: 'C', text: 'The main branch downtown.' },
    ],
    answer: 'A',
    explanation:
      'How many（いくつ）への応答は数量。「Since the early nineties.」は時期（Since when）、「The main branch downtown.」は場所（Which one）への応答であり、質問には合わない。',
    translation: 'この街に銀行の支店はいくつありますか？ — 12店舗くらいだと思います。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'acquisition',
    tags: ['数字・時刻'],
    script: 'When will the acquisition be finalized? — By the end of the third quarter.',
    choices: [
      { key: 'A', text: 'A mid-sized software firm.' },
      { key: 'B', text: 'For roughly ten million dollars.' },
      { key: 'C', text: 'By the end of the third quarter.' },
    ],
    answer: 'C',
    explanation:
      'When（いつ）への応答は時期。「A mid-sized software firm.」は対象（Which company）、「For roughly ten million dollars.」は金額（How much）への応答であり、質問には合わない。',
    translation:
      'その買収はいつ最終合意に至りますか？ — 第3四半期の終わりまでには合意する見込みです。',
    difficulty: 3,
  },
]
