// Part5（text_blank）追加50問（d4帯）のデータ本体（T-85。正本: docs/15 T-85行、docs/14 3.1節・3.6節）。
//
// 【設計判断（docs未記載）】14の3.6「文長・出題パターンの拡充」を受け、公式試験並みの
// 文長（14語以上）・複雑な修飾構造を持つd4（難易度4）専用の50問を追加する。
// 文法観点は主述一致・完了形・受動態・as...as比較の4種（既存5分類のうち「動詞の形」
// 「比較」に相当）に絞り、均等配分ではなく「難関文法」への集中投資とする
// （主述一致15問・完了形12問・受動態12問・as...as比較11問）。
// 実在の企業・人物名を想起させないよう、固有名詞は./fictionalNames.tsの架空プールから採る。
// keyVocabWordはS/A/B語彙カード（600語）から選び、part5QuestionsS/S2と重複しない語を選定した。
// 正答キーはcorrectText/distractorsの形で書き、part5Question.tsのrotatePart5Choicesが
// index%4の決定的ローテーションでA〜Dへの機械的な分散を行う。

export interface Part5RawEntry {
  keyVocabWord: string
  tags: string[]
  question: string
  correctText: string
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
  difficulty: number
}

export const PART5_ENTRIES_S3_RAW: Part5RawEntry[] = [
  {
    keyVocabWord: 'qualification',
    tags: ['動詞の形'],
    question:
      'Each of the regional managers at Bramwell Logistics ___ required to submit an updated qualification record every quarter.',
    correctText: 'is',
    distractors: ['are', 'were', 'be'],
    explanation:
      '主語は"Each of the regional managers"で、Eachが主語の核となるため単数扱い。isが正しい。managersにつられてareを選ぶのは典型的な誤り。',
    translation:
      'Bramwell Logisticsの地域マネージャーは、それぞれ四半期ごとに更新された資格記録を提出することが求められている。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'appraisal',
    tags: ['動詞の形'],
    question:
      'Marlowe & Vance ___ already lost three senior managers before the new appraisal system was introduced.',
    correctText: 'had',
    distractors: ['has', 'have', 'was'],
    explanation:
      '過去のある時点（appraisal system was introduced）よりさらに前の完了を表すため過去完了(had lost)。hadが正しい。',
    translation:
      '新しい評価制度が導入される頃には、Marlowe & Vanceはすでに3人のシニアマネージャーを失っていた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'complaint',
    tags: ['動詞の形'],
    question:
      'The complaint submitted through the customer portal ___ carefully reviewed by the support team before a response was sent.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にreviewed（過去分詞）が続き、complaintは「見直される」対象なので受動態(was reviewed)が正しい。has（単数現在完了）・had（過去完了）・did（過去（doの過去形））は単数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      'カスタマーポータルを通じて提出された苦情申し立ては、回答が送られる前にサポートチームによって注意深く見直された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'sustainable',
    tags: ['比較'],
    question:
      'The new packaging developed by Sofia Marchetti is not nearly as ___ as the previous version claimed to be.',
    correctText: 'sustainable',
    distractors: ['sustainability', 'sustainably', 'sustain'],
    explanation:
      '"as ___ as"の間には形容詞が入る。sustainableが正しい。sustainabilityは名詞、sustainablyは副詞、sustainは動詞原形で不適。',
    translation:
      'ソフィア・マルケッティ氏が開発した新しい梱包は、以前のバージョンが主張していたほど持続可能ではない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'expense',
    tags: ['動詞の形'],
    question:
      'A number of unexpected expenses at Halden & Cole ___ delayed the launch of the new product line.',
    correctText: 'have',
    distractors: ['has', 'is', 'was'],
    explanation:
      '"A number of + 複数名詞"は複数扱い（"the number of"は単数扱いと区別する）。expensesが主語の中心なのでhaveが正しい。was（単数過去）・has（単数現在完了）・is（単数現在）は複数現在完了ではなく、この文の主語・時制と一致しない。',
    translation: 'Halden & Coleでの予期しない出費の数々が、新製品ラインの発売を遅らせた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'delivery',
    tags: ['動詞の形'],
    question:
      'By next Friday, the delivery from Sundgren Aerospace ___ traveled through four different ports.',
    correctText: 'will have',
    distractors: ['has', 'had', 'was'],
    explanation:
      '未来のある時点までの完了を表す未来完了(will have traveled)。will haveが正しい。has（単数現在完了）・had（過去完了）・was（単数過去）は未来完了ではなく、この文の主語・時制と一致しない。',
    translation:
      '来週金曜日までには、Sundgren Aerospaceからの配送分は4つの異なる港を経由していることになる。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'covenant',
    tags: ['動詞の形'],
    question:
      'The loan covenant ___ renegotiated after Naomi Fujita raised concerns about the repayment schedule.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にrenegotiated（過去分詞）が続き、covenantは「再交渉される」対象なので受動態が正しい。did（過去（doの過去形））・has（単数現在完了）・had（過去完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      'ナオミ・フジタ氏が返済スケジュールについて懸念を示した後、その融資契約条項は再交渉された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'scalable',
    tags: ['比較'],
    question: "Tobias Grün's proposed system is not as ___ as the vendor originally promised.",
    correctText: 'scalable',
    distractors: ['scalability', 'scale', 'scaling'],
    explanation:
      '"as ___ as"の間には形容詞が入る。scalableが正しい。scalabilityは名詞、scale/scalingは動詞派生形で不適。',
    translation:
      'トビアス・グリューン氏が提案したシステムは、業者が当初約束していたほど拡張性が高くない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'branch',
    tags: ['動詞の形'],
    question:
      'The number of branch locations that Voss Interactive operates in the region ___ grown steadily since 2020.',
    correctText: 'has',
    distractors: ['have', 'are', 'were'],
    explanation:
      '"The number of + 複数名詞"は単数扱い。主語の核はThe numberなのでhasが正しい。have（複数現在完了）・are（複数現在）・were（複数過去）は単数現在完了ではなく、この文の主語・時制と一致しない。',
    translation: 'Voss Interactiveがその地域で運営する支店数は、2020年以降着実に増加している。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'testimonial',
    tags: ['動詞の形'],
    question:
      'Castellan Foods ___ never received a testimonial from a celebrity chef until last year.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"until last year"という過去の基準点より前の完了を表す過去完了。hadが正しい。has（単数現在完了）・was（単数過去）・have（複数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation:
      'Castellan Foodsは昨年までセレブリティシェフによる推薦の声を一度も受けたことがなかった。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'dispute',
    tags: ['動詞の形'],
    question: 'A formal dispute ___ filed against the supplier after months of investigation.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にfiled（過去分詞）が続き、disputeは「提出される」対象なので受動態が正しい。had（過去完了）・did（過去（doの過去形））・has（単数現在完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '数か月にわたる調査の後、その仕入先に対して正式な異議申し立てが提出された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'punctual',
    tags: ['比較'],
    question: "Hana Novak's replacement has not been as ___ as the previous delivery driver.",
    correctText: 'punctual',
    distractors: ['punctuality', 'punctually', 'punctualness'],
    explanation:
      '"as ___ as"の間には形容詞が入る。punctualが正しい。punctuality/punctualnessは名詞、punctuallyは副詞で不適。',
    translation: 'ハナ・ノヴァーク氏の後任は、以前の配送ドライバーほど時間に正確ではない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'vendor',
    tags: ['動詞の形'],
    question:
      'Neither the vendor nor the two subcontractors working with Marchetti Group ___ willing to lower the price.',
    correctText: 'were',
    distractors: ['was', 'is', 'has'],
    explanation:
      '"Neither A nor B"では動詞はBに一致する。ここでのBは複数のsubcontractorsなのでwereが正しい。has（単数現在完了）・was（単数過去）・is（単数現在）は複数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      '業者もMarchetti Groupと組む2社の下請け業者も、価格を下げることに前向きではなかった。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'valuation',
    tags: ['動詞の形'],
    question:
      'Analysts believe that Whitmore Realty ___ completed its property valuation well before the market shifted.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"before the market shifted"（市場が変動する前）という過去の基準点より前の完了。hadが正しい。has（単数現在完了）・was（単数過去）・have（複数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation:
      'アナリストは、Whitmore Realtyが市場が変動するかなり前に不動産評価を完了していたと考えている。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'breach',
    tags: ['動詞の形'],
    question:
      'Allegations of a serious safety breach ___ raised during the quarterly review before the committee.',
    correctText: 'were',
    distractors: ['did', 'have', 'had'],
    explanation:
      '空所の後にraised（過去分詞）が続き、Allegations（複数）は「提起される」対象なので受動態(were raised)が正しい。did（過去（doの過去形））・have（複数現在完了）・had（過去完了）は複数過去ではなく、この文の主語・時制と一致しない。',
    translation: '委員会の前の四半期レビュー中に、重大な安全上の違反の疑惑が提起された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'biodegradable',
    tags: ['比較'],
    question:
      'Standard containers are not as ___ as the packaging material that Andres Villalobos sources for the depot.',
    correctText: 'biodegradable',
    distractors: ['biodegrade', 'biodegradation', 'biodegradably'],
    explanation:
      '"as ___ as"の間には形容詞が入る。biodegradableが正しい。biodegradeは動詞、biodegradationは名詞、biodegradablyは副詞で不適。',
    translation:
      '標準的な容器は、アンドレス・ビジャロボス氏がデポ向けに調達する梱包材ほど生分解性が高くない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'asset',
    tags: ['動詞の形'],
    question:
      'Every asset listed in the audit conducted by Calder Ridge Holdings ___ inspected before the merger was finalized.',
    correctText: 'was',
    distractors: ['were', 'have been', 'are'],
    explanation:
      '"Every + 単数名詞"は単数扱い。assetが単数なのでwasが正しい。are（複数現在）・were（複数過去）・have been（複数現在完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      'Calder Ridge Holdingsが実施した監査に記載されたすべての資産は、合併が確定する前に検査された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'affiliate',
    tags: ['動詞の形'],
    question:
      'Since acquiring the affiliate, Kestrel Analytics ___ expanded its workforce by nearly forty percent.',
    correctText: 'has',
    distractors: ['had', 'have', 'was'],
    explanation:
      '"Since ~"（〜以来）は現在完了とともに使う。hasが正しい。had（過去完了）・have（複数現在完了）・was（単数過去）は単数現在完了ではなく、この文の主語・時制と一致しない。',
    translation:
      'その提携会社を買収して以来、Kestrel Analyticsは従業員数をほぼ40パーセント増やしてきた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'escrow',
    tags: ['動詞の形'],
    question:
      'The remaining funds ___ held in escrow until both parties signed the final agreement.',
    correctText: 'were',
    distractors: ['did', 'have', 'had'],
    explanation:
      '空所の後にheld（過去分詞）が続き、fundsは「保管される」対象なので受動態(were held)が正しい。have（複数現在完了）・had（過去完了）・did（過去（doの過去形））は複数過去ではなく、この文の主語・時制と一致しない。',
    translation: '残りの資金は、両当事者が最終合意書に署名するまでエスクロー口座に保管されていた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'benefits',
    tags: ['比較'],
    question:
      "The hotel's new benefits package is not as ___ as guests had hoped when Meredith Aldous announced it.",
    correctText: 'generous',
    distractors: ['generosity', 'generously', 'generousness'],
    explanation:
      '"as ___ as"の間には形容詞が入る。generousが正しい。generosity/generousnessは名詞、generouslyは副詞で不適。',
    translation:
      'そのホテルの新しい特典パッケージは、メレディス・アルダス氏が発表した際に宿泊客が期待していたほど手厚くない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'commuter',
    tags: ['動詞の形'],
    question:
      'Neither Daniel Whitfield, a daily commuter, nor his assistant ___ aware that the shuttle schedule had changed.',
    correctText: 'was',
    distractors: ['were', 'are', 'have been'],
    explanation:
      '"Neither A nor B"では動詞はBに一致する。his assistantは単数なのでwasが正しい。have been（複数現在完了）・were（複数過去）・are（複数現在）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      'ダニエル・ウィットフィールド氏も彼のアシスタントも、シャトルの時刻表が変更されたことに気づいていなかった。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'compliance',
    tags: ['動詞の形'],
    question:
      'By the end of this fiscal year, Bellrose Pharmaceuticals ___ reviewed every compliance document twice.',
    correctText: 'will have',
    distractors: ['has', 'had', 'have'],
    explanation: '未来のある時点までの完了を表す未来完了。will haveが正しい。',
    translation:
      '今会計年度末までに、Bellrose Pharmaceuticalsはすべてのコンプライアンス文書を2回見直していることになる。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'eviction',
    tags: ['動詞の形'],
    question: 'A tenant ___ served with an eviction notice after missing several rent payments.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にserved（過去分詞）が続き、tenantは「送達される」対象なので受動態が正しい。did（過去（doの過去形））・has（単数現在完了）・had（過去完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '複数回の家賃支払いを怠った後、その入居者には立ち退き通知が送達された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'flagship',
    tags: ['比較'],
    question:
      "This year's flagship plan is not quite as ___ as competitors have claimed in recent advertisements.",
    correctText: 'extensive',
    distractors: ['extensiveness', 'extensively', 'extent'],
    explanation:
      '"as ___ as"の間には形容詞が入る。extensiveが正しい。extensivenessは名詞、extensivelyは副詞、extentは別の名詞で不適。',
    translation: '今年の主力プランは、競合他社が最近の広告で主張しているほど手厚いものではない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'dwelling',
    tags: ['動詞の形'],
    question:
      'A report on urban dwelling costs, along with a regional survey by Northfield Instruments, ___ scheduled for release next month.',
    correctText: 'is',
    distractors: ['are', 'were', 'have been'],
    explanation:
      '"A, along with B"の場合、動詞はAに一致する。A reportが主語の核となる単数名詞なのでisが正しい。are（複数現在）・were（複数過去）・have been（複数現在完了）は単数現在ではなく、この文の主語・時制と一致しない。',
    translation:
      '都市部の住居費に関する報告書は、Northfield Instrumentsによる地域調査とともに、来月公開される予定だ。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'freight',
    tags: ['動詞の形'],
    question:
      'Drayton Freight ___ already rerouted two shipments by the time the storm reached the coast.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"by the time the storm reached the coast"より前の完了を表す過去完了。hadが正しい。has（単数現在完了）・was（単数過去）・have（複数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation: '嵐が沿岸に到達する頃には、Drayton Freightはすでに2件の荷物の経路を変更していた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'memo',
    tags: ['動詞の形'],
    question:
      'A memo ___ issued to warehouse staff after the internal audit found several process gaps.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にissued（過去分詞）が続き、memoは「発行される」対象なので受動態が正しい。had（過去完了）・did（過去（doの過去形））・has（単数現在完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '内部監査でいくつかの手順上の不備が見つかった後、倉庫スタッフに社内通知が発行された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'outlet',
    tags: ['比較'],
    question: "Kenji Watanabe's new outlet location is not as ___ as the flagship store downtown.",
    correctText: 'profitable',
    distractors: ['profitability', 'profitably', 'profit'],
    explanation:
      '"as ___ as"の間には形容詞が入る。profitableが正しい。profitabilityは名詞、profitablyは副詞、profitは名詞/動詞で不適。',
    translation: '渡辺賢二氏の新しい店舗は、中心街の旗艦店ほど利益が出ていない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'appendix',
    tags: ['動詞の形'],
    question:
      'Everyone involved in preparing the appendix for the Delacroix Partners report ___ asked to double-check the figures.',
    correctText: 'was',
    distractors: ['were', 'are', 'have been'],
    explanation:
      '"Everyone"は常に単数扱い。wasが正しい。were（複数過去）・are（複数現在）・have been（複数現在完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: 'Delacroix Partnersの報告書の付録作成に関わった全員が、数値の再確認を求められた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'campaign',
    tags: ['動詞の形'],
    question:
      "Amberline Media ___ run similar campaigns for over a decade before this year's controversy.",
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"before this year\'s controversy"より前の完了を表す過去完了。hadが正しい。have（複数現在完了）・has（単数現在完了）・was（単数過去）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation:
      'Amberline Mediaは、今年の物議を醸す出来事より前の10年以上にわたり、似たようなキャンペーンを行ってきていた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'oversight',
    tags: ['動詞の形'],
    question: 'The company ___ placed under new oversight shortly after the previous CEO resigned.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にplaced（過去分詞）が続き、companyは「置かれる」対象なので受動態が正しい。has（単数現在完了）・had（過去完了）・did（過去（doの過去形））は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '前任のCEOが退任した直後、その会社は新たな監督体制の下に置かれた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'hospitality',
    tags: ['比較'],
    question:
      'Guest hospitality at the new branch is not as ___ as it was at the downtown location Fatima Rahman managed for years.',
    correctText: 'warm',
    distractors: ['warmth', 'warmly', 'warmest'],
    explanation:
      '"as ___ as"の間には原級の形容詞が入る。warmが正しい。warmthは名詞、warmlyは副詞、warmestは最上級で不適。',
    translation:
      '新しい支店でのおもてなしは、ファティマ・ラーマン氏が長年管理した中心街の店舗ほど温かみがない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'modernization',
    tags: ['動詞の形'],
    question:
      'The percentage of budget allocated to the modernization plan at Osgood Manufacturing ___ expected to reach twelve percent.',
    correctText: 'is',
    distractors: ['are', 'were', 'have been'],
    explanation:
      '"The percentage of + 複数名詞相当"は単数扱い。The percentageが主語の核なのでisが正しい。were（複数過去）・have been（複数現在完了）・are（複数現在）は単数現在ではなく、この文の主語・時制と一致しない。',
    translation:
      'Osgood Manufacturingでの近代化計画に割り当てられた予算の割合は、12パーセントに達すると見込まれている。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'overstock',
    tags: ['動詞の形'],
    question:
      'Investigators concluded that the board ___ overlooked signs of overstock for several years before costs spiraled out of control.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"before costs spiraled out of control"より前の完了を表す過去完了。hadが正しい。was（単数過去）・have（複数現在完了）・has（単数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation:
      '調査官は、コストが制御不能になるより前の数年間、取締役会が過剰在庫の兆候を見過ごしていたと結論づけた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'timeline',
    tags: ['動詞の形'],
    question: 'A revised timeline ___ approved, delaying the merger until the review was complete.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にapproved（過去分詞）が続き、timelineは「承認される」対象なので受動態が正しい。has（単数現在完了）・had（過去完了）・did（過去（doの過去形））は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '審査が完了するまで合併を遅らせる、修正後のスケジュールが承認された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'merchandise',
    tags: ['比較'],
    question:
      "The gift shop's merchandise selection this season is not as ___ as it was before Oliver Sandqvist took over purchasing.",
    correctText: 'diverse',
    distractors: ['diversity', 'diversify', 'diversely'],
    explanation:
      '"as ___ as"の間には形容詞が入る。diverseが正しい。diversityは名詞、diversifyは動詞、diverselyは副詞で不適。',
    translation:
      'そのギフトショップの品揃えは、オリバー・サンドクヴィスト氏が仕入れを引き継ぐ前ほど多様ではない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'stockpile',
    tags: ['動詞の形'],
    question:
      'Either the warehouse manager or the two shift supervisors at Rennick Data Systems ___ responsible for the stockpile count.',
    correctText: 'are',
    distractors: ['is', 'was', 'has been'],
    explanation:
      '"Either A or B"では動詞はBに一致する。ここでのBは複数のsupervisorsなのでareが正しい。is（単数現在）・was（単数過去）・has been（単数現在完了）は複数現在ではなく、この文の主語・時制と一致しない。',
    translation:
      'Rennick Data Systemsでは、倉庫管理者かあるいは2名の交代勤務監督者のいずれかが在庫数の確認に責任を負う。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'lease',
    tags: ['動詞の形'],
    question:
      'By the time collections began, several tenants ___ already fallen behind on their lease payments.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"By the time collections began"より前の完了を表す過去完了。hadが正しい。has（単数現在完了）・was（単数過去）・have（複数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation: '回収が始まる頃には、複数の入居者はすでに賃貸料の支払いが滞っていた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'statement',
    tags: ['動詞の形'],
    question: 'A statement ___ issued clarifying the reporting error after an internal review.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にissued（過去分詞）が続き、statementは「発行される」対象なので受動態が正しい。has（単数現在完了）・had（過去完了）・did（過去（doの過去形））は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '内部審査の後、報告ミスを説明する声明が発表された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'footfall',
    tags: ['比較'],
    question: 'Weekday footfall at the restaurant is not as ___ as weekend traffic tends to be.',
    correctText: 'heavy',
    distractors: ['heaviness', 'heavily', 'heaviest'],
    explanation:
      '"as ___ as"の間には原級の形容詞が入る。heavyが正しい。heavinessは名詞、heavilyは副詞、heaviestは最上級で不適。',
    translation: '平日のその店の来客数は、週末の人出ほど多くない傾向にある。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'derivative',
    tags: ['動詞の形'],
    question:
      'A series of complex financial derivatives held by Thorncastle Financial ___ under review by external auditors.',
    correctText: 'is',
    distractors: ['are', 'were', 'have been'],
    explanation:
      '"A series of + 複数名詞"は単数扱い。A seriesが主語の核なのでisが正しい。are（複数現在）・were（複数過去）・have been（複数現在完了）は単数現在ではなく、この文の主語・時制と一致しない。',
    translation:
      'Thorncastle Financialが保有する一連の複雑な金融派生商品は、外部監査人による審査を受けている。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'sabbatical',
    tags: ['動詞の形'],
    question:
      'By the time she returns from her sabbatical, Elena Kowalski ___ been away from the office for a full year.',
    correctText: 'will have',
    distractors: ['has', 'had', 'have'],
    explanation: '未来のある時点までの完了を表す未来完了。will haveが正しい。',
    translation:
      '彼女が研究休暇から戻る頃には、エレナ・コワルスキー氏はまるまる1年間オフィスを離れていることになる。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'milestone',
    tags: ['動詞の形'],
    question:
      "Several sections describing project milestones ___ withheld at the auditor's instruction before the report was released.",
    correctText: 'were',
    distractors: ['did', 'have', 'had'],
    explanation:
      '空所の後にwithheld（過去分詞）が続き、sections（複数）は「差し控えられる」対象なので受動態(were withheld)が正しい。did（過去（doの過去形））・have（複数現在完了）・had（過去完了）は複数過去ではなく、この文の主語・時制と一致しない。',
    translation:
      'プロジェクトの節目を記述したいくつかの箇所は、報告書の公開前に監査人の指示により差し控えられた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'compatible',
    tags: ['比較'],
    question:
      'The revised software is not as ___ as customers were led to expect during the initial rollout.',
    correctText: 'compatible',
    distractors: ['compatibility', 'more compatible', 'compatibly'],
    explanation:
      '"as ___ as"の間には原級の形容詞が入る（比較級は不可）。compatibleが正しい。compatibilityは名詞、more compatibleは比較級、compatiblyは副詞で不適。',
    translation:
      '改訂されたソフトウェアは、初期展開の際に顧客が期待させられていたほど互換性が高くない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'network',
    tags: ['動詞の形'],
    question:
      'The network of contacts that Baywater Consulting has built over the past decade ___ grown far more diverse.',
    correctText: 'has',
    distractors: ['have', 'are', 'were'],
    explanation:
      '主語の核は"The network"（単数の集合名詞）。hasが正しい。have（複数現在完了）・are（複数現在）・were（複数過去）は単数現在完了ではなく、この文の主語・時制と一致しない。',
    translation: 'Baywater Consultingがこの10年で築いてきた人脈は、はるかに多様になった。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'inquiry',
    tags: ['動詞の形'],
    question:
      'The support team ___ already cleared most of the pending inquiry list before the new manager arrived.',
    correctText: 'had',
    distractors: ['has', 'was', 'have'],
    explanation:
      '"before the new manager arrived"より前の完了を表す過去完了。hadが正しい。was（単数過去）・have（複数現在完了）・has（単数現在完了）は過去完了ではなく、この文の主語・時制と一致しない。',
    translation:
      '新しいマネージャーが着任する前に、サポートチームはすでに保留中の問い合わせ一覧のほとんどを解消していた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'agreement',
    tags: ['動詞の形'],
    question:
      'The dispute ___ referred for adjudication after the two parties failed to reach an agreement.',
    correctText: 'was',
    distractors: ['did', 'has', 'had'],
    explanation:
      '空所の後にreferred（過去分詞）が続き、disputeは「付託される」対象なので受動態が正しい。had（過去完了）・did（過去（doの過去形））・has（単数現在完了）は単数過去ではなく、この文の主語・時制と一致しない。',
    translation: '両者が合意に至らなかったため、その紛争は裁定に付託された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'batch',
    tags: ['動詞の形'],
    question:
      'Every batch of textiles produced by Iversen Textiles ___ tested for durability before shipment.',
    correctText: 'is',
    distractors: ['are', 'were', 'have been'],
    explanation:
      '"Every + 単数名詞"は単数扱い。batchが単数なのでisが正しい。have been（複数現在完了）・are（複数現在）・were（複数過去）は単数現在ではなく、この文の主語・時制と一致しない。',
    translation:
      'Iversen Textilesで生産される織物のロットはそれぞれ、出荷前に耐久性の検査を受ける。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'renovation',
    tags: ['動詞の形'],
    question:
      'A committee of five board members overseeing the renovation ___ expected to report back within thirty days.',
    correctText: 'is',
    distractors: ['are', 'were', 'have'],
    explanation:
      '"A committee of + 複数名詞"は単数の集合体扱い。A committeeが主語の核なのでisが正しい。were（複数過去）・have（複数現在完了）・are（複数現在）は単数現在ではなく、この文の主語・時制と一致しない。',
    translation: '改修を監督する5名の取締役から成る委員会は、30日以内に報告する見込みだ。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'warehouse',
    tags: ['動詞の形'],
    question:
      'The findings that led inspectors to close the old warehouse ___ documented in a lengthy report.',
    correctText: 'were',
    distractors: ['was', 'has been', 'is'],
    explanation:
      '主語はThe findings（複数形）。wereが正しい。was（単数過去）・has been（単数現在完了）・is（単数現在）は複数過去ではなく、この文の主語・時制と一致しない。',
    translation: '検査官がその古い倉庫の閉鎖を決めるに至った所見は、長い報告書に文書化されている。',
    difficulty: 4,
  },
]
