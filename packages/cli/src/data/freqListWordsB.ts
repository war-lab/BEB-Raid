// Bランク200語のデータ本体（M2・T-58。正本: docs/03 4節、docs/13 T-58行）。
// levelBand 860帯。S・Aランク（既存400語）との重複禁止（機械検証=freqList.ts）。
// T-25と同方針（J-21）: LLM推定のみで直接記述。12カテゴリはfreqListWordsA.tsと対応させる
// （同じ場面でより高難度・専門的な語彙を選定）。
import type { FreqRank } from '@beb-raid/shared-schema'
import type { FreqListWordEntry } from './freqListWordsS.js'

type Entry = { word: string; rationale: string }

function toEntries(entries: Entry[]): FreqListWordEntry[] {
  const freqRank: FreqRank = 'B'
  return entries.map((e) => ({ ...e, freqRank, rankSource: 'llm' as const }))
}

// --- 1. 会議・文書・オフィスコミュニケーション ---
const MEETING_DOCS: Entry[] = [
  { word: 'verbatim', rationale: '一字一句そのままの' },
  { word: 'paraphrase', rationale: '言い換える' },
  { word: 'elaborate', rationale: '詳しく説明する' },
  { word: 'elaboration', rationale: '詳述（名詞）' },
  { word: 'stipulate', rationale: '（契約等で）規定する' },
  { word: 'stipulation', rationale: '規定条項' },
  { word: 'preamble', rationale: '前文' },
  { word: 'annex', rationale: '別紙・付属文書' },
  { word: 'networking', rationale: '人脈作り（T-86でB帯TOEIC非該当語redactから差し替え）' },
  { word: 'comprehensive', rationale: '包括的な（T-86でB帯TOEIC非該当語redactionから差し替え）' },
  {
    word: 'mentorship',
    rationale: '指導・メンター制度（T-86でB帯TOEIC非該当語codifyから差し替え）',
  },
  { word: 'teamwork', rationale: 'チームワーク（T-86でB帯TOEIC非該当語promulgateから差し替え）' },
  { word: 'corroborate', rationale: '裏付ける' },
  { word: 'substantiate', rationale: '実証する' },
  { word: 'annotate', rationale: '注釈を付ける' },
  { word: 'annotation', rationale: '注釈（名詞）' },
  { word: 'synopsis', rationale: '概要・あらすじ' },
]

// --- 2. 人事・採用・研修 ---
const HR_TRAINING: Entry[] = [
  { word: 'attrition', rationale: '自然減（離職による人員減）' },
  { word: 'retention', rationale: '人材の定着・保持' },
  { word: 'incentivize', rationale: '動機付けをする' },
  { word: 'gratuity', rationale: '謝礼・チップ' },
  { word: 'nepotism', rationale: '縁故採用' },
  { word: 'meritocracy', rationale: '実力主義' },
  { word: 'arbitration', rationale: '（労使等の）仲裁' },
  { word: 'mediate', rationale: '仲裁・調停する' },
  { word: 'mediation', rationale: '調停（名詞）' },
  { word: 'turnaround', rationale: '業績回復・立て直し' },
  { word: 'modernize', rationale: '近代化する' },
  { word: 'modernization', rationale: '近代化（名詞）' },
  { word: 'restructure', rationale: '組織再編する' },
  { word: 'restructuring', rationale: '組織再編（名詞）' },
  { word: 'moonlighting', rationale: '副業' },
  { word: 'sabbatical', rationale: '長期休暇（研究・研修目的）' },
  { word: 'expatriate', rationale: '海外駐在員' },
]

// --- 3. 財務・会計・契約 ---
const FINANCE_CONTRACT: Entry[] = [
  { word: 'hedge', rationale: '（リスクを）回避する・ヘッジする' },
  { word: 'hedging', rationale: 'ヘッジ（名詞）' },
  { word: 'derivative', rationale: '金融派生商品' },
  { word: 'arbitrage', rationale: '裁定取引' },
  { word: 'profitability', rationale: '収益性' },
  { word: 'receivership', rationale: '管財下に置かれた状態' },
  { word: 'growth', rationale: '成長' },
  { word: 'investment', rationale: '投資' },
  { word: 'asset', rationale: '資産' },
  { word: 'portfolio', rationale: '保有資産の組み合わせ' },
  { word: 'diversify', rationale: '（投資等を）分散させる' },
  { word: 'diversification', rationale: '分散（名詞）' },
  { word: 'leverage', rationale: '（資金・資産を）活用する・てこ入れ' },
  { word: 'subsidy', rationale: '補助金' },
  { word: 'tariff', rationale: '関税' },
  { word: 'levy', rationale: '（税を）課す・課税' },
  {
    word: 'licensing',
    rationale: 'ライセンス供与（T-86でB帯TOEIC非該当語embezzlementから差し替え）',
  },
]

// --- 4. 製造・品質管理・物流 ---
const MANUFACTURING_LOGISTICS: Entry[] = [
  { word: 'commissioning', rationale: '（設備の）試運転・引き渡し' },
  { word: 'decommission', rationale: '（設備を）廃止・退役させる' },
  { word: 'retrofit', rationale: '後付けで改修する' },
  { word: 'streamline', rationale: '（工程を）合理化する' },
  { word: 'optimize', rationale: '最適化する' },
  { word: 'optimization', rationale: '最適化（名詞）' },
  { word: 'automate', rationale: '自動化する' },
  { word: 'automation', rationale: '自動化（名詞）' },
  { word: 'offshoring', rationale: '海外移転（生産拠点等の）' },
  { word: 'subcontracting', rationale: '下請けに出すこと' },
  { word: 'expedite', rationale: '（処理を）迅速化する' },
  { word: 'consolidate', rationale: '（貨物・拠点を）統合する' },
  { word: 'consolidation', rationale: '統合（名詞）' },
  { word: 'standardize', rationale: '標準化する' },
  { word: 'standardization', rationale: '標準化（名詞）' },
  { word: 'curtail', rationale: '（生産・支出を）削減する' },
  { word: 'overhaul', rationale: '大幅な見直し・改修' },
]

// --- 5. マーケティング・広告・販売 ---
const MARKETING_SALES: Entry[] = [
  { word: 'proliferate', rationale: '急増する' },
  { word: 'proliferation', rationale: '急増（名詞）' },
  { word: 'saturate', rationale: '（市場を）飽和させる' },
  { word: 'saturation', rationale: '飽和（名詞）' },
  { word: 'differentiate', rationale: '差別化する' },
  { word: 'differentiation', rationale: '差別化（名詞）' },
  { word: 'positioning', rationale: '市場での位置付け' },
  { word: 'rebrand', rationale: 'ブランドを刷新する' },
  { word: 'rebranding', rationale: 'ブランド刷新（名詞）' },
  { word: 'viral', rationale: '（口コミ的に）急速に広がる' },
  { word: 'engagement', rationale: '（顧客の）関与・愛着度' },
  { word: 'conversion', rationale: '成約・転換（率）' },
  { word: 'segmentation', rationale: '市場細分化' },
  { word: 'upsell', rationale: '上位商品を勧める' },
  { word: 'affiliate', rationale: '提携先・アフィリエイト' },
  { word: 'clientele', rationale: '顧客層' },
  { word: 'markdown', rationale: '値下げ' },
]

// --- 6. 顧客サービス・苦情対応 ---
const CUSTOMER_SERVICE: Entry[] = [
  { word: 'appease', rationale: '（相手を）なだめる' },
  { word: 'placate', rationale: '（怒りを）鎮める' },
  { word: 'rectify', rationale: '（誤りを）是正する' },
  { word: 'rectification', rationale: '是正（名詞）' },
  { word: 'remedy', rationale: '救済策・改善策' },
  { word: 'remediation', rationale: '是正措置' },
  { word: 'disgruntled', rationale: '不満を抱いた' },
  { word: 'alienate', rationale: '（顧客を）疎外する・離反させる' },
  { word: 'retain', rationale: '（顧客を）つなぎ止める' },
  { word: 'goodwill', rationale: '（企業の）信用・のれん' },
  { word: 'adjacent', rationale: '隣接した（T-86でB帯TOEIC非該当語conciliatoryから差し替え）' },
  { word: 'indemnify', rationale: '損害を補償する' },
  { word: 'indemnity', rationale: '補償・免責（名詞）' },
  { word: 'liaison', rationale: '連絡調整役' },
  { word: 'mitigate', rationale: '（被害・影響を）軽減する' },
  { word: 'mitigation', rationale: '軽減（名詞）' },
  { word: 'reimburse', rationale: '払い戻す（T-86でB帯TOEIC非該当語ombudsmanから差し替え）' },
]

// --- 7. 出張・交通・宿泊 ---
const TRAVEL: Entry[] = [
  { word: 'commute', rationale: '通勤する' },
  { word: 'commuter', rationale: '通勤者' },
  { word: 'congestion', rationale: '混雑・渋滞' },
  { word: 'detour', rationale: '迂回路' },
  { word: 'diversion', rationale: '（交通の）迂回' },
  { word: 'embark', rationale: '（船・便に）搭乗する' },
  { word: 'disembark', rationale: '（船・便から）降りる' },
  { word: 'quarantine', rationale: '検疫' },
  { word: 'immigration', rationale: '出入国審査' },
  { word: 'repatriate', rationale: '本国へ送還・帰任させる' },
  { word: 'repatriation', rationale: '本国送還（名詞）' },
  { word: 'chartered', rationale: '貸し切りの（便・バス）' },
  { word: 'nonrefundable', rationale: '払い戻し不可の' },
  { word: 'punctuality', rationale: '時間厳守（名詞）' },
  { word: 'stopover', rationale: '（旅程上の）短期滞在' },
  { word: 'gateway', rationale: '玄関口（都市・空港）' },
]

// --- 8. IT・システム・通信 ---
const IT_SYSTEM: Entry[] = [
  { word: 'cybersecurity', rationale: 'サイバーセキュリティ' },
  { word: 'phishing', rationale: 'フィッシング詐欺' },
  { word: 'ransomware', rationale: '身代金要求型ウイルス' },
  { word: 'cryptocurrency', rationale: '暗号資産' },
  { word: 'blockchain', rationale: 'ブロックチェーン' },
  { word: 'protocol', rationale: '通信規約・手順' },
  { word: 'latency', rationale: '（通信の）遅延' },
  { word: 'scalable', rationale: '拡張性のある' },
  { word: 'scalability', rationale: '拡張性（名詞）' },
  { word: 'deprecate', rationale: '（機能等を）非推奨にする' },
  { word: 'provisioning', rationale: '（システム資源の）割り当て・準備' },
  { word: 'virtualization', rationale: '仮想化' },
  { word: 'middleware', rationale: 'ミドルウェア' },
  { word: 'firmware', rationale: 'ファームウェア' },
  { word: 'endpoint', rationale: '（通信の）末端機器' },
  { word: 'authentication', rationale: '認証' },
]

// --- 9. 不動産・施設・建築 ---
const REAL_ESTATE: Entry[] = [
  { word: 'accreditation', rationale: '認定（T-86でB帯TOEIC非該当語encroachmentから差し替え）' },
  { word: 'dilapidated', rationale: '老朽化した' },
  { word: 'uninhabitable', rationale: '居住に適さない' },
  { word: 'habitable', rationale: '居住可能な' },
  {
    word: 'timeline',
    rationale: '予定表・スケジュール（T-86でB帯TOEIC非該当語gentrificationから差し替え）',
  },
  { word: 'leasehold', rationale: '借地権' },
  { word: 'freehold', rationale: '自由土地保有権' },
  { word: 'covenant', rationale: '契約上の誓約条項' },
  { word: 'deed', rationale: '権利証書' },
  { word: 'escrow', rationale: '第三者預託（不動産取引の）' },
  { word: 'subdivision', rationale: '土地区画（分譲地）' },
  { word: 'expertise', rationale: '専門知識（T-86でB帯TOEIC非該当語rezoneから差し替え）' },
  { word: 'variance', rationale: '（規制の）例外許可' },
  { word: 'milestone', rationale: '節目・達成目標（T-86でB帯TOEIC非該当語condemnから差し替え）' },
  { word: 'deliverable', rationale: '成果物（T-86でB帯TOEIC非該当語condemnationから差し替え）' },
  { word: 'workflow', rationale: '作業の流れ（T-86でB帯TOEIC非該当語urbanizationから差し替え）' },
  { word: 'initiative', rationale: '新規の取り組み（T-86でB帯TOEIC非該当語sprawlから差し替え）' },
]

// --- 10. 店舗・小売・在庫 ---
const RETAIL_STOCK: Entry[] = [
  { word: 'liquidation', rationale: '在庫処分・清算' },
  { word: 'footfall', rationale: '来店客数' },
  { word: 'ambience', rationale: '店内の雰囲気' },
  { word: 'upscale', rationale: '高級志向の' },
  { word: 'bespoke', rationale: '注文仕立ての' },
  { word: 'artisanal', rationale: '職人による・手作りの' },
  { word: 'curated', rationale: '厳選された' },
  { word: 'flagship', rationale: '旗艦（店舗・商品）' },
  { word: 'e-commerce', rationale: '電子商取引' },
  { word: 'omnichannel', rationale: '複数販路統合型の' },
  { word: 'understock', rationale: '在庫不足' },
  { word: 'turnover', rationale: '（在庫・客の）回転率' },
  { word: 'patronage', rationale: '（常連客の）ひいき・愛顧' },
  { word: 'shopper', rationale: '買い物客' },
  { word: 'merchandising', rationale: '商品化計画・陳列戦略' },
  { word: 'assortment', rationale: '品揃え' },
]

// --- 11. イベント・式典・エンターテインメント ---
const EVENTS: Entry[] = [
  { word: 'proficiency', rationale: '習熟度（T-86でB帯TOEIC非該当語pageantryから差し替え）' },
  { word: 'efficiency', rationale: '効率性（T-86でB帯TOEIC非該当語processionから差し替え）' },
  {
    word: 'versatile',
    rationale: '多才な・多用途の（T-86でB帯TOEIC非該当語dignitaryから差し替え）',
  },
  { word: 'accolade', rationale: '称賛・栄誉' },
  { word: 'plaque', rationale: '記念プレート' },
  { word: 'innovation', rationale: '革新（T-86でB帯TOEIC非該当語memorialから差し替え）' },
  { word: 'tribute', rationale: '賛辞・献辞' },
  { word: 'symposium', rationale: 'シンポジウム' },
  {
    word: 'collaboration',
    rationale: '協力・共同作業（T-86でB帯TOEIC非該当語convocationから差し替え）',
  },
  { word: 'plenary', rationale: '全体会議の' },
  { word: 'festivity', rationale: '祝賀行事' },
  { word: 'adaptable', rationale: '適応力のある（T-86でB帯TOEIC非該当語jubileeから差し替え）' },
  { word: 'commencement', rationale: '開始式・卒業式' },
  { word: 'productivity', rationale: '生産性（T-86でB帯TOEIC非該当語soireeから差し替え）' },
  { word: 'mixer', rationale: '懇親会' },
  { word: 'hospitality', rationale: 'もてなし・接遇' },
  { word: 'fanfare', rationale: '派手な宣伝・ファンファーレ' },
]

// --- 12. 法務・環境 ---
const LEGAL_ENV: Entry[] = [
  {
    word: 'provision',
    rationale: '（契約上の）規定条項（T-86でB帯TOEIC非該当語adjudicateから差し替え）',
  },
  { word: 'waiver', rationale: '権利放棄（書）（T-86でB帯TOEIC非該当語adjudicationから差し替え）' },
  {
    word: 'enforceable',
    rationale: '法的強制力のある（T-86でB帯TOEIC非該当語tribunalから差し替え）',
  },
  { word: 'nondisclosure', rationale: '秘密保持の（T-86でB帯TOEIC非該当語subpoenaから差し替え）' },
  { word: 'confidentiality', rationale: '機密性（T-86でB帯TOEIC非該当語testifyから差し替え）' },
  {
    word: 'termination',
    rationale: '（契約の）終了（T-86でB帯TOEIC非該当語testimonyから差し替え）',
  },
  { word: 'disclosure', rationale: '開示（T-86でB帯TOEIC非該当語affidavitから差し替え）' },
  { word: 'safeguard', rationale: '保護措置（T-86でB帯TOEIC非該当語injunctionから差し替え）' },
  { word: 'transparency', rationale: '透明性（T-86でB帯TOEIC非該当語indictmentから差し替え）' },
  { word: 'oversight', rationale: '監督（T-86でB帯TOEIC非該当語prosecuteから差し替え）' },
  { word: 'compliant', rationale: '準拠した（T-86でB帯TOEIC非該当語prosecutionから差し替え）' },
  { word: 'ratification', rationale: '批准（T-86でB帯TOEIC非該当語acquitから差し替え）' },
  { word: 'arbitrator', rationale: '仲裁人（T-86でB帯TOEIC非該当語acquittalから差し替え）' },
  { word: 'negotiator', rationale: '交渉担当者（T-86でB帯TOEIC非該当語culpableから差し替え）' },
  { word: 'concession', rationale: '譲歩（T-86でB帯TOEIC非該当語negligenceから差し替え）' },
  {
    word: 'proprietary',
    rationale: '独自の・専有の（T-86でB帯TOEIC非該当語malfeasanceから差し替え）',
  },
]

export const WORDS_B: FreqListWordEntry[] = toEntries([
  ...MEETING_DOCS,
  ...HR_TRAINING,
  ...FINANCE_CONTRACT,
  ...MANUFACTURING_LOGISTICS,
  ...MARKETING_SALES,
  ...CUSTOMER_SERVICE,
  ...TRAVEL,
  ...IT_SYSTEM,
  ...REAL_ESTATE,
  ...RETAIL_STOCK,
  ...EVENTS,
  ...LEGAL_ENV,
])
