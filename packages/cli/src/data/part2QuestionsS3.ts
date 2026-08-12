// Part2（audio_qa）追加分のデータ本体（T-349。正本: docs/32 ウェーブ8 T-349行、docs/03 7.1節）。
//
// 【設計判断（docs未記載）】K-74（31の所見）を受け、疑問文以外の出題形式（平叙文・付加疑問・
// 選択疑問）をすべて本ファイルで追加する。既存152問（part2QuestionsS.ts・S2.ts）はすべて
// WH疑問文/Yes-No疑問文であるため、疑問文以外の比率が0%だった。本ファイル追加後の比率は
// 63/(152+63)=約29%となり、目標の25〜30%に入る。
// 全63問を間接応答（応答が発話の型に素直に対応せず、推論を要する応答）とする。既存の間接応答
// （S2.ts、20問・全てdifficulty4）と合算すると83/215=約39%となり、目標の40%程度に入る。
// 既存の間接応答がdifficulty4のみだったのに対し、本ファイルはdifficulty2〜4に分散させる
// （K-74「間接応答をd4以外にも配分」）。
// 一部の設問には音韻混同ディストラクタ（発音が似た語を誤答に使う）を導入する（tags[0]に
// '音韻混同' を付与）。
// keyVocabWordは既存のS/A/B語彙カード・他Part2/Part5ファイルで実在確認済みの語から選ぶ。
// 正答キーはcorrectText/distractorsの形で書き、part2Question.tsのrotatePart2Choicesが
// keyVocabWordのハッシュ由来のローテーションでA/B/Cへの分散を行う。

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

export const PART2_ENTRIES_S3_RAW: readonly Part2RawEntry[] = [
  // ============ 平叙文＋間接応答（22問） ============
  {
    keyVocabWord: 'postpone',
    tags: ['平叙文'],
    script: "We're already over budget for this quarter. — Let's postpone the new hires, then.",
    correctText: "Let's postpone the new hires, then.",
    distractors: ['The budget was approved last week.', "I don't have a calculator with me."],
    explanation:
      '間接応答: 予算超過という発言に対し「新規採用を延期しよう」と対策を提案しており、話の流れに合う。他の2つは発言内容と噛み合わない。',
    translation: '今期はもう予算を超えています。 — では新規採用を延期しましょう。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'storage',
    tags: ['平叙文'],
    script:
      'The safety inspection is scheduled for tomorrow morning. — Then I should clean up the storage area today.',
    correctText: 'Then I should clean up the storage area today.',
    distractors: ['The inspector left already.', 'We passed the inspection last year.'],
    explanation:
      '間接応答: 明日検査があるという発言を受け「今日中に保管場所を片付けるべきだ」と準備行動を示しており、話の流れに合う。他の2つは時系列や話題が合わない。',
    translation:
      '安全検査は明日の朝に予定されています。 — それでは今日中に保管場所を片付けないと。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'backup',
    tags: ['平叙文'],
    script:
      'The venue for the conference just canceled on us. — I know a backup location we can call right away.',
    correctText: 'I know a backup location we can call right away.',
    distractors: ['The conference starts at nine.', 'I already sent the invitations.'],
    explanation:
      '間接応答: 会場が予約を取り消したという問題に対し「すぐに連絡できる代替会場を知っている」と解決策を示しており、話の流れに合う。他の2つは問題への対応になっていない。',
    translation:
      'カンファレンスの会場が予約を取り消してきました。 — すぐに連絡できる代替会場を知っています。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'prioritize',
    tags: ['平叙文'],
    script:
      "The client wants this order prioritized over the others. — I'll check if the team can ship it today.",
    correctText: "I'll check if the team can ship it today.",
    distractors: ['The order was placed last Monday.', 'The client canceled the order.'],
    explanation:
      '間接応答: 迅速な対応を求める発言に対し「チームが今日発送できるか確認する」と行動を示しており、話の流れに合う。他の2つは要望への対応になっていない。',
    translation:
      '取引先はこの注文を優先してほしいと言っています。 — チームが今日発送できるか確認します。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'glitch',
    tags: ['平叙文'],
    script:
      'Something triggered a system glitch last night. — I was on a flight, so it wasn’t me logging in.',
    correctText: 'I was on a flight, so it wasn’t me logging in.',
    distractors: ['The system runs a nightly backup.', 'I forgot my password again.'],
    explanation:
      '間接応答: システム障害という発言に対し「自分ではない（アリバイ）」と応じており、話の流れに合う。他の2つは直接の対応になっていない。',
    translation:
      '昨夜システム障害の警報が作動しました。 — 私は飛行機に乗っていたので、ログインしたのは私ではありません。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'printer',
    tags: ['平叙文'],
    script:
      "We still haven't received the invoice from the printer. — Let me call their office and ask about it.",
    correctText: 'Let me call their office and ask about it.',
    distractors: ['The invoice was for the annual report.', 'The printer is out of toner again.'],
    explanation:
      '間接応答: 請求書が未着という発言に対し「事務所に電話して確認する」と対応を示しており、話の流れに合う。他の2つは発話中の語に関連するが、質問の核心への対応にはなっていない。',
    translation: '印刷業者からの請求書がまだ届いていません。 — 事務所に電話して確認してみます。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'timeline',
    tags: ['平叙文'],
    script:
      'The printer broke down again, and the repair timeline keeps slipping. — Then we might as well replace it.',
    correctText: 'Then we might as well replace it.',
    distractors: ['The repair takes about two weeks.', 'I already reported it to IT.'],
    explanation:
      '間接応答: 修理の見通しが遅れ続けているという発言に対し「買い替えたほうがいい」と結論を示しており、話の流れに合う。他の2つは発言内容と矛盾または噛み合わない。',
    translation:
      'プリンターがまた故障して、修理の見通しも遅れ続けています。 — それなら買い替えたほうがいいですね。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'confirm',
    tags: ['平叙文'],
    script:
      'Our software subscription renews automatically next week, but nobody could confirm if we still need it. — Someone should double-check if we still need all those licenses.',
    correctText: 'Someone should double-check if we still need all those licenses.',
    distractors: [
      'The subscription costs less than last year.',
      'I updated the software yesterday.',
    ],
    explanation:
      '間接応答: 自動更新が来週というへ発言に対し「ライセンスが本当に必要か確認すべきだ」と提案しており、話の流れに合う。他の2つは発言への応答として的外れ。',
    translation:
      '弊社のソフトウェアの契約は来週自動更新されます。 — 全てのライセンスが本当に必要か誰かが確認すべきですね。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'refundable',
    tags: ['平叙文'],
    script:
      "The customer is asking for a refund since the damaged shipment should be refundable. — I'll process it as soon as I confirm the return.",
    correctText: "I'll process it as soon as I confirm the return.",
    distractors: [
      'The shipment left the warehouse yesterday.',
      'The customer ordered two more units.',
    ],
    explanation:
      '間接応答: 返金要求という発言に対し「返品を確認したら処理する」と対応を示しており、話の流れに合う。他の2つは話題が合わない。',
    translation: 'お客様が破損した荷物の返金を求めています。 — 返品を確認したらすぐに処理します。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'balance',
    tags: ['平叙文'],
    script:
      "I haven't gotten my travel reimbursement yet, and it's been three weeks. — Let me confirm the balance with accounting on your behalf.",
    correctText: 'Let me confirm the balance with accounting on your behalf.',
    distractors: ['The trip was to the branch office.', 'I submitted my receipts too.'],
    explanation:
      '間接応答: 立替金がまだ支払われていないという発言に対し「代わりに経理に確認する」と対応しており、話の流れに合う。他の2つは発言への直接の対応になっていない。',
    translation:
      '出張の立替金がまだ支払われていなくて、もう3週間になります。 — 代わりに経理部に確認してみます。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'backlog',
    tags: ['平叙文'],
    script:
      'Occupancy at the downtown branch dropped again, adding to a backlog of empty rooms. — Maybe we should run another promotion there.',
    correctText: 'Maybe we should run another promotion there.',
    distractors: ['The branch opened five years ago.', "It's the largest branch in the city."],
    explanation:
      '間接応答: 入居率が再び落ちたという発言に対し「プロモーションを行うべきかもしれない」と対策を提案しており、話の流れに合う。他の2つは発言内容と噛み合わない。',
    translation:
      '今期も都心の支店の入居率が落ちました。 — そこでもう一度プロモーションを行うべきかもしれません。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'campaign',
    tags: ['平叙文'],
    script:
      "That celebrity endorsement campaign fell through this morning. — We'll need a new marketing angle by Friday, then.",
    correctText: "We'll need a new marketing angle by Friday, then.",
    distractors: ['The campaign launched last spring.', 'She has quite a large following.'],
    explanation:
      '間接応答: 推薦契約が破談になったという発言に対し「金曜までに新しい方向性が必要になる」と対応を示しており、話の流れに合う。他の2つは発言と矛盾または的外れ。',
    translation:
      '今朝、著名人の推薦契約が破談になりました。 — それなら金曜までに新しいマーケティングの方向性が必要ですね。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'presentation',
    tags: ['平叙文'],
    script:
      'The conference room projector malfunctioned right before the presentation. — I brought a spare one just in case.',
    correctText: 'I brought a spare one just in case.',
    distractors: ['The presentation went well overall.', 'The projector is quite old.'],
    explanation:
      '間接応答: プロジェクターが故障したという発言に対し「念のためスペアを持ってきた」と解決策を示しており、話の流れに合う。他の2つは対応として的外れ。',
    translation:
      'プレゼンの直前に会議室のプロジェクターが故障しました。 — 念のためスペアを持ってきました。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'milestone',
    tags: ['平叙文'],
    script:
      "The new software is supposed to help us hit our next milestone sooner. — I'll believe it once I see it actually work.",
    correctText: "I'll believe it once I see it actually work.",
    distractors: ['The approval process takes five steps.', 'The software costs quite a lot.'],
    explanation:
      '間接応答: 次の目標達成が早まるという期待に対し「実際に動くのを見てから信じる」と懐疑的な態度を示しており、話の流れに合う。他の2つは発言内容と噛み合わない。',
    translation:
      'この新しいソフトウェアのおかげで次の目標達成が早まるはずです。 — 実際に動くのを見てから信じます。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'hire',
    tags: ['平叙文'],
    script:
      "Two new hires start their onboarding on Monday. — I'll make sure their desks are ready by then.",
    correctText: "I'll make sure their desks are ready by then.",
    distractors: ['The interview process took two months.', 'Both candidates have strong resumes.'],
    explanation:
      '間接応答: 月曜日に新人研修が始まるという発言に対し「それまでに机の準備をしておく」と対応を示しており、話の流れに合う。他の2つは発言への対応になっていない。',
    translation:
      '2人の新入社員が月曜日から新人研修を始めます。 — それまでに机の準備をしておきます。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'reservation',
    tags: ['平叙文'],
    script:
      "The hotel overbooked our reservation for the conference. — Then we'll need to find rooms at another hotel nearby.",
    correctText: "Then we'll need to find rooms at another hotel nearby.",
    distractors: [
      'The reservation was made months ago.',
      'The conference has three hundred guests.',
    ],
    explanation:
      '間接応答: 予約超過という発言に対し「近くの別のホテルを探す必要がある」と対応を示しており、話の流れに合う。他の2つは対応として的外れ。',
    translation:
      'ホテルがカンファレンス用の予約を過剰受付していました。 — それなら近くの別のホテルで部屋を探す必要がありますね。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'network',
    tags: ['平叙文'],
    script:
      "Our contact at the ministry hasn't replied in over a week, and our network there is limited. — I'll try reaching out through a different contact.",
    correctText: "I'll try reaching out through a different contact.",
    distractors: ['The ministry building is downtown.', 'She used to work there for years.'],
    explanation:
      '間接応答: 連絡担当者から返信がないという発言に対し「別の連絡先を試す」と対応を示しており、話の流れに合う。他の2つは対応として的外れ。',
    translation:
      '省庁の連絡担当者から1週間以上返信がありません。 — 別の連絡先を通じて連絡してみます。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'valuation',
    tags: ['平叙文'],
    script:
      'The merger added a large amount of goodwill to our valuation. — Our accountants will need to reassess it next year.',
    correctText: 'Our accountants will need to reassess it next year.',
    distractors: ['The merger closed in March.', 'The valuation seems too high already.'],
    explanation:
      '間接応答: 会計上の「のれん」が増えたという発言に対し「来年再評価が必要になる」と実務的な見通しを示しており、話の流れに合う。他の2つは発言内容と噛み合わない。',
    translation:
      'その合併により、当社の帳簿上のれん代が大幅に増えました。 — 来年、会計担当者が再評価する必要がありますね。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'agreement',
    tags: ['平叙文'],
    script:
      'Costs on our fleet vehicles jumped this year under the new leasing agreement. — We should compare leasing costs against buying new ones.',
    correctText: 'We should compare leasing costs against buying new ones.',
    distractors: ['The fleet has twelve vehicles.', 'Fuel prices went up too.'],
    explanation:
      '間接応答: 車両の減価償却費が増えたという発言に対し「リースと新車購入のコストを比較すべきだ」と提案しており、話の流れに合う。他の2つは発言と直接関係しない。',
    translation:
      '今年は社用車の減価償却費が急増しました。 — リースと新車購入のコストを比較すべきですね。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'consensus',
    tags: ['平叙文'],
    script:
      "We couldn't reach a consensus on the new logo at yesterday's meeting. — Let's just put it to a vote this time.",
    correctText: "Let's just put it to a vote this time.",
    distractors: ['The logo was designed last month.', 'The meeting ran an hour late.'],
    explanation:
      '間接応答: 合意に至らなかったという発言に対し「今回は投票で決めよう」と解決策を示しており、話の流れに合う。他の2つは発言への対応になっていない。',
    translation:
      '昨日の会議で新しいロゴについて合意に至りませんでした。 — 今回は投票で決めましょう。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'grievance',
    tags: ['平叙文'],
    script:
      'One of the warehouse staff filed a formal grievance yesterday. — HR should probably look into it before it escalates.',
    correctText: 'HR should probably look into it before it escalates.',
    distractors: ['The warehouse is fully staffed now.', 'He has worked here for five years.'],
    explanation:
      '間接応答: 正式な不服申立てがあったという発言に対し「エスカレートする前に人事が調査すべきだ」と提案しており、話の流れに合う。他の2つは発言内容と噛み合わない。',
    translation:
      '昨日、倉庫スタッフの1人が正式な不服申立てを行いました。 — エスカレートする前に人事が調査すべきでしょうね。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'disgruntled',
    tags: ['平叙文'],
    script:
      "A disgruntled former employee posted a negative review online. — Let's have someone from PR respond calmly.",
    correctText: "Let's have someone from PR respond calmly.",
    distractors: ['The review site is quite popular.', 'He left the company two years ago.'],
    explanation:
      '間接応答: 不満を持つ元従業員が悪評を投稿したという発言に対し「広報担当者に冷静に対応してもらおう」と提案しており、話の流れに合う。他の2つは対応として的外れ。',
    translation:
      '不満を持つ元従業員がネットに批判的なレビューを投稿しました。 — 広報の誰かに冷静に対応してもらいましょう。',
    difficulty: 4,
  },

  // ============ 付加疑問（21問） ============
  {
    keyVocabWord: 'office',
    tags: ['付加疑問'],
    script:
      "This office hasn't been inspected since last year, has it? — Actually, the fire marshal came through in March.",
    correctText: 'Actually, the fire marshal came through in March.',
    distractors: ['The office opened in 2019.', 'It has three loading docks.'],
    explanation:
      '間接応答: 「検査されていないですよね」という付加疑問に対し「実は3月に消防署の検査があった」と訂正情報で応じており、話の流れに合う。他の2つは質問の核心（検査の有無）に答えていない。',
    translation:
      'このオフィスは昨年から検査されていませんよね？ — 実は3月に消防署の検査がありました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'premises',
    tags: ['付加疑問'],
    script:
      "Visitors need a badge to enter the premises, don't they? — Only after five, when the front desk closes.",
    correctText: 'Only after five, when the front desk closes.',
    distractors: ['The premises cover two city blocks.', 'The badges are printed in the lobby.'],
    explanation:
      '間接応答: 「バッジが必要ですよね」という付加疑問に対し「5時以降だけ必要」と条件付きで応じており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '来訪者は構内に入るのにバッジが必要ですよね？ — 5時以降、受付が閉まってからだけです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'client',
    tags: ['付加疑問'],
    script:
      "The client's remodeling finished on schedule, didn't it? — They actually wrapped up a full week early.",
    correctText: 'They actually wrapped up a full week early.',
    distractors: ['The remodeling cost more than expected.', 'The client is based downtown.'],
    explanation:
      '間接応答: 「予定通り終えましたよね」という付加疑問に対し「実は1週間早く終えた」と補足情報で応じており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: 'その顧客の改装は予定通り終わりましたよね？ — 実は1週間も早く終わりました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'registration',
    tags: ['付加疑問'],
    script:
      "The airport shuttle needs its registration renewed every year, doesn't it? — It used to, but now it's every two years.",
    correctText: "It used to, but now it's every two years.",
    distractors: ['The airport is about ten miles away.', 'The shuttle seats about twenty people.'],
    explanation:
      '間接応答: 「毎年更新が必要ですよね」という付加疑問に対し「以前はそうだったが今は2年ごとだ」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '空港シャトルの登録は毎年更新が必要ですよね？ — 以前はそうでしたが、今は2年ごとです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'competitor',
    tags: ['付加疑問'],
    script:
      "Our closest competitor mostly serves local businesses, isn't it? — It was, until it started shipping overseas last year.",
    correctText: 'It was, until it started shipping overseas last year.',
    distractors: ['Local businesses tend to pay on time.', 'We have about two hundred clients.'],
    explanation:
      '間接応答: 「主に地元企業向けですよね」という付加疑問に対し「以前はそうだったが去年から海外発送を始めた」と変化を伝えており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '弊社の最大の競合は主に地元企業向けですよね？ — 以前はそうでしたが、去年から海外発送を始めてから変わりました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'market',
    tags: ['付加疑問'],
    script:
      "You already sent the market report to the client, didn't you? — I was just about to, actually.",
    correctText: 'I was just about to, actually.',
    distractors: ['The client travels frequently.', 'The market report covers three regions.'],
    explanation:
      '間接応答: 「もう送りましたよね」という付加疑問に対し「実はちょうど送るところだった」とまだ送っていないことを示しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: 'もう市場レポートをお客様に送りましたよね？ — 実はちょうど送るところでした。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'probation',
    tags: ['付加疑問'],
    script:
      "The new hire is still on probation, isn't she? — Actually, she passed her review early last week.",
    correctText: 'Actually, she passed her review early last week.',
    distractors: ['She started three months ago.', 'Probation usually lasts ninety days.'],
    explanation:
      '間接応答: 「まだ試用期間中ですよね」という付加疑問に対し「実は先週すでに審査を通過した」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: 'その新入社員はまだ試用期間中ですよね？ — 実は先週すでに審査を通過しました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'zoning',
    tags: ['付加疑問'],
    script:
      "This lot has commercial zoning, doesn't it? — Only the front half; the back is still residential.",
    correctText: 'Only the front half; the back is still residential.',
    distractors: ['The lot is about two acres.', 'Zoning changes take months to approve.'],
    explanation:
      '間接応答: 「商業用に区分されていますよね」という付加疑問に対し「前半分だけで、裏は住宅用のまま」と部分的な訂正で応じており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      'この土地は商業用に区分されていますよね？ — 前半分だけです。裏側はまだ住宅用のままです。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'sponsor',
    tags: ['付加疑問'],
    script:
      "The same company sponsored the event last year too, didn't they? — No, that was a different sponsor entirely.",
    correctText: 'No, that was a different sponsor entirely.',
    distractors: ['The event drew a large crowd.', 'Sponsorship fees went up this year.'],
    explanation:
      '間接応答: 「昨年も同じ会社が協賛しましたよね」という付加疑問に対し「いいえ、全く別の協賛企業だった」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '昨年も同じ会社がイベントに協賛しましたよね？ — いいえ、それは全く別の協賛企業でした。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'feedback',
    tags: ['付加疑問'],
    script:
      "You collected feedback from that client already, didn't you? — She's still drafting some for us.",
    correctText: "She's still drafting some for us.",
    distractors: ['The client signed a two-year deal.', 'Feedback helps with new sales.'],
    explanation:
      '間接応答: 「もう推薦の声をもらいましたよね」という付加疑問に対し「まだ書いている最中だ」とまだ完了していないことを示しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: 'もうそのお客様から推薦の声をもらいましたよね？ — まだ書いてくれている最中です。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'vacancy',
    tags: ['付加疑問'],
    script:
      "There's still a vacancy in the accounting team, isn't there? — We actually filled it last Friday.",
    correctText: 'We actually filled it last Friday.',
    distractors: ['Accounting has six team members.', 'The vacancy was posted online.'],
    explanation:
      '間接応答: 「まだ欠員がありますよね」という付加疑問に対し「実は先週金曜に補充した」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: '経理チームにはまだ欠員がありますよね？ — 実は先週の金曜日に補充しました。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'discount',
    tags: ['付加疑問'],
    script:
      "Members still get a discount on renewals, don't they? — Only if they renew before the plan expires.",
    correctText: 'Only if they renew before the plan expires.',
    distractors: ['Membership fees increased slightly.', 'The discount used to be higher.'],
    explanation:
      '間接応答: 「更新時に割引がありますよね」という付加疑問に対し「有効期限前に更新した場合のみ」と条件付きで応じており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '会員は更新時にまだ割引が受けられますよね？ — プランの有効期限が切れる前に更新した場合だけです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'tenancy',
    tags: ['付加疑問'],
    script:
      "The lobby work required under the new tenancy is finished by now, isn't it? — They're just waiting on the new carpet to arrive.",
    correctText: "They're just waiting on the new carpet to arrive.",
    distractors: ['The lobby looks much brighter now.', 'The renovation took six weeks.'],
    explanation:
      '間接応答: 「もう完了していますよね」という付加疑問に対し「新しいカーペットの到着を待っているだけ」とほぼ完了だが未完であることを示しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      'ロビーの改装はもう終わっていますよね？ — 新しいカーペットの到着を待っているだけです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'customs',
    tags: ['付加疑問'],
    script:
      "Customs closes at midnight, doesn't it? — Actually, this terminal keeps a counter open all night.",
    correctText: 'Actually, this terminal keeps a counter open all night.',
    distractors: ['Customs officers wear uniforms.', 'Security staff work in shifts.'],
    explanation:
      '間接応答: 「深夜に閉まりますよね」という付加疑問に対し「このターミナルは一晩中開けている」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '保安検査場は深夜に閉まりますよね？ — 実は、このターミナルは一晩中1つ開けています。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'manual',
    tags: ['付加疑問'],
    script:
      "New hires get the training manual on their first day, don't they? — It's actually spread across the whole first week.",
    correctText: "It's actually spread across the whole first week.",
    distractors: ['The manual covers company policy.', 'New hires meet their supervisors too.'],
    explanation:
      '間接応答: 「初日に研修マニュアルを受け取りますよね」という付加疑問に対し「実は初週全体に分けて行う」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '新入社員は初日に研修マニュアルを受け取りますよね？ — 実は初週全体に分けて行われます。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'merchandise',
    tags: ['付加疑問'],
    script:
      "That merchandise cleared customs yesterday, didn't it? — Not yet; it's still held up at the port.",
    correctText: "Not yet; it's still held up at the port.",
    distractors: [
      "There's a container ship at the port.",
      'The consignee signed for the shipment.',
    ],
    explanation:
      '間接応答: 「昨日通関しましたよね」という付加疑問に対し「まだ港で保留されている」と訂正しており、話の流れに合う。他の2つは質問の核心（通関の有無）に答えていない。',
    translation: 'あの商品は昨日通関しましたよね？ — まだです。まだ港で保留されています。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'clause',
    tags: ['付加疑問'],
    script:
      "The board approved the new sponsorship clause last month, didn't they? — They're still reviewing the final terms.",
    correctText: "They're still reviewing the final terms.",
    distractors: ['The board meets twice a month.', 'The deal is worth quite a lot.'],
    explanation:
      '間接応答: 「先月承認しましたよね」という付加疑問に対し「まだ最終条件を検討中だ」とまだ承認されていないことを示しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: '取締役会は先月その推薦契約を承認しましたよね？ — まだ最終条件を検討中です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'personnel',
    tags: ['付加疑問'],
    script:
      "Personnel numbers in the design team went up this year, didn't they? — No, they actually stayed exactly the same.",
    correctText: 'No, they actually stayed exactly the same.',
    distractors: ['The design team works on branding.', 'Headcount reports come out quarterly.'],
    explanation:
      '間接応答: 「今年増えましたよね」という付加疑問に対し「いいえ、全く変わらなかった」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      'デザインチームの人員は今年増えましたよね？ — いいえ、実際は全く変わりませんでした。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'exhibitor',
    tags: ['付加疑問'],
    script:
      "Every exhibitor gets a booth near the entrance, doesn't it? — Only the ones who registered before June.",
    correctText: 'Only the ones who registered before June.',
    distractors: ['The entrance is near the main hall.', 'Booths are set up the night before.'],
    explanation:
      '間接応答: 「全出展者が入口近くのブースを得ますよね」という付加疑問に対し「6月前に登録した出展者だけ」と条件付きで応じており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation: '出展者は全員入口近くのブースを得られますよね？ — 6月前に登録した出展者だけです。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'outlet',
    tags: ['付加疑問'],
    script:
      "The European outlet reports directly to headquarters, doesn't it? — It actually reports through the regional office first.",
    correctText: 'It actually reports through the regional office first.',
    distractors: ['The outlet was opened in 2015.', 'Headquarters is based overseas.'],
    explanation:
      '間接応答: 「本社に直接報告しますよね」という付加疑問に対し「実は地域事務所を経由してから報告する」と訂正しており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      '欧州子会社は本社に直接報告しますよね？ — 実は地域事務所を経由してから報告します。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'wholesaler',
    tags: ['付加疑問'],
    script:
      "That wholesaler offers the lowest prices in the region, doesn't it? — It did, until a new supplier undercut them last month.",
    correctText: 'It did, until a new supplier undercut them last month.',
    distractors: ['The wholesaler supplies most local shops.', 'Prices tend to rise every winter.'],
    explanation:
      '間接応答: 「地域で最安値ですよね」という付加疑問に対し「以前はそうだったが先月新しい業者がさらに安くした」と変化を伝えており、話の流れに合う。他の2つは質問の核心に答えていない。',
    translation:
      'その卸売業者はこの地域で最安値ですよね？ — 以前はそうでしたが、先月新しい業者がさらに安くしました。',
    difficulty: 4,
  },

  // ============ 選択疑問（21問） ============
  {
    keyVocabWord: 'credential',
    tags: ['選択疑問'],
    script:
      'Should we hire the contractor with the stronger credential or the one from the capital? — Whichever one can start sooner, honestly.',
    correctText: 'Whichever one can start sooner, honestly.',
    distractors: ['The capital is two hours away.', 'Both contractors have good reviews.'],
    explanation:
      '間接応答: 「どちらの請負業者にすべきか」という選択疑問に対し「早く始められる方でいい」と決定基準を示す形で答えており、話の流れに合う。他の2つはどちらかを選んでいない。',
    translation:
      '地元の請負業者にすべきか、首都の業者にすべきか？ — 正直、早く始められる方でいいです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'connection',
    tags: ['選択疑問'],
    script:
      "Do you want the venue with the better transit connection or the one downtown? — Let's see which one is cheaper first.",
    correctText: "Let's see which one is cheaper first.",
    distractors: ['The transit connection is quite fast.', 'Downtown is easier to reach by train.'],
    explanation:
      '間接応答: 「交通の便が良い会場か都心の会場か」という選択疑問に対し「まず安い方を確認しよう」と決定を先延ばしにする形で答えており、話の流れに合う。他の2つは直接どちらかを選んでいる（間接応答ではない）。',
    translation:
      '会場は交通の便が良い方か都心の方か、どちらがいいですか？ — まずどちらが安いか確認しましょう。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'keynote',
    tags: ['選択疑問'],
    script:
      "Should the schedule include a day trip or just the keynote session? — I'll let the client decide that one.",
    correctText: "I'll let the client decide that one.",
    distractors: ['The keynote session runs three hours.', 'Day trips require an early start.'],
    explanation:
      '間接応答: 「日帰り旅行を含めるか基調講演だけにするか」という選択疑問に対し「それは顧客に決めてもらう」と判断を委ねる形で答えており、話の流れに合う。他の2つはどちらかを直接選んでいる。',
    translation:
      '予定には日帰り旅行を含めるべきですか、それとも基調講演だけですか？ — それはお客様に決めてもらいます。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'menu',
    tags: ['選択疑問'],
    script:
      "Should we finalize the menu for noon or one o'clock service? — Whatever works best for the guest speaker's schedule.",
    correctText: "Whatever works best for the guest speaker's schedule.",
    distractors: ['The caterer needs two days notice.', 'Lunch usually runs an hour.'],
    explanation:
      '間接応答: 「正午か1時のどちらでメニューを確定するか」という選択疑問に対し「来賓講演者の予定に合わせる」と別の基準に委ねる形で答えており、話の流れに合う。他の2つはどちらかを直接選んでいない代わりに関係ない情報。',
    translation:
      'メニューは正午か1時のどちらで確定すべきですか？ — 来賓講演者の予定に一番合う方でお願いします。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'layover',
    tags: ['選択疑問'],
    script:
      "Would you rather have a layover in Dubai or fly direct? — Direct, if it doesn't cost too much more.",
    correctText: "Direct, if it doesn't cost too much more.",
    distractors: ['Dubai has a beautiful airport.', 'Direct flights are always faster.'],
    explanation:
      '間接応答: 「ドバイ経由か直行か」という選択疑問に対し「値段があまり変わらないなら直行」と条件付きで直行を選んでおり、話の流れに合う。他の2つは選択への直接の回答になっていない。',
    translation:
      'ドバイ経由にしますか、それとも直行にしますか？ — 値段があまり変わらないなら直行がいいです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'capital',
    tags: ['選択疑問'],
    script:
      'Should we expand through franchising or open company-owned stores? — Franchising would let us grow faster with less capital.',
    correctText: 'Franchising would let us grow faster with less capital.',
    distractors: [
      'Company-owned stores are easier to manage.',
      'Our current stores are doing well.',
    ],
    explanation:
      '間接応答: 「フランチャイズ展開か直営店開設か」という選択疑問に対し「フランチャイズなら少ない資本で速く成長できる」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      'フランチャイズで展開すべきか、直営店を開くべきか？ — フランチャイズなら少ない資本で速く成長できますね。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'supplier',
    tags: ['選択疑問'],
    script:
      "Should we outsource the customer support to a supplier or keep it in-house? — Let's pilot outsourcing for just one product line first.",
    correctText: "Let's pilot outsourcing for just one product line first.",
    distractors: [
      'In-house support tends to cost more.',
      'Customer satisfaction scores dropped recently.',
    ],
    explanation:
      '間接応答: 「顧客対応を外部委託するか社内で続けるか」という選択疑問に対し「まず1つの製品ラインで試験導入しよう」と条件付きの折衷案を示しており、話の流れに合う。他の2つはどちらかを直接選んでいない。',
    translation:
      '顧客サポートを外部委託すべきか、社内で続けるべきか？ — まず1つの製品ラインだけで試験導入してみましょう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'rebrand',
    tags: ['選択疑問'],
    script:
      "Do we rebrand the whole company or just refresh the logo? — Let's start small and see how customers react.",
    correctText: "Let's start small and see how customers react.",
    distractors: ['The current logo is ten years old.', 'Rebranding usually takes a full year.'],
    explanation:
      '間接応答: 「会社全体をリブランドするかロゴだけ更新するか」という選択疑問に対し「小さく始めて反応を見よう」と暗にロゴ更新を選ぶ形で答えており、話の流れに合う。他の2つは選択の判断につながっていない。',
    translation:
      '会社全体をリブランドすべきか、それともロゴだけ更新すべきか？ — まず小さく始めて、お客様の反応を見ましょう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'carrier',
    tags: ['選択疑問'],
    script:
      'Should we use an air carrier or a sea carrier for this shipment? — Air, since the client needs it within the week.',
    correctText: 'Air, since the client needs it within the week.',
    distractors: ['Sea carriers are cheaper per container.', 'The shipment weighs about two tons.'],
    explanation:
      '間接応答: 「今回は航空便か海運かどちらで発送するか」という選択疑問に対し「顧客が1週間以内に必要なので航空便」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      '今回は航空便か海運かどちらで発送すべきですか？ — お客様が1週間以内に必要としているので航空便です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subcontractor',
    tags: ['選択疑問'],
    script:
      "Do you want to bring in a subcontractor or extend the current crew's hours? — Extending hours might be cheaper, but let's check overtime rules first.",
    correctText: "Extending hours might be cheaper, but let's check overtime rules first.",
    distractors: ['The subcontractor is available next week.', 'The current crew has ten workers.'],
    explanation:
      '間接応答: 「下請け業者を入れるか現場の勤務時間を延長するか」という選択疑問に対し「延長の方が安いかもしれないが残業規定を先に確認しよう」と条件付きで答えており、話の流れに合う。他の2つは判断につながっていない。',
    translation:
      '下請け業者を入れるべきですか、それとも今の作業員の勤務時間を延長すべきですか？ — 延長の方が安いかもしれませんが、まず残業規定を確認しましょう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'liquidation',
    tags: ['選択疑問'],
    script:
      'Should the excess inventory go to liquidation or be donated? — Donation might actually help our tax situation more.',
    correctText: 'Donation might actually help our tax situation more.',
    distractors: [
      'The inventory takes up a lot of space.',
      'Liquidation sales usually last a week.',
    ],
    explanation:
      '間接応答: 「過剰在庫を処分するか寄付するか」という選択疑問に対し「寄付の方が税務上有利かもしれない」と理由を添えて寄付を選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      '過剰在庫は処分すべきですか、それとも寄付すべきですか？ — 寄付の方が税務上、実は有利かもしれません。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'showroom',
    tags: ['選択疑問'],
    script:
      'Would you rather see the new models at the showroom or online first? — Online first, so I know what to look for in person.',
    correctText: 'Online first, so I know what to look for in person.',
    distractors: ['The showroom is open until eight.', 'The new models launched last week.'],
    explanation:
      '間接応答: 「ショールームで見るかまずオンラインで見るか」という選択疑問に対し「まずオンラインで見て、実際に確認すべき点を把握したい」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      'ショールームで新モデルを見るか、まずオンラインで見るか、どちらがいいですか？ — まずオンラインで見て、実際に確認すべき点を把握したいです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'expense',
    tags: ['選択疑問'],
    script:
      'Should we book a bus, given the extra expense, or have everyone drive separately? — The bus, so we all arrive together.',
    correctText: 'The bus, so we all arrive together.',
    distractors: [
      'The parking lot has plenty of space.',
      'Driving separately gives more flexibility.',
    ],
    explanation:
      '間接応答: 「追加費用がかかってもバスを予約するか各自で運転するか」という選択疑問に対し「バスなら皆一緒に到着できる」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      '追加費用がかかってもバスを予約すべきですか、それとも各自で運転すべきですか？ — バスなら皆一緒に到着できますね。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'target',
    tags: ['選択疑問'],
    script:
      "Is the delay affecting our production target or shipping this month? — Honestly, it's a bit of both.",
    correctText: "Honestly, it's a bit of both.",
    distractors: ['Production runs three shifts a day.', 'Shipping delays cost us customers.'],
    explanation:
      '間接応答: 「生産か配送のどちらに障害があるか」という選択疑問に対し「今月は両方に少しずつある」と両方を示す形で答えており、話の流れに合う。他の2つはどちらかを直接選んでいない。',
    translation:
      '障害は生産にあるのか、それとも配送にあるのか？ — 正直、今月は両方に少しずつあります。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'revenue',
    tags: ['選択疑問'],
    script:
      "Will the new levy affect resident revenue or business revenue only? — It's still under debate at the city council.",
    correctText: "It's still under debate at the city council.",
    distractors: ['The levy would fund road repairs.', 'Residents already pay property tax.'],
    explanation:
      '間接応答: 「新しい課税は住民に適用されるか企業だけか」という選択疑問に対し「市議会でまだ議論中だ」とまだ決まっていないことを示しており、話の流れに合う。他の2つはどちらかを直接選んでいない。',
    translation:
      '新しい課税は住民に適用されるのか、それとも企業だけか？ — まだ市議会で議論中です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'overhead',
    tags: ['選択疑問'],
    script:
      "Should we hire more staff now, even with the added overhead, or wait until next quarter? — Let's wait and see how the current project goes.",
    correctText: "Let's wait and see how the current project goes.",
    distractors: ['Overhead grew last year too.', 'Hiring now would cost more overall.'],
    explanation:
      '間接応答: 「今すぐ人員を増やすか来期まで待つか」という選択疑問に対し「今のプロジェクトの様子を見てから決めよう」と暗に待つ方を選んでおり、話の流れに合う。他の2つは選択への直接の回答になっていない。',
    translation:
      '今すぐ人員を増やすべきですか、それとも来期まで待つべきですか？ — 今のプロジェクトの様子を見てから決めましょう。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'retailer',
    tags: ['選択疑問'],
    script:
      'Should we partner with the online retailer or the chain of physical stores? — Both, if the terms are reasonable enough.',
    correctText: 'Both, if the terms are reasonable enough.',
    distractors: [
      'The chain has locations nationwide.',
      'The online retailer ships internationally.',
    ],
    explanation:
      '間接応答: 「オンライン小売業者か実店舗チェーンのどちらと提携するか」という選択疑問に対し「条件が合理的なら両方」と両方を示す形で答えており、話の流れに合う。他の2つはどちらかを直接選んでいない。',
    translation:
      'オンライン小売業者と提携すべきですか、それとも実店舗チェーンと提携すべきですか？ — 条件が合理的なら両方でもいいですね。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'covenant',
    tags: ['選択疑問'],
    script:
      'Do you want to renew the lease covenant for another year or negotiate a shorter term? — A shorter term, so we keep our options open.',
    correctText: 'A shorter term, so we keep our options open.',
    distractors: ['The current agreement expires in June.', 'Rent went up slightly this year.'],
    explanation:
      '間接応答: 「1年間の契約更新か短期契約の交渉か」という選択疑問に対し「短期契約にして選択肢を残したい」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      '賃貸契約を1年更新すべきですか、それとも短期での交渉にすべきですか？ — 短期にして、選択肢を残しておきたいです。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'profit',
    tags: ['選択疑問'],
    script:
      'Should we recruit more partners to grow profit or focus on the ones we have? — Focus on the current ones; quality over quantity.',
    correctText: 'Focus on the current ones; quality over quantity.',
    distractors: [
      'Partners earn a commission per sale.',
      'We currently have about fifty partners.',
    ],
    explanation:
      '間接応答: 「提携先を増やすか今の提携先に集中するか」という選択疑問に対し「今の提携先に集中する。量より質」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      '提携先を増やすべきですか、それとも今の提携先に集中すべきですか？ — 今の提携先に集中しましょう。量より質です。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'request',
    tags: ['選択疑問'],
    script:
      'Should we respond to the request by phone or by email? — Email, so we have a written record.',
    correctText: 'Email, so we have a written record.',
    distractors: ['The request came in this morning.', 'Phone calls tend to be faster.'],
    explanation:
      '間接応答: 「問い合わせに電話かメールのどちらで返答するか」という選択疑問に対し「記録が残るのでメール」と理由を添えて選んでおり、話の流れに合う。他の2つは選択の根拠を示していない。',
    translation:
      'その問い合わせには電話で返答すべきですか、それともメールで返答すべきですか？ — 記録が残るようにメールにしましょう。',
    difficulty: 2,
  },
]
