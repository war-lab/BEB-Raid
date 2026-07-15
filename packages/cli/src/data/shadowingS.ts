// シャドーイング素材30本のデータ本体（M2・T-62。正本: docs/13 T-62行・3.5節）。
// 新規執筆はしない（3.10節: 「Part3/4スクリプトから20本＋既存Part2の応答文から10本を流用」）。
// 内訳:
// - p3-extract-01〜10: part34SetsS.ts の Part3（会話）10セットから、各セットで最も長く
//   内容的にまとまった1話者ぶんの発話を抜粋（話者表記"A:"/"B:"は除去）。抜粋元のkeyVocabWordが
//   その抜粋内に実在することを確認済み。
// - p4-verbatim-01〜10: part34SetsS.ts の Part4（単独トーク）10セットのscriptをそのまま流用
//   （元々単独話者の連続発話のため加工不要）。
// - p2-response-01〜10: part2QuestionsS.ts/part2QuestionsS2.tsの応答文（" — "以降）のうち、
//   S/A/B語彙カード（600語）の語を含むものを10件抜粋。
// timingはプレースホルダ（cli/src/timing.tsのestimateWordTimingsを、このファイルの推定
// durationMsに基づいて生成。T-64のTTS実測時にttsBatch.tsが実測durationMsから再計算し
// 上書きする＝T-46のshadowing分岐と同じ扱い。ここではスキーマの検証条件を満たす値であれば良い）。

export interface ShadowingRawEntry {
  id: string
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
    keyVocabWord: 'reschedule',
    tags: ['先読み'],
    script:
      'Actually, I just found out I have a client call at the same time. Could we reschedule it to Thursday afternoon?',
    translation:
      '実はちょうど、同じ時間にクライアントとの電話が入っていることが分かりました。木曜日の午後に変更できますか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-02',
    keyVocabWord: 'malfunction',
    tags: ['意図推定'],
    script:
      "The shared server seems to be malfunctioning again — I can't access any of the project files.",
    translation: '共有サーバーがまた不調のようです—プロジェクトファイルに一切アクセスできません。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-03',
    keyVocabWord: 'submit',
    tags: ['パラフレーズ照合'],
    script: "Let's submit the order today so the items arrive before the weekend.",
    translation: '今日中に注文を提出しましょう、そうすれば商品が週末前に届きます。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-04',
    keyVocabWord: 'backlog',
    tags: ['意図推定'],
    script: "They mentioned a warehouse backlog, but they couldn't give a firm delivery date.",
    translation: '彼らは倉庫の滞積を理由に挙げましたが、確実な配送日は教えてもらえませんでした。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-05',
    keyVocabWord: 'candidate',
    tags: ['先読み'],
    script: 'What did you think of the candidate we interviewed this morning?',
    translation: '今朝面接したその候補者について、どう思いましたか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-06',
    keyVocabWord: 'attendee',
    tags: ['パラフレーズ照合'],
    script: "I'll send a quick survey to the attendee list this afternoon.",
    translation: '今日の午後、参加者リストに簡単なアンケートを送ります。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-07',
    keyVocabWord: 'synchronize',
    tags: ['意図推定'],
    script: 'Yes, IT said all our files will automatically synchronize before the update starts.',
    translation:
      'ええ、ITによると更新が始まる前に私たちのファイルは全て自動的に同期されるそうです。',
    difficulty: 3,
  },
  {
    id: 'shadow-p3-08',
    keyVocabWord: 'itinerary',
    tags: ['先読み'],
    script: 'Have you finished putting together my itinerary for the conference next month?',
    translation: '来月のカンファレンスに向けた私の旅程はもうできましたか。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-09',
    keyVocabWord: 'restock',
    tags: ['パラフレーズ照合'],
    script: 'I know, our best-selling items keep selling out faster than we can restock them.',
    translation:
      'そうなんです、うちの売れ筋商品は補充が追いつかないほど早く売り切れてしまうんです。',
    difficulty: 2,
  },
  {
    id: 'shadow-p3-10',
    keyVocabWord: 'renewal',
    tags: ['意図推定'],
    script:
      'The overall cost is about the same, but they want to shorten the renewal period to six months.',
    translation: '全体のコストはほぼ同じですが、更新期間を6か月に短縮したいそうです。',
    difficulty: 4,
  },

  // ---- Part4トークの丸ごと流用（10件） ----
  {
    id: 'shadow-p4-01',
    keyVocabWord: 'tenant',
    tags: ['先読み'],
    script:
      'Attention all building tenants: the east elevator will be out of service for routine maintenance from nine to eleven tomorrow morning. During that time, please use the west elevator or the stairs near the lobby. We apologize for any inconvenience and expect the elevator to be back in service by early afternoon.',
    translation:
      '全入居者の皆様へ：東側のエレベーターは明日午前9時から11時まで定期点検のため使用できません。その間は西側のエレベーターまたはロビー近くの階段をご利用ください。ご不便をおかけして申し訳ございませんが、午後早くには運転を再開する見込みです。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-02',
    keyVocabWord: 'merchandise',
    tags: ['パラフレーズ照合'],
    script:
      "This weekend only, visit Harbor Outlet for our biggest clearance sale of the year. Every item in the store is marked down, with select merchandise up to seventy percent off. Doors open early at eight, and the first fifty customers will receive a complimentary gift bag. Don't miss this once-a-year event.",
    translation:
      '今週末限定で、年に一度の最大クリアランスセールをハーバーアウトレットで開催中です。全商品が値下げされ、一部商品は最大70%オフになります。開店は朝8時で、先着50名様には無料のギフトバッグを差し上げます。この年に一度のイベントをお見逃しなく。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-03',
    keyVocabWord: 'confirm',
    tags: ['意図推定'],
    script:
      "Hi, this is Dana calling from Crestview Dental. I'm calling to let you know that your appointment originally scheduled for Tuesday at ten needs to be moved due to a scheduling conflict. We have an opening on Wednesday at the same time. Please call us back at your convenience to confirm.",
    translation:
      'こんにちは、クレストビュー歯科のデイナです。火曜日10時にご予定いただいていたご予約が、日程の都合により変更が必要になったことをお知らせするためにお電話しました。同じ時間帯の水曜日に空きがございます。ご都合の良い時に折り返しお電話いただき、ご確認をお願いいたします。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-04',
    keyVocabWord: 'boarding',
    tags: ['数字・時刻'],
    script:
      'Attention passengers on flight two-fourteen to Denver: your departure gate has changed from gate twelve to gate twenty-three. Boarding will begin in approximately twenty minutes. Please proceed to the new gate as soon as possible, and have your boarding pass ready for the agent.',
    translation:
      'デンバー行き214便をご利用のお客様へ：出発ゲートが12番ゲートから23番ゲートに変更になりました。搭乗は約20分後に開始します。できるだけ早く新しいゲートへお進みいただき、搭乗券をご準備の上、係員にお見せください。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-05',
    keyVocabWord: 'itinerary',
    tags: ['先読み'],
    script:
      "Welcome, everyone, to the Riverside History Museum. My name is Carlos, and I'll be your guide for the next hour. Let me walk you through today's itinerary: we'll begin in the main hall, where you'll see artifacts dating back over two hundred years, before moving on to the interactive exhibit on the second floor. Please feel free to ask questions along the way.",
    translation:
      '皆様、リバーサイド歴史博物館へようこそ。私はカルロスと申します。これから1時間、皆様のガイドを務めます。まず本日の予定をご案内します。まずはメインホールから始め、200年以上前の遺物をご覧いただいた後、2階のインタラクティブ展示へと進みます。途中で質問がございましたら、お気軽にどうぞ。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-06',
    keyVocabWord: 'revenue',
    tags: ['数字・時刻'],
    script:
      "Good afternoon, everyone. Before we wrap up today's meeting, I want to share a quick update on our quarterly results. Revenue grew twelve percent compared to last quarter, largely thanks to strong sales in the retail division. I want to thank each of you for your hard work, and I look forward to sharing more details at next month's review.",
    translation:
      '皆様、こんにちは。本日の会議を締めくくる前に、四半期業績について簡単にご報告します。収益は前四半期比で12%増加し、これは主に小売部門の好調な売上によるものです。皆様の努力に感謝申し上げるとともに、来月のレビューで詳細をご報告できることを楽しみにしています。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-07',
    keyVocabWord: 'streamline',
    tags: ['パラフレーズ照合'],
    script:
      "Thank you all for coming today. I'm excited to introduce our newest product line, designed specifically to help small businesses streamline their daily operations. After months of testing and customer feedback, we're confident this launch will set a new standard in the industry. We'll be taking questions after a short demonstration.",
    translation:
      '本日はお越しいただきありがとうございます。中小企業の日常業務の効率化を目的とした、新しい製品ラインをご紹介できることを大変嬉しく思います。数ヶ月にわたるテストと顧客からのフィードバックを経て、この発売が業界に新たな標準をもたらすと確信しています。簡単なデモンストレーションの後、質疑応答の時間を設けます。',
    difficulty: 3,
  },
  {
    id: 'shadow-p4-08',
    keyVocabWord: 'mortgage',
    tags: ['数字・時刻'],
    script:
      'Thank you for calling Meridian Bank customer service. For account balance and recent transactions, press one. To report a lost or stolen card, press two. To speak with a representative about a loan or mortgage, press three. For any other inquiry, please stay on the line and the next available representative will assist you.',
    translation:
      'メリディアン銀行カスタマーサービスにお電話いただきありがとうございます。口座残高および最近の取引については1を、カードの紛失・盗難のご報告は2を、ローンまたは住宅ローンに関する担当者との通話は3を押してください。その他のお問い合わせは、そのままお待ちいただければ、次に対応可能な担当者がご案内いたします。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-09',
    keyVocabWord: 'orientation',
    tags: ['先読み'],
    script:
      "Good morning, and welcome to your first day of orientation. Over the next two days, you'll learn about our company policies, meet your department supervisor, and complete a few required training modules. Please keep your employee badge visible at all times, and don't hesitate to ask your mentor if you have any questions.",
    translation:
      'おはようございます、オリエンテーション初日へようこそ。今後2日間で、会社の規定について学び、部署の上司と面会し、いくつかの必須研修モジュールを修了していただきます。従業員バッジは常に見えるように着用してください。ご質問があれば、遠慮なくメンターにお尋ねください。',
    difficulty: 2,
  },
  {
    id: 'shadow-p4-10',
    keyVocabWord: 'commuter',
    tags: ['数字・時刻'],
    script:
      "Good morning, commuters. Traffic on the downtown expressway is moving slowly this morning due to ongoing construction near exit seven. Drivers should expect delays of up to twenty minutes and may want to consider the riverside route as an alternative. We'll have another update in thirty minutes.",
    translation:
      'おはようございます、通勤中の皆様。7番出口付近の継続中の工事により、都心部の高速道路の交通は今朝ゆっくりとした流れになっています。ドライバーの皆様は最大20分の遅延を見込んでいただき、代替としてリバーサイドルートのご利用もご検討ください。30分後にまた最新情報をお伝えします。',
    difficulty: 2,
  },

  // ---- Part2応答文の流用（10件） ----
  {
    id: 'shadow-p2-01',
    keyVocabWord: 'warranty',
    tags: ['弱形・連結'],
    script: 'It comes with a two-year warranty.',
    translation: '2年間の保証が付いています。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-02',
    keyVocabWord: 'audit',
    tags: ['弱形・連結'],
    script: 'Yes, we passed the audit last week.',
    translation: 'はい、先週監査に合格しました。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-03',
    keyVocabWord: 'feedback',
    tags: ['弱形・連結'],
    script: 'We are still waiting on client feedback.',
    translation: 'まだ顧客からのフィードバックを待っています。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-04',
    keyVocabWord: 'technician',
    tags: ['弱形・連結'],
    script: 'Yes, but the technician already fixed it.',
    translation: 'はい、でも技術者がもう修理してくれました。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-05',
    keyVocabWord: 'distributor',
    tags: ['弱形・連結'],
    script: 'We plan to partner with a local distributor.',
    translation: '地元の販売代理店と提携する予定です。',
    difficulty: 3,
  },
  {
    id: 'shadow-p2-06',
    keyVocabWord: 'procurement',
    tags: ['弱形・連結'],
    script: 'Our procurement manager will handle it.',
    translation: '調達担当マネージャーが対応します。',
    difficulty: 3,
  },
  {
    id: 'shadow-p2-07',
    keyVocabWord: 'warehouse',
    tags: ['弱形・連結'],
    script: "I'll check with the warehouse right away.",
    translation: 'すぐに倉庫に確認します。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-08',
    keyVocabWord: 'budget',
    tags: ['弱形・連結'],
    script: "We're still discussing the budget for it.",
    translation: 'その予算についてはまだ協議中です。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-09',
    keyVocabWord: 'headquarters',
    tags: ['弱形・連結'],
    script: "We're still waiting to hear from headquarters.",
    translation: 'まだ本社からの連絡を待っています。',
    difficulty: 2,
  },
  {
    id: 'shadow-p2-10',
    keyVocabWord: 'sponsor',
    tags: ['弱形・連結'],
    script: 'The company has sponsored local events for years.',
    translation: 'その会社は長年、地域のイベントに協賛してきました。',
    difficulty: 2,
  },
]
