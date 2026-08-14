// Aランク200語のデータ本体（M2・T-58。正本: docs/03 4節、docs/13 T-58行）。
// levelBand 730帯。Sランク200語（freqListWordsS.ts）との重複禁止（機械検証=freqList.ts）。
// T-25と同方針（J-21）: LLM推定のみで直接記述（B-1未解決のため公開コーパス未使用）。
// 12カテゴリに分散して記述する（各カテゴリのまとまりはコメントで示す。カテゴリ自体は
// 自前定義=docsに固定リストなし。TOEICのビジネス場面を包括的にカバーする分類）。
import type { FreqRank } from '@beb-raid/shared-schema'
import type { FreqListWordEntry } from './freqListWordsS.js'

type Entry = { word: string; rationale: string }

function toEntries(entries: Entry[]): FreqListWordEntry[] {
  const freqRank: FreqRank = 'A'
  return entries.map((e) => ({ ...e, freqRank, rankSource: 'llm' as const }))
}

// --- 1. 会議・文書・オフィスコミュニケーション ---
const MEETING_DOCS: Entry[] = [
  { word: 'summarize', rationale: '要点をまとめる。会議後の報告で頻出' },
  { word: 'revise', rationale: '文書・計画を修正する' },
  { word: 'outline', rationale: '概要・要点を示す（名詞・動詞両方で頻出）' },
  { word: 'transcript', rationale: '会議・通話の書き起こし' },
  { word: 'appendix', rationale: '文書末尾の付録' },
  { word: 'footnote', rationale: '脚注' },
  { word: 'circulate', rationale: '文書を関係者に回覧する' },
  { word: 'disseminate', rationale: '情報を広く周知する' },
  { word: 'briefing', rationale: '事前説明会・簡単な報告会' },
  { word: 'consensus', rationale: '合意・総意' },
  { word: 'unanimous', rationale: '全会一致の' },
  { word: 'ratify', rationale: '正式に承認・批准する' },
  { word: 'amendment', rationale: '契約・規則の修正条項' },
  { word: 'addendum', rationale: '追加条項・補遺' },
  { word: 'disclose', rationale: '情報を開示する' },
  { word: 'confidential', rationale: '機密の。社内文書の定番形容詞' },
  { word: 'proofread', rationale: '文書の校正をする' },
]

// --- 2. 人事・採用・研修 ---
const HR_TRAINING: Entry[] = [
  { word: 'qualification', rationale: '資格・要件' },
  { word: 'credential', rationale: '資格証明' },
  { word: 'onboarding', rationale: '新人受け入れ研修' },
  { word: 'mentor', rationale: '指導役・助言者' },
  { word: 'probation', rationale: '試用期間' },
  { word: 'appraisal', rationale: '人事評価' },
  { word: 'workforce', rationale: '労働力・従業員全体' },
  { word: 'personnel', rationale: '人事・職員' },
  { word: 'seniority', rationale: '勤続年数・年功' },
  { word: 'tenure', rationale: '在職期間' },
  { word: 'commend', rationale: '（正式に）称賛する' },
  { word: 'commendation', rationale: '表彰・称賛（名詞）' },
  { word: 'internship', rationale: 'インターンシップ' },
  { word: 'payroll', rationale: '給与支払業務' },
  { word: 'pension', rationale: '年金' },
  { word: 'entitlement', rationale: '受給資格・権利' },
  { word: 'headcount', rationale: '人員数' },
]

// --- 3. 財務・会計・契約 ---
const FINANCE_CONTRACT: Entry[] = [
  { word: 'liquidity', rationale: '流動性（資金の）' },
  { word: 'solvency', rationale: '支払い能力' },
  { word: 'depreciation', rationale: '減価償却' },
  { word: 'amortize', rationale: '（費用を）分割償却する' },
  { word: 'ledger', rationale: '会計帳簿' },
  { word: 'reconcile', rationale: '（帳簿を）照合する' },
  { word: 'reconciliation', rationale: '照合・調整（名詞）' },
  { word: 'remittance', rationale: '送金' },
  { word: 'surplus', rationale: '黒字・余剰' },
  { word: 'deficit', rationale: '赤字・不足' },
  { word: 'overhead', rationale: '諸経費・間接費' },
  { word: 'capital', rationale: '資本' },
  { word: 'equity', rationale: '株式持分・自己資本' },
  { word: 'dividend', rationale: '配当金' },
  { word: 'valuation', rationale: '評価額の算定' },
  { word: 'underwrite', rationale: '（保険・融資を）引き受ける' },
  { word: 'collateral', rationale: '担保' },
]

// --- 4. 製造・品質管理・物流 ---
const MANUFACTURING_LOGISTICS: Entry[] = [
  { word: 'prototype', rationale: '試作品' },
  { word: 'specification', rationale: '仕様書' },
  { word: 'tolerance', rationale: '許容誤差' },
  { word: 'calibrate', rationale: '（機器を）調整・校正する' },
  { word: 'durability', rationale: '耐久性' },
  { word: 'batch', rationale: '一括処理・一回分の生産量' },
  { word: 'consignment', rationale: '委託販売・委託貨物' },
  { word: 'procure', rationale: '調達する' },
  { word: 'backlog', rationale: '未処理の受注・滞積' },
  { word: 'bottleneck', rationale: '生産・作業の障害箇所' },
  { word: 'throughput', rationale: '処理能力・生産量' },
  { word: 'refurbish', rationale: '改修・再整備する' },
  { word: 'recall', rationale: '製品回収' },
  { word: 'obsolete', rationale: '旧式の・廃れた' },
  { word: 'perishable', rationale: '（食品等が）傷みやすい' },
  { word: 'bulk', rationale: '大量の（まとめ買い等）' },
  { word: 'stockpile', rationale: '備蓄・在庫の山' },
]

// --- 5. マーケティング・広告・販売 ---
const MARKETING_SALES: Entry[] = [
  { word: 'demographic', rationale: '人口統計上の（属性）' },
  { word: 'niche', rationale: '隙間市場' },
  { word: 'benchmark', rationale: '基準・指標' },
  { word: 'outreach', rationale: '働きかけ・普及活動' },
  { word: 'sponsorship', rationale: '協賛・スポンサー活動' },
  { word: 'sponsor', rationale: '協賛者・後援者' },
  { word: 'testimonial', rationale: '推薦文・利用者の声' },
  { word: 'incentive', rationale: '奨励金・動機付け' },
  { word: 'markup', rationale: '上乗せ価格・利幅' },
  { word: 'clearance', rationale: '在庫一掃セール' },
  { word: 'loyalty', rationale: '（顧客の）忠誠度・愛顧' },
  { word: 'exclusive', rationale: '限定の・独占的な' },
  { word: 'premium', rationale: '割増料金・上質な' },
  { word: 'retailer', rationale: '小売業者' },
  { word: 'wholesaler', rationale: '卸売業者' },
  { word: 'consumer', rationale: '消費者' },
]

// --- 6. 顧客サービス・苦情対応 ---
const CUSTOMER_SERVICE: Entry[] = [
  { word: 'complaint', rationale: '苦情' },
  { word: 'grievance', rationale: '不満・苦情（やや形式的）' },
  { word: 'dissatisfaction', rationale: '不満' },
  { word: 'apologize', rationale: '謝罪する' },
  { word: 'apology', rationale: '謝罪（名詞）' },
  { word: 'resolve', rationale: '（問題を）解決する' },
  { word: 'resolution', rationale: '解決（名詞）' },
  { word: 'escalate', rationale: '（問題を）上位に引き上げる' },
  { word: 'escalation', rationale: 'エスカレーション（名詞）' },
  { word: 'compensate', rationale: '補償する' },
  { word: 'compensation', rationale: '補償（名詞）' },
  { word: 'courteous', rationale: '丁寧な・礼儀正しい' },
  { word: 'courtesy', rationale: '礼儀・厚意' },
  { word: 'empathize', rationale: '共感する' },
  { word: 'satisfaction', rationale: '満足度' },
  { word: 'dispute', rationale: '紛争・異議' },
  { word: 'redress', rationale: '救済・是正' },
]

// --- 7. 出張・交通・宿泊 ---
const TRAVEL: Entry[] = [
  { word: 'layover', rationale: '乗り継ぎの待ち時間' },
  { word: 'transit', rationale: '通過・乗り継ぎ' },
  { word: 'checkpoint', rationale: '検問所・チェックポイント' },
  { word: 'customs', rationale: '税関' },
  { word: 'visa', rationale: '査証' },
  { word: 'passport', rationale: '旅券' },
  { word: 'chauffeur', rationale: '専属運転手' },
  { word: 'shuttle', rationale: '送迎バス' },
  { word: 'concierge', rationale: 'コンシェルジュ' },
  { word: 'amenity', rationale: '設備・サービス（ホテル等）' },
  { word: 'vacancy', rationale: '空室・欠員' },
  { word: 'overbook', rationale: '予約を定員以上に取る' },
  { word: 'refundable', rationale: '払い戻し可能な' },
  { word: 'punctual', rationale: '時間に正確な' },
  { word: 'connection', rationale: '乗り継ぎ便' },
]

// --- 8. IT・システム・通信 ---
const IT_SYSTEM: Entry[] = [
  { word: 'firewall', rationale: 'ファイアウォール' },
  { word: 'encryption', rationale: '暗号化' },
  { word: 'encrypt', rationale: '暗号化する' },
  { word: 'bandwidth', rationale: '通信帯域幅' },
  { word: 'glitch', rationale: '一時的な不具合' },
  { word: 'backup', rationale: 'バックアップ' },
  { word: 'malware', rationale: '悪意あるソフトウェア' },
  { word: 'interface', rationale: '（システムの）接点・画面' },
  { word: 'browser', rationale: 'ブラウザ' },
  { word: 'algorithm', rationale: 'アルゴリズム' },
  { word: 'configure', rationale: '設定する' },
  { word: 'configuration', rationale: '設定（名詞）' },
  { word: 'compatible', rationale: '互換性のある' },
  { word: 'compatibility', rationale: '互換性（名詞）' },
  { word: 'synchronize', rationale: '同期させる' },
  { word: 'integrate', rationale: '統合する' },
  { word: 'integration', rationale: '統合（名詞）' },
]

// --- 9. 不動産・施設・建築 ---
const REAL_ESTATE: Entry[] = [
  { word: 'zoning', rationale: '用途地域規制' },
  { word: 'blueprint', rationale: '設計図' },
  { word: 'contractor', rationale: '請負業者' },
  { word: 'subcontractor', rationale: '下請け業者' },
  { word: 'demolition', rationale: '解体・取り壊し' },
  { word: 'foundation', rationale: '基礎（建物の）' },
  { word: 'scaffolding', rationale: '足場' },
  { word: 'permit', rationale: '許可証' },
  { word: 'easement', rationale: '地役権' },
  { word: 'condominium', rationale: '分譲マンション' },
  { word: 'tenancy', rationale: '賃借期間・借家権' },
  { word: 'custodian', rationale: '施設管理者' },
  { word: 'dwelling', rationale: '住居' },
  { word: 'occupancy', rationale: '入居・占有' },
  { word: 'vacant', rationale: '空いている' },
  { word: 'remodel', rationale: '改装する' },
  { word: 'infrastructure', rationale: 'インフラ・基盤設備' },
]

// --- 10. 店舗・小売・在庫 ---
const RETAIL_STOCK: Entry[] = [
  { word: 'storefront', rationale: '店頭・店舗の正面' },
  { word: 'shelving', rationale: '棚・棚設備' },
  { word: 'checkout', rationale: 'レジ・会計' },
  { word: 'cashier', rationale: 'レジ係' },
  { word: 'barcode', rationale: 'バーコード' },
  { word: 'restock', rationale: '在庫を補充する' },
  { word: 'overstock', rationale: '過剰在庫' },
  { word: 'shoplifting', rationale: '万引き' },
  { word: 'stockroom', rationale: '倉庫・保管室' },
  { word: 'showroom', rationale: 'ショールーム' },
  { word: 'franchise', rationale: 'フランチャイズ' },
  { word: 'franchisee', rationale: '加盟店（側）' },
  { word: 'outlet', rationale: 'アウトレット店' },
  { word: 'boutique', rationale: '専門小型店舗' },
  { word: 'kiosk', rationale: '売店・キオスク' },
  { word: 'merchant', rationale: '商人・小売業者' },
]

// --- 11. イベント・式典・エンターテインメント ---
const EVENTS: Entry[] = [
  { word: 'ceremony', rationale: '式典' },
  { word: 'keynote', rationale: '基調講演' },
  { word: 'emcee', rationale: '司会者' },
  { word: 'rehearsal', rationale: 'リハーサル' },
  { word: 'backdrop', rationale: '背景幕' },
  { word: 'decor', rationale: '装飾' },
  { word: 'invitee', rationale: '招待客' },
  { word: 'attendee', rationale: '参加者' },
  { word: 'exhibitor', rationale: '出展者' },
  { word: 'showcase', rationale: '展示・紹介する' },
  { word: 'gala', rationale: '祝賀会・盛大な催し' },
  { word: 'laureate', rationale: '受賞者' },
  { word: 'commemorate', rationale: '記念する' },
  { word: 'anniversary', rationale: '記念日' },
  { word: 'unveiling', rationale: '（新製品等の）披露' },
  { word: 'inauguration', rationale: '開業式・就任式' },
  { word: 'RSVP', rationale: '出欠の返信（招待状の定型）' },
]

// --- 12. 法務・環境 ---
const LEGAL_ENV: Entry[] = [
  { word: 'regulation', rationale: '規制・規則' },
  { word: 'regulatory', rationale: '規制上の' },
  { word: 'verify', rationale: '確認する・検証する' },
  { word: 'reconfirm', rationale: '再確認する' },
  { word: 'partnership', rationale: '提携関係' },
  { word: 'expansion', rationale: '拡大・拡張' },
  { word: 'jurisdiction', rationale: '管轄権' },
  { word: 'statute', rationale: '法令・制定法' },
  { word: 'subcontract', rationale: '下請けに出す' },
  { word: 'relocation', rationale: '移転' },
  { word: 'sustainability', rationale: '持続可能性' },
  { word: 'sustainable', rationale: '持続可能な' },
  { word: 'emission', rationale: '排出（物）' },
  { word: 'recycle', rationale: 'リサイクルする' },
  { word: 'recycling', rationale: 'リサイクル（名詞）' },
  { word: 'biodegradable', rationale: '生分解性の' },
  { word: 'eco-friendly', rationale: '環境に優しい' },
]

export const WORDS_A: FreqListWordEntry[] = toEntries([
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
