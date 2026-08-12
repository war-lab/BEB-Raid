// Aランク200語の語彙カード内容（M2・T-59。正本: docs/04 2節(vocab_card)、docs/02 4節）。
// front=単語（freqListWordsA.tsと同じ200語）/ phrase=短いビジネス文脈フレーズ / back=和訳。
// phraseAudioは生成段階では予約パス（T-64でTTS音声を実際に生成し差し替える）。
// 既存教材（金のフレーズ等）を一切参照せず、TOEICのビジネスシーンで自然に使われる
// 一般的な用例文として新規に書き下ろした（T-26と同方針）。
import type { VocabCardEntry } from './vocabCardsS.js'

export const VOCAB_CARDS_A: VocabCardEntry[] = [
  // --- 会議・文書・オフィスコミュニケーション ---
  {
    word: 'summarize',
    back: '要約する',
    phrase: "Could you summarize the client's main concerns in one paragraph?",
  },
  {
    word: 'revise',
    back: '修正する',
    phrase: 'We need to revise the proposal before the client meeting.',
  },
  {
    word: 'outline',
    back: '概要',
    phrase: 'The manager gave a brief outline of the new marketing strategy.',
  },
  {
    word: 'transcript',
    back: '書き起こし',
    phrase: 'A transcript of the conference call was sent to all attendees.',
  },
  {
    word: 'appendix',
    back: '付録',
    phrase: 'Detailed figures are provided in the appendix of the report.',
  },
  {
    word: 'footnote',
    back: '脚注',
    phrase: 'The footnote explains why the sales figures were adjusted.',
  },
  {
    word: 'circulate',
    back: '回覧する',
    phrase: 'Please circulate the updated schedule to the entire team.',
  },
  {
    word: 'disseminate',
    back: '周知する',
    phrase: 'The HR department will disseminate the new policy by email.',
  },
  {
    word: 'briefing',
    back: '説明会',
    phrase: 'All new employees must attend a safety briefing on their first day.',
  },
  {
    word: 'consensus',
    back: '総意',
    phrase: 'The board reached a consensus on the merger after a long discussion.',
  },
  {
    word: 'unanimous',
    back: '全会一致の',
    phrase: "The committee's decision to approve the budget was unanimous.",
  },
  {
    word: 'ratify',
    back: '批准する',
    phrase: 'Shareholders will vote to ratify the new contract next week.',
  },
  {
    word: 'amendment',
    back: '修正条項',
    phrase: 'The lawyer added an amendment to clarify the delivery terms.',
  },
  {
    word: 'addendum',
    back: '追加条項',
    phrase: 'An addendum listing the extra services was attached to the contract.',
  },
  {
    word: 'disclose',
    back: '開示する',
    phrase: 'The company must disclose any financial risks to investors.',
  },
  {
    word: 'confidential',
    back: '機密の',
    phrase: 'This document is confidential and should not be shared outside the team.',
  },
  {
    word: 'proofread',
    back: '校正する',
    phrase: 'Please proofread the press release before it goes out.',
  },

  // --- 人事・採用・研修 ---
  {
    word: 'qualification',
    back: '資格',
    phrase: 'A degree in accounting is a minimum qualification for this position.',
  },
  {
    word: 'credential',
    back: '資格証明',
    phrase: 'Please submit your credentials along with your application.',
  },
  {
    word: 'onboarding',
    back: '新人研修',
    phrase: 'The onboarding program lasts two weeks for all new hires.',
  },
  {
    word: 'mentor',
    back: '助言者',
    phrase: 'Every new employee is assigned a mentor for the first month.',
  },
  {
    word: 'probation',
    back: '試用期間',
    phrase: 'New staff members are on probation for the first three months.',
  },
  {
    word: 'appraisal',
    back: '人事評価',
    phrase: 'Your annual appraisal will be scheduled for next Monday.',
  },
  {
    word: 'workforce',
    back: '労働力',
    phrase: 'The company plans to expand its workforce by 20 percent this year.',
  },
  {
    word: 'personnel',
    back: '職員',
    phrase: 'All personnel must complete the training by the end of the month.',
  },
  {
    word: 'seniority',
    back: '勤続年数',
    phrase: 'Vacation days are allocated based on seniority.',
  },
  { word: 'tenure', back: '在職期間', phrase: 'She has over ten years of tenure with the firm.' },
  {
    word: 'dismiss',
    back: '解雇する',
    phrase: 'The manager had to dismiss two employees due to budget cuts.',
  },
  {
    word: 'dismissal',
    back: '解雇',
    phrase: 'His dismissal came as a shock to the rest of the team.',
  },
  {
    word: 'layoff',
    back: '一時解雇',
    phrase: 'The factory announced a layoff affecting fifty workers.',
  },
  {
    word: 'severance',
    back: '退職金',
    phrase: 'Employees who are laid off will receive a severance package.',
  },
  {
    word: 'pension',
    back: '年金',
    phrase: 'The company offers a generous pension plan for long-term staff.',
  },
  {
    word: 'entitlement',
    back: '受給資格',
    phrase: 'Check your entitlement to paid leave before booking a vacation.',
  },
  {
    word: 'headcount',
    back: '人員数',
    phrase: 'The department needs approval to increase its headcount.',
  },

  // --- 財務・会計・契約 ---
  {
    word: 'liquidity',
    back: '流動性',
    phrase: 'The company improved its liquidity by collecting overdue invoices.',
  },
  {
    word: 'solvency',
    back: '支払い能力',
    phrase: "Auditors questioned the firm's solvency after the losses.",
  },
  {
    word: 'depreciation',
    back: '減価償却',
    phrase: 'The depreciation of the equipment is calculated over five years.',
  },
  {
    word: 'amortize',
    back: '分割償却する',
    phrase: 'The firm will amortize the cost of the software over three years.',
  },
  {
    word: 'ledger',
    back: '帳簿',
    phrase: 'All transactions must be recorded in the general ledger.',
  },
  {
    word: 'reconcile',
    back: '照合する',
    phrase: 'The accountant needs to reconcile the bank statement with the ledger.',
  },
  {
    word: 'reconciliation',
    back: '照合',
    phrase: 'Monthly reconciliation of accounts is required by policy.',
  },
  {
    word: 'arrears',
    back: '未払い金',
    phrase: "The tenant's rent payments are three months in arrears.",
  },
  {
    word: 'surplus',
    back: '黒字',
    phrase: 'The department reported a budget surplus this quarter.',
  },
  {
    word: 'deficit',
    back: '赤字',
    phrase: 'The company posted a deficit due to rising shipping costs.',
  },
  {
    word: 'overhead',
    back: '諸経費',
    phrase: 'Reducing overhead costs is a priority for the new CFO.',
  },
  {
    word: 'capital',
    back: '資本',
    phrase: 'The startup raised enough capital to open a second office.',
  },
  {
    word: 'equity',
    back: '自己資本',
    phrase: 'Investors were offered equity in exchange for funding.',
  },
  {
    word: 'dividend',
    back: '配当金',
    phrase: 'Shareholders will receive a dividend at the end of the fiscal year.',
  },
  {
    word: 'valuation',
    back: '評価額',
    phrase: 'The valuation of the company rose after the acquisition news.',
  },
  {
    word: 'underwrite',
    back: '引き受ける',
    phrase: 'The bank agreed to underwrite the loan for the new factory.',
  },
  {
    word: 'collateral',
    back: '担保',
    phrase: 'The property was used as collateral for the business loan.',
  },

  // --- 製造・品質管理・物流 ---
  {
    word: 'prototype',
    back: '試作品',
    phrase: 'Engineers tested the prototype before mass production began.',
  },
  {
    word: 'specification',
    back: '仕様書',
    phrase: 'The parts must meet the exact specification provided by the client.',
  },
  {
    word: 'tolerance',
    back: '許容誤差',
    phrase: 'Each component is manufactured within a strict tolerance.',
  },
  {
    word: 'calibrate',
    back: '較正する',
    phrase: 'Technicians calibrate the machines every morning before the shift.',
  },
  {
    word: 'durability',
    back: '耐久性',
    phrase: 'The new packaging was chosen for its durability during shipping.',
  },
  {
    word: 'batch',
    back: '一括生産分',
    phrase: 'The first batch of products failed quality inspection.',
  },
  {
    word: 'consignment',
    back: '委託貨物',
    phrase: 'The consignment was delayed at customs for two days.',
  },
  {
    word: 'procure',
    back: '調達する',
    phrase: 'The purchasing team will procure raw materials from a new supplier.',
  },
  {
    word: 'backlog',
    back: '未処理の受注',
    phrase: 'The factory is working overtime to clear the order backlog.',
  },
  {
    word: 'bottleneck',
    back: '障害箇所',
    phrase: 'Slow approval processes have become a bottleneck in production.',
  },
  {
    word: 'throughput',
    back: '処理能力',
    phrase: 'The new assembly line increased throughput by thirty percent.',
  },
  {
    word: 'refurbish',
    back: '改修する',
    phrase: 'The company plans to refurbish the old warehouse next year.',
  },
  {
    word: 'recall',
    back: '製品回収',
    phrase: 'The manufacturer issued a recall after discovering a safety defect.',
  },
  {
    word: 'obsolete',
    back: '旧式の',
    phrase: 'The old machinery became obsolete after the upgrade.',
  },
  {
    word: 'perishable',
    back: '傷みやすい',
    phrase: 'Perishable goods must be shipped in refrigerated containers.',
  },
  {
    word: 'bulk',
    back: '大量（にまとめて）',
    phrase: 'Buying supplies in bulk reduces the unit cost significantly.',
  },
  {
    word: 'stockpile',
    back: '備蓄',
    phrase: 'The warehouse keeps a stockpile of parts in case of shortages.',
  },

  // --- マーケティング・広告・販売 ---
  {
    word: 'demographic',
    back: '人口層・客層',
    phrase: 'The campaign targets a younger demographic than before.',
  },
  {
    word: 'niche',
    back: '隙間市場',
    phrase: 'The company found success by focusing on a niche market.',
  },
  {
    word: 'benchmark',
    back: '基準',
    phrase: "Sales figures are compared against last year's benchmark.",
  },
  {
    word: 'outreach',
    back: '働きかけ',
    phrase: 'The marketing team launched an outreach program for small businesses.',
  },
  {
    word: 'sponsorship',
    back: '協賛',
    phrase: 'The firm secured a sponsorship deal with the local sports team.',
  },
  {
    word: 'sponsor',
    back: '協賛する',
    phrase: 'Several companies agreed to sponsor the annual conference.',
  },
  {
    word: 'testimonial',
    back: '推薦の声',
    phrase: 'The website features testimonials from satisfied customers.',
  },
  {
    word: 'incentive',
    back: '奨励金',
    phrase: 'Employees receive an incentive for exceeding their sales targets.',
  },
  {
    word: 'markup',
    back: '上乗せ価格',
    phrase: 'The retailer applies a fixed markup on all imported goods.',
  },
  {
    word: 'clearance',
    back: '在庫一掃セール',
    phrase: 'The store is holding a clearance sale to make room for new stock.',
  },
  {
    word: 'loyalty',
    back: '愛顧',
    phrase: 'The airline rewards customer loyalty with frequent flyer points.',
  },
  {
    word: 'exclusive',
    back: '限定の',
    phrase: 'The magazine published an exclusive interview with the CEO.',
  },
  { word: 'premium', back: '割増料金', phrase: 'Customers pay a premium for same-day delivery.' },
  {
    word: 'retailer',
    back: '小売業者',
    phrase: 'The retailer negotiated better terms with its main supplier.',
  },
  {
    word: 'wholesaler',
    back: '卸売業者',
    phrase: 'The wholesaler offers discounts for orders over a certain size.',
  },
  {
    word: 'consumer',
    back: '消費者',
    phrase: 'Consumer demand for eco-friendly products has increased sharply.',
  },

  // --- 顧客サービス・苦情対応 ---
  {
    word: 'complaint',
    back: '苦情',
    phrase: 'The hotel received a complaint about the noise from the renovation.',
  },
  {
    word: 'grievance',
    back: '苦情申し立て',
    phrase: 'Staff can file a grievance through the HR department.',
  },
  {
    word: 'dissatisfaction',
    back: '不満',
    phrase: 'Customer dissatisfaction rose after the price increase.',
  },
  { word: 'apologize', back: '謝罪する', phrase: 'The airline apologized for the delayed flight.' },
  {
    word: 'apology',
    back: '謝罪',
    phrase: 'The company sent a formal apology along with a refund.',
  },
  {
    word: 'resolve',
    back: '解決する',
    phrase: 'The support team worked quickly to resolve the billing error.',
  },
  {
    word: 'resolution',
    back: '解決',
    phrase: 'Both parties reached a resolution without going to court.',
  },
  {
    word: 'escalate',
    back: '上位に引き上げる',
    phrase: "If the issue isn't fixed today, please escalate it to the manager.",
  },
  {
    word: 'escalation',
    back: 'エスカレーション',
    phrase: 'The complaint went through several stages of escalation.',
  },
  {
    word: 'compensate',
    back: '補償する',
    phrase: 'The airline offered to compensate passengers for the cancellation.',
  },
  {
    word: 'compensation',
    back: '補償',
    phrase: 'Compensation was provided for the damaged luggage.',
  },
  {
    word: 'courteous',
    back: '丁寧な',
    phrase: 'The staff remained courteous even during the busy holiday season.',
  },
  {
    word: 'courtesy',
    back: '厚意',
    phrase: 'As a courtesy, the hotel upgraded the guest’s room for free.',
  },
  {
    word: 'empathize',
    back: '共感する',
    phrase: 'Support agents are trained to empathize with frustrated customers.',
  },
  {
    word: 'satisfaction',
    back: '満足度',
    phrase: 'Customer satisfaction scores improved after the new training program.',
  },
  {
    word: 'dispute',
    back: '紛争',
    phrase: 'The two companies settled their dispute over the contract terms.',
  },
  {
    word: 'redress',
    back: '救済',
    phrase: 'Customers may seek redress if the product fails within warranty.',
  },

  // --- 出張・交通・宿泊 ---
  {
    word: 'layover',
    back: '乗り継ぎ待ち',
    phrase: 'We have a three-hour layover in Singapore before the connecting flight.',
  },
  {
    word: 'transit',
    back: '通過',
    phrase: 'Passengers in transit do not need to collect their luggage.',
  },
  {
    word: 'checkpoint',
    back: '検問所',
    phrase: 'All visitors must pass through a security checkpoint at the entrance.',
  },
  {
    word: 'customs',
    back: '税関',
    phrase: 'It took over an hour to clear customs at the airport.',
  },
  {
    word: 'visa',
    back: '査証',
    phrase: 'Business travelers to that country need a visa in advance.',
  },
  {
    word: 'passport',
    back: '旅券',
    phrase: 'Make sure your passport is valid for at least six months.',
  },
  {
    word: 'chauffeur',
    back: '専属運転手',
    phrase: 'A chauffeur was waiting to take the executives to the hotel.',
  },
  {
    word: 'shuttle',
    back: '送迎バス',
    phrase: 'A free shuttle runs between the airport and the conference center.',
  },
  {
    word: 'concierge',
    back: 'コンシェルジュ',
    phrase: 'The concierge arranged a dinner reservation for the guests.',
  },
  {
    word: 'amenity',
    back: '設備',
    phrase: 'Free breakfast is a popular amenity at this hotel.',
  },
  { word: 'vacancy', back: '空室', phrase: 'The hotel had no vacancy during the trade show.' },
  {
    word: 'overbook',
    back: '定員以上に予約を取る',
    phrase: 'The airline had to offer vouchers after overbooking the flight.',
  },
  {
    word: 'refundable',
    back: '払い戻し可能な',
    phrase: 'Choose the refundable fare in case your plans change.',
  },
  {
    word: 'punctual',
    back: '時間に正確な',
    phrase: 'The train service in this country is known for being punctual.',
  },
  {
    word: 'connection',
    back: '乗り継ぎ便',
    phrase: 'She almost missed her connection because of the delayed flight.',
  },

  // --- IT・システム・通信 ---
  {
    word: 'firewall',
    back: 'ファイアウォール',
    phrase: 'The IT department installed a new firewall to block unauthorized access.',
  },
  {
    word: 'encryption',
    back: '暗号化',
    phrase: 'All customer data is protected with strong encryption.',
  },
  {
    word: 'encrypt',
    back: '暗号化する',
    phrase: 'Employees are required to encrypt files before sending them externally.',
  },
  {
    word: 'bandwidth',
    back: '帯域幅',
    phrase: 'The office needs more bandwidth to support video conferencing.',
  },
  {
    word: 'glitch',
    back: '一時的な不具合',
    phrase: 'A software glitch caused the system to crash briefly.',
  },
  {
    word: 'backup',
    back: 'バックアップ',
    phrase: 'Make sure to keep a backup of important files on the server.',
  },
  {
    word: 'malware',
    back: '悪意あるソフト',
    phrase: 'The antivirus program detected malware on one of the laptops.',
  },
  {
    word: 'interface',
    back: '画面・接点',
    phrase: 'The new interface makes the software much easier to use.',
  },
  {
    word: 'browser',
    back: 'ブラウザ',
    phrase: 'The website works best with the latest version of the browser.',
  },
  {
    word: 'algorithm',
    back: 'アルゴリズム',
    phrase: 'The recommendation algorithm suggests products based on past purchases.',
  },
  {
    word: 'configure',
    back: '設定する',
    phrase: 'IT staff will configure the new laptops before distribution.',
  },
  {
    word: 'configuration',
    back: '設定',
    phrase: 'The server configuration was changed to improve security.',
  },
  {
    word: 'compatible',
    back: '互換性のある',
    phrase: 'Check that the printer is compatible with your operating system.',
  },
  {
    word: 'compatibility',
    back: '互換性',
    phrase: 'Compatibility issues delayed the software rollout.',
  },
  {
    word: 'synchronize',
    back: '同期させる',
    phrase: 'Employees can synchronize their calendars across devices.',
  },
  {
    word: 'integrate',
    back: '統合する',
    phrase: 'The company plans to integrate the two databases next quarter.',
  },
  {
    word: 'integration',
    back: '統合',
    phrase: 'The integration of the new system took longer than expected.',
  },

  // --- 不動産・施設・建築 ---
  {
    word: 'zoning',
    back: '用途地域規制',
    phrase: 'The new zoning law restricts commercial construction in this area.',
  },
  {
    word: 'blueprint',
    back: '設計図',
    phrase: 'The architect presented the blueprint for the new office building.',
  },
  {
    word: 'contractor',
    back: '請負業者',
    phrase: 'The company hired a contractor to renovate the lobby.',
  },
  {
    word: 'subcontractor',
    back: '下請け業者',
    phrase: 'The main contractor brought in a subcontractor for the electrical work.',
  },
  {
    word: 'demolition',
    back: '解体',
    phrase: 'Demolition of the old factory will begin next month.',
  },
  {
    word: 'foundation',
    back: '基礎',
    phrase: 'Cracks appeared in the foundation of the building.',
  },
  { word: 'scaffolding', back: '足場', phrase: 'Workers set up scaffolding to repair the roof.' },
  {
    word: 'permit',
    back: '許可証',
    phrase: 'The construction company obtained a permit before starting work.',
  },
  {
    word: 'easement',
    back: '地役権',
    phrase: 'The property has an easement allowing access to the shared driveway.',
  },
  {
    word: 'condominium',
    back: '分譲マンション',
    phrase: 'The developer is building a new condominium downtown.',
  },
  { word: 'tenancy', back: '賃借期間', phrase: 'The tenancy agreement runs for two years.' },
  {
    word: 'eviction',
    back: '立ち退き',
    phrase: 'The landlord began eviction proceedings after months of unpaid rent.',
  },
  {
    word: 'dwelling',
    back: '住居',
    phrase: 'The building was converted from an office into a residential dwelling.',
  },
  {
    word: 'occupancy',
    back: '入居',
    phrase: 'The new office building has an occupancy rate of ninety percent.',
  },
  {
    word: 'vacant',
    back: '空いている',
    phrase: 'The store next door has been vacant for six months.',
  },
  {
    word: 'remodel',
    back: '改装する',
    phrase: 'The company decided to remodel the reception area.',
  },
  {
    word: 'infrastructure',
    back: 'インフラ',
    phrase: 'The city invested heavily in transportation infrastructure.',
  },

  // --- 店舗・小売・在庫 ---
  {
    word: 'storefront',
    back: '店頭',
    phrase: 'The company redesigned its storefront to attract more customers.',
  },
  {
    word: 'shelving',
    back: '棚',
    phrase: 'New shelving was installed to display the seasonal items.',
  },
  {
    word: 'checkout',
    back: 'レジ',
    phrase: 'Long lines formed at the checkout during the holiday sale.',
  },
  { word: 'cashier', back: 'レジ係', phrase: 'The cashier apologized for the long wait.' },
  { word: 'barcode', back: 'バーコード', phrase: "Scan the barcode to check the item's price." },
  {
    word: 'restock',
    back: '補充する',
    phrase: 'Staff need to restock the shelves before the store opens.',
  },
  {
    word: 'overstock',
    back: '過剰在庫',
    phrase: 'The warehouse is full of overstock from last season.',
  },
  {
    word: 'shoplifting',
    back: '万引き',
    phrase: 'The store installed cameras to prevent shoplifting.',
  },
  {
    word: 'stockroom',
    back: '倉庫',
    phrase: 'Extra inventory is kept in the stockroom at the back of the store.',
  },
  {
    word: 'showroom',
    back: 'ショールーム',
    phrase: 'Customers can view the new models in the showroom.',
  },
  {
    word: 'franchise',
    back: 'フランチャイズ',
    phrase: 'The company plans to expand through franchise agreements.',
  },
  {
    word: 'franchisee',
    back: '加盟店',
    phrase: "Each franchisee must follow the company's operating standards.",
  },
  {
    word: 'outlet',
    back: 'アウトレット店',
    phrase: "The outlet store sells last season's merchandise at a discount.",
  },
  {
    word: 'boutique',
    back: '専門小型店舗',
    phrase: 'She opened a small boutique specializing in handmade jewelry.',
  },
  { word: 'kiosk', back: '売店', phrase: 'A kiosk near the entrance sells snacks and drinks.' },
  {
    word: 'merchant',
    back: '商人',
    phrase: 'Local merchants formed an association to promote the shopping district.',
  },

  // --- イベント・式典・エンターテインメント ---
  { word: 'ceremony', back: '式典', phrase: 'The opening ceremony will be held in the main hall.' },
  {
    word: 'keynote',
    back: '基調講演',
    phrase: "The CEO will deliver the keynote at this year's conference.",
  },
  {
    word: 'emcee',
    back: '司会者',
    phrase: 'The emcee introduced each speaker before their presentation.',
  },
  {
    word: 'rehearsal',
    back: 'リハーサル',
    phrase: 'The team held a rehearsal the night before the product launch.',
  },
  {
    word: 'backdrop',
    back: '背景幕',
    phrase: 'A large backdrop with the company logo was set up on stage.',
  },
  {
    word: 'decor',
    back: '装飾',
    phrase: "The banquet hall's decor matched the company's brand colors.",
  },
  {
    word: 'invitee',
    back: '招待客',
    phrase: 'Each invitee received a personalized invitation card.',
  },
  {
    word: 'attendee',
    back: '参加者',
    phrase: 'Over three hundred attendees registered for the seminar.',
  },
  {
    word: 'exhibitor',
    back: '出展者',
    phrase: 'Exhibitors set up their booths early in the morning.',
  },
  {
    word: 'showcase',
    back: '展示する',
    phrase: 'The event will showcase the latest products from local designers.',
  },
  { word: 'gala', back: '祝賀会', phrase: 'The charity gala raised a record amount this year.' },
  {
    word: 'laureate',
    back: '受賞者',
    phrase: 'The laureate gave a short speech after receiving the award.',
  },
  {
    word: 'commemorate',
    back: '記念する',
    phrase: 'The company held a dinner to commemorate its fiftieth anniversary.',
  },
  {
    word: 'anniversary',
    back: '記念日',
    phrase: 'The store is celebrating its tenth anniversary with a sale.',
  },
  {
    word: 'unveiling',
    back: '披露',
    phrase: 'The unveiling of the new logo took place at the press conference.',
  },
  {
    word: 'inauguration',
    back: '開業式',
    phrase: 'The inauguration of the new branch attracted local media attention.',
  },
  {
    word: 'RSVP',
    back: '出欠の返信',
    phrase: 'Please RSVP by Friday so we can finalize the seating chart.',
  },

  // --- 法務・環境 ---
  {
    word: 'regulation',
    back: '規制',
    phrase: 'The new regulation requires companies to report their emissions.',
  },
  {
    word: 'regulatory',
    back: '規制上の',
    phrase: 'The merger is still awaiting regulatory approval.',
  },
  {
    word: 'litigation',
    back: '訴訟手続き',
    phrase: 'The company set aside funds to cover potential litigation costs.',
  },
  {
    word: 'lawsuit',
    back: '訴訟',
    phrase: 'A former employee filed a lawsuit against the company.',
  },
  {
    word: 'plaintiff',
    back: '原告',
    phrase: 'The plaintiff argued that the contract had been broken.',
  },
  {
    word: 'defendant',
    back: '被告',
    phrase: "The defendant's lawyer requested more time to prepare.",
  },
  {
    word: 'jurisdiction',
    back: '管轄権',
    phrase: 'The court ruled that the case was outside its jurisdiction.',
  },
  {
    word: 'statute',
    back: '法令',
    phrase: 'The new statute affects how contracts must be written.',
  },
  {
    word: 'infringe',
    back: '侵害する',
    phrase: 'The company was accused of using a design that infringes a patent.',
  },
  {
    word: 'infringement',
    back: '侵害',
    phrase: 'The lawsuit centered on alleged copyright infringement.',
  },
  {
    word: 'sustainability',
    back: '持続可能性',
    phrase: "The report highlights the company's progress on sustainability.",
  },
  {
    word: 'sustainable',
    back: '持続可能な',
    phrase: 'The factory switched to a more sustainable packaging material.',
  },
  {
    word: 'emission',
    back: '排出',
    phrase: 'The factory reduced its carbon emissions by twenty percent.',
  },
  {
    word: 'recycle',
    back: 'リサイクルする',
    phrase: 'Employees are encouraged to recycle paper and plastic at the office.',
  },
  {
    word: 'recycling',
    back: 'リサイクル',
    phrase: 'The building added new recycling bins on every floor.',
  },
  {
    word: 'biodegradable',
    back: '生分解性の',
    phrase: 'The company switched to biodegradable packaging last year.',
  },
  {
    word: 'eco-friendly',
    back: '環境に優しい',
    phrase: 'Customers are increasingly choosing eco-friendly products.',
  },
]
