// シャドーイング素材30本のデータ本体（M2・T-62。正本: docs/13 T-62行・3.5節）。
// 新規執筆はしない（3.10節: 「Part3/4スクリプトから20本＋既存Part2の応答文から10本を流用」）。
// 内訳:
// - p3-extract-01〜10: part34SetsS.ts の Part3（会話）10セットから、各セットで最も長く
//   内容的にまとまった1話者ぶんの発話を抜粋（話者表記"A:"/"B:"は除去）。抜粋元のkeyVocabWordが
//   その抜粋内に実在することを確認済み。
// - p4-verbatim-01〜10: part34SetsS.ts の Part4（単独トーク）10セットのscriptを元に流用。
// - p2-response-01〜10: part2QuestionsS.ts/part2QuestionsS2.tsの応答文（" — "以降）のうち、
//   S/A/B語彙カード（600語）の語を含むものを10件抜粋して元にした。
// 【2026-08-07訂正・T-340・K-87】上記「流用」は元は逐語コピー（p4-verbatim-*は完全一致、
// p2-response-*も完全一致）だった。p2-response-*は元のPart2問題の正答choiceそのものだったため、
// シャドーイングで先に見た学習者がPart2側の正答を覚えてしまう露出になっていた
// （p3-extract-*は話者表記除去のみで文自体は完全一致）。全30件を意味・keyVocabWordを保ちながら
// 言い換え、逐語コピーとPart2正答の先出しを解消した。timingはプレースホルダ（cli/src/timing.tsの
// estimateWordTimingsを、このファイルの推定durationMsに基づいて生成。T-64のTTS実測時に
// ttsBatch.tsが実測durationMsから再計算し上書きする＝T-46のshadowing分岐と同じ扱い。
// ここではスキーマの検証条件を満たす値であれば良い）。

export interface ShadowingRawEntry {
  id: string
  /**
   * 抜粋元のPart（2/3/4）。実装当初は組み立て側（shadowingQuestion.ts）でpart:3を
   * 固定していたため、p4-verbatim・p2-response由来の20件が誤ってPart3として配信されていた
   * （2026-08-07訂正・T-340・K-87）
   */
  part: 2 | 3 | 4
  keyVocabWord: string
  tags: string[]
  script: string
  translation: string
  difficulty: number
}

export const SHADOWING_ENTRIES_S: ShadowingRawEntry[] = [
  // ---- Part3会話からの抜粋（10件） ----
  {
    id: 'shadow-p3-01',
    part: 3,
    keyVocabWord: 'reschedule',
    tags: ['先読み'],
    script:
      'Actually, I just realized I have a client call scheduled at that exact time. Would it be possible to reschedule to Thursday afternoon instead?',
    translation:
      '実は、ちょうど同じ時間にクライアントとの電話が入っていることに気づきました。木曜日の午後に変更することは可能でしょうか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-02',
    part: 3,
    keyVocabWord: 'malfunction',
    tags: [],
    script:
      "It looks like the shared server is malfunctioning again, and I can't get into any of the project files.",
    translation:
      '共有サーバーがまた不調のようで、プロジェクトファイルにまったくアクセスできません。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-03',
    part: 3,
    keyVocabWord: 'submit',
    tags: ['パラフレーズ照合'],
    script: 'We should submit the order today so everything arrives before the weekend.',
    translation: '今日中に注文を提出すべきです、そうすればすべて週末前に届きます。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-04',
    part: 3,
    keyVocabWord: 'backlog',
    tags: [],
    script:
      "They said there was a backlog at the warehouse, but they couldn't commit to a firm delivery date.",
    translation: '彼らは倉庫に滞貨があると言いましたが、確実な配送日は約束できませんでした。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-05',
    part: 3,
    keyVocabWord: 'candidate',
    tags: ['先読み'],
    script: 'So, what was your impression of the candidate we interviewed earlier this morning?',
    translation: 'それで、今朝面接したその候補者についてどんな印象を持ちましたか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-06',
    part: 3,
    keyVocabWord: 'attendee',
    tags: ['パラフレーズ照合'],
    script: 'I plan to send a short survey out to the attendee list later this afternoon.',
    translation: '今日の午後、参加者リストに簡単なアンケートを送るつもりです。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-07',
    part: 3,
    keyVocabWord: 'synchronize',
    tags: [],
    script:
      'Right, IT confirmed that our files will synchronize automatically once the update begins.',
    translation: 'そうです、ITによると更新が始まると私たちのファイルは自動的に同期されるそうです。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-08',
    part: 3,
    keyVocabWord: 'itinerary',
    tags: ['先読み'],
    script: "Is my itinerary for next month's conference ready yet?",
    translation: '来月のカンファレンスに向けた私の旅程はもう準備できていますか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-09',
    part: 3,
    keyVocabWord: 'restock',
    tags: ['パラフレーズ照合'],
    script: "I hear you — our best-selling items sell out faster than we're able to restock them.",
    translation:
      'そうなんです、うちの売れ筋商品は補充が追いつかないほど早く売り切れてしまうんです。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-10',
    part: 3,
    keyVocabWord: 'renewal',
    tags: [],
    script:
      "The total cost stays roughly the same, but they'd like to cut the renewal period down to six months.",
    translation: '総コストはほぼ同じままですが、更新期間を6か月に短縮したいそうです。',
    difficulty: 4,
  },

  // ---- Part4トークを元にした言い換え（10件） ----
  {
    id: 'shadow-p4-01',
    part: 4,
    keyVocabWord: 'tenant',
    tags: ['先読み'],
    script:
      "Attention, tenants: the east elevator will be shut down for scheduled maintenance tomorrow morning from nine until eleven. While it's out of service, please take the west elevator or use the stairs by the lobby. We're sorry for the inconvenience, and the elevator should be running again by early afternoon.",
    translation:
      '入居者の皆様へ：東側のエレベーターは明日午前9時から11時まで定期点検のため停止します。稼働していない間は西側のエレベーターまたはロビー横の階段をご利用ください。ご不便をおかけして申し訳ございませんが、午後早くには再び運転する見込みです。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-02',
    part: 4,
    keyVocabWord: 'merchandise',
    tags: ['パラフレーズ照合'],
    script:
      "Just this weekend, stop by Harbor Outlet for the year's biggest clearance event. Everything in the store is discounted, and select merchandise is marked down by as much as seventy percent. We open early at eight o'clock, and the first fifty shoppers get a free gift bag. Don't miss out on this once-a-year sale.",
    translation:
      '今週末限定で、年に一度の最大クリアランスイベントをぜひハーバーアウトレットへ。店内すべての商品が割引され、一部商品は最大70%引きになります。朝8時に早めに開店し、先着50名様には無料のギフトバッグを差し上げます。この年に一度のセールをお見逃しなく。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-03',
    part: 4,
    keyVocabWord: 'confirm',
    tags: [],
    script:
      "Hello, this is Dana from Crestview Dental. I'm reaching out because your appointment, originally set for Tuesday at ten, has to be rescheduled due to a conflict. We do have an opening at the same time on Wednesday. Please call us back whenever it's convenient to confirm the new time.",
    translation:
      'こんにちは、クレストビュー歯科のデイナです。火曜日10時にご予定いただいていたご予約が、都合により変更になったことをお知らせするためにご連絡しました。同じ時間帯の水曜日に空きがございます。ご都合の良いときに折り返しお電話いただき、新しい時間をご確認ください。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-04',
    part: 4,
    keyVocabWord: 'boarding',
    tags: ['数字・時刻'],
    script:
      'Attention passengers booked on flight two-fourteen to Denver: the departure gate has been switched from gate twelve to gate twenty-three. Boarding should start in about twenty minutes, so please head to the new gate right away and have your boarding pass out for the agent.',
    translation:
      'デンバー行き214便をご予約のお客様へ：出発ゲートが12番ゲートから23番ゲートに変更されました。搭乗は約20分後に始まる見込みですので、すぐに新しいゲートへお進みいただき、搭乗券を係員にご準備ください。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-05',
    part: 4,
    keyVocabWord: 'itinerary',
    tags: ['先読み'],
    script:
      "Hello and welcome to the Riverside History Museum. I'm Carlos, and I'll be guiding you for the next hour. Here's how today's itinerary looks: we'll start in the main hall with artifacts more than two hundred years old, then head up to the interactive exhibit on the second floor. Feel free to ask me anything along the way.",
    translation:
      '皆様、リバーサイド歴史博物館へようこそ。私はカルロスと申します。これから1時間、皆様をご案内します。本日の予定はこちらです。まずメインホールで200年以上前の遺物をご覧いただき、その後2階のインタラクティブ展示へ進みます。道中、何か質問があればお気軽にどうぞ。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-06',
    part: 4,
    keyVocabWord: 'revenue',
    tags: ['数字・時刻'],
    script:
      "Good afternoon, everyone. Before wrapping up today's meeting, I'd like to give a brief update on this quarter's numbers. Revenue climbed twelve percent from last quarter, driven mostly by strong performance in retail. Thanks to all of you for the hard work, and I'll share more at next month's review.",
    translation:
      '皆様、こんにちは。本日の会議を終える前に、今四半期の数字について簡単にご報告します。収益は前四半期比で12%増加し、主に小売部門の好調によるものです。皆様のご努力に感謝しますとともに、来月のレビューで詳細をお伝えします。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-07',
    part: 4,
    keyVocabWord: 'streamline',
    tags: ['パラフレーズ照合'],
    script:
      "Thanks, everyone, for joining today. I'm thrilled to introduce our newest product line, built to help small businesses streamline everyday operations. After months of testing and customer input, we're confident this launch will raise the bar in the industry. We'll open the floor for questions after a brief demo.",
    translation:
      '本日はご参加いただきありがとうございます。中小企業の日常業務の効率化を目的とした新しい製品ラインをご紹介できることを嬉しく思います。数ヶ月のテストと顧客からの意見を経て、この発売が業界の水準を上げると確信しています。簡単なデモの後、質疑応答の時間を設けます。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-08',
    part: 4,
    keyVocabWord: 'mortgage',
    tags: ['数字・時刻'],
    script:
      'Thanks for calling Meridian Bank customer service. Press one for your account balance or recent transactions. Press two to report a lost or stolen card. Press three to talk to someone about a loan or mortgage. For anything else, stay on the line and the next available representative will help you.',
    translation:
      'メリディアン銀行カスタマーサービスにお電話いただきありがとうございます。口座残高または最近の取引は1を、カードの紛失・盗難のご報告は2を、ローンまたは住宅ローンについての担当者との通話は3を押してください。その他のお問い合わせは、そのままお待ちいただければ次に対応可能な担当者がご案内します。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-09',
    part: 4,
    keyVocabWord: 'orientation',
    tags: ['先読み'],
    script:
      "Good morning, and welcome to day one of orientation. Over the next couple of days, you'll go over company policy, meet your supervisor, and finish a handful of required training modules. Keep your employee badge visible at all times, and feel free to ask your mentor if anything comes up.",
    translation:
      'おはようございます、オリエンテーション初日へようこそ。今後2日ほどで、会社の方針を確認し、上司と面会し、いくつかの必須研修モジュールを終えていただきます。従業員バッジは常に見えるように着用し、何かあれば遠慮なくメンターにお尋ねください。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-10',
    part: 4,
    keyVocabWord: 'commuter',
    tags: ['数字・時刻'],
    script:
      "Good morning, commuters. This morning, traffic on the downtown expressway is crawling because of ongoing construction near exit seven. Expect delays of up to twenty minutes, and you might want to try the riverside route instead. We'll check back in with another update in thirty minutes.",
    translation:
      'おはようございます、通勤中の皆様。今朝、7番出口付近の継続中の工事により都心部の高速道路の交通は非常にゆっくりです。最大20分の遅延を見込んでいただき、代わりにリバーサイドルートをお試しいただくのもよいかもしれません。30分後にまた最新情報をお伝えします。',
    difficulty: 2,
  },

  // ---- Part2応答文を元にした言い換え（10件） ----
  // 元のPart2正答choiceと完全一致していると学習者が先に答えを覚えてしまうため、
  // 意味・keyVocabWordを保ったまま言い換えている（2026-08-07訂正・T-340・K-87）
  {
    id: 'shadow-p2-01',
    part: 2,
    keyVocabWord: 'warranty',
    tags: ['弱形・連結'],
    script: 'The manufacturer offers a two-year warranty on this model.',
    translation: 'メーカーはこのモデルに2年間の保証を提供しています。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-02',
    part: 2,
    keyVocabWord: 'audit',
    tags: ['弱形・連結'],
    script: 'The audit was completed successfully last week.',
    translation: '監査は先週無事に完了しました。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-03',
    part: 2,
    keyVocabWord: 'feedback',
    tags: ['弱形・連結'],
    script: "We haven't received the client's feedback yet.",
    translation: 'まだ顧客からのフィードバックを受け取っていません。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-04',
    part: 2,
    keyVocabWord: 'technician',
    tags: ['弱形・連結'],
    script: 'A technician was called in and fixed the issue right away.',
    translation: '技術者が呼ばれて、すぐに問題を修理してくれました。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-05',
    part: 2,
    keyVocabWord: 'distributor',
    tags: ['弱形・連結'],
    script: 'The company is looking for a local distributor to expand sales.',
    translation: 'その会社は販売拡大のため、地元の販売代理店を探しています。',
    difficulty: 3,
  },
  {
    id: 'shadow-p2-06',
    part: 2,
    keyVocabWord: 'procurement',
    tags: ['弱形・連結'],
    script: 'The procurement manager is responsible for negotiating with suppliers.',
    translation: '調達担当マネージャーが仕入れ先との交渉を担当しています。',
    difficulty: 3,
  },
  {
    id: 'shadow-p2-07',
    part: 2,
    keyVocabWord: 'warehouse',
    tags: ['弱形・連結'],
    script: 'Let me confirm the stock with the warehouse team.',
    translation: '倉庫チームに在庫を確認してみます。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-08',
    part: 2,
    keyVocabWord: 'budget',
    tags: ['弱形・連結'],
    script: "The budget for that project hasn't been finalized yet.",
    translation: 'そのプロジェクトの予算はまだ確定していません。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-09',
    part: 2,
    keyVocabWord: 'headquarters',
    tags: ['弱形・連結'],
    script: "Headquarters hasn't responded to our request yet.",
    translation: '本社はまだ私たちの依頼に返答していません。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-10',
    part: 2,
    keyVocabWord: 'sponsor',
    tags: ['弱形・連結'],
    script: 'This company has been a longtime sponsor of community events.',
    translation: 'この会社は長年、地域のイベントのスポンサーを務めています。',
    difficulty: 2,
  },
]
