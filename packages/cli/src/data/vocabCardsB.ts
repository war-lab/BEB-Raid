// Bランク200語の語彙カード内容（M2・T-59。正本: docs/04 2節(vocab_card)、docs/02 4節）。
// front=単語（freqListWordsB.tsと同じ200語）/ phrase=短いビジネス文脈フレーズ / back=和訳。
// phraseAudioは生成段階では予約パス（T-64でTTS音声を実際に生成し差し替える）。
// levelBand860帯向けに、Aランクよりやや専門的・複雑な文脈で用例文を書き下ろした。
import type { VocabCardEntry } from './vocabCardsS.js'

export const VOCAB_CARDS_B: VocabCardEntry[] = [
  // --- 会議・文書・オフィスコミュニケーション ---
  {
    word: 'verbatim',
    back: '一字一句そのままの',
    phrase: "The secretary recorded the chairman's remarks verbatim in the minutes.",
  },
  {
    word: 'paraphrase',
    back: '言い換える',
    phrase: 'The editor asked the writer to paraphrase the technical section.',
  },
  {
    word: 'elaborate',
    back: '詳しく説明する',
    phrase: 'Could you elaborate on how the new policy will affect overtime pay?',
  },
  {
    word: 'elaboration',
    back: '詳述',
    phrase: 'The client requested further elaboration on the pricing structure.',
  },
  {
    word: 'stipulate',
    back: '規定する',
    phrase: 'The contract stipulates that payment must be made within thirty days.',
  },
  {
    word: 'stipulation',
    back: '規定条項',
    phrase: 'One stipulation requires the vendor to insure all shipments.',
  },
  {
    word: 'preamble',
    back: '前文',
    phrase: 'The preamble of the agreement outlines the purpose of the partnership.',
  },
  {
    word: 'annex',
    back: '別紙',
    phrase: 'The technical drawings are provided in the annex to the contract.',
  },
  {
    word: 'redact',
    back: '黒塗りする',
    phrase: 'Legal staff had to redact confidential figures before releasing the report.',
  },
  {
    word: 'redaction',
    back: '黒塗り',
    phrase: 'The redaction of personal data delayed the public disclosure.',
  },
  {
    word: 'codify',
    back: '成文化する',
    phrase: 'The committee decided to codify the informal procedures into a manual.',
  },
  {
    word: 'promulgate',
    back: '公布する',
    phrase: 'The government will promulgate the revised trade regulations next month.',
  },
  {
    word: 'corroborate',
    back: '裏付ける',
    phrase: "Two witnesses' statements corroborate the auditor's findings.",
  },
  {
    word: 'substantiate',
    back: '実証する',
    phrase: 'The claim was substantiated by receipts and shipping records.',
  },
  {
    word: 'annotate',
    back: '注釈を付ける',
    phrase: 'The reviewer annotated the draft with suggested revisions.',
  },
  {
    word: 'annotation',
    back: '注釈',
    phrase: 'Each annotation in the margin refers to a supporting document.',
  },
  {
    word: 'synopsis',
    back: 'あらすじ・要旨',
    phrase: 'A one-page synopsis of the proposal was circulated before the meeting.',
  },

  // --- 人事・採用・研修 ---
  {
    word: 'attrition',
    back: '自然減',
    phrase: 'The company plans to reduce staff through attrition rather than layoffs.',
  },
  {
    word: 'retention',
    back: '人材の定着',
    phrase: 'Employee retention improved after the new benefits package was introduced.',
  },
  {
    word: 'incentivize',
    back: '動機付けをする',
    phrase: 'Management wants to incentivize employees to complete the training early.',
  },
  {
    word: 'gratuity',
    back: '謝礼',
    phrase: 'A gratuity is automatically added to bills for large groups.',
  },
  {
    word: 'nepotism',
    back: '縁故採用',
    phrase: 'The new hiring policy was introduced to prevent accusations of nepotism.',
  },
  {
    word: 'meritocracy',
    back: '実力主義',
    phrase: 'The firm prides itself on being a meritocracy where promotions are earned.',
  },
  {
    word: 'arbitration',
    back: '仲裁',
    phrase: 'The labor dispute was settled through arbitration instead of a strike.',
  },
  {
    word: 'mediate',
    back: '調停する・仲介する',
    phrase: 'An outside consultant was brought in to mediate the dispute between departments.',
  },
  {
    word: 'mediation',
    back: '調停',
    phrase: 'Both parties agreed to mediation before taking the matter to court.',
  },
  {
    word: 'redundancy',
    back: '人員整理',
    phrase: 'The restructuring resulted in the redundancy of several administrative posts.',
  },
  {
    word: 'downsize',
    back: '人員を削減する',
    phrase: 'The firm had to downsize its regional offices after the merger.',
  },
  {
    word: 'downsizing',
    back: '人員削減',
    phrase: 'The downsizing plan will be finalized by the end of the quarter.',
  },
  {
    word: 'restructure',
    back: '組織再編する',
    phrase: 'The board voted to restructure the sales division.',
  },
  {
    word: 'restructuring',
    back: '組織再編',
    phrase: 'The restructuring affected nearly every department in the company.',
  },
  {
    word: 'moonlighting',
    back: '副業',
    phrase: "The company's policy prohibits moonlighting for a competing firm.",
  },
  {
    word: 'sabbatical',
    back: '長期休暇',
    phrase: 'She took a six-month sabbatical to complete her research project.',
  },
  {
    word: 'expatriate',
    back: '海外駐在員',
    phrase: 'The firm offers housing assistance to expatriate staff working abroad.',
  },

  // --- 財務・会計・契約 ---
  {
    word: 'hedge',
    back: 'ヘッジする',
    phrase: 'The company used currency contracts to hedge against exchange rate risk.',
  },
  {
    word: 'hedging',
    back: 'ヘッジ',
    phrase: 'Hedging strategies helped the firm limit its losses during the downturn.',
  },
  {
    word: 'derivative',
    back: '金融派生商品',
    phrase: 'The bank sold a derivative product tied to interest rate movements.',
  },
  {
    word: 'arbitrage',
    back: '裁定取引',
    phrase: 'Traders profited from arbitrage opportunities between the two markets.',
  },
  {
    word: 'insolvency',
    back: '支払不能状態',
    phrase: 'The retailer filed for protection after facing insolvency.',
  },
  {
    word: 'receivership',
    back: '管財下の状態',
    phrase: 'The struggling airline was placed into receivership last year.',
  },
  {
    word: 'bankruptcy',
    back: '破産',
    phrase: 'The chain of stores filed for bankruptcy after years of declining sales.',
  },
  {
    word: 'foreclosure',
    back: '差し押さえ',
    phrase: 'The bank began foreclosure proceedings after the loan went unpaid.',
  },
  {
    word: 'asset',
    back: '資産',
    phrase: 'The factory is listed as one of the company’s major assets.',
  },
  {
    word: 'portfolio',
    back: '保有資産の組み合わせ',
    phrase: 'The investment portfolio includes stocks, bonds, and real estate.',
  },
  {
    word: 'diversify',
    back: '分散させる',
    phrase: 'The firm decided to diversify its investments across several industries.',
  },
  {
    word: 'diversification',
    back: '分散',
    phrase: 'Diversification reduced the fund’s exposure to a single market.',
  },
  {
    word: 'leverage',
    back: '活用する',
    phrase: 'The startup leveraged its investor network to win new business deals.',
  },
  {
    word: 'subsidy',
    back: '補助金',
    phrase: 'The government offers a subsidy to companies that hire new graduates.',
  },
  {
    word: 'tariff',
    back: '関税',
    phrase: 'New tariffs on imported steel raised production costs.',
  },
  {
    word: 'levy',
    back: '課税する',
    phrase: 'The city plans to levy a small tax on short-term rentals.',
  },
  {
    word: 'embezzlement',
    back: '横領',
    phrase: 'The former treasurer was charged with embezzlement of club funds.',
  },

  // --- 製造・品質管理・物流 ---
  {
    word: 'commissioning',
    back: '試運転',
    phrase: 'The commissioning of the new plant is scheduled for next spring.',
  },
  {
    word: 'decommission',
    back: '廃止する',
    phrase: 'The old power station will be decommissioned within two years.',
  },
  {
    word: 'retrofit',
    back: '後付けで改修する',
    phrase: 'The building was retrofitted with more energy-efficient lighting.',
  },
  {
    word: 'streamline',
    back: '合理化する',
    phrase: 'The new software helped streamline the order processing workflow.',
  },
  {
    word: 'optimize',
    back: '最適化する',
    phrase: 'The team worked to optimize delivery routes and cut fuel costs.',
  },
  {
    word: 'optimization',
    back: '最適化',
    phrase: 'Route optimization reduced average delivery time by two hours.',
  },
  {
    word: 'automate',
    back: '自動化する',
    phrase: 'The warehouse plans to automate its inventory tracking system.',
  },
  {
    word: 'automation',
    back: '自動化',
    phrase: 'Automation reduced the need for manual data entry.',
  },
  {
    word: 'offshoring',
    back: '海外移転',
    phrase: "The company's offshoring of production cut manufacturing costs significantly.",
  },
  {
    word: 'subcontracting',
    back: '下請けに出すこと',
    phrase: 'Subcontracting the installation work helped meet the tight deadline.',
  },
  {
    word: 'expedite',
    back: '迅速化する',
    phrase: 'The client paid extra to expedite the shipment.',
  },
  {
    word: 'consolidate',
    back: '集約する',
    phrase: 'The airline decided to consolidate its regional flights into one hub.',
  },
  {
    word: 'consolidation',
    back: '集約',
    phrase: 'The consolidation of warehouses reduced overall storage costs.',
  },
  {
    word: 'standardize',
    back: '標準化する',
    phrase: 'The company plans to standardize packaging across all product lines.',
  },
  {
    word: 'standardization',
    back: '標準化',
    phrase: 'Standardization made it easier to train staff at every location.',
  },
  {
    word: 'curtail',
    back: '削減する',
    phrase: 'The factory had to curtail production due to a parts shortage.',
  },
  {
    word: 'overhaul',
    back: '大幅な見直し',
    phrase: 'The logistics network underwent a complete overhaul last year.',
  },

  // --- マーケティング・広告・販売 ---
  {
    word: 'proliferate',
    back: '急増する',
    phrase: 'Online discount retailers have proliferated in the past decade.',
  },
  {
    word: 'proliferation',
    back: '急増',
    phrase: 'The proliferation of low-cost competitors squeezed profit margins.',
  },
  {
    word: 'saturate',
    back: '飽和させる',
    phrase: 'The smartphone market has become saturated with similar models.',
  },
  {
    word: 'saturation',
    back: '飽和',
    phrase: 'Market saturation forced the company to look overseas for growth.',
  },
  {
    word: 'differentiate',
    back: '差別化する',
    phrase: 'The brand differentiates itself through personalized customer service.',
  },
  {
    word: 'differentiation',
    back: '差別化',
    phrase: 'Product differentiation is key in a crowded marketplace.',
  },
  {
    word: 'positioning',
    back: '位置付け',
    phrase: 'The agency recommended a new positioning strategy for the brand.',
  },
  {
    word: 'rebrand',
    back: 'ブランドを刷新する',
    phrase: 'The airline decided to rebrand after years of poor customer reviews.',
  },
  {
    word: 'rebranding',
    back: 'ブランド刷新',
    phrase: 'The rebranding included a new logo and updated slogan.',
  },
  {
    word: 'viral',
    back: '急速に広がる',
    phrase: 'The advertisement went viral within a few days of its release.',
  },
  {
    word: 'engagement',
    back: '（顧客の）関与',
    phrase: 'Customer engagement increased after the launch of the loyalty app.',
  },
  {
    word: 'conversion',
    back: '成約率',
    phrase: 'The redesigned website improved the checkout conversion rate.',
  },
  {
    word: 'segmentation',
    back: '市場細分化',
    phrase: 'Market segmentation allowed the team to tailor ads by region.',
  },
  {
    word: 'upsell',
    back: '上位商品を勧める',
    phrase: 'Staff are trained to upsell customers on extended warranties.',
  },
  {
    word: 'affiliate',
    back: '提携先',
    phrase: 'The company earns revenue through its network of affiliate websites.',
  },
  {
    word: 'clientele',
    back: '顧客層',
    phrase: 'The restaurant built a loyal clientele over twenty years.',
  },
  {
    word: 'markdown',
    back: '値下げ',
    phrase: 'A seasonal markdown cleared most of the remaining inventory.',
  },

  // --- 顧客サービス・苦情対応 ---
  {
    word: 'appease',
    back: 'なだめる',
    phrase: 'The manager offered a discount to appease the frustrated customer.',
  },
  {
    word: 'placate',
    back: '鎮める',
    phrase: 'The airline tried to placate passengers with meal vouchers.',
  },
  {
    word: 'rectify',
    back: '是正する',
    phrase: 'The company moved quickly to rectify the billing mistake.',
  },
  {
    word: 'rectification',
    back: '是正',
    phrase: 'Rectification of the error took less than a day.',
  },
  {
    word: 'remedy',
    back: '救済策',
    phrase: 'A full refund was offered as a remedy for the defective product.',
  },
  {
    word: 'remediation',
    back: '是正措置',
    phrase: 'The remediation plan included staff retraining and new procedures.',
  },
  {
    word: 'disgruntled',
    back: '不満を抱いた',
    phrase: 'Several disgruntled customers posted negative reviews online.',
  },
  {
    word: 'alienate',
    back: '疎外する',
    phrase: 'Executives were careful not to alienate long-time customers with the new pricing.',
  },
  {
    word: 'retain',
    back: 'つなぎ止める',
    phrase: 'The loyalty program helped retain customers during the price war.',
  },
  {
    word: 'goodwill',
    back: '信用',
    phrase: 'The company built goodwill by donating to local charities.',
  },
  {
    word: 'conciliatory',
    back: '和解的な',
    phrase: 'The CEO took a conciliatory tone during the press conference.',
  },
  {
    word: 'indemnify',
    back: '損害を補償する',
    phrase: 'The supplier agreed to indemnify the retailer for any defects.',
  },
  {
    word: 'indemnity',
    back: '損害補償（契約上の）',
    phrase: 'The contract includes an indemnity clause covering legal costs.',
  },
  {
    word: 'liaison',
    back: '連絡調整役',
    phrase: 'She serves as the liaison between the client and the design team.',
  },
  {
    word: 'mitigate',
    back: '軽減する',
    phrase: 'The company took steps to mitigate the impact of the delay.',
  },
  {
    word: 'mitigation',
    back: '軽減',
    phrase: 'Risk mitigation is a key part of the project plan.',
  },
  {
    word: 'ombudsman',
    back: '苦情処理担当者',
    phrase: 'Unresolved complaints can be forwarded to the company ombudsman.',
  },

  // --- 出張・交通・宿泊 ---
  {
    word: 'commute',
    back: '通勤する',
    phrase: 'Many employees commute over an hour to reach the downtown office.',
  },
  {
    word: 'commuter',
    back: '通勤者',
    phrase: 'The new rail line was built mainly for commuters.',
  },
  {
    word: 'congestion',
    back: '混雑',
    phrase: 'Traffic congestion made the delivery truck an hour late.',
  },
  {
    word: 'detour',
    back: '迂回路',
    phrase: 'Road construction forced drivers to take a lengthy detour.',
  },
  {
    word: 'diversion',
    back: '交通の迂回',
    phrase: 'A traffic diversion was set up around the accident site.',
  },
  {
    word: 'embark',
    back: '（船に）乗り込む',
    phrase: 'Cruise passengers must embark at least an hour before departure.',
  },
  {
    word: 'disembark',
    back: '降りる',
    phrase: 'Passengers must disembark through the rear door during this stop.',
  },
  {
    word: 'quarantine',
    back: '検疫',
    phrase: 'The shipment was held in quarantine pending inspection.',
  },
  {
    word: 'immigration',
    back: '出入国審査',
    phrase: 'The line at immigration was much shorter than expected.',
  },
  {
    word: 'repatriate',
    back: '本国へ送還する',
    phrase: 'The company arranged to repatriate staff during the crisis.',
  },
  {
    word: 'repatriation',
    back: '本国送還',
    phrase: 'The repatriation process took nearly a week to arrange.',
  },
  {
    word: 'chartered',
    back: '貸し切りの',
    phrase: 'A chartered bus took the delegates directly to the venue.',
  },
  {
    word: 'nonrefundable',
    back: '払い戻し不可の',
    phrase: 'The discounted ticket is nonrefundable once purchased.',
  },
  {
    word: 'punctuality',
    back: '時間厳守',
    phrase: 'The courier service is known for its punctuality.',
  },
  {
    word: 'stopover',
    back: '短期滞在',
    phrase: 'The itinerary includes a two-day stopover in Dubai.',
  },
  {
    word: 'gateway',
    back: '玄関口',
    phrase: 'The airport serves as a gateway for business travelers to the region.',
  },

  // --- IT・システム・通信 ---
  {
    word: 'cybersecurity',
    back: 'サイバーセキュリティ',
    phrase: 'The firm invested heavily in cybersecurity after the breach.',
  },
  {
    word: 'phishing',
    back: 'フィッシング詐欺',
    phrase: 'Employees are trained to recognize phishing emails.',
  },
  {
    word: 'ransomware',
    back: '身代金要求型ウイルス',
    phrase: 'A ransomware attack shut down the company’s servers for two days.',
  },
  {
    word: 'cryptocurrency',
    back: '暗号資産',
    phrase: 'The company began accepting cryptocurrency for online purchases.',
  },
  {
    word: 'blockchain',
    back: 'ブロックチェーン',
    phrase: 'Blockchain technology is being tested for supply chain tracking.',
  },
  {
    word: 'protocol',
    back: '通信規約',
    phrase: 'The new security protocol requires two-factor authentication.',
  },
  {
    word: 'latency',
    back: '通信の遅延',
    phrase: 'High latency made the video call difficult to follow.',
  },
  {
    word: 'scalable',
    back: '拡張性のある',
    phrase: 'The startup chose a scalable platform to support future growth.',
  },
  {
    word: 'scalability',
    back: '拡張性',
    phrase: 'Scalability was the main reason for choosing this software vendor.',
  },
  {
    word: 'deprecate',
    back: '非推奨にする',
    phrase: 'The company will deprecate the old app in favor of the new version.',
  },
  {
    word: 'provisioning',
    back: 'システム資源の割り当て',
    phrase: 'Provisioning new servers now takes only a few minutes.',
  },
  {
    word: 'virtualization',
    back: '仮想化',
    phrase: 'Virtualization reduced the number of physical servers needed.',
  },
  {
    word: 'middleware',
    back: 'ミドルウェア',
    phrase: 'The middleware connects the ordering system to the payment gateway.',
  },
  {
    word: 'firmware',
    back: 'ファームウェア',
    phrase: 'A firmware update fixed the printer’s connectivity issue.',
  },
  {
    word: 'endpoint',
    back: '末端機器',
    phrase: 'Every endpoint device must have the security software installed.',
  },
  {
    word: 'authentication',
    back: '認証',
    phrase: 'Two-factor authentication is now required to access company email.',
  },

  // --- 不動産・施設・建築 ---
  {
    word: 'encroachment',
    back: '境界への侵害',
    phrase: 'The fence was moved after a survey revealed an encroachment.',
  },
  {
    word: 'dilapidated',
    back: '老朽化した',
    phrase: 'The company bought the dilapidated building to convert it into offices.',
  },
  {
    word: 'uninhabitable',
    back: '居住に適さない',
    phrase: 'The apartment was declared uninhabitable after the fire.',
  },
  {
    word: 'habitable',
    back: '居住可能な',
    phrase: 'Renovations made the old warehouse habitable for staff use.',
  },
  {
    word: 'gentrification',
    back: '高級化・再開発',
    phrase: 'Gentrification has raised rents throughout the old industrial district.',
  },
  {
    word: 'leasehold',
    back: '借地権',
    phrase: 'The company purchased a leasehold property near the port.',
  },
  {
    word: 'freehold',
    back: '自由土地保有権',
    phrase: 'The firm prefers freehold properties for long-term investment.',
  },
  {
    word: 'covenant',
    back: '契約上の誓約条項',
    phrase: 'The lease includes a covenant restricting subletting.',
  },
  { word: 'deed', back: '権利証書', phrase: 'The deed was transferred once the payment cleared.' },
  {
    word: 'escrow',
    back: '第三者預託',
    phrase: 'The deposit was held in escrow until the sale was finalized.',
  },
  {
    word: 'subdivision',
    back: '土地区画',
    phrase: 'The developer split the land into a residential subdivision.',
  },
  {
    word: 'rezone',
    back: '用途地域を変更する',
    phrase: 'The city voted to rezone the area for mixed commercial use.',
  },
  {
    word: 'variance',
    back: '例外許可',
    phrase: 'The owner applied for a variance to build beyond the height limit.',
  },
  {
    word: 'condemn',
    back: '使用不可と宣告する',
    phrase: 'Inspectors condemned the building after finding structural damage.',
  },
  {
    word: 'condemnation',
    back: '使用不可宣告',
    phrase: 'The condemnation forced tenants to relocate within a month.',
  },
  {
    word: 'urbanization',
    back: '都市化',
    phrase: 'Rapid urbanization increased demand for office space downtown.',
  },
  {
    word: 'sprawl',
    back: '都市の無秩序な拡大',
    phrase: 'Urban sprawl has pushed warehouses further from the city center.',
  },

  // --- 店舗・小売・在庫 ---
  {
    word: 'liquidation',
    back: '在庫処分',
    phrase: 'The chain held a liquidation sale before closing its doors.',
  },
  {
    word: 'footfall',
    back: '来店客数',
    phrase: 'Footfall at the mall increased after the new anchor store opened.',
  },
  {
    word: 'ambience',
    back: '店内の雰囲気',
    phrase: 'The café’s cozy ambience keeps customers coming back.',
  },
  {
    word: 'upscale',
    back: '高級志向の',
    phrase: 'The brand opened an upscale boutique in the shopping district.',
  },
  {
    word: 'bespoke',
    back: '注文仕立ての',
    phrase: 'The tailor specializes in bespoke suits for business clients.',
  },
  {
    word: 'artisanal',
    back: '職人による',
    phrase: 'The bakery is known for its artisanal bread and pastries.',
  },
  {
    word: 'curated',
    back: '厳選された',
    phrase: 'The store offers a curated selection of local products.',
  },
  {
    word: 'flagship',
    back: '旗艦店',
    phrase: 'The company opened its flagship store in the capital city.',
  },
  {
    word: 'e-commerce',
    back: '電子商取引',
    phrase: 'E-commerce sales now account for half of the company’s revenue.',
  },
  {
    word: 'omnichannel',
    back: '複数販路統合型の',
    phrase: 'The retailer adopted an omnichannel strategy linking online and in-store sales.',
  },
  {
    word: 'understock',
    back: '在庫不足の状態にする',
    phrase: 'The store understocked several popular items during the holiday season.',
  },
  {
    word: 'turnover',
    back: '回転率',
    phrase: 'Fast inventory turnover keeps the store’s shelves stocked with fresh items.',
  },
  {
    word: 'patronage',
    back: '（客としての）ひいき',
    phrase: 'The restaurant thanked customers for their continued patronage.',
  },
  {
    word: 'shopper',
    back: '買い物客',
    phrase: 'Shoppers lined up early for the doorbuster deals.',
  },
  {
    word: 'merchandising',
    back: '陳列戦略',
    phrase: 'Visual merchandising helped highlight the new product line.',
  },
  {
    word: 'assortment',
    back: '品揃え',
    phrase: 'The store expanded its assortment of imported goods.',
  },

  // --- イベント・式典・エンターテインメント ---
  {
    word: 'pageantry',
    back: '華やかな儀式',
    phrase: 'The opening ceremony was filled with pageantry and music.',
  },
  {
    word: 'procession',
    back: '行列',
    phrase: 'A procession of executives led the ribbon-cutting event.',
  },
  {
    word: 'dignitary',
    back: '要人',
    phrase: 'A foreign dignitary attended the groundbreaking ceremony.',
  },
  {
    word: 'accolade',
    back: '称賛',
    phrase: 'The company received an accolade for its customer service.',
  },
  {
    word: 'plaque',
    back: '記念プレート',
    phrase: 'A plaque was installed to mark the building’s completion.',
  },
  {
    word: 'memorial',
    back: '追悼の',
    phrase: "A memorial service was held in honor of the company's late founder.",
  },
  {
    word: 'tribute',
    back: '賛辞',
    phrase: 'The staff paid tribute to their longtime colleague at the farewell party.',
  },
  {
    word: 'symposium',
    back: 'シンポジウム',
    phrase: 'Researchers gathered for an international symposium on renewable energy.',
  },
  {
    word: 'convocation',
    back: '式典',
    phrase: 'The university held its annual convocation in the main auditorium.',
  },
  {
    word: 'plenary',
    back: '全体会議の',
    phrase: 'The plenary session brought together delegates from every department.',
  },
  {
    word: 'festivity',
    back: '祝祭ムード',
    phrase: 'A sense of festivity filled the office during the holiday season.',
  },
  {
    word: 'jubilee',
    back: '記念祝典',
    phrase: 'The company marked its golden jubilee with a week of events.',
  },
  {
    word: 'commencement',
    back: '開始',
    phrase: 'The commencement of the new fiscal year was marked with a company address.',
  },
  {
    word: 'soiree',
    back: '夜会',
    phrase: 'The firm hosted a soiree for its top clients after the conference.',
  },
  {
    word: 'mixer',
    back: '懇親会',
    phrase: 'A networking mixer followed the industry panel discussion.',
  },
  {
    word: 'hospitality',
    back: 'もてなし',
    phrase: 'Guests praised the hotel staff for their hospitality.',
  },
  {
    word: 'fanfare',
    back: '派手な宣伝',
    phrase: 'The product was launched with considerable fanfare.',
  },

  // --- 法務・環境 ---
  {
    word: 'adjudicate',
    back: '裁定を下す',
    phrase: 'An independent panel was appointed to adjudicate the dispute.',
  },
  {
    word: 'adjudication',
    back: '裁定',
    phrase: 'The adjudication process is expected to take several months.',
  },
  {
    word: 'tribunal',
    back: '審判所',
    phrase: 'The case was referred to an industrial tribunal.',
  },
  {
    word: 'subpoena',
    back: '召喚状',
    phrase: 'The company received a subpoena requesting internal documents.',
  },
  {
    word: 'testify',
    back: '証言する',
    phrase: 'The manager was asked to testify about the safety inspection.',
  },
  {
    word: 'testimony',
    back: '証言',
    phrase: 'The witness gave testimony about the accident on the factory floor.',
  },
  {
    word: 'affidavit',
    back: '宣誓供述書',
    phrase: 'The employee signed an affidavit confirming the events.',
  },
  {
    word: 'injunction',
    back: '差止命令',
    phrase: 'The court issued an injunction to halt the construction project.',
  },
  {
    word: 'indictment',
    back: '起訴',
    phrase: 'The former executive faced indictment on fraud charges.',
  },
  {
    word: 'prosecute',
    back: '起訴する',
    phrase: 'Prosecutors decided to prosecute the case after reviewing the evidence.',
  },
  {
    word: 'prosecution',
    back: '起訴・検察側',
    phrase: 'The prosecution presented financial records as evidence.',
  },
  {
    word: 'acquit',
    back: '無罪とする',
    phrase: 'The jury voted to acquit the defendant after a short deliberation.',
  },
  {
    word: 'acquittal',
    back: '無罪判決',
    phrase: 'The acquittal ended a two-year legal battle for the company.',
  },
  {
    word: 'culpable',
    back: '責めを負うべき',
    phrase: 'The audit found the manager culpable for the accounting error.',
  },
  {
    word: 'negligence',
    back: '過失',
    phrase: 'The lawsuit alleged negligence in the handling of the shipment.',
  },
  {
    word: 'malfeasance',
    back: '不正行為',
    phrase: 'The investigation uncovered malfeasance by a senior official.',
  },
]
