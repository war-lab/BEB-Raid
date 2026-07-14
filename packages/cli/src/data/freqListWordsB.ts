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
  { word: 'redact', rationale: '（機密部分を）削除・黒塗りする' },
  { word: 'redaction', rationale: '黒塗り・削除（名詞）' },
  { word: 'codify', rationale: '成文化する' },
  { word: 'promulgate', rationale: '（法令等を）公布する' },
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
  { word: 'redundancy', rationale: '（英）人員整理・余剰人員' },
  { word: 'downsize', rationale: '人員を削減する' },
  { word: 'downsizing', rationale: '人員削減（名詞）' },
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
  { word: 'insolvency', rationale: '支払不能状態' },
  { word: 'receivership', rationale: '管財下に置かれた状態' },
  { word: 'bankruptcy', rationale: '破産' },
  { word: 'foreclosure', rationale: '（担保物件の）差し押さえ' },
  { word: 'asset', rationale: '資産' },
  { word: 'portfolio', rationale: '保有資産の組み合わせ' },
  { word: 'diversify', rationale: '（投資等を）分散させる' },
  { word: 'diversification', rationale: '分散（名詞）' },
  { word: 'leverage', rationale: '（資金・資産を）活用する・てこ入れ' },
  { word: 'subsidy', rationale: '補助金' },
  { word: 'tariff', rationale: '関税' },
  { word: 'levy', rationale: '（税を）課す・課税' },
  { word: 'embezzlement', rationale: '横領' },
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
  { word: 'conciliatory', rationale: '和解的な・懐柔的な' },
  { word: 'indemnify', rationale: '損害を補償する' },
  { word: 'indemnity', rationale: '補償・免責（名詞）' },
  { word: 'liaison', rationale: '連絡調整役' },
  { word: 'mitigate', rationale: '（被害・影響を）軽減する' },
  { word: 'mitigation', rationale: '軽減（名詞）' },
  { word: 'ombudsman', rationale: '苦情処理担当者・オンブズマン' },
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
  { word: 'encroachment', rationale: '（境界等への）侵害' },
  { word: 'dilapidated', rationale: '老朽化した' },
  { word: 'uninhabitable', rationale: '居住に適さない' },
  { word: 'habitable', rationale: '居住可能な' },
  { word: 'gentrification', rationale: '（地域の）高級化・再開発' },
  { word: 'leasehold', rationale: '借地権' },
  { word: 'freehold', rationale: '自由土地保有権' },
  { word: 'covenant', rationale: '契約上の誓約条項' },
  { word: 'deed', rationale: '権利証書' },
  { word: 'escrow', rationale: '第三者預託（不動産取引の）' },
  { word: 'subdivision', rationale: '土地区画（分譲地）' },
  { word: 'rezone', rationale: '用途地域を変更する' },
  { word: 'variance', rationale: '（規制の）例外許可' },
  { word: 'condemn', rationale: '（建物を）使用不可と宣告する' },
  { word: 'condemnation', rationale: '使用不可宣告（名詞）' },
  { word: 'urbanization', rationale: '都市化' },
  { word: 'sprawl', rationale: '（都市の）無秩序な拡大' },
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
  { word: 'pageantry', rationale: '華やかな儀式・見せ物' },
  { word: 'procession', rationale: '行列' },
  { word: 'dignitary', rationale: '要人' },
  { word: 'accolade', rationale: '称賛・栄誉' },
  { word: 'plaque', rationale: '記念プレート' },
  { word: 'memorial', rationale: '記念（の）・追悼の' },
  { word: 'tribute', rationale: '賛辞・献辞' },
  { word: 'symposium', rationale: 'シンポジウム' },
  { word: 'convocation', rationale: '式典（学位授与式等）' },
  { word: 'plenary', rationale: '全体会議の' },
  { word: 'festivity', rationale: '祝賀行事' },
  { word: 'jubilee', rationale: '記念祝典（周年）' },
  { word: 'commencement', rationale: '開始式・卒業式' },
  { word: 'soiree', rationale: '夜会・晩餐会' },
  { word: 'mixer', rationale: '懇親会' },
  { word: 'hospitality', rationale: 'もてなし・接遇' },
  { word: 'fanfare', rationale: '派手な宣伝・ファンファーレ' },
]

// --- 12. 法務・環境 ---
const LEGAL_ENV: Entry[] = [
  { word: 'adjudicate', rationale: '裁定・判決を下す' },
  { word: 'adjudication', rationale: '裁定（名詞）' },
  { word: 'tribunal', rationale: '審判所・法廷' },
  { word: 'subpoena', rationale: '召喚状' },
  { word: 'testify', rationale: '証言する' },
  { word: 'testimony', rationale: '証言（名詞）' },
  { word: 'affidavit', rationale: '宣誓供述書' },
  { word: 'injunction', rationale: '差止命令' },
  { word: 'indictment', rationale: '起訴' },
  { word: 'prosecute', rationale: '起訴する' },
  { word: 'prosecution', rationale: '起訴・検察側（名詞）' },
  { word: 'acquit', rationale: '無罪とする' },
  { word: 'acquittal', rationale: '無罪判決（名詞）' },
  { word: 'culpable', rationale: '責めを負うべき' },
  { word: 'negligence', rationale: '過失' },
  { word: 'malfeasance', rationale: '不正行為（職権上の）' },
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
