// Part7単一（text_passage）URL・メールアドレスを含む題材の追加データ（T-273。正本:
// docs/30_改修計画_全量レビュー棚卸し.md 17節「T-273の位置づけ」、docs/24 3.1節・3.6節）。
//
// 【背景】既存の初期在庫（part7SinglePassagesS.ts・全40セット）を全数走査してもURL・
// メールアドレス・20文字以上の連続トークンを含む設問が0件だった。第一にT-227
// （overflow-wrap: anywhereによる折返しの是正）を実データで検証できない。第二に、
// 実際のTOEIC Part7はWebページ・メール・広告を題材とし、URLとメールアドレスが頻出する
// ため、既存コンテンツは本試験より題材が狭い。本ファイルはその穴を埋める追加セットで、
// part7SinglePassagesS.ts本体（既存配信パックpack-reading-p7single-s-001のソース）は
// 一切変更しない。
//
// 【配信しない（ADR 0006 判断5）】本ファイルは
// content/drafts/text-passage-p7-url-s.jsonl（既存の配信パックとは別の新規ドラフトパス）
// にのみ出力する。build.ts の PACK_DEFINITIONS には登録しない＝人手レビュー（H-R1）を
// 経るまで配信対象外（T-144と同じ「生成側と在庫だけ実装し、配信は保留」の扱い）。
//
// 【実在しないドメイン・アドレス】すべて `*.example.com` を使う（RFC 2606の予約ドメイン。
// 実在の企業・組織との衝突を避ける）。架空の社名（Harborcrest／Northbridge等）を
// サブドメインに使い、TOEIC Part7らしい業務文脈を持たせている。
//
// 【390px幅の折返し検証（T-227向け）】p7url-002 のWebサイトURLとメールアドレスは、
// ハイフン・スラッシュを含まない50文字超の連続トークン
// （internationallogisticsexpo2026registration.example.com）にしている。この形式は
// 単語区切り・改行可能点を持たないため、`overflow-wrap: anywhere` が無いと390px幅の
// 画面で確実にはみ出す。

import type { Part7SingleRawEntry } from './part7SinglePassagesS.js'

export const PART7_SINGLE_URL_ENTRIES_S: Part7SingleRawEntry[] = [
  {
    setId: 'p7url-001',
    difficulty: 3,
    tags: ['スキャン', '推論'],
    keyVocabWords: ['shipment', 'invoice'],
    passageKind: 'email',
    passageText:
      'Subject: Your Shipment Has Left the Warehouse — Invoice #48213\n\nDear Ms. Tanaka,\n\nYour recent shipment from Harborcrest Home Goods has left our warehouse and is on its way. You can track the delivery status at any time using the link below.\n\nTracking: https://track.harborcrestshipping.example.com/orders/48213\n\nYour invoice is attached as a PDF and is also available for download from your account page. If any item arrives damaged, please contact our support team within seven days at support@harborcrestshipping.example.com and include your order number. Refunds for damaged items are typically processed within five business days of the reply.\n\nThank you for shopping with us.\n\nCustomer Care Team, Harborcrest Home Goods',
    subQuestions: [
      {
        question: 'What is the purpose of this email?',
        correctText: 'To notify a customer that a shipment is on its way',
        distractors: [
          'To request payment for an order',
          'To cancel a previous order',
          'To advertise a new product line',
        ],
        explanation:
          '本文冒頭で"Your recent shipment... has left our warehouse and is on its way"と述べており、発送済みであることを知らせるための連絡である。支払い要求・注文取消・新製品広告への言及はない。',
        translation: 'このメールの目的は何ですか。',
      },
      {
        question: 'What should the customer do if an item arrives damaged?',
        correctText: 'Contact support within seven days and include the order number',
        distractors: [
          'Return the item to the nearest store',
          'Request a replacement through the tracking link',
          'Wait for a follow-up call from customer care',
        ],
        explanation:
          '本文に"please contact our support team within seven days... and include your order number"と明記されている。',
        translation: '商品が破損して届いた場合、顧客は何をすべきですか。',
      },
      {
        question: 'According to the email, what is attached?',
        correctText: 'An invoice',
        distractors: ['A shipping label', 'A product manual', 'A discount coupon'],
        explanation: '本文に"Your invoice is attached as a PDF"と明記されている。',
        translation: 'このメールには何が添付されていますか。',
      },
    ],
  },
  {
    setId: 'p7url-002',
    difficulty: 3,
    tags: ['スキャン', '語彙推測'],
    keyVocabWords: ['registration', 'complimentary', 'voucher'],
    passageKind: 'advertisement',
    passageText:
      'REGISTER FOR THE ANNUAL LOGISTICS EXPO\n\nJoin professionals from across the shipping and logistics industry for a full day of workshops, keynote speakers, and networking. The event will be held on September 12 at the Riverside Convention Center.\n\nEarly registration (before August 20) includes a complimentary lunch voucher and priority seating. Seats are limited, so early registration is recommended.\n\nTo register, visit our website and complete the online form. For groups of five or more, please contact our events coordinator directly for a discounted rate.\n\nWebsite: internationallogisticsexpo2026registration.example.com\nContact: eventscoordinator@internationallogisticsexpo2026registration.example.com',
    subQuestions: [
      {
        question: 'What is being advertised?',
        correctText: 'A logistics industry conference',
        distractors: [
          'A logistics job fair',
          'A logistics software product',
          'A logistics training certification',
        ],
        explanation:
          '本文全体が「ワークショップ・基調講演・ネットワーキング」を伴う一日がかりのイベント（Expo）の告知であり、求人・ソフトウェア製品・研修資格の話ではない。',
        translation: '何が宣伝されていますか。',
      },
      {
        question: 'What benefit do early registrants receive?',
        correctText: 'A complimentary lunch voucher and priority seating',
        distractors: [
          'A discount on hotel accommodations',
          "A free copy of the keynote speaker's book",
          'Reimbursement for travel expenses',
        ],
        explanation:
          '本文に"Early registration... includes a complimentary lunch voucher and priority seating"と明記されている。',
        translation: '早期登録者はどのような特典を受けますか。',
      },
      {
        question: 'What should someone do to receive a discounted rate for a large group?',
        correctText: 'Contact the events coordinator directly',
        distractors: [
          'Register online before August 20',
          'Mail a written request to the venue',
          'Call the Riverside Convention Center',
        ],
        explanation:
          '本文に"For groups of five or more, please contact our events coordinator directly for a discounted rate"と明記されている。',
        translation: '団体割引を受けるにはどうすればよいですか。',
      },
    ],
  },
  {
    setId: 'p7url-003',
    difficulty: 2,
    tags: ['スキャン'],
    keyVocabWords: ['maintenance', 'inquiry'],
    passageKind: 'notice',
    passageText:
      'SYSTEM MAINTENANCE NOTICE\n\nThe employee portal will be unavailable for scheduled maintenance from 11 p.m. Friday, March 6, until 5 a.m. Saturday, March 7. During this time, employees will not be able to submit timesheets, view pay statements, or update personal information.\n\nA status page will be updated throughout the maintenance window at status.internalportal.example.com. If the portal is still unavailable after 6 a.m. Saturday, please send an inquiry to ithelpdesk@internalportal.example.com rather than submitting a new ticket through the portal itself.\n\nWe apologize for any inconvenience this may cause.',
    subQuestions: [
      {
        question: 'What is the purpose of the notice?',
        correctText: 'To inform employees of scheduled system downtime',
        distractors: [
          'To report the results of a completed inspection',
          'To announce a permanent change in pay schedule',
          'To request volunteers for a new project',
        ],
        explanation:
          '本文冒頭で"will be unavailable for scheduled maintenance"と述べており、今後予定されているシステム停止を知らせる案内である。',
        translation: 'この案内の目的は何ですか。',
      },
      {
        question:
          'What should employees do if the portal is still unavailable after 6 a.m. Saturday?',
        correctText: 'Send an email inquiry to the help desk',
        distractors: [
          'Submit a new ticket through the portal',
          'Call the main office line',
          'Wait until Monday to check again',
        ],
        explanation:
          '本文に"please send an inquiry to ithelpdesk@internalportal.example.com rather than submitting a new ticket through the portal itself"と明記されている。',
        translation: '土曜午前6時を過ぎてもポータルが利用できない場合、従業員は何をすべきですか。',
      },
    ],
  },
  {
    setId: 'p7url-004',
    difficulty: 2,
    tags: ['推論'],
    keyVocabWords: ['itinerary'],
    passageKind: 'chat',
    passageText:
      "Priya Nair [2:15 p.m.]\nHey, did the client send over the revised itinerary yet?\n\nSam Osei [2:17 p.m.]\nJust got it. I uploaded it to the shared drive — you can view it at files.northbridgeconsulting.example.com/itinerary-v3.\n\nPriya Nair [2:19 p.m.]\nThanks. Can you also email me a copy in case I can't get into the drive from my phone?\n\nSam Osei [2:20 p.m.]\nSure, sending it to your inbox now from sam.osei@northbridgeconsulting.example.com.",
    subQuestions: [
      {
        question: 'What are Priya Nair and Sam Osei mainly discussing?',
        correctText: 'A document that a client recently sent',
        distractors: [
          'A meeting that was recently canceled',
          'A problem with the shared drive login',
          "A change in the client's travel plans",
        ],
        explanation:
          '会話はクライアントから届いた改訂版の旅程表（itinerary）についてのものであり、会議の中止・共有ドライブへのログイン問題・旅行計画の変更自体には触れていない。',
        translation: 'Priya NairとSam Oseiは主に何について話していますか。',
      },
      {
        question: 'At 2:19 p.m., why does Priya Nair ask for a copy by email?',
        correctText: 'She may not be able to access the shared drive from her phone',
        distractors: [
          'She does not have permission to view the shared drive',
          'She wants a printed copy for a meeting',
          'She is unable to open the file format on the drive',
        ],
        explanation:
          '直前で"in case I can\'t get into the drive from my phone"と述べているため、携帯からドライブにアクセスできない場合に備えてのことだと分かる。',
        translation: '午後2時19分にPriya Nairがメールでコピーを求めているのはなぜですか。',
      },
    ],
  },
]
