// Part3/4・ディクテーション短文40本のデータ本体（M2・T-62。正本: docs/13 T-62行・3.4節）。
// 全問tags[0]='弱形・連結'固定。1文8〜14語・blanks 1〜3穴（弱形になりやすい機能語を穴にする）。
// tags[1]は穴の内容に応じたサブタグ（T-82・J-41）: 助動詞弱形（would/should/could/will/
// must/can/may/has/have/was/were/is/are等のモーダル・助動詞の弱形化）・冠詞・前置詞
// （a/an/the/to/for/from/at/in/with/within/on/before等の弱形化）・音の連結（and/than/
// if/your/this/her+母音等、隣接語との連結・リエゾンが生じる機能語）の3種から1つを付与する。
// keyVocabWordはS/A/B語彙カード（600語）から選び、scriptに文字列として実在する語のみを使う。
// ワードバンク（正解語＋ダミー計6語）はランタイム側（engine/dictation.ts）が動的に組み立てるため、
// ここではscript/blanksのみを持つ（採点はblanks全穴一致。03の8節・13の3.4節）。

export interface DictationRawEntry {
  keyVocabWord: string
  tags: string[]
  script: string
  blanks: { index: number; answer: string }[]
  explanation: string
  translation: string
  difficulty: number
}

export const DICTATION_ENTRIES_S: DictationRawEntry[] = [
  {
    keyVocabWord: 'shipment',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'She would like to confirm the delivery date for the shipment.',
    blanks: [
      {
        index: 1,
        answer: 'would',
      },
      {
        index: 3,
        answer: 'to',
      },
      {
        index: 8,
        answer: 'for',
      },
    ],
    explanation: '弱形になりやすいwould/to/forを穴にしている。',
    translation: '彼女はその出荷分の配送日を確認したいと考えている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'invoice',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Please send the invoice to our accounting department today.',
    blanks: [
      {
        index: 2,
        answer: 'the',
      },
      {
        index: 4,
        answer: 'to',
      },
    ],
    explanation: '弱形になりやすいthe/toを穴にしている。',
    translation: 'その請求書を今日、当社の経理部に送ってください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'candidate',
    tags: ['弱形・連結', '音の連結'],
    script: 'The candidate has already submitted her resume and references.',
    blanks: [
      {
        index: 2,
        answer: 'has',
      },
      {
        index: 7,
        answer: 'and',
      },
    ],
    explanation: '弱形になりやすいhas/andを穴にしている。',
    translation: 'その候補者はすでに履歴書と推薦状を提出している。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'warehouse',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The boxes were moved from the warehouse this morning.',
    blanks: [
      {
        index: 2,
        answer: 'were',
      },
      {
        index: 4,
        answer: 'from',
      },
    ],
    explanation: '弱形になりやすいwere/fromを穴にしている。',
    translation: 'その箱は今朝、倉庫から移動された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'contract',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The parties should review the contract before they sign it.',
    blanks: [
      {
        index: 2,
        answer: 'should',
      },
      {
        index: 7,
        answer: 'they',
      },
    ],
    explanation: '弱形になりやすいshould/theyを穴にしている。',
    translation: '契約当事者は署名する前にその契約書を確認すべきだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'vendor',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'We could ask the vendor for a better price.',
    blanks: [
      {
        index: 1,
        answer: 'could',
      },
      {
        index: 5,
        answer: 'for',
      },
    ],
    explanation: '弱形になりやすいcould/forを穴にしている。',
    translation: '私たちは業者にもっと良い価格を求めることができる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'renovation',
    tags: ['弱形・連結', '音の連結'],
    script: 'The renovation will take longer than we expected.',
    blanks: [
      {
        index: 2,
        answer: 'will',
      },
      {
        index: 5,
        answer: 'than',
      },
    ],
    explanation: '弱形になりやすいwill/thanを穴にしている。',
    translation: 'その改装は私たちが予想したより長くかかるだろう。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'inspection',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The inspection is scheduled for next Tuesday morning.',
    blanks: [
      {
        index: 2,
        answer: 'is',
      },
      {
        index: 4,
        answer: 'for',
      },
    ],
    explanation: '弱形になりやすいis/forを穴にしている。',
    translation: 'その検査は来週火曜日の朝に予定されている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'employee',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Every employee must complete the survey by Friday.',
    blanks: [
      {
        index: 2,
        answer: 'must',
      },
      {
        index: 6,
        answer: 'by',
      },
    ],
    explanation: '弱形になりやすいmust/byを穴にしている。',
    translation: 'すべての従業員は金曜日までにその調査を完了しなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'presentation',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'She is preparing a presentation for the client.',
    blanks: [
      {
        index: 1,
        answer: 'is',
      },
      {
        index: 3,
        answer: 'a',
      },
    ],
    explanation: '弱形になりやすいis/aを穴にしている。',
    translation: '彼女は顧客向けのプレゼンテーションを準備している。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'budget',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The budget was approved, but it got revised later.',
    blanks: [
      {
        index: 2,
        answer: 'was',
      },
      {
        index: 5,
        answer: 'it',
      },
    ],
    explanation: '弱形になりやすいwas/itを穴にしている。',
    translation: 'その予算は承認されたが、後に修正された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'reservation',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'We made a reservation for four people tonight.',
    blanks: [
      {
        index: 2,
        answer: 'a',
      },
      {
        index: 4,
        answer: 'for',
      },
    ],
    explanation: '弱形になりやすいa/forを穴にしている。',
    translation: '私たちは今夜4人分の予約をした。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'deadline',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The deadline was extended to next Monday afternoon.',
    blanks: [
      {
        index: 2,
        answer: 'was',
      },
      {
        index: 4,
        answer: 'to',
      },
    ],
    explanation: '弱形になりやすいwas/toを穴にしている。',
    translation: '締め切りは来週の月曜日の午後まで延長された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'warranty',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'This product comes with a warranty that lasts two years.',
    blanks: [
      {
        index: 3,
        answer: 'with',
      },
      {
        index: 6,
        answer: 'that',
      },
    ],
    explanation: '弱形になりやすいwith/thatを穴にしている。',
    translation: 'この製品には2年間続く保証が付いている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'supervisor',
    tags: ['弱形・連結', '音の連結'],
    script: 'Ask your supervisor if you have any questions.',
    blanks: [
      {
        index: 3,
        answer: 'if',
      },
      {
        index: 5,
        answer: 'have',
      },
    ],
    explanation: '弱形になりやすいif/haveを穴にしている。',
    translation: '質問があれば、上司に尋ねてください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'brochure',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The brochure is available at the front desk.',
    blanks: [
      {
        index: 2,
        answer: 'is',
      },
      {
        index: 4,
        answer: 'at',
      },
    ],
    explanation: '弱形になりやすいis/atを穴にしている。',
    translation: 'そのパンフレットはフロントデスクで入手できる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'merger',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The merger could be finalized sooner than the board expected.',
    blanks: [
      {
        index: 2,
        answer: 'could',
      },
      {
        index: 6,
        answer: 'than',
      },
    ],
    explanation: '弱形になりやすいcould/thanを穴にしている。',
    translation: 'その合併は取締役会が予想したより早く成立する可能性がある。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'subscription',
    tags: ['弱形・連結', '音の連結'],
    script: 'You can cancel your subscription at any time.',
    blanks: [
      {
        index: 1,
        answer: 'can',
      },
      {
        index: 3,
        answer: 'your',
      },
    ],
    explanation: '弱形になりやすいcan/yourを穴にしている。',
    translation: 'あなたはいつでも購読を解約できる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'voucher',
    tags: ['弱形・連結', '音の連結'],
    script: 'Bring this voucher with you to the store.',
    blanks: [
      {
        index: 1,
        answer: 'this',
      },
      {
        index: 3,
        answer: 'with',
      },
    ],
    explanation: '弱形になりやすいthis/withを穴にしている。',
    translation: 'この割引券を店に持ってきてください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'franchise',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'They are planning to open a new franchise downtown.',
    blanks: [
      {
        index: 1,
        answer: 'are',
      },
      {
        index: 5,
        answer: 'a',
      },
    ],
    explanation: '弱形になりやすいare/aを穴にしている。',
    translation: '彼らは中心街に新しいフランチャイズ店を開く予定だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'itinerary',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'I have sent you the itinerary for next week.',
    blanks: [
      {
        index: 1,
        answer: 'have',
      },
      {
        index: 4,
        answer: 'the',
      },
    ],
    explanation: '弱形になりやすいhave/theを穴にしている。',
    translation: '来週の旅程表をあなたに送りました。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'malfunction',
    tags: ['弱形・連結', '音の連結'],
    script: 'The printer seems to be malfunctioning again this week.',
    blanks: [
      {
        index: 3,
        answer: 'to',
      },
      {
        index: 4,
        answer: 'be',
      },
    ],
    explanation: '弱形になりやすいto/beを穴にしている。',
    translation: 'そのプリンターは今週また故障しているようだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'refund',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'You may request a refund within thirty days.',
    blanks: [
      {
        index: 1,
        answer: 'may',
      },
      {
        index: 5,
        answer: 'within',
      },
    ],
    explanation: '弱形になりやすいmay/withinを穴にしている。',
    translation: 'あなたは30日以内であれば返金を請求できる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'orientation',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'New employees must attend orientation on their first day.',
    blanks: [
      {
        index: 2,
        answer: 'must',
      },
      {
        index: 5,
        answer: 'on',
      },
    ],
    explanation: '弱形になりやすいmust/onを穴にしている。',
    translation: '新入社員は初日にオリエンテーションに出席しなければならない。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'clearance',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The store will hold a clearance sale next weekend.',
    blanks: [
      {
        index: 2,
        answer: 'will',
      },
      {
        index: 4,
        answer: 'a',
      },
    ],
    explanation: '弱形になりやすいwill/aを穴にしている。',
    translation: 'その店は来週末にクリアランスセールを開催する。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'technician',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'A repair technician will arrive before noon tomorrow.',
    blanks: [
      {
        index: 3,
        answer: 'will',
      },
      {
        index: 5,
        answer: 'before',
      },
    ],
    explanation: '弱形になりやすいwill/beforeを穴にしている。',
    translation: '修理の技術者が明日の正午前に到着する予定だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'compliance',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The report must show full compliance with the new regulation.',
    blanks: [
      {
        index: 2,
        answer: 'must',
      },
      {
        index: 6,
        answer: 'with',
      },
    ],
    explanation: '弱形になりやすいmust/withを穴にしている。',
    translation: 'その報告書は新しい規制への完全な遵守を示さなければならない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'applicant',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Only a few applicants were invited for the second round.',
    blanks: [
      {
        index: 1,
        answer: 'a',
      },
      {
        index: 6,
        answer: 'for',
      },
    ],
    explanation: '弱形になりやすいa/forを穴にしている。',
    translation: 'ごく少数の応募者だけが2次選考に招待された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'premises',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Visitors must sign in before entering the premises.',
    blanks: [
      {
        index: 1,
        answer: 'must',
      },
      {
        index: 6,
        answer: 'the',
      },
    ],
    explanation: '弱形になりやすいmust/theを穴にしている。',
    translation: '訪問者は敷地に入る前に署名しなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'supplier',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'We have not received the invoice from the supplier yet.',
    blanks: [
      {
        index: 1,
        answer: 'have',
      },
      {
        index: 6,
        answer: 'from',
      },
    ],
    explanation: '弱形になりやすいhave/fromを穴にしている。',
    translation: '私たちはまだ仕入先から請求書を受け取っていない。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'commute',
    tags: ['弱形・連結', '音の連結'],
    script: 'Her commute takes about an hour each way.',
    blanks: [
      {
        index: 0,
        answer: 'her',
      },
      {
        index: 4,
        answer: 'an',
      },
    ],
    explanation: '弱形になりやすいher/anを穴にしている。',
    translation: '彼女の通勤は片道約1時間かかる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'contractor',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The contractor will send an estimate before the end of the week.',
    blanks: [
      {
        index: 2,
        answer: 'will',
      },
      {
        index: 6,
        answer: 'before',
      },
    ],
    explanation: '弱形になりやすいwill/beforeを穴にしている。',
    translation: 'その請負業者は週末までに見積もりを送るだろう。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'renewal',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The renewal notice was mailed to all members last week.',
    blanks: [
      {
        index: 3,
        answer: 'was',
      },
      {
        index: 5,
        answer: 'to',
      },
    ],
    explanation: '弱形になりやすいwas/toを穴にしている。',
    translation: '更新のお知らせは先週、全会員に郵送された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'feedback',
    tags: ['弱形・連結', '音の連結'],
    script: 'We would appreciate your feedback on the new design.',
    blanks: [
      {
        index: 1,
        answer: 'would',
      },
      {
        index: 3,
        answer: 'your',
      },
    ],
    explanation: '弱形になりやすいwould/yourを穴にしている。',
    translation: '新しいデザインについてのご意見をいただければ幸いです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'shuttle',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Our shuttle leaves every hour from the main entrance.',
    blanks: [
      {
        index: 5,
        answer: 'from',
      },
      {
        index: 6,
        answer: 'the',
      },
    ],
    explanation: '弱形になりやすいfrom/theを穴にしている。',
    translation: '当社のシャトルバスは正面玄関から毎時発車する。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'certification',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Employees must renew their certification every two years.',
    blanks: [
      {
        index: 1,
        answer: 'must',
      },
      {
        index: 5,
        answer: 'every',
      },
    ],
    explanation: '弱形になりやすいmust/everyを穴にしている。',
    translation: '従業員は2年ごとに資格を更新しなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'outlet',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The new outlet opens at nine tomorrow morning.',
    blanks: [
      {
        index: 0,
        answer: 'the',
      },
      {
        index: 4,
        answer: 'at',
      },
    ],
    explanation: '弱形になりやすいthe/atを穴にしている。',
    translation: 'その新しい店舗は明日の朝9時に開店する。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'layover',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Our flight has a two-hour layover in Chicago.',
    blanks: [
      {
        index: 2,
        answer: 'has',
      },
      {
        index: 6,
        answer: 'in',
      },
    ],
    explanation: '弱形になりやすいhas/inを穴にしている。',
    translation: '私たちの便はシカゴで2時間の乗り継ぎがある。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'receipt',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'You should keep the receipt in case you need the warranty.',
    blanks: [
      {
        index: 1,
        answer: 'should',
      },
      {
        index: 5,
        answer: 'in',
      },
    ],
    explanation: '弱形になりやすいshould/inを穴にしている。',
    translation: '保証を利用する場合に備えて、レシートを保管しておくべきだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'consignment',
    tags: ['弱形・連結', '音の連結'],
    script: 'The consignment was delayed because of a customs issue.',
    blanks: [
      {
        index: 2,
        answer: 'was',
      },
      {
        index: 4,
        answer: 'because',
      },
    ],
    explanation: '弱形になりやすいwas/becauseを穴にしている。',
    translation: 'その委託荷物は税関の問題のため遅延した。',
    difficulty: 4,
  },
  // 【T-341（K-79）追加】機能語の弱形だけでなく、内容語の穴・複数語ブロックの穴も混ぜる。
  // 内容語の穴は文脈推測ではなく語そのものの聞き取り力を試す（ワードバンクのダミーは
  // engine/dictation.tsのbuildWordBankが内容語プールから選ぶ。混同を避けるため機能語とは
  // 別クラス扱いにしている）
  {
    keyVocabWord: 'courier',
    tags: ['内容語'],
    script: 'The courier delivered the package to the office before noon.',
    blanks: [
      {
        index: 1,
        answer: 'courier',
      },
    ],
    explanation:
      '文脈からの推測ではなく、内容語courierの音そのものを正確に聞き取れるかを試す穴にしている。',
    translation: '配達員はその荷物を正午前にオフィスへ届けた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'backlog',
    tags: ['内容語'],
    script: 'The warehouse is dealing with a large backlog.',
    blanks: [
      {
        index: 7,
        answer: 'backlog',
      },
    ],
    explanation:
      '文脈からの推測ではなく、内容語backlogの音そのものを正確に聞き取れるかを試す穴にしている。',
    translation: 'その倉庫は大量の滞貨に対応している。',
    difficulty: 3,
  },
  // 隣接する2語をひと続きの連結音として穴にする（複数語ブロック）
  {
    keyVocabWord: 'premium',
    tags: ['弱形・連結', '複数語ブロック'],
    script: 'Customers have to pay a premium for next-day delivery.',
    blanks: [
      {
        index: 1,
        answer: 'have',
      },
      {
        index: 2,
        answer: 'to',
      },
    ],
    explanation:
      '"have to"は/hæftə/のように連結して発音されやすいため、隣接する2語をひと続きのブロックとして穴にしている。',
    translation: '顧客は翌日配達のために割増料金を払わなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'overhead',
    tags: ['弱形・連結', '複数語ブロック'],
    script: 'The company used to spend more on overhead each month.',
    blanks: [
      {
        index: 2,
        answer: 'used',
      },
      {
        index: 3,
        answer: 'to',
      },
    ],
    explanation:
      '"used to"は/juːstə/のように連結して発音されやすいため、隣接する2語をひと続きのブロックとして穴にしている。',
    translation: 'その会社はかつて、毎月もっと諸経費をかけていた。',
    difficulty: 3,
  },
]
